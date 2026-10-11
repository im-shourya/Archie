import type { Metadata } from "next";
import type { Availability, Stats } from "@archie/evals/report";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { report, RESULTS_URL } from "@/features/evals/data";
import styles from "@/features/evals/evals.module.css";
import { ms, percent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Evals",
  description:
    "How well Archie understands spoken commands, measured on a held-out test set, with latency percentiles for every tier.",
};

/** P50 … P100 in the unit that reads best for the tier (sub-ms stays in ms with decimals). */
function lat(value: number): string {
  return value < 1 ? `${value.toFixed(3)} ms` : ms(value);
}

function Ratio({ n, pass }: { n: number; pass: number }) {
  return (
    <>
      {pass}/{n} <span className={styles.muted}>({percent(n ? pass / n : 0)})</span>
    </>
  );
}

const STAT_COLUMNS: (keyof Stats)[] = ["p50", "p70", "p95", "p99", "p100"];

export default function EvalsPage() {
  const { headline, dev, fastPath, availability, categories, latency, misses, runs } = report;
  const warm = latency.find((l) => l.tier === "AI command (warm)");
  const splits: [string, Availability][] = [
    ["Test", availability.test],
    ...(availability.dev ? [["Dev", availability.dev] as [string, Availability]] : []),
  ];
  const tiles = [
    { label: "Task accuracy, held-out test", value: percent(headline.taskAccuracy), detail: `${headline.cases} cases · target ≥ 90%` },
    { label: "False actions", value: percent(headline.falseActionRate), detail: "acted when it should have asked · target ≤ 2%" },
    { label: "Right kind of response", value: percent(headline.kindAccuracy), detail: "edit, ask, confirm, answer or decline" },
    ...(warm ? [{ label: "AI command, warm P50", value: lat(warm.stats.p50), detail: `P95 ${lat(warm.stats.p95)} · N = ${warm.stats.n}` }] : []),
  ];

  return (
    <div className={styles.page}>
      <SiteHeader current="/evals" />

      <main className={styles.main}>
        <h1 className={styles.title}>Evals</h1>
        <p className={styles.lead}>
          Every spoken command goes through the same path as in the app: the local fast path, then the AI tier, then
          the guardrails and the graph engine. Each case checks the resulting board, not the wording. The test split
          is held out: it never drove a prompt change. Numbers come straight from the committed{" "}
          <a href={RESULTS_URL}>result files</a>.
        </p>

        <ul className={styles.tiles} aria-label="Headline results">
          {tiles.map((t) => (
            <li key={t.label} className={styles.tile}>
              <span className={styles.tileLabel}>{t.label}</span>
              <span className={styles.tileValue}>{t.value}</span>
              <span className={styles.muted}>{t.detail}</span>
            </li>
          ))}
        </ul>

        <section className={styles.section} aria-labelledby="categories">
          <h2 id="categories">By category</h2>
          <div className={styles.scroll} tabIndex={0} role="region" aria-labelledby="categories">
            <table className={styles.table}>
              <caption className={styles.caption}>Cases passed per category, dev and held-out test splits</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Dev</th>
                  <th scope="col">Test</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.category}>
                    <th scope="row">{c.category}</th>
                    <td className={styles.num}>{c.dev ? <Ratio {...c.dev} /> : "–"}</td>
                    <td className={styles.num}>{c.test ? <Ratio {...c.test} /> : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className={styles.facts}>
            {dev && (
              <>
                <dt>Dev split</dt>
                <dd>
                  {percent(dev.taskAccuracy)} task accuracy over {dev.cases} cases, {percent(dev.falseActionRate)} false
                  actions
                </dd>
              </>
            )}
            {splits.map(([split, a]) => (
              <div key={split} className={styles.factRow}>
                <dt>{split}: answered vs. no answer</dt>
                <dd>
                  {a.answered} of {a.cases} got an answer; {a.answered ? percent(a.correct / a.answered) : "–"} of
                  those were right.
                  {a.noAnswer > 0 && ` ${a.noAnswer} timed out or hit a provider outage on the free tier.`}
                </dd>
              </div>
            ))}
            <dt>Over-clarify (asked when it should have acted)</dt>
            <dd>{percent(headline.overClarifyRate)} on test</dd>
            {fastPath && (
              <>
                <dt>Fast path alone (no AI)</dt>
                <dd>
                  handles {percent(fastPath.coverage)} of {fastPath.cases} cases with {percent(fastPath.precision)}{" "}
                  precision; it abstains rather than guess
                </dd>
              </>
            )}
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="latency">
          <h2 id="latency">Latency</h2>
          <div className={styles.scroll} tabIndex={0} role="region" aria-labelledby="latency">
            <table className={styles.table}>
              <caption className={styles.caption}>Percentiles per tier; P100 is the slowest run, never trimmed</caption>
              <thead>
                <tr>
                  <th scope="col">Tier</th>
                  <th scope="col">Source</th>
                  <th scope="col">N</th>
                  {STAT_COLUMNS.map((k) => (
                    <th key={k} scope="col">
                      {k.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latency.map((l) => (
                  <tr key={`${l.tier}-${l.source}`}>
                    <th scope="row">{l.tier}</th>
                    <td>{l.source}</td>
                    <td className={styles.num}>{l.stats.n.toLocaleString("en-US")}</td>
                    {STAT_COLUMNS.map((k) => (
                      <td key={k} className={styles.num}>
                        {lat(l.stats[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            AI timings run on free tiers (a Gemini model ladder with Groq as the fallback), so the tail includes
            failovers between providers.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="misses">
          <h2 id="misses">Misses</h2>
          {misses.length === 0 ? (
            <p className={styles.note}>No failing cases in these runs.</p>
          ) : (
            <ul className={styles.misses}>
              {misses.map((m) => (
                <li key={`${m.split}-${m.id}`}>
                  <code>{m.id}</code> <span className={styles.muted}>({m.split})</span>: expected {m.expected}, {m.reason}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section} aria-labelledby="runs">
          <h2 id="runs">Runs</h2>
          <div className={styles.scroll} tabIndex={0} role="region" aria-labelledby="runs">
            <table className={styles.table}>
              <caption className={styles.caption}>Where each number comes from</caption>
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Cases</th>
                  <th scope="col">Accuracy</th>
                  <th scope="col">False actions</th>
                  <th scope="col">Date</th>
                  <th scope="col">Commit</th>
                  <th scope="col">Prompt</th>
                  <th scope="col">Models</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td className={styles.num}>{r.cases}</td>
                    <td className={styles.num}>{percent(r.taskAccuracy)}</td>
                    <td className={styles.num}>{percent(r.falseActionRate)}</td>
                    <td>{r.date}</td>
                    <td>
                      <code>{r.commit}</code>
                    </td>
                    <td>
                      <code>{r.promptHash}</code>
                    </td>
                    <td>{r.model}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            Method: <a href="https://github.com/im-shourya/Archie/blob/main/docs/22-evaluation.md">evaluation</a> ·{" "}
            <a href="https://github.com/im-shourya/Archie/blob/main/docs/23-eval-dataset.md">dataset</a> ·{" "}
            <a href="https://github.com/im-shourya/Archie/blob/main/docs/24-latency-benchmark.md">latency</a>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
