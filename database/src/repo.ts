import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { decodeTime, monotonicFactory } from "ulid";
import type { BoardEvent } from "@archie/simulator";
import {
  BoardSchema,
  DB_NAME,
  DB_VERSION,
  DEFAULT_SETTINGS,
  MAX_EVENTS_PER_BOARD,
  SettingsSchema,
  StoredEventSchema,
  type Board,
  type BoardSummary,
  type SettingKey,
  type Settings,
  type StoredEvent,
} from "./schema";

/** Repository API (docs/17). Reads are validated; corrupt records are skipped, never thrown. */
export interface BoardRepository {
  readonly persistent: boolean;
  listBoards(): Promise<BoardSummary[]>;
  getBoard(id: string): Promise<Board | null>;
  saveBoard(board: Board): Promise<void>;
  deleteBoard(id: string): Promise<void>;
  appendEvent(boardId: string, event: BoardEvent): Promise<void>;
  listEvents(boardId: string): Promise<BoardEvent[]>;
  getSetting<K extends SettingKey>(key: K): Promise<Settings[K]>;
  setSetting<K extends SettingKey>(key: K, value: Settings[K]): Promise<void>;
}

const nextUlid = monotonicFactory();
export const newId = (): string => nextUlid().toLowerCase();
export const idTime = (id: string): number => decodeTime(id.toUpperCase());

interface ArchieDB extends DBSchema {
  boards: { key: string; value: Board; indexes: { "by-updatedAt": number } };
  events: { key: string; value: StoredEvent; indexes: { "by-board": string } };
  settings: { key: string; value: { key: string; value: unknown } };
}

function summarize(board: Board): BoardSummary {
  return { id: board.id, name: board.name, nodeCount: board.graph.nodes.length, updatedAt: board.updatedAt };
}

function warnCorrupt(what: string, id: unknown): void {
  console.warn(`[archie/database] skipped corrupt ${what}`, id);
}

/** IndexedDB-backed repository. Uses the global `indexedDB` (tests swap it with fake-indexeddb). */
export function createIdbRepository(): BoardRepository {
  let dbPromise: Promise<IDBPDatabase<ArchieDB>> | null = null;
  const db = () =>
    (dbPromise ??= openDB<ArchieDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        // One case per version; never edit a released case.
        if (oldVersion < 1) {
          database.createObjectStore("boards", { keyPath: "id" }).createIndex("by-updatedAt", "updatedAt");
          database.createObjectStore("events", { keyPath: "id" }).createIndex("by-board", "boardId");
          database.createObjectStore("settings", { keyPath: "key" });
        }
      },
    }));

  return {
    persistent: true,
    async listBoards() {
      const all = await (await db()).getAllFromIndex("boards", "by-updatedAt");
      return all
        .flatMap((raw) => {
          const parsed = BoardSchema.safeParse(raw);
          if (!parsed.success) warnCorrupt("board", (raw as { id?: unknown })?.id);
          return parsed.success ? [summarize(parsed.data)] : [];
        })
        .reverse();
    },
    async getBoard(id) {
      const raw = await (await db()).get("boards", id);
      if (!raw) return null;
      const parsed = BoardSchema.safeParse(raw);
      if (!parsed.success) warnCorrupt("board", id);
      return parsed.success ? parsed.data : null;
    },
    async saveBoard(board) {
      await (await db()).put("boards", BoardSchema.parse(board));
    },
    async deleteBoard(id) {
      const tx = (await db()).transaction(["boards", "events"], "readwrite");
      await tx.objectStore("boards").delete(id);
      const keys = await tx.objectStore("events").index("by-board").getAllKeys(id);
      await Promise.all(keys.map((key) => tx.objectStore("events").delete(key)));
      await tx.done;
    },
    async appendEvent(boardId, event) {
      const tx = (await db()).transaction("events", "readwrite");
      await tx.store.put(StoredEventSchema.parse({ id: event.id, boardId, event }));
      const keys = await tx.store.index("by-board").getAllKeys(boardId);
      const excess = keys.length - MAX_EVENTS_PER_BOARD;
      if (excess > 0) {
        const oldest = [...keys].sort().slice(0, excess);
        await Promise.all(oldest.map((key) => tx.store.delete(key)));
      }
      await tx.done;
    },
    async listEvents(boardId) {
      const all = await (await db()).getAllFromIndex("events", "by-board", boardId);
      return all
        .flatMap((raw) => {
          const parsed = StoredEventSchema.safeParse(raw);
          if (!parsed.success) warnCorrupt("event", (raw as { id?: unknown })?.id);
          return parsed.success ? [parsed.data.event] : [];
        })
        .sort((a, b) => a.id.localeCompare(b.id));
    },
    async getSetting(key) {
      const row = await (await db()).get("settings", key);
      const parsed = SettingsSchema.shape[key].safeParse(row?.value);
      return (parsed.success ? parsed.data : DEFAULT_SETTINGS[key]) as Settings[typeof key];
    },
    async setSetting(key, value) {
      await (await db()).put("settings", { key, value: SettingsSchema.shape[key].parse(value) });
    },
  };
}

/** Fallback when IndexedDB is unavailable (EF-04): works for the session, nothing persists. */
export function createMemoryRepository(): BoardRepository {
  const boards = new Map<string, Board>();
  const events = new Map<string, BoardEvent[]>();
  const settings: Settings = { ...DEFAULT_SETTINGS };
  return {
    persistent: false,
    async listBoards() {
      return [...boards.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(summarize);
    },
    async getBoard(id) {
      return structuredClone(boards.get(id) ?? null);
    },
    async saveBoard(board) {
      boards.set(board.id, structuredClone(BoardSchema.parse(board)));
    },
    async deleteBoard(id) {
      boards.delete(id);
      events.delete(id);
    },
    async appendEvent(boardId, event) {
      const list = [...(events.get(boardId) ?? []), structuredClone(event)];
      events.set(boardId, list.slice(-MAX_EVENTS_PER_BOARD));
    },
    async listEvents(boardId) {
      return structuredClone(events.get(boardId) ?? []);
    },
    async getSetting(key) {
      return settings[key];
    },
    async setSetting(key, value) {
      settings[key] = value;
    },
  };
}

let shared: Promise<BoardRepository> | null = null;

/** The app-wide repository: IndexedDB when it works, memory otherwise. */
export function getRepository(): Promise<BoardRepository> {
  return (shared ??= (async () => {
    try {
      if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
      const repo = createIdbRepository();
      await repo.listBoards();
      return repo;
    } catch {
      return createMemoryRepository();
    }
  })());
}
