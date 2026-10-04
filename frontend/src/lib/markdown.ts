/**
 * A small Markdown parser for the legal documents (docs/legal). It covers what those files use:
 * headings, paragraphs, bullet lists, tables, **bold**, `code` and links. It returns a tree that
 * is rendered as React elements, never as HTML, so nothing in a document can inject markup.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

/**
 * Links that may be followed: https, site-relative paths, and sibling documents ("terms.md"),
 * which map to their legal page. Anything else (javascript:, data:, http:) becomes plain text.
 */
export function safeHref(href: string): string | null {
  if (/^https:\/\//i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  const doc = /^([a-z0-9-]+)\.md$/i.exec(href);
  if (doc) return doc[1] === "README" ? "/legal" : `/legal/${doc[1]!.toLowerCase()}`;
  return null;
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push({ type: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: "strong", children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ type: "code", text: m[2] });
    else {
      const href = safeHref(m[4]!);
      const children = parseInline(m[3]!);
      out.push(...(href ? [{ type: "link" as const, href, children }] : children));
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const text = heading[2]!.trim();
      blocks.push({
        type: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        text,
        children: parseInline(text),
      });
      i++;
    } else if (line.startsWith("- ")) {
      const items: Inline[][] = [];
      while (i < lines.length && lines[i]!.startsWith("- "))
        items.push(parseInline(lines[i++]!.slice(2).trim()));
      blocks.push({ type: "list", items });
    } else if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) rows.push(lines[i++]!);
      const [head, , ...body] = rows; // the second row is the |---| separator
      blocks.push({ type: "table", header: cells(head!), rows: body.map(cells) });
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i]!.trim() && !/^(#{1,3} |- |\|)/.test(lines[i]!))
        para.push(lines[i++]!.trim());
      blocks.push({ type: "paragraph", children: parseInline(para.join(" ")) });
    }
  }
  return blocks;
}

/** A heading's id for in-page links: "Your choices and rights" → "your-choices-and-rights". */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
