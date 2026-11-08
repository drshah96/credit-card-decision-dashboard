"""End and change dates written into a card's served text, so a check isn't relied on past them.

A rate such as "Travel through Dec 31, 2026" or "This quarter (Q4): dining" stops being true on a
known day, and a credit that changes "on or after January 1, 2027" may not land as described. A
check made before either can only vouch for the card until then, so review_due_on takes the
earliest such date. The phrasings are the catalog's own, and test_end_dates fails on one this
can't read.
"""

import calendar
import re
from collections.abc import Iterator
from datetime import date

from backend.models import Card

_MONTHS = {
    name: number
    for number in range(1, 13)
    for name in (calendar.month_name[number].lower(), calendar.month_abbr[number].lower())
}
_MONTHS["sept"] = 9
_MONTH = "|".join(sorted(_MONTHS, key=len, reverse=True))

# "through", "thru", "until", "ends", "end of", "expires", then an optional "the" before the date.
_LEAD = r"\b(?:through|thru|until|ends?(?:\s+of)?|expires?)\s+(?:the\s+)?"
_MONTH_DAY_YEAR = re.compile(_LEAD + rf"({_MONTH})\.?\s+(\d{{1,2}}),?\s+(20\d\d)\b", re.I)
_MONTH_YEAR = re.compile(_LEAD + rf"({_MONTH})\.?\s+(20\d\d)\b", re.I)
_NUMERIC = re.compile(_LEAD + r"(\d{1,2})/(\d{1,2})/(20\d\d)\b", re.I)
_YEAR = re.compile(_LEAD + r"(20\d\d)\b", re.I)
_QUARTER = re.compile(r"\bthis quarter\s*\(Q([1-4])\)", re.I)
# A change takes effect on the first day of a period, not its last. "from" is in the list only
# when a full date follows it at once, so "cut from 1¢ in Aug 2025" isn't read as a date.
_CHANGE = r"\b(?:on or after|starting|beginning|effective|from)\s+(?:the\s+|in\s+)?"
_CHANGE_DAY = re.compile(_CHANGE + rf"({_MONTH})\.?\s+(\d{{1,2}}),?\s+(20\d\d)\b", re.I)
_CHANGE_MONTH = re.compile(_CHANGE + rf"({_MONTH})\.?\s+(20\d\d)\b", re.I)
# A bare year is a change only after a word that can't mean anything else: "Starting in 2027".
_CHANGE_YEAR = re.compile(
    r"\b(?:on or after|starting|beginning|effective)\s+(?:in\s+)?(20\d\d)\b", re.I
)
CHANGE_PHRASE = re.compile(
    r"\b(?:on or after|starting|beginning|effective)\b[^.;()]{0,24}?\b20\d\d\b", re.I
)
# Every phrase above, for the test that no dated wording slips past the parsers.
DATED_PHRASE = re.compile(
    _LEAD + r"[^.;()]{0,24}?\b20\d\d\b|\bthis quarter\b(?:\s*\(Q[1-4]\))?", re.I
)


def _month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def dates_in(text: str, checked_on: date) -> list[date]:
    """Every end date in one string. A quarter takes its year from the check, rolling forward if
    that quarter had already ended when the card was checked."""
    found: list[date] = []
    taken: list[tuple[int, int]] = []

    def claim(match: re.Match) -> bool:
        span = match.span()
        if any(start < span[1] and span[0] < end for start, end in taken):
            return False
        taken.append(span)
        return True

    for match in _MONTH_DAY_YEAR.finditer(text):
        if claim(match):
            month, day, year = match.groups()
            found.append(date(int(year), _MONTHS[month.lower()], int(day)))
    for match in _NUMERIC.finditer(text):
        if claim(match):
            month, day, year = match.groups()
            found.append(date(int(year), int(month), int(day)))
    for match in _MONTH_YEAR.finditer(text):
        if claim(match):
            month, year = match.groups()
            found.append(_month_end(int(year), _MONTHS[month.lower()]))
    for match in _YEAR.finditer(text):
        if claim(match):
            found.append(date(int(match.group(1)), 12, 31))
    for match in _CHANGE_DAY.finditer(text):
        if claim(match):
            month, day, year = match.groups()
            found.append(date(int(year), _MONTHS[month.lower()], int(day)))
    for match in _CHANGE_MONTH.finditer(text):
        if claim(match):
            month, year = match.groups()
            found.append(date(int(year), _MONTHS[month.lower()], 1))
    for match in _CHANGE_YEAR.finditer(text):
        if claim(match):
            found.append(date(int(match.group(1)), 1, 1))
    for match in _QUARTER.finditer(text):
        end = _month_end(checked_on.year, int(match.group(1)) * 3)
        found.append(end if end >= checked_on else _month_end(end.year + 1, end.month))
    return found


# History, not current terms. welcome_bonus is never served and model_dump leaves it out.
_NOT_CURRENT = frozenset({"timeline", "welcome_bonus"})


def _strings(value) -> Iterator[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def served_text(card: Card) -> Iterator[str]:
    """Every string an agent can be served as a current term: notes, tips and verdicts included,
    because any of them can say when a term ends. Removed credits are history, so they're out."""
    data = card.model_dump()
    data["credits"] = [credit for credit in data["credits"] if not credit["removed"]]
    yield from _strings({k: v for k, v in data.items() if k not in _NOT_CURRENT})


def earliest_end(card: Card, checked_on: date) -> date | None:
    """The first end date on or after the check. Earlier dates describe what had already
    changed by then, so they can't shorten the check."""
    ends = [d for text in served_text(card) for d in dates_in(text, checked_on) if d >= checked_on]
    return min(ends, default=None)
