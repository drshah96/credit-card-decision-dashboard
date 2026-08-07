"""Pins the root README's issuer table to the real catalog (issue #154).

The table sat at "95 cards across 7 issuers" for weeks while the catalog
moved on — on a project whose pitch is accuracy, the README misstating its
own catalog is a credibility bug, and nothing caught it. This does.
"""

import json
import re
from collections import Counter
from pathlib import Path

REPO = Path(__file__).parent.parent.parent


def _catalog_counts() -> Counter:
    counts: Counter = Counter()
    for p in (REPO / "backend" / "data" / "cards").glob("**/*.json"):
        if "staging" in p.parts:
            continue
        counts[json.loads(p.read_text())["issuer"]] += 1
    return counts


def _readme_counts() -> tuple[Counter, int, int]:
    text = (REPO / "README.md").read_text()
    rows = re.findall(r"^\| ([A-Za-z .]+) \| (\d+) \|$", text, flags=re.M)
    table = Counter({name.strip(): int(n) for name, n in rows})
    m = re.search(r"(\d+) cards across (\d+) issuers", text)
    assert m, "README no longer states 'N cards across M issuers'"
    return table, int(m.group(1)), int(m.group(2))


def test_readme_issuer_table_matches_catalog() -> None:
    catalog = _catalog_counts()
    table, total, issuers = _readme_counts()

    assert table == catalog, (
        "README issuer table drifted from the catalog. "
        f"Catalog says: {dict(sorted(catalog.items(), key=lambda kv: -kv[1]))}"
    )
    assert total == sum(catalog.values())
    assert issuers == len(catalog)
