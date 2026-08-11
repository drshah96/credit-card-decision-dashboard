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
const CSS = readFileSync(join(SRC, "index.css"), "utf-8");

/** Tailwind utilities are generated at build time, not authored in index.css,
 * so they are out of scope here. Anything with a variant prefix or arbitrary
 * value (`md:`, `[...]`, `/`) is Tailwind by construction; the rest is a
 * prefix list. A class wrongly skipped here is a missed check, not a false
 * failure, so keep it tight. */
const TAILWIND =
  /[:[\]/]|^(flex|grid|hidden|sr-only|block|contents|isolate|truncate|uppercase|lowercase|capitalize|italic|underline|antialiased|absolute|relative|fixed|sticky|static|border|visible|invisible)$|^(flex|grid|text|bg|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|w|h|gap|border|rounded|inline|font|items|justify|self|min|max|overflow|absolute|relative|fixed|sticky|top|left|right|bottom|z|opacity|shadow|transition|duration|ease|cursor|select|whitespace|space|leading|tracking|shrink|grow|basis|order|col|row|place|content|divide|ring|outline|fill|stroke|aspect|object|origin|scale|rotate|translate|skew|animate|backdrop|filter|blur|list|align|table|break|indent|decoration|underline)-/;

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
    for (const m of text.matchAll(/className=(?:"([^"{}]+)"|\{`([^`${}]+)`\})/g)) {
      for (const cls of (m[1] ?? m[2]).split(/\s+/).filter(Boolean)) {
        // Tailwind utilities are generated, not authored in index.css.
        if (TAILWIND.test(cls)) continue;
        if (!found.has(cls)) found.set(cls, file.replace(SRC, "src"));
      }
    }
  }
  return found;
}

describe("every authored class the app uses has a CSS rule", () => {
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
