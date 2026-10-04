import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref, type Inline } from "../../frontend/src/lib/markdown";

/** The legal documents (docs/legal) and the parser that renders them. */

const DIR = join(import.meta.dirname, "../../docs/legal");
const DOCS = ["privacy", "terms", "third-parties", "accessibility"];

const links = (nodes: Inline[]): string[] =>
  nodes.flatMap((n) => (n.type === "link" ? [n.href, ...links(n.children)] : n.type === "strong" ? links(n.children) : []));

describe("markdown parser", () => {
  it("parses bold, code and links inside text", () => {
    expect(parseInline("a **b** `c` [d](https://x.org)")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "code", text: "c" },
      { type: "text", text: " " },
      { type: "link", href: "https://x.org", children: [{ type: "text", text: "d" }] },
    ]);
  });

  it.each([
    ["https://example.org", "https://example.org"],
    ["/legal/privacy", "/legal/privacy"],
    ["terms.md", "/legal/terms"],
    ["README.md", "/legal"],
    ["javascript:alert(1)", null],
    ["data:text/html,<b>", null],
    ["http://plain.example", null],
    ["//evil.example", null],
  ])("safeHref(%s)", (href, expected) => {
    expect(safeHref(href)).toBe(expected);
  });

  it("turns an unsafe link into plain text, so nothing can be injected", () => {
    const out = parseInline("[click](javascript:alert(1))");
    expect(out.every((n) => n.type === "text")).toBe(true);
    expect(out.map((n) => (n.type === "text" ? n.text : "")).join("")).toMatch(/^click/);
  });

  it("parses headings, lists, tables and paragraphs", () => {
    const blocks = parseMarkdown("# T\n\nOne\ntwo\n\n- a\n- b\n\n| H | I |\n|---|---|\n| 1 | 2 |\n");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "table"]);
    const table = blocks[3]!;
    if (table.type !== "table") throw new Error("table");
    expect(table.header).toHaveLength(2);
    expect(table.rows).toHaveLength(1);
  });
});

describe("legal documents", () => {
  it.each(DOCS)("%s has a title, an effective date and only safe links", (name) => {
    const blocks = parseMarkdown(readFileSync(join(DIR, `${name}.md`), "utf8"));
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ type: "paragraph", children: [{ type: "text", text: expect.stringMatching(/^Effective \d{1,2} \w+ \d{4}\.$/) }] });
    const raw = readFileSync(join(DIR, `${name}.md`), "utf8");
    const written = [...raw.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!);
    for (const href of written) expect(safeHref(href), `${name}: ${href}`).not.toBeNull();
    const rendered = blocks.flatMap((b) => (b.type === "paragraph" || b.type === "heading" ? links(b.children) : []));
    expect(rendered.length).toBeGreaterThan(0);
  });

  it("the index lists every document, and every document is listed", () => {
    const index = readFileSync(join(DIR, "README.md"), "utf8");
    const files = readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => f.replace(/\.md$/, ""));
    expect(files.sort()).toEqual([...DOCS].sort());
    for (const doc of DOCS) expect(index).toContain(`(${doc}.md)`);
  });

  it("says plainly that the documents are not legal advice", () => {
    expect(readFileSync(join(DIR, "README.md"), "utf8")).toMatch(/not\*\* been reviewed by a lawyer/);
  });
});
