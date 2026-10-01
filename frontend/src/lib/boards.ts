import { buildTemplate, emptyGraph, TEMPLATES, type TemplateId } from "@archie/simulator";
import { BOARD_SCHEMA_VERSION, getRepository, newId, type Board } from "@archie/database";

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
