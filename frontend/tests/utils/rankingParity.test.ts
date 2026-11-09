import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CardSummary } from "../../src/types/cards";
import {
  BRAND_EXCLUDES,
  LIMITED_RATE,
  ROTATING_RATE,
  CATEGORY_MATCHERS,
  CENTS_PER_GALLON,
  TOP_PICK_CATEGORIES,
  WHOLESALE_EXCLUDES,
  computeTopPicks,
  rankCategory,
} from "../../src/utils/topPickCategories";

// The MCP server's Python ranking is pinned to the expected.json written here.
// Regeneration steps are in tests/backend/mcp_server/test_ranking_parity.py.
const FIXTURE_DIR = resolve(__dirname, "../../../tests/fixtures/ranking_parity");

interface Scenario {
  name: string;
  card_ids: string[] | null;
  pooling: boolean;
  own_cards: boolean;
}

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as T;
}

const summaries = readFixture<CardSummary[]>("summaries.json");
const scenarios = readFixture<Scenario[]>("scenarios.json");

function cardsFor(scenario: Scenario): CardSummary[] {
  if (scenario.card_ids === null) return summaries;
  const wanted = new Set(scenario.card_ids);
  return summaries.filter((card) => wanted.has(card.id));
}

function describeRegex(regex: RegExp) {
  return { source: regex.source, flags: regex.flags };
}

function rankScenario(scenario: Scenario) {
  const cards = cardsFor(scenario);
  return Object.fromEntries(
    TOP_PICK_CATEGORIES.map((category) => {
      const ranked = rankCategory(cards, category.key, {
        applyPointsPooling: scenario.pooling,
        ownCards: scenario.own_cards,
      });
      return [
        category.key,
        {
          total: ranked.length,
          real: ranked.filter((entry) => !entry.isFallback).length,
          top: ranked
            .slice(0, 10)
            .map((e) => [e.card.id, e.effectiveValue, e.multiplier, e.isFallback, e.isPooled]),
        },
      ];
    }),
  );
}

// One line per scenario and category, so a ranking change is a readable diff.
function formatScenarios(results: Record<string, Record<string, unknown>>): string {
  const blocks = Object.entries(results).map(([name, rows]) => {
    const lines = Object.entries(rows).map(
      ([key, row]) => `   ${JSON.stringify(key)}: ${JSON.stringify(row)}`,
    );
    return `  ${JSON.stringify(name)}: {\n${lines.join(",\n")}\n  }`;
  });
  return `{\n${blocks.join(",\n")}\n }`;
}

describe("ranking parity fixture", () => {
  it("records every definition and ranking the Python port must match", async () => {
    const definitions = {
      categories: TOP_PICK_CATEGORIES,
      matchers: Object.fromEntries(
        Object.entries(CATEGORY_MATCHERS).map(([key, regex]) => [key, describeRegex(regex)]),
      ),
      wholesale_excludes: WHOLESALE_EXCLUDES,
      brand_excludes: Object.fromEntries(
        Object.entries(BRAND_EXCLUDES).map(([key, regex]) => [key, describeRegex(regex)]),
      ),
      limited_rate: describeRegex(LIMITED_RATE),
      rotating_rate: describeRegex(ROTATING_RATE),
      cents_per_gallon: describeRegex(CENTS_PER_GALLON),
      names_sorted: summaries.map((card) => card.name).sort((a, b) => a.localeCompare(b)),
    };
    const results = Object.fromEntries(
      scenarios.map((scenario) => [scenario.name, rankScenario(scenario)]),
    );
    const head = JSON.stringify(definitions, null, 1).replace(/\n}$/, "");
    const body = `${head},\n "scenarios": ${formatScenarios(results)}\n}\n`;
    await expect(body).toMatchFileSnapshot(resolve(FIXTURE_DIR, "expected.json"));
  });

  it("keeps rankCategory's first three entries equal to computeTopPicks's slots", () => {
    for (const scenario of scenarios) {
      const options = { applyPointsPooling: scenario.pooling, ownCards: scenario.own_cards };
      const cards = cardsFor(scenario);
      for (const row of computeTopPicks(cards, options)) {
        const ranked = rankCategory(cards, row.key, options);
        expect([row.topChoice, row.runnerUp, row.honorableMention]).toEqual([
          ranked[0],
          ranked[1],
          ranked[2],
        ]);
      }
    }
  });
});
