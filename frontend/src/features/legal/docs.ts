import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, type Block } from "@/lib/markdown";

/** The legal documents (docs/legal), read at build time: the repository is the single source. */
export const LEGAL_DOCS = ["privacy", "terms", "third-parties", "accessibility"] as const;
export type LegalSlug = (typeof LEGAL_DOCS)[number];

export interface LegalDoc {
  title: string;
  /** First paragraph after the title ("Effective 5 October 2026."), shown under it. */
  effective: string | null;
  blocks: Block[];
}

const DIR = join(process.cwd(), "..", "docs", "legal");

export function loadLegalDoc(name: LegalSlug | "README"): LegalDoc {
  const blocks = parseMarkdown(readFileSync(join(DIR, `${name}.md`), "utf8"));
  const [first, second, ...rest] = blocks;
  const title = first?.type === "heading" ? first.text : "Legal";
  const effectiveText =
    second?.type === "paragraph" && second.children.length === 1 && second.children[0]!.type === "text"
      ? second.children[0]!.text
      : null;
  return {
    title,
    effective: effectiveText && /^Effective /.test(effectiveText) ? effectiveText : null,
    blocks: effectiveText && /^Effective /.test(effectiveText) ? rest : blocks.slice(1),
  };
}
