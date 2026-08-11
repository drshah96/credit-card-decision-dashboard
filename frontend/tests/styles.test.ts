import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// jsdom applies no stylesheet, so a deleted CSS rule is structurally invisible
// to every other test in this suite: the component still renders, the roles and
// text are unchanged, and nothing fails. That is exactly how a refactor of this
// file removed the entire `.card-picker*` block plus `.compare-credit-hint`
// while 418 tests stayed green, breaking the picker on /compare and on
// /top-picks, which reuses the same classes.
//
// This can't check that the styling is *right* — only that every class the app
// actually uses has a rule somewhere. That is the half a stylesheet-less test
// runner can still do.

const SRC = join(__dirname, "..", "src");
// Comments are stripped before matching. Without this, a class name mentioned
// only in a comment satisfies the check — index.css currently discusses
// `.card-picker-result` in a comment while having no such rule, so a component
// reintroducing that class would have passed against prose.
const CSS = readFileSync(join(SRC, "index.css"), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Tailwind utilities are generated at build time, not authored in index.css,
 * so they are out of scope here. Anything with a variant prefix or arbitrary
 * value (`md:`, `[...]`, `/`) is Tailwind by construction; the rest is a
 * prefix list. A class wrongly skipped here is a missed check, not a false
 * failure, so keep it tight. */
const TAILWIND =
  /[:[\]/]|^(flex|grid|hidden|sr-only|block|contents|isolate|truncate|uppercase|lowercase|capitalize|italic|underline|antialiased|tabular-nums|absolute|relative|fixed|sticky|static|border|visible|invisible)$|^(flex|grid|text|bg|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|w|h|gap|border|rounded|inline|font|items|justify|self|min|max|overflow|absolute|relative|fixed|sticky|top|left|right|bottom|z|opacity|shadow|transition|duration|ease|cursor|select|whitespace|space|leading|tracking|shrink|grow|basis|order|col|row|place|content|divide|ring|outline|fill|stroke|aspect|object|origin|scale|rotate|translate|skew|animate|backdrop|filter|blur|list|align|table|break|indent|decoration|underline)-/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Class names written as plain string literals in className={...} or ="...". */
function usedClasses(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf-8");
    // Three shapes: className="a b", className={`a b`}, and the interpolated
    // className={`a${cond ? " x" : " y"}`}. The last was previously skipped
    // entirely, which meant the compare trigger's own `active` / `is-required`
    // states — the two classes carrying its visual state — were invisible to
    // this check. Interpolated expressions are dropped and the literal
    // fragments around them are still scanned.
    // Three shapes: className="a b", className={`a b`}, and the interpolated
    // className={`a${cond ? " x" : " y"}`}. The last was previously skipped
    // entirely, which meant the compare trigger's own `active` / `is-required`
    // states — the two classes carrying its visual state — were invisible here.
    for (const m of text.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
      const raw = (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, (expr) => {
        // Only literals in *result* position count. `active === "issuers"`
        // compares against a value that is not a class name, so take literals
        // preceded by ? or : and ignore comparison operands.
        const results = [...expr.matchAll(/[?:]\s*(?:"([^"]*)"|'([^']*)')/g)]
          .map((s) => s[1] ?? s[2])
          .filter(Boolean);
        // An interpolation contributing no literal is a class assembled at
        // runtime. Poison the surrounding token so it is skipped rather than
        // reported as a half-name like "t-".
        return results.length ? ` ${results.join(" ")} ` : "\u0000";
      });
      for (const cls of raw.split(/\s+/).filter(Boolean)) {
        // Tailwind utilities are generated, not authored in index.css.
        if (cls.includes("\u0000") || TAILWIND.test(cls)) continue;
        if (TAILWIND.test(cls)) continue;
        if (!found.has(cls)) found.set(cls, file.replace(SRC, "src"));
      }
    }
  }
  return found;
}

describe("authored classes in className literals have a CSS rule", () => {
  // Scope, stated precisely because the first wording ("every authored class")
  // claimed more than it checks. What it verifies: every class appearing in a
  // className string literal or template literal, including literal fragments
  // inside an interpolation, appears somewhere in a selector in index.css.
  //
  // What it does NOT verify, so nobody trusts it further than it goes:
  //   - that the styling is correct, or present at all in a useful form. jsdom
  //     applies no stylesheet; this is a text search over the CSS source.
  //   - a class assembled at runtime from a variable, e.g. `t-${size}`.
  //   - that a class has its OWN rule. `.x` used only as an ancestor in
  //     `.x .y {}` still counts, so deleting a base rule while keeping a
  //     descendant one passes.
  // Comments are stripped first, so prose mentioning a class does not count.
  it("finds no class referenced in a component but absent from index.css", () => {
    const missing: string[] = [];
    for (const [cls, file] of usedClasses()) {
      // Word-boundary match so `.card-picker` doesn't satisfy `.card-picker-x`.
      if (!new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(CSS)) {
        missing.push(`${cls}  (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("scans a realistic number of classes, so a broken matcher can't pass vacuously", () => {
    expect(usedClasses().size).toBeGreaterThan(60);
  });
});
