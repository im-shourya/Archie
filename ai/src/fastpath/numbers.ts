/**
 * Spoken numbers → digits (docs/13 §1): "fifty thousand" → 50000, "one point two million" →
 * 1200000, "twelve hundred" → 1200, "50k" → 50000. Pure, token based.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };
const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

type Kind = "unit" | "tens" | "hundred" | "scale" | "digits";

function classify(token: string): { kind: Kind; value: number } | null {
  if (token in UNITS) return { kind: "unit", value: UNITS[token]! };
  if (token in TENS) return { kind: "tens", value: TENS[token]! };
  if (token === "hundred") return { kind: "hundred", value: 100 };
  if (token in SCALES) return { kind: "scale", value: SCALES[token]! };
  const suffixed = /^(\d+(?:\.\d+)?)([kmb])$/.exec(token);
  if (suffixed) return { kind: "digits", value: Number(suffixed[1]) * SUFFIX[suffixed[2]!]! };
  if (/^\d+(?:\.\d+)?$/.test(token)) return { kind: "digits", value: Number(token) };
  return null;
}

/** Which token kinds may follow which inside one number. */
const FOLLOWS: Record<Kind | "start", readonly Kind[]> = {
  start: ["unit", "tens", "digits", "hundred", "scale"],
  unit: ["hundred", "scale"],
  tens: ["unit", "hundred", "scale"],
  digits: ["hundred", "scale"],
  hundred: ["unit", "tens", "scale"],
  scale: ["unit", "tens", "digits"],
};

function format(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)));
}

/** Replace every spoken or suffixed number in a space-separated, lowercased string. */
export function wordsToNumbers(text: string): string {
  const tokens = text.split(" ").filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const first = tokens[i]!;
    const firstClass = classify(first);
    // "a hundred", "a thousand", "a million"
    const articleScale = first === "a" && /^(hundred|thousand|million|billion)$/.test(tokens[i + 1] ?? "");
    if (!firstClass && !articleScale) {
      out.push(first);
      i++;
      continue;
    }
    // A bare scale word ("thousand") without a number isn't a number on its own.
    if (firstClass && (firstClass.kind === "scale" || firstClass.kind === "hundred")) {
      out.push(first);
      i++;
      continue;
    }

    let total = 0;
    let current = articleScale ? 1 : 0;
    let last: Kind | "start" = articleScale ? "unit" : "start";
    let j = articleScale ? i + 1 : i;
    while (j < tokens.length) {
      const token = tokens[j]!;
      // "one hundred and fifty": 'and' is part of the number only after hundred/scale.
      if (token === "and" && (last === "hundred" || last === "scale")) {
        const next = classify(tokens[j + 1] ?? "");
        if (next && (next.kind === "unit" || next.kind === "tens")) {
          j++;
          continue;
        }
        break;
      }
      // "one point two": decimals after a unit/tens/digits value.
      if (token === "point" && (last === "unit" || last === "tens" || last === "digits")) {
        let k = j + 1;
        let decimals = "";
        while (k < tokens.length && tokens[k]! in UNITS && UNITS[tokens[k]!]! < 10) {
          decimals += String(UNITS[tokens[k]!]);
          k++;
        }
        if (!decimals) break;
        current += Number(`0.${decimals}`);
        last = "digits";
        j = k;
        continue;
      }
      const cls = classify(token);
      if (!cls || !FOLLOWS[last].includes(cls.kind)) break;
      if (cls.kind === "hundred") current = (current || 1) * 100;
      else if (cls.kind === "scale") {
        total += (current || 1) * cls.value;
        current = 0;
      } else current += cls.value;
      last = cls.kind;
      j++;
    }
    out.push(format(total + current));
    i = j;
  }
  return out.join(" ");
}
