// Eval runner (docs/22): `npm run eval`. Assertions and metrics are importable for tests.
export { check, checkAll, grounded, type Assertion, type Outcome } from "./assertions";
export { computeMetrics, type CaseResult, type Metrics } from "./metrics";
export { loadCases, loadFixtures, type EvalCase } from "./cases";
