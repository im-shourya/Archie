import { describe, expect, it } from "vitest";
import { version } from "./health";

describe("version (the deployed commit on /api/health)", () => {
  const sha = "0123456789abcdef";
  it.each<[string, NodeJS.ProcessEnv, string]>([
    ["a stamped image", { ARCHIE_VERSION: sha }, "0123456"],
    ["Render, image built without GIT_SHA", { ARCHIE_VERSION: "dev", RENDER_GIT_COMMIT: "fedcba9876543210" }, "fedcba9"],
    ["Vercel", { VERCEL_GIT_COMMIT_SHA: sha, ARCHIE_VERSION: "dev" }, "0123456"],
    ["a stamped image on Render", { ARCHIE_VERSION: sha, RENDER_GIT_COMMIT: "fedcba9876543210" }, "0123456"],
    ["a local run", {}, "dev"],
  ])("%s", (_name, env, expected) => {
    expect(version(env)).toBe(expected);
  });
});
