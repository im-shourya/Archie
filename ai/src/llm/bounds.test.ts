import { describe, expect, it } from "vitest";
import { findOutOfBounds, isClarifyAnswer } from "./bounds";

describe("findOutOfBounds", () => {
  it.each([
    ["a billion replicas of the api", "replicas", 1e9],
    ["give the api five thousand servers", "replicas", 5000],
    ["scale the workers to two thousand", "replicas", 2000],
    ["send fifty million requests a second", "rps", 5e7],
    ["set the traffic to twelve million rps", "rps", 1.2e7],
    ["shard postgres into three hundred", "shards", 300],
    ["peak is two hundred x", "peakMultiplier", 200],
  ])("%s → %s", (utterance, field, value) => {
    expect(findOutOfBounds(utterance)).toEqual([expect.objectContaining({ field, value })]);
  });

  it.each([
    "give the api fifty servers",
    "send fifty thousand requests a second, ninety percent reads",
    "shard postgres into four",
    "peak is three x",
    "we have two billion users, add a cache",
    "what happens at a billion requests a day",
    "scale the api to forty",
  ])("in bounds or not a bounded field: %s", (utterance) => {
    expect(findOutOfBounds(utterance)).toEqual([]);
  });

  it("recognises a clarify answer", () => {
    expect(isClarifyAnswer("send fifty million rps (answer: Use 10,000,000)")).toBe(true);
    expect(isClarifyAnswer("send fifty million rps")).toBe(false);
  });
});
