import Link from "next/link";
import { Wordmark } from "@/components/brand/LogoMark";
import { SITE } from "@/lib/site";
import styles from "./site.module.css";

const LINKS = [
  { href: "/interview", label: "Interview" },
  { href: "/#templates", label: "Templates" },
  { href: "/evals", label: "Evals" },
  { href: SITE.repo, label: "GitHub" },
];

/**
 * Site navigation for the marketing and reading pages: a slim bar in the glass material, pinned
 * to the top so the page scrolls underneath it (apple.com's global nav). The board has its own.
 */
export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="Archie home">
          <Wordmark size={20} />
        </Link>
        <nav aria-label="Site" className={styles.nav}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={l.href === current ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/b/new?template=three-tier" className={styles.cta}>
          Try the demo
        </Link>
      </div>
    </header>
  );
}
