import { describe, expect, it } from "vitest";
import { stats } from "./stats";

describe("stats", () => {
  it("computes nearest-rank percentiles with the true max", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(stats(samples)).toEqual({ n: 100, p50: 50, p70: 70, p95: 95, p99: 99, p100: 100, mean: 50.5 });
  });

  it("handles a single sample", () => {
    expect(stats([4])).toMatchObject({ n: 1, p50: 4, p100: 4 });
  });

  it("rejects empty input", () => {
    expect(() => stats([])).toThrow();
  });
});
