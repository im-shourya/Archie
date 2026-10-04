import { describe, expect, it } from "vitest";
import { wordsToNumbers } from "./numbers";

describe("wordsToNumbers", () => {
  it.each([
    ["fifty thousand", "50000"],
    ["one point two million", "1200000"],
    ["twelve hundred", "1200"],
    ["two hundred fifty thousand", "250000"],
    ["one hundred and fifty", "150"],
    ["a million", "1000000"],
    ["a hundred thousand", "100000"],
    ["twenty five", "25"],
    ["50k", "50000"],
    ["1.5m", "1500000"],
    ["1.2 million", "1200000"],
    ["30", "30"],
    ["ninety", "90"],
    ["zero", "0"],
  ])("%s → %s", (input, expected) => {
    expect(wordsToNumbers(input)).toBe(expected);
  });

  it("keeps surrounding words and separate numbers apart", () => {
    expect(wordsToNumbers("send fifty thousand requests")).toBe("send 50000 requests");
    expect(wordsToNumbers("five replicas of the api")).toBe("5 replicas of the api");
    expect(wordsToNumbers("shard postgres into two")).toBe("shard postgres into 2");
    expect(wordsToNumbers("three five")).toBe("3 5");
  });

  it("doesn't treat a bare scale word or 'a' as a number", () => {
    expect(wordsToNumbers("thousand")).toBe("thousand");
    expect(wordsToNumbers("add a cache")).toBe("add a cache");
    expect(wordsToNumbers("hundreds of servers")).toBe("hundreds of servers");
  });

  it("leaves 'and' alone when it joins commands", () => {
    expect(wordsToNumbers("five and kill redis")).toBe("5 and kill redis");
  });
});
