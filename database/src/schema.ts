import { z } from "zod";
import { BoardEventSchema, GraphSchema } from "@archie/simulator";

/** IndexedDB layout (docs/17). Bump DB_VERSION and add an upgrade step when stores change. */
export const DB_NAME = "archie";
export const DB_VERSION = 1;
export const BOARD_SCHEMA_VERSION = 1;
export const MAX_EVENTS_PER_BOARD = 1000;

export const BoardSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  schemaVersion: z.literal(BOARD_SCHEMA_VERSION),
  graph: GraphSchema,
  mode: z.enum(["design", "interview"]),
  problemId: z.string().nullable(),
  interview: z.unknown().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const StoredEventSchema = z.strictObject({
  id: z.string().min(1),
  boardId: z.string().min(1),
  event: BoardEventSchema,
});

export const SettingsSchema = z.strictObject({
  handsFree: z.boolean(),
  tts: z.boolean(),
  theme: z.enum(["system", "light", "dark"]),
  seenTips: z.array(z.string()),
});

export type Board = z.infer<typeof BoardSchema>;
export type StoredEvent = z.infer<typeof StoredEventSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  handsFree: false,
  tts: true,
  theme: "system",
  seenTips: [],
};

export interface BoardSummary {
  id: string;
  name: string;
  nodeCount: number;
  updatedAt: number;
}
