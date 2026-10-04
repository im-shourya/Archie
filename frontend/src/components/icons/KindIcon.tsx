import {
  Archive,
  ArrowsSplit,
  Database,
  Door,
  Gear,
  Globe,
  HardDrives,
  MagnifyingGlass,
  Memory,
  Plug,
  Queue,
  Stack,
  Users,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { NodeKind } from "@archie/simulator";

/** One Phosphor icon per component kind (docs/06 · Icons). Decorative: the label carries meaning. */
const ICONS: Record<NodeKind, Icon> = {
  client: Users,
  cdn: Globe,
  lb: ArrowsSplit,
  gateway: Door,
  service: HardDrives,
  worker: Gear,
  cache: Memory,
  sql: Database,
  nosql: Stack,
  queue: Queue,
  objectstore: Archive,
  search: MagnifyingGlass,
  external: Plug,
};

export function KindIcon({ kind, size = 18 }: { kind: NodeKind; size?: number }) {
  const Icon = ICONS[kind];
  return <Icon size={size} aria-hidden />;
}
