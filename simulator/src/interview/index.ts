// Interview mode (F-10): problem bank and simulator-computed SLO checks. The reference designs
// (references.ts) are deliberately not exported: they are the answer key.
export * from "./types";
export { PROBLEMS, PROBLEM_LIST } from "./problems";
export { atPeak, HEADROOM_RHO, sloChecks } from "./checks";
