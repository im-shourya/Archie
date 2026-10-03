import * as z from "zod/mini";
import { BoardEventSchema, GraphSchema } from "@archie/simulator";

/** IndexedDB layout (docs/17). Bump DB_VERSION and add an upgrade step when stores change. */
export const DB_NAME = "archie";
export const DB_VERSION = 1;
export const BOARD_SCHEMA_VERSION = 1;
export const MAX_EVENTS_PER_BOARD = 1000;

export const BoardSchema = z.strictObject({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  schemaVersion: z.literal(BOARD_SCHEMA_VERSION),
  graph: GraphSchema,
  mode: z.enum(["design", "interview"]),
  problemId: z.nullable(z.string()),
  interview: z.nullable(z.unknown()),
  createdAt: z.number().check(z.int()),
  updatedAt: z.number().check(z.int()),
});

export const StoredEventSchema = z.strictObject({
  id: z.string().check(z.minLength(1)),
  boardId: z.string().check(z.minLength(1)),
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
