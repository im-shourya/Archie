import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Design-system contract (docs/06 · Design system, ADR-015). Colours live as tokens in
 * globals.css; component stylesheets only reference them, so dark mode and contrast stay
 * correct by construction.
 */

const ROOT = join(import.meta.dirname, "../..");
const SRC = join(ROOT, "frontend/src");
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch)\(/gi;

function cssModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssModules(path);
    return entry.name.endsWith(".module.css") ? [path] : [];
  });
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("design tokens", () => {
  const files = cssModules(SRC);

  it("finds the component stylesheets", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))(
    "%s has no raw colour literals",
    (_name, file) => {
      const found = stripComments(readFileSync(file, "utf8")).match(RAW_COLOUR) ?? [];
      expect(found).toEqual([]);
    },
  );

  it("every var(--color-*) used by a module is defined in globals.css", () => {
    const globals = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const defined = new Set([...globals.matchAll(/(--color-[a-z-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set(
      files.flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/var\((--color-[a-z-]+)/g)].map((m) => m[1]),
      ),
    );
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });
});
