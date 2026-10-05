import type { Metadata } from "next";
import Link from "next/link";
import { PROBLEM_LIST } from "@archie/simulator";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import home from "@/features/home/home.module.css";
import { compact } from "@/lib/format";
import styles from "./interview.module.css";

/** Problem picker (F-10, docs/design §5.1). Static: the bank ships with the app. */

export const metadata: Metadata = {
  title: "Practice an interview",
  description:
    "Design a system by voice against real requirements; the simulator checks your SLOs live.",
  robots: { index: false },
};

const percent = (f: number) => `${String(Math.round(f * 100_000) / 1000)}%`;

export default function InterviewPage() {
  return (
    <div className={home.page}>
      <SiteHeader current="/interview" />
      <main className={home.pageMain}>
        <h1 className={home.pageTitle}>Practice a system-design interview</h1>
        <p className={home.pageLede}>
          Pick a problem. The requirements set the load, the simulator checks your SLOs as you
          design by voice, and an interviewer asks one question at a time. Finish for a scorecard.
        </p>
        <ul className={styles.grid} aria-label="Problems">
          {PROBLEM_LIST.map((p) => (
            <li key={p.id}>
              <Link href={`/b/new?problem=${p.id}`} className={styles.card}>
                <span className={styles.difficulty}>{p.difficulty}</span>
                <span className={styles.title}>{p.title}</span>
                <dl className={styles.reqs}>
                  <div>
                    <dt>Peak</dt>
                    <dd>{compact(p.requirements.peakRps)} rps</dd>
                  </div>
                  <div>
                    <dt>Reads</dt>
                    <dd>{Math.round(p.requirements.readRatio * 100)}%</dd>
                  </div>
                  <div>
                    <dt>Read p99</dt>
                    <dd>{p.requirements.p99Ms} ms</dd>
                  </div>
                  <div>
                    <dt>Availability</dt>
                    <dd>{percent(p.requirements.availability)}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
