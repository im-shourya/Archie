import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";

describe("normalize", () => {
  it.each([
    ["Send fifty thousand requests a second, ninety percent reads.", "send 50000 rps 90% reads"],
    ["Kill Redis.", "kill redis"],
    ["Um, okay so, kill the read is cache please", "kill the redis cache"],
    ["Shard Post Gres into two.", "shard postgres into 2"],
    ["Put cough ka in front of the writes", "put kafka in front of the writes"],
    ["50,000 RPS", "50000 rps"],
    ["set peak to three x", "set peak to 3x"],
    ["Bring that one back", "bring that back"],
    ["Postgres replica one", "postgres replica 1"],
    ["Hey Archie, can you undo that?", "undo that"],
    ["redis's hit rate to 95 percent", "redis hit rate to 95%"],
    ["1.5k qps", "1500 rps"],
  ])("%s → %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it("keeps hyphens inside ids", () => {
    expect(normalize("kill pg-r1")).toBe("kill pg-r1");
  });
});
