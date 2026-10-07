import { buildReport } from "@archie/evals/report";
import test from "../../../../evals/results/latest.json";
import dev from "../../../../evals/results/b1-dev.json";
import b0 from "../../../../evals/results/b0-fastpath.json";
import benchFast from "../../../../evals/results/bench-fastpath.json";
import benchSim from "../../../../evals/results/bench-simulator.json";

/**
 * The committed result files (docs/22, 24), read at build time. buildReport validates them, so a
 * malformed file fails the build instead of rendering a wrong number.
 */
export const report = buildReport({ test, dev, b0, benchFast, benchSim });

export const RESULTS_URL = "https://github.com/im-shourya/Archie/tree/main/evals/results";
