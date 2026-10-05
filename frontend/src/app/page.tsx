import Link from "next/link";
import { ArrowRight, ArrowUpRight, CaretRight, Plus } from "@phosphor-icons/react/dist/ssr";
import { TEMPLATES, type TemplateId } from "@archie/simulator";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Reveal, ScrollProgress, WordReveal } from "@/features/home/Motion";
import { OpenFile } from "@/features/home/OpenFile";
import { RecentBoards } from "@/features/home/RecentBoards";
import styles from "@/features/home/home.module.css";
import { report } from "@/features/evals/data";
import { ms, percent } from "@/lib/format";
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
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

/** Real numbers from the committed eval and bench results (the same source as /evals). */
function measured() {
  const fast = report.latency.find((l) => l.tier.startsWith("Fast path"));
  const ai =
    report.latency.find((l) => l.tier === "AI command (warm)" && l.source.startsWith("deployed")) ??
    report.latency.find((l) => l.tier === "AI command (warm)");
  return [
    {
      value: percent(report.headline.taskAccuracy),
      label: `of ${report.headline.cases} held-out spoken commands understood`,
    },
    {
      value: percent(report.headline.falseActionRate),
      label: "false actions: it asks instead of guessing",
    },
    // Sub-millisecond: three decimals, as on /evals ("0.006 ms", not "0.0 ms").
    ...(fast
      ? [
          {
            value: fast.stats.p50 < 1 ? `${fast.stats.p50.toFixed(3)} ms` : ms(fast.stats.p50),
            label: "to apply a simple command, locally",
          },
        ]
      : []),
    ...(ai
      ? [{ value: ms(ai.stats.p50), label: `median for the AI tier (${ai.source.split(",")[0]})` }]
      : []),
  ];
}

export default function Home() {
  const [first, ...rest] = SITE.tagline.split(". ");
  return (
    <div className={styles.page}>
      <JsonLd />
      <SiteHeader />

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title" className={styles.title}>
            <span className={styles.titleFirst}>{first}.</span>
            <span className={styles.titleRest}>{rest.join(". ")}</span>
          </h1>
          <p className={styles.lede}>
            Archie is a system-design board you talk to. Describe an architecture, put real traffic
            through it, and see where it fails and why, before an interviewer or production does.
          </p>
          <div className={styles.actions}>
            <Link href="/b/new?template=three-tier" className={styles.primary}>
              Open the 50k rps demo <ArrowRight size={16} weight="bold" aria-hidden />
            </Link>
            <Link href="/b/new" className={styles.secondary}>
              <Plus size={16} weight="bold" aria-hidden /> New board
            </Link>
          </div>
          <p className={styles.alsoLinks}>
            Or <Link href="/interview">practice a system-design interview</Link>, or <OpenFile />
          </p>
        </section>

        {/* The board rises and flattens as you scroll (scroll-scrubbed; static with reduced motion). */}
        <ScrollProgress mode="pin" as="section" className={styles.stage}>
          <div className={styles.stageSticky}>
            <figure className={styles.heroVisual}>
              <picture>
                {/* Phones get a close-up: the full board would be unreadable at 360 px. */}
                <source
                  srcSet="/home/board-crop-dark.jpg"
                  media="(max-width: 767px) and (prefers-color-scheme: dark)"
                  width={1280}
                  height={840}
                />
                <source srcSet="/home/board-crop-light.jpg" media="(max-width: 767px)" width={1280} height={840} />
                <source srcSet="/home/board-dark.jpg" media="(prefers-color-scheme: dark)" />
                <img
                  src="/home/board-light.jpg"
                  width={2160}
                  height={1245}
                  fetchPriority="high"
                  alt="An Archie board at 50,000 requests a second: Postgres is saturated at ρ 1.40, and a note explains the math"
                />
              </picture>
              <figcaption className={styles.stageCaption}>
                50,000 requests a second. Postgres saturates at ρ 1.40, and the board says why.
              </figcaption>
            </figure>
          </div>
        </ScrollProgress>

        <section aria-labelledby="how-heading" className={styles.section}>
          <Reveal>
            <h2 id="how-heading" className={styles.sectionTitle}>
              Say it. Load it. Break it.
            </h2>
            <p className={styles.sectionLede}>Three sentences, out loud, from an empty board to a failure you can explain.</p>
          </Reveal>
          <ol className={styles.steps}>
            {STEPS.map((step, i) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber}>0{i + 1}</span>
                <WordReveal text={step.utterance} className={styles.utterance} />
                <div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="measured-heading" className={styles.section}>
          <Reveal>
            <h2 id="measured-heading" className={styles.sectionTitle}>
              Measured, not claimed.
            </h2>
            <p className={styles.sectionLede}>Straight from the committed eval and bench results.</p>
          </Reveal>
          <dl className={styles.measured}>
            {measured().map((m, i) => (
              <Reveal key={m.label} className={styles.metric} delay={i * 80}>
                <dt>{m.label}</dt>
                <dd>{m.value}</dd>
              </Reveal>
            ))}
          </dl>
          <p className={styles.sectionLink}>
            <Link href="/evals">
              Every run, case and percentile on the evals page <ArrowUpRight size={14} aria-hidden />
            </Link>
          </p>
        </section>

        <section id="templates" aria-labelledby="templates-heading" className={styles.section}>
          <Reveal>
            <h2 id="templates-heading" className={styles.sectionTitle}>
              Start from a template.
            </h2>
          </Reveal>
          <ul className={styles.templates}>
            {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
              <li key={id}>
                <Link href={`/b/new?template=${id}`} className={styles.template}>
                  <span className={styles.templateName}>{TEMPLATES[id].name}</span>
                  <span className={styles.templateDesc}>{TEMPLATES[id].description}</span>
                  <CaretRight size={16} weight="bold" aria-hidden className={styles.templateArrow} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <RecentBoards />

        <Reveal as="section" className={styles.closing}>
          <h2 className={styles.closingTitle}>Find the bottleneck before it finds you.</h2>
          <div className={styles.actions}>
            <Link href="/b/new?template=three-tier" className={styles.primary}>
              Open the demo <ArrowRight size={16} weight="bold" aria-hidden />
            </Link>
            <Link href="/interview" className={styles.secondary}>
              Practice an interview
            </Link>
          </div>
        </Reveal>
      </main>

      <SiteFooter />
    </div>
  );
}
