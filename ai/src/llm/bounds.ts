import { MAX_RPS } from "@archie/simulator";
import { normalize } from "../fastpath";

/**
 * G-05 in code: find numbers the user asked for that the op language can't hold (docs/14).
 * Models tend to clamp them silently ("fifty million rps" → 10,000,000) or shrug (noop), and a
 * silently changed number is a false action. The guardrail turns these into a clarify instead.
 * Works on the fast path's normalized text, so spoken numbers are already digits.
 */

export interface OutOfBounds {
  field: "rps" | "replicas" | "shards" | "peakMultiplier";
  value: number;
  max: number;
  noun: string;
}

const N = String.raw`(\d+(?:\.\d+)?)`;
const REPLICA_WORDS = String.raw`(?:replicas?|servers?|instances?|copies|boxes|machines|pods|nodes|workers|containers)`;

const RULES: { field: OutOfBounds["field"]; max: number; noun: string; patterns: RegExp[] }[] = [
  {
    field: "rps",
    max: MAX_RPS,
    noun: "requests per second",
    patterns: [new RegExp(`${N}\\s*(?:rps|qps)\\b`), new RegExp(`\\b(?:traffic|workload|load)\\b.*?\\bto\\s+${N}\\b`)],
  },
  {
    field: "replicas",
    max: 1000,
    noun: "replicas",
    patterns: [new RegExp(`${N}\\s+(?:\\w+\\s+)?${REPLICA_WORDS}\\b`), new RegExp(`\\bscale\\b.*?\\bto\\s+${N}\\b(?!\\s*(?:rps|qps|x)\\b)`)],
  },
  {
    field: "shards",
    max: 256,
    noun: "shards",
    patterns: [new RegExp(`${N}\\s+(?:shards?|partitions?)\\b`), new RegExp(`\\bshard\\w*\\b.*?\\binto\\s+${N}\\b`)],
  },
  {
    field: "peakMultiplier",
    max: 100,
    noun: "× peak",
    patterns: [new RegExp(`\\bpeak\\b.*?\\b${N}\\s*(?:x|times)\\b`), new RegExp(`\\b${N}\\s*(?:x|times)\\s+(?:at\\s+)?peak\\b`)],
  },
];

export function findOutOfBounds(utterance: string): OutOfBounds[] {
  const text = normalize(utterance);
  const found: OutOfBounds[] = [];
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const m = pattern.exec(text);
      const value = m ? Number(m[1]) : NaN;
      if (value > rule.max) {
        found.push({ field: rule.field, value, max: rule.max, noun: rule.noun });
        break;
      }
    }
  }
  return found;
}

/** The clarify round-trip appends "(answer: …)": the user already chose, so don't ask again. */
export function isClarifyAnswer(utterance: string): boolean {
  // Greedy to the last ")": option labels can contain parentheses ("Postgres (primary)").
  return /\(answer:.*\)\s*$/i.test(utterance);
}
