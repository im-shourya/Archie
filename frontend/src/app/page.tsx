import Link from "next/link";
import { TEMPLATES, type TemplateId } from "@archie/simulator";
import { RecentBoards } from "@/features/home/RecentBoards";
import styles from "@/features/home/home.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Archie</h1>
      <p className={styles.lede}>
        Talk through a system. Watch it run. Watch it break. Describe an architecture out loud, put
        traffic through it, and see exactly where it fails.
      </p>
      <div className={styles.actions}>
        <Link href="/b/new" className={styles.primary}>
          New board
        </Link>
      </div>

      <section aria-labelledby="templates-heading" className={styles.section}>
        <h2 id="templates-heading" className={styles.sectionTitle}>
          Start from a template
        </h2>
        <div className={styles.grid}>
          {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
            <Link key={id} href={`/b/new?template=${id}`} className={styles.card}>
              <span className={styles.cardTitle}>{TEMPLATES[id].name}</span>
              <span className={styles.muted}>{TEMPLATES[id].description}</span>
            </Link>
          ))}
        </div>
      </section>

      <RecentBoards />
    </main>
  );
}
