"""Python port of rankCategory in frontend/src/utils/topPickCategories.ts.

tests/backend/mcp_server/test_ranking_parity.py pins this to the TypeScript output.
RankInput deliberately has no affiliate field, so ranking cannot read monetization.
"""

import math
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, fields

from backend.models import CardSummary

GENERIC_TRAVEL_PORTAL = "travel (portal|purchases)|travel center"

# JS \b and \d are ASCII-only, hence re.ASCII. JS \s is not: it also matches Unicode spaces and
# U+FEFF, so test_matcher_input_invariants keeps those out of the text these regexes read.
_FLAGS = re.IGNORECASE | re.ASCII

MATCHER_SOURCES: dict[str, str] = {
    "dining": (
        r"restaurant|dining|caf[eé]|\bbars?\b|food delivery|doordash|grubhub|takeout"
        r"|fast food"
    ),
    "groceries": r"grocery|groceries|supermarket",
    "gas-ev": r"\bgas\b|gasoline|\bfuel\b|ev charging",
    "streaming": r"streaming|netflix|spotify|\bhulu\b|disney\+|espn",
    "flights": (
        r"airfare|\bairline|\bflight|\bunited\b|\bdelta\b|\bair\b|" + GENERIC_TRAVEL_PORTAL
    ),
    "hotels": r"\bhotel|\bmotel|vacation rental|vacation home|" + GENERIC_TRAVEL_PORTAL,
    "car-rentals": r"car rentals?|rental cars?|" + GENERIC_TRAVEL_PORTAL,
    "other-travel": r"\btravel\b|\bcruise|timeshare",
    "transit": (
        r"transit|rideshare|\buber\b|\blyft\b|subway|\btrain\b|\btolls?\b|\btaxi\b|\bparking\b"
        r"|\bbus(es)?\b|\brides?\b|\brails?\b|ground transportation"
    ),
    "online-shopping": r"online (shopping|retail|purchases)",
    "wholesale": r"wholesale club|costco|sam'?s club|\bbj'?s\b",
    "home-improvement": (
        r"home improvement|hardware store|garden(ing)? (center|supply|store)|furniture"
    ),
    "utilities": r"\butilit(y|ies)\b",
    "phone-internet": r"\bphone plans?\b|\bcell phones?\b|\bwireless\b|\binternet\b|\bcable\b",
    "rent": r"\brent\b|\bmortgage\b",
    "drugstores": r"drugstores?|drug stores?|\bpharmacy\b",
    "entertainment": r"entertainment|\bmovies?\b|\bconcerts?\b|amusement park",
    "fitness": r"fitness clubs?|\bgyms?\b",
}

WHOLESALE_EXCLUDES: tuple[str, ...] = ("gas-ev", "flights", "hotels", "car-rentals", "other-travel")

BRAND_EXCLUDE_SOURCES: dict[str, str] = {
    "flights": r"\bunited\b|\bdelta\b|\bsouthwest\b|american airlines",
    "hotels": r"\bhilton\b|\bmarriott\b|\bihg\b|\bhyatt\b|choice hotels|choice privileges",
    "transit": r"\blyft\b|\buber\b",
}

# Skipped in whole-catalog rankings only; see ROTATING_RATE in topPickCategories.ts.
ROTATING_RATE_SOURCE = r"\brotating\b|\bthis quarter\b"

# Applies in every category: a rate most purchases in the category don't earn, such as one
# merchant network, one website or certain hours. See LIMITED_RATE in topPickCategories.ts.
LIMITED_RATE_SOURCE = (
    r"partner restaurants|citi nights|gas at costco|online groceries|amazon\.com|disneyplus\.com"
)

CENTS_PER_GALLON_SOURCE = r"¢\s*\/\s*gal"

_MATCHERS = {key: re.compile(source, _FLAGS) for key, source in MATCHER_SOURCES.items()}
_BRAND_EXCLUDES = {key: re.compile(source, _FLAGS) for key, source in BRAND_EXCLUDE_SOURCES.items()}
_CENTS_PER_GALLON = re.compile(CENTS_PER_GALLON_SOURCE, _FLAGS)
_LIMITED_RATE = re.compile(LIMITED_RATE_SOURCE, _FLAGS)
_ROTATING_RATE = re.compile(ROTATING_RATE_SOURCE, _FLAGS)
_MULTIPLIER_TOKEN = re.compile(r"[\d.]+", re.ASCII)
_PARSE_FLOAT_PREFIX = re.compile(r"\d+\.?\d*|\.\d+", re.ASCII)


@dataclass(frozen=True)
class Category:
    key: str
    label: str
    emoji: str
    description: str
    group: str


_DAILY = "Common & Daily Spending"
_TRAVEL = "Travel & Transportation"
_RETAIL = "Retail & Miscellaneous"

CATEGORIES: tuple[Category, ...] = (
    Category(
        "dining",
        "Dining",
        "🍽️",
        "Restaurants, fast food, bars, cafes, and food delivery services.",
        _DAILY,
    ),
    Category(
        "groceries",
        "Groceries",
        "🛒",
        "Supermarkets and local food markets (not wholesale clubs).",
        _DAILY,
    ),
    Category(
        "gas-ev",
        "Gas & EV Charging",
        "⛽",
        "Fuel stations and electric vehicle charging points.",
        _DAILY,
    ),
    Category(
        "streaming",
        "Streaming Services",
        "📺",
        "Monthly digital subscriptions for video and audio.",
        _DAILY,
    ),
    Category("utilities", "Utilities", "💡", "Electric, gas and water bills.", _DAILY),
    Category(
        "phone-internet",
        "Phone & Internet",
        "📱",
        "Cell phone plans, home internet and cable TV.",
        _DAILY,
    ),
    Category("rent", "Rent or Mortgage", "🏠", "Rent or mortgage payments on your home.", _DAILY),
    Category(
        "drugstores",
        "Drugstores",
        "💊",
        "Pharmacies and drugstores like CVS and Walgreens.",
        _DAILY,
    ),
    Category("fitness", "Fitness & Gyms", "🏋️", "Gym and fitness club memberships.", _DAILY),
    Category(
        "flights",
        "Flights",
        "✈️",
        "Airfare, booked direct or through an airline or travel portal.",
        _TRAVEL,
    ),
    Category("hotels", "Hotels", "🏨", "Hotels, motels, and vacation rentals/homes.", _TRAVEL),
    Category(
        "car-rentals",
        "Car Rentals",
        "🚗",
        "Rental cars, booked direct or through a travel portal.",
        _TRAVEL,
    ),
    Category(
        "other-travel",
        "Other Travel",
        "🧳",
        "Cruises, timeshares, travel agencies, and general travel-portal spend that isn't "
        "specifically a flight, hotel, or rental car.",
        _TRAVEL,
    ),
    Category(
        "transit",
        "Transit",
        "🚆",
        "Parking, public buses, subways, trains, tolls, taxis, and rideshare.",
        _TRAVEL,
    ),
    Category(
        "online-shopping",
        "Online Shopping",
        "🛍️",
        "Digital purchases for retail, electronics, and clothing.",
        _RETAIL,
    ),
    Category(
        "wholesale",
        "Wholesale Clubs",
        "🏬",
        "Bulk retailers like Costco, Sam's Club, and BJ's Wholesale.",
        _RETAIL,
    ),
    Category(
        "home-improvement",
        "Home Improvement",
        "🔨",
        "Hardware stores, gardening supply shops, and furniture stores.",
        _RETAIL,
    ),
    Category(
        "entertainment",
        "Entertainment",
        "🎬",
        "Movies, concerts, sporting events, amusement parks, and live entertainment tickets.",
        _RETAIL,
    ),
    Category(
        "catch-all",
        "Catch-All",
        "💳",
        "Everything else, at the card's flat everyday rate.",
        "Overall",
    ),
)

CATEGORY_KEYS: tuple[str, ...] = tuple(c.key for c in CATEGORIES)


@dataclass(frozen=True)
class RateInput:
    category: str
    multiplier: str
    is_base: bool


@dataclass(frozen=True)
class RankInput:
    id: str
    name: str
    annual_fee: int
    categories: tuple[RateInput, ...]
    best_cpp: float
    secured_variant_id: str | None
    points_pool_id: str | None
    points_pool_receiver: bool

    @classmethod
    def from_summary(cls, summary: CardSummary) -> "RankInput":
        return cls(
            id=summary.id,
            name=summary.name,
            annual_fee=summary.annual_fee,
            categories=tuple(
                RateInput(r.category, r.multiplier, r.is_base) for r in summary.categories
            ),
            best_cpp=summary.best_cpp,
            secured_variant_id=summary.secured_variant_id,
            points_pool_id=summary.points_pool_id,
            points_pool_receiver=summary.points_pool_receiver,
        )


RANK_INPUT_FIELDS: frozenset[str] = frozenset(f.name for f in fields(RankInput))


@dataclass(frozen=True)
class RankEntry:
    card: RankInput
    effective_value: float
    effective_cpp: float
    multiplier: str
    is_fallback: bool
    is_pooled: bool

    @property
    def is_percent_rate(self) -> bool:
        return "%" in self.multiplier


def parse_multiplier_value(multiplier: str) -> float:
    """The first numeric token, by JS parseFloat's longest-prefix rule, or -inf if none."""
    token = _MULTIPLIER_TOKEN.search(multiplier)
    if token is None:
        return -math.inf
    prefix = _PARSE_FLOAT_PREFIX.match(token.group())
    return float(prefix.group()) if prefix else math.nan


def js_round(value: float) -> float:
    """Math.round, not Python's banker's rounding."""
    return value if not math.isfinite(value) else float(math.floor(value + 0.5))


def collation_key(name: str) -> tuple[str, str]:
    """Matches localeCompare over every card name; the parity test pins that."""
    return (name.casefold(), name)


def _matches_category(rate: RateInput, category_key: str) -> bool:
    if category_key == "catch-all":
        return rate.is_base
    matcher = _MATCHERS.get(category_key)
    if matcher is None or not matcher.search(rate.category):
        return False
    if _LIMITED_RATE.search(rate.category):
        return False
    if category_key == "wholesale":
        return not any(_MATCHERS[key].search(rate.category) for key in WHOLESALE_EXCLUDES)
    brand = _BRAND_EXCLUDES.get(category_key)
    return not (brand and brand.search(rate.category))


def _is_rankable(multiplier: str) -> bool:
    return not _CENTS_PER_GALLON.search(multiplier)


def _best_rate(
    card: RankInput, category_key: str, own_cards: bool = False
) -> tuple[float, str] | None:
    best: tuple[float, str] | None = None
    for rate in card.categories:
        if not _matches_category(rate, category_key) or not _is_rankable(rate.multiplier):
            continue
        if not own_cards and _ROTATING_RATE.search(rate.category):
            continue
        value = parse_multiplier_value(rate.multiplier)
        if best is None or value > best[0]:
            best = (value, rate.multiplier)
    return best


def _catch_all_rate(card: RankInput) -> tuple[float, str] | None:
    rate = next((r for r in card.categories if r.is_base), None)
    if rate is None or not _is_rankable(rate.multiplier):
        return None
    return (parse_multiplier_value(rate.multiplier), rate.multiplier)


def exclude_hidden_secured(cards: Iterable[RankInput]) -> list[RankInput]:
    """A secured twin is hidden only when its unsecured sibling is in the same set."""
    cards = list(cards)
    hidden = {c.secured_variant_id for c in cards if c.secured_variant_id is not None}
    return [c for c in cards if c.id not in hidden]


def _effective_cpp(card: RankInput, pool: Sequence[RankInput], pooling: bool) -> float:
    """Only a receiver can boost, so two feeders sharing a pool id never lift each other."""
    if not pooling or not card.points_pool_id:
        return card.best_cpp
    boosts = (
        c.best_cpp
        for c in pool
        if c.id != card.id and c.points_pool_id == card.points_pool_id and c.points_pool_receiver
    )
    return max((card.best_cpp, *boosts))


def _to_entry(card: RankInput, rate: tuple[float, str], fallback: bool, cpp: float) -> RankEntry:
    value, multiplier = rate
    pooled = cpp > card.best_cpp
    literal_percent = "%" in multiplier and not pooled
    return RankEntry(
        card=card,
        effective_value=value if literal_percent else value * cpp,
        effective_cpp=cpp,
        multiplier=multiplier,
        is_fallback=fallback,
        is_pooled=pooled,
    )


def _sort_key(entry: RankEntry) -> tuple[float, int, tuple[str, str]]:
    return (
        -js_round(entry.effective_value * 10000),
        entry.card.annual_fee,
        collation_key(entry.card.name),
    )


def rank_category(
    cards: Iterable[RankInput],
    category_key: str,
    pooling: bool = False,
    own_cards: bool = False,
) -> list[RankEntry]:
    """Every real-bonus entry, sorted, with fallbacks appended up to 3 total. own_cards means
    the cards are ones someone holds, so holder-only rates such as rotating categories count."""
    deduped = exclude_hidden_secured(cards)
    cpp = {c.id: _effective_cpp(c, deduped, pooling) for c in deduped}
    entries = []
    for card in deduped:
        best = _best_rate(card, category_key, own_cards)
        if best is not None:
            entries.append(_to_entry(card, best, False, cpp[card.id]))
    entries.sort(key=_sort_key)

    if len(entries) < 3 and category_key != "catch-all":
        used = {e.card.id for e in entries}
        fallbacks = []
        for card in deduped:
            if card.id in used:
                continue
            catch_all = _catch_all_rate(card)
            if catch_all is not None:
                fallbacks.append(_to_entry(card, catch_all, True, cpp[card.id]))
        fallbacks.sort(key=_sort_key)
        entries.extend(fallbacks[: 3 - len(entries)])
    return entries
