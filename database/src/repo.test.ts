import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTemplate, type BoardEvent } from "@archie/simulator";
import { createIdbRepository, createMemoryRepository, newId, type BoardRepository } from "./repo";
import { BOARD_SCHEMA_VERSION, MAX_EVENTS_PER_BOARD, type Board } from "./schema";

const board = (overrides: Partial<Board> = {}): Board => ({
  id: newId(),
  name: "Untitled board",
  schemaVersion: BOARD_SCHEMA_VERSION,
  graph: buildTemplate("three-tier"),
  mode: "design",
  problemId: null,
  interview: null,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const event = (overrides: Partial<BoardEvent> = {}): BoardEvent => ({
  id: newId(),
  at: Date.now(),
  utterance: "kill redis",
  source: "fastpath",
  ops: [{ type: "fail", id: "redis" }],
  versionAfter: 1,
  ...overrides,
});

describe.each<[string, () => BoardRepository]>([
  ["IndexedDB", () => {
    globalThis.indexedDB = new IDBFactory();
    return createIdbRepository();
  }],
  ["memory", createMemoryRepository],
])("%s repository", (_name, create) => {
  let repo: BoardRepository;
  beforeEach(() => {
    repo = create();
  });

  it("round-trips a board", async () => {
    const b = board();
    await repo.saveBoard(b);
    expect(await repo.getBoard(b.id)).toEqual(b);
    expect(await repo.getBoard("missing")).toBeNull();
  });

  it("round-trips a board's chat log, and loads boards saved before it", async () => {
    const chat = [
      { id: "t1", at: 1, role: "user" as const, text: "what's the bottleneck?" },
      { id: "t2", at: 2, role: "assistant" as const, text: "Postgres at ρ 0.91.", kind: "answer" as const, focus: ["db"] },
    ];
    const b = board({ chat });
    await repo.saveBoard(b);
    expect((await repo.getBoard(b.id))?.chat).toEqual(chat);
    const legacy = board();
    await repo.saveBoard(legacy);
    expect((await repo.getBoard(legacy.id))?.chat).toBeUndefined();
  });

  it("rejects a chat turn with an unknown role", async () => {
    await expect(repo.saveBoard(board({ chat: [{ id: "t", at: 1, role: "system" as "user", text: "x" }] }))).rejects.toThrow();
  });

  it("lists boards newest first with node counts", async () => {
    await repo.saveBoard(board({ id: "a", name: "Old", updatedAt: 10 }));
    await repo.saveBoard(board({ id: "b", name: "New", updatedAt: 20 }));
    const list = await repo.listBoards();
    expect(list.map((s) => s.name)).toEqual(["New", "Old"]);
    expect(list[0]!.nodeCount).toBe(7);
  });

  it("rejects invalid boards on save", async () => {
    await expect(repo.saveBoard({ ...board(), name: "" })).rejects.toThrow();
  });

  it("appends and lists events in order, and deletes them with the board", async () => {
    const b = board();
    await repo.saveBoard(b);
    const first = event();
    const second = event({ utterance: "bring it back", ops: [{ type: "recover", id: "redis" }] });
    await repo.appendEvent(b.id, first);
    await repo.appendEvent(b.id, second);
    expect(await repo.listEvents(b.id)).toEqual([first, second]);
    await repo.deleteBoard(b.id);
    expect(await repo.getBoard(b.id)).toBeNull();
    expect(await repo.listEvents(b.id)).toEqual([]);
  });

  it(`caps events at ${MAX_EVENTS_PER_BOARD} per board, trimming the oldest`, async () => {
    const b = board();
    for (let i = 0; i < MAX_EVENTS_PER_BOARD + 3; i++) await repo.appendEvent(b.id, event());
    const events = await repo.listEvents(b.id);
    expect(events).toHaveLength(MAX_EVENTS_PER_BOARD);
  });

  it("returns default settings and persists changes", async () => {
    expect(await repo.getSetting("handsFree")).toBe(false);
    await repo.setSetting("handsFree", true);
    expect(await repo.getSetting("handsFree")).toBe(true);
  });
});

describe("IndexedDB corrupt records", () => {
  it("skips corrupt boards instead of throwing", async () => {
    globalThis.indexedDB = new IDBFactory();
    const repo = createIdbRepository();
    await repo.saveBoard(board({ id: "good" }));
    const { openDB } = await import("idb");
    const db = await openDB("archie", 1);
    await db.put("boards", { id: "bad", name: 42 } as never);
    db.close();
    expect((await repo.listBoards()).map((s) => s.id)).toEqual(["good"]);
    expect(await repo.getBoard("bad")).toBeNull();
  });
});
