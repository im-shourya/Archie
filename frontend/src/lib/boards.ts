import { applyBatch, buildTemplate, emptyGraph, PROBLEMS, TEMPLATES, type Op, type ProblemId, type TemplateId } from "@archie/simulator";
import { BOARD_SCHEMA_VERSION, getRepository, newId, type Board } from "@archie/database";
import type { InterviewState } from "@/features/interview/state";

/** Create and persist a new board, optionally from a template (FR-040, FR-041). */
export async function createBoard(template?: TemplateId): Promise<string> {
  const repo = await getRepository();
  const now = Date.now();
  const graph = template ? buildTemplate(template) : emptyGraph();
  const board: Board = {
    id: newId(),
    name: template ? TEMPLATES[template].name : "Untitled board",
    schemaVersion: BOARD_SCHEMA_VERSION,
    graph,
    mode: "design",
    problemId: null,
    interview: null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.saveBoard(board);
  if (template) {
    await repo.appendEvent(board.id, {
      id: newId(),
      at: now,
      utterance: null,
      source: "template",
      ops: TEMPLATES[template].ops,
      versionAfter: graph.version,
    });
  }
  return board.id;
}

/**
 * Create an interview board (F-10, docs/34 Step 6): empty design, the problem's peak workload as
 * its first event, and the first question (a deterministic hint, no AI call) in the transcript.
 */
export async function createInterviewBoard(problemId: ProblemId): Promise<string> {
  const problem = PROBLEMS[problemId];
  const repo = await getRepository();
  const now = Date.now();
  const ops: Op[] = [{ type: "setWorkload", rps: problem.requirements.peakRps, readRatio: problem.requirements.readRatio, peakMultiplier: 1 }];
  const result = applyBatch(emptyGraph(), ops);
  if (!result.ok) throw new Error(result.errors[0]?.message ?? "could not apply the workload");
  const interview: InterviewState = {
    startedAt: now,
    transcript: [{ role: "interviewer", text: problem.hints[0]!.question, at: now, source: "hint" }],
    turnsUsed: 0,
    scorecard: null,
  };
  const board: Board = {
    id: newId(),
    name: problem.title.replace(/^Design (a |an )?/, "").replace(/^./, (c) => c.toUpperCase()),
    schemaVersion: BOARD_SCHEMA_VERSION,
    graph: result.graph,
    mode: "interview",
    problemId,
    interview,
    createdAt: now,
    updatedAt: now,
  };
  await repo.saveBoard(board);
  await repo.appendEvent(board.id, { id: newId(), at: now, utterance: null, source: "template", ops, versionAfter: result.graph.version });
  return board.id;
}
