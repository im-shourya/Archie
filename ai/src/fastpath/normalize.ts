import { wordsToNumbers } from "./numbers";

/**
 * Normalize a dictated utterance for the grammar (docs/13 §1). Output is lowercase,
 * single-spaced, with numbers as digits, "%" for percentages and "rps" for rate phrases.
 */

/** Common speech-to-text mishearings of infrastructure names. Grows from eval failures. */
const DICTATION_FIXES: [RegExp, string][] = [
  [/\bpost ?gres(?:s| sequel| sql)?\b/g, "postgres"],
  [/\bpost grass\b/g, "postgres"],
  [/\b(?:read|red) is\b/g, "redis"],
  [/\b(?:cough ?ka|cafka|kafca)\b/g, "kafka"],
  [/\bengine ?x\b/g, "nginx"],
  [/\bmy ?sequel\b/g, "mysql"],
  [/\bmongo db\b/g, "mongodb"],
  [/\bdynamo db\b/g, "dynamodb"],
  [/\belastic search\b/g, "elasticsearch"],
  [/\bsequel\b/g, "sql"],
];

const RATE = /\b(?:requests?|reqs?|queries|calls|hits)(?: per| a| each| every)? second\b|\b(?:req\/s|requests\/second|qps|rps)\b/g;

const LEADING_FILLERS =
  /^(?:please|hey archie|archie|okay so|ok so|okay|ok|so|um+|uh+|can you|could you|would you|now|then|and|lets|let us|i want to|i want you to|go ahead and)\s+/;
const TRAILING_FILLERS = /\s+(?:please|for me|now|thanks|thank you)$/;

export function normalize(utterance: string): string {
  let text = utterance
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/'s\b/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // 50,000 → 50000
    .replace(/[^a-z0-9%.\-/ ]+/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ") // keep "." only inside decimals
    .replace(/(^|\s)-+|-+(?=\s|$)/g, " ") // keep hyphens only inside words
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of DICTATION_FIXES) text = text.replace(pattern, replacement);

  // "that one" is a pronoun, not the number 1.
  text = text.replace(/\b(that|this) one\b/g, "$1");
  text = text.replace(/\b(?:um+|uh+)\b\s*/g, "");
  text = wordsToNumbers(text);
  text = text
    .replace(/(\d+(?:\.\d+)?) ?(?:percent|per cent|%)/g, "$1%")
    .replace(/(\d+(?:\.\d+)?) (?:x|times)\b/g, "$1x")
    .replace(RATE, "rps")
    .replace(/\s+/g, " ")
    .trim();

  let previous: string;
  do {
    previous = text;
    text = text.replace(LEADING_FILLERS, "").replace(TRAILING_FILLERS, "").trim();
  } while (text !== previous);
  return text;
}
