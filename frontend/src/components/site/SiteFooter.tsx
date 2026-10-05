import Link from "next/link";
import { SITE } from "@/lib/site";
import styles from "./site.module.css";

type FooterLink = { label: string; href: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "The 50k rps demo", href: "/b/new?template=three-tier" },
      { label: "New board", href: "/b/new" },
      { label: "Interview practice", href: "/interview" },
      { label: "Templates", href: "/#templates" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Evals", href: "/evals" },
      { label: "Design system", href: "/design" },
      { label: "Changelog", href: `${SITE.repo}/blob/main/CHANGELOG.md`, external: true },
      { label: "Source code", href: SITE.repo, external: true },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Report an issue", href: `${SITE.repo}/issues`, external: true },
      { label: "Security", href: `${SITE.repo}/security`, external: true },
      { label: "Contributing", href: `${SITE.repo}/blob/main/CONTRIBUTING.md`, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Terms of Use", href: "/legal/terms" },
      { label: "Third-party notices", href: "/legal/third-parties" },
      { label: "Accessibility", href: "/legal/accessibility" },
    ],
  },
];

/** The site footer: a fine-print note, a link directory, then copyright, licence and version. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.fineprint}>
          Archie runs in your browser. Boards are saved on this device only: there are no accounts,
          cookies or analytics. Commands that need the AI tier send your words and board to Google
          Gemini, with Groq as a fallback (<Link href="/legal/privacy#ai-providers">details</Link>).
          Simulator numbers are queueing-model estimates, not benchmarks of real systems.
        </p>

        <nav aria-label="Footer" className={styles.directory}>
          {COLUMNS.map((col) => (
            <div key={col.title} className={styles.column}>
              <h2 className={styles.columnTitle}>{col.title}</h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} rel="noopener">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href}>{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.legalBar}>
          <p>
            Copyright © {year} {SITE.author}. Released under the{" "}
            <a href={`${SITE.repo}/blob/main/LICENSE`} rel="noopener">
              MIT License
            </a>
            .
          </p>
          <p className={styles.meta}>
            <span>Version {SITE.version}</span>
            <span aria-hidden>·</span>
            <span>Built by voice with Wispr Flow</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
