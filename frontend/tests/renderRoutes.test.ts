import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generate, renderRoutesYaml, spliceRoutes, BEGIN, END } from "../scripts/renderRoutes.mjs";
import { loadRoutes } from "../scripts/routes.mjs";

// render.yaml's routing rules are generated from the same route list the
// prerender step uses, so a rule exists exactly where a file does.
//
// That coupling is the whole fix. The rules used to be one pattern per shape
// (`/cards/:id`), which also matched ids that are not real cards, and a rewrite
// onto a missing file is answered by Render with 200 and an empty body — not a
// 404, and not a fall-through to the next rule. An unknown card id rendered a
// blank page, and the app never loaded to show its own "Card not found".
//
// The generated file is committed, so the only thing that can break this is
// someone changing the catalog without regenerating. That is what these check.

const RENDER_YAML = join(__dirname, "..", "..", "render.yaml");
const yaml = () => readFileSync(RENDER_YAML, "utf-8");

/** The `source:` of every rule, in file order. */
function sources(text: string): string[] {
  return [...text.matchAll(/^\s+source:\s*(\S+)$/gm)].map((m) => m[1]);
}

describe("render.yaml is in sync with the catalog", () => {
  it("regenerating it changes nothing", async () => {
    const { next, current } = await generate();
    // If this fails, run `npm run generate:routes` in frontend/ and commit.
    expect(next).toBe(current);
  });

  it("has a rule for every prerendered route except the root", async () => {
    const routes = (await loadRoutes()).map((r) => r.path).filter((p) => p !== "/");
    const declared = new Set(sources(yaml()));
    expect(routes.filter((p) => !declared.has(p))).toEqual([]);
  });

  it("declares no rule for a page that is not built", async () => {
    const routes = new Set((await loadRoutes()).map((r) => r.path));
    const extra = sources(yaml()).filter((s) => s !== "/*" && !routes.has(s));
    expect(extra).toEqual([]);
  });

  it("covers every card in the catalog, not merely most of them", async () => {
    const cards = (await loadRoutes()).filter((r) => r.path.startsWith("/cards/"));
    // Guards against the list silently emptying and every assertion above
    // passing over nothing.
    expect(cards.length).toBeGreaterThan(100);
    const declared = new Set(sources(yaml()));
    expect(cards.filter((c) => !declared.has(c.path))).toEqual([]);
  });
});

describe("staged drafts get no routing rule", () => {
  // staging/ is empty today, so asserting over its contents would assert over
  // nothing and pass. A real draft is written for the duration of this test
  // instead — a rule here would mean Render serves a page for a card nobody
  // has approved, the same class of gap as seeding drafts into the catalog.
  it("excludes a draft that exists only in staging", async () => {
    const dir = join(__dirname, "..", "..", "backend", "data", "cards", "staging");
    const file = join(dir, "zzz-test-draft.json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ id: "zzz-test-draft", name: "Draft", issuer: "Test" }));
    try {
      const paths = (await loadRoutes()).map((r) => r.path);
      expect(paths).not.toContain("/cards/zzz-test-draft");
      expect(renderRoutesYaml(paths)).not.toContain("zzz-test-draft");
      // The control: this fixture would be picked up if it were not in staging.
      expect(paths.length).toBeGreaterThan(100);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

describe("the routing rules behave the way the fix depends on", () => {
  it("uses no :param patterns, which is what caused the bug", () => {
    // A pattern matches ids that do not exist. That is the entire defect.
    expect(sources(yaml()).filter((s) => s.includes(":"))).toEqual([]);
  });

  it("keeps the catch-all last and singular", () => {
    const all = sources(yaml());
    expect(all.filter((s) => s === "/*")).toHaveLength(1);
    expect(all[all.length - 1]).toBe("/*");
  });

  it("declares no route twice", () => {
    const all = sources(yaml());
    expect(all.length).toBe(new Set(all).size);
  });

  it("points every rule at its own directory index", () => {
    const pairs = [...yaml().matchAll(/source:\s*(\S+)\n\s*destination:\s*(\S+)/g)];
    expect(pairs.length).toBeGreaterThan(100);
    for (const [, source, destination] of pairs) {
      expect(destination).toBe(source === "/*" ? "/index.html" : `${source}/index.html`);
    }
  });
});

describe("the generator itself", () => {
  it("omits the root, which Render serves natively", () => {
    const block = renderRoutesYaml(["/", "/compare"]);
    expect(block).not.toMatch(/source: \/$/m);
    expect(block).toContain("source: /compare");
  });

  it("puts the catch-all after the specific rules, since Render matches top down", () => {
    const block = renderRoutesYaml(["/cards/x", "/compare"]);
    expect(block.indexOf("source: /*")).toBeGreaterThan(block.indexOf("source: /cards/x"));
  });

  it("emits rules in a stable order, so regenerating produces no diff noise", () => {
    expect(renderRoutesYaml(["/b", "/a", "/c"])).toBe(renderRoutesYaml(["/c", "/b", "/a"]));
  });

  it("refuses to write when the markers are missing rather than silently doing nothing", () => {
    expect(() => spliceRoutes("services:\n  - name: x\n", "block")).toThrow(/markers/);
    expect(() => spliceRoutes(`${END}\n${BEGIN}\n`, "block")).toThrow(/wrong order/);
  });

  it("replaces only the marked region and leaves the rest of the file alone", () => {
    const before = `top:\n${BEGIN}\nold\n${END}\nbottom:\n`;
    const after = spliceRoutes(before, `${BEGIN}\nnew\n${END}`);
    expect(after).toBe(`top:\n${BEGIN}\nnew\n${END}\nbottom:\n`);
  });
});
