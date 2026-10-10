"use client";

import { ChevronDown, Plus } from "lucide-react";
import { CATALOG, uniqueLabel, type NodeKind } from "@archie/simulator";
import { KindIcon } from "@/components/icons/KindIcon";
import { useBoardStore } from "../store/board.store";
import { OverflowMenu } from "./OverflowMenu";
import styles from "./board.module.css";

/**
 * Add ▾: put a component on the board by hand, for when speaking isn't practical or the AI is
 * busy. Ordered by how often a design needs each kind. The same validated op as voice
 * ("add a cache"), so Undo, History, replay and share all work; the new component opens in the
 * Inspector so it can be connected straight away.
 */
const KINDS: NodeKind[] = ["service", "cache", "sql", "nosql", "queue", "worker", "lb", "gateway", "cdn", "objectstore", "search", "external", "client"];

/** Default labels: the catalog's names, except clients, which the templates call "Users". */
const label = (kind: NodeKind) => (kind === "client" ? "Users" : CATALOG[kind].displayName);

export function addComponent(kind: NodeKind): void {
  const { board, apply, requestSelect, notify } = useBoardStore.getState();
  if (!board) return;
  const name = uniqueLabel(label(kind), board.graph.nodes.map((n) => n.label));
  const result = apply([{ type: "addNode", kind, label: name }], { utterance: null, source: "inspector" });
  if (!result.ok) return notify(result.errors[0]?.message ?? "Couldn’t add that component.", false);
  const added = result.graph.nodes.find((n) => n.label === name);
  if (added) requestSelect(added.id);
  notify(`Added ${name}. Connect it in the Inspector.`, true);
}

export function AddMenu({ compact }: { compact: boolean }) {
  return (
    <OverflowMenu
      label="Add component"
      iconOnly={compact}
      buttonClassName={compact ? styles.iconButton : styles.textButton}
      trigger={
        compact ? (
          <Plus size={16} aria-hidden />
        ) : (
          <>
            <Plus size={16} aria-hidden /> Add <ChevronDown size={14} aria-hidden />
          </>
        )
      }
      items={KINDS.map((kind) => ({
        label: label(kind),
        icon: <KindIcon kind={kind} size={16} />,
        onSelect: () => addComponent(kind),
      }))}
    />
  );
}
