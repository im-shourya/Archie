import {
  Archive,
  Boxes,
  Cog,
  Database,
  Globe,
  ListOrdered,
  MemoryStick,
  Plug,
  Router,
  Search,
  Server,
  Split,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NodeKind } from "@archie/simulator";

/** One Lucide icon per component kind (docs/06 · Icons). Decorative: the label carries meaning. */
const ICONS: Record<NodeKind, LucideIcon> = {
  client: Users,
  cdn: Globe,
  lb: Split,
  gateway: Router,
  service: Server,
  worker: Cog,
  cache: MemoryStick,
  sql: Database,
  nosql: Boxes,
  queue: ListOrdered,
  objectstore: Archive,
  search: Search,
  external: Plug,
};

export function KindIcon({ kind, size = 18 }: { kind: NodeKind; size?: number }) {
  const Icon = ICONS[kind];
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}
