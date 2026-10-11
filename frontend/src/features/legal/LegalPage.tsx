import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Wordmark } from "@/components/brand/LogoMark";
import { slug, type Block, type Inline } from "@/lib/markdown";
import type { LegalDoc } from "./docs";
import styles from "./legal.module.css";

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return <Fragment key={i}>{n.text}</Fragment>;
      case "strong":
        return <strong key={i}>{renderInline(n.children)}</strong>;
      case "code":
        return <code key={i}>{n.text}</code>;
      case "link":
        return n.href.startsWith("/") ? (
          <Link key={i} href={n.href}>
            {renderInline(n.children)}
          </Link>
        ) : (
          <a key={i} href={n.href} rel="noopener noreferrer">
            {renderInline(n.children)}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3";
      return (
        <Tag key={i} id={slug(block.text)}>
          {renderInline(block.children)}
        </Tag>
      );
    }
    case "paragraph":
      return <p key={i}>{renderInline(block.children)}</p>;
    case "list":
      return (
        <ul key={i}>
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div key={i} className={styles.tableWrap} tabIndex={0} role="region" aria-label="Table">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, j) => (
                  <th key={j} scope="col">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

const NAV = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/third-parties", label: "Third parties" },
  { href: "/legal/accessibility", label: "Accessibility" },
];

/** A legal document: title, effective date, the rendered Markdown, and links to the others. */
export function LegalPage({ doc, current }: { doc: LegalDoc; current: string }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Archie home">
          <Wordmark size={22} />
        </Link>
        <nav aria-label="Legal" className={styles.nav}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={n.href === current ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className={styles.main}>
        <article className={styles.doc}>
          <h1>{doc.title}</h1>
          {doc.effective && <p className={styles.effective}>{doc.effective}</p>}
          {doc.blocks.map(renderBlock)}
        </article>
      </main>
      <footer className={styles.footer}>
        <Link href="/">Back to Archie</Link>
        <a href="https://github.com/im-shourya/Archie/tree/main/docs/legal">Source on GitHub</a>
      </footer>
    </div>
  );
}
