import Link from "next/link";
import { ArrowRight, GraduationCap, Plus } from "lucide-react";
import { TEMPLATES, type TemplateId } from "@archie/simulator";
import { Wordmark } from "@/components/brand/LogoMark";
import { RecentBoards } from "@/features/home/RecentBoards";
import styles from "@/features/home/home.module.css";
import { SITE, siteUrl } from "@/lib/site";

const STEPS = [
  {
    title: "Say it",
    utterance: "“Five replicas of the API.”",
    body: "Short commands apply locally in well under a millisecond. Anything unclear is never guessed.",
  },
  {
    title: "Load it",
    utterance: "“Send fifty thousand requests a second.”",
    body: "Every component shows its load and utilization, and the bottleneck explains itself with the numbers.",
  },
  {
    title: "Break it",
    utterance: "“Kill Redis.”",
    body: "Reads flood the database, replicas saturate, and the blast radius shows exactly what changed.",
  },
];

function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    description: SITE.description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    url: siteUrl().toString(),
    codeRepository: SITE.repo,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  // Static, trusted content built from constants above (no user input).
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export default function Home() {
  return (
    <div className={styles.page}>
      <JsonLd />
      <header className={styles.header}>
        <Link href="/" className={styles.brandLink} aria-label="Archie home">
          <Wordmark size={26} />
        </Link>
        <a href={SITE.repo} className={styles.navLink}>
          Source on GitHub
        </a>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{SITE.tagline}</h1>
        <p className={styles.lede}>
          Archie is a system-design board you talk to. Describe an architecture, put real traffic
          through it, and see where it fails and why, before an interviewer or production does.
        </p>
        <div className={styles.actions}>
          <Link href="/b/new" className={styles.primary}>
            <Plus size={18} aria-hidden /> New board
          </Link>
          <Link href="/b/new?template=three-tier" className={styles.secondary}>
            Open the 50k rps demo <ArrowRight size={18} aria-hidden />
          </Link>
          <Link href="/interview" className={styles.secondary}>
            <GraduationCap size={18} aria-hidden /> Practice an interview
          </Link>
        </div>

        <section aria-labelledby="how-heading" className={styles.section}>
          <h2 id="how-heading" className={styles.sectionTitle}>
            How it works
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, i) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepHead}>
                  <span className={styles.stepNumber}>0{i + 1}</span>
                  {step.title}
                </span>
                <p className={styles.utterance}>{step.utterance}</p>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

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

      <footer className={styles.footer}>
        <span>Built by voice with Wispr Flow.</span>
        <span>Boards stay in your browser.</span>
        <a href={SITE.repo}>MIT licensed</a>
        <Link href="/evals">Evals</Link>
        <Link href="/design">Design system</Link>
      </footer>
    </div>
  );
}
