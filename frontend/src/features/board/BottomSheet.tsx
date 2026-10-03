"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { SHEET_PEEK_PX } from "./useFit";
import styles from "./board.module.css";

/**
 * Phone side panel (docs/33 Step 3, doc 06 · Responsive). Three snap points: peek (one line),
 * half, full. Only the handle takes pointer events, so the canvas keeps pinch and pan. The
 * handle is also a button (tap cycles; Escape collapses), so it works without dragging.
 */

export type Snap = "peek" | "half" | "full";
const ORDER: Snap[] = ["peek", "half", "full"];
const NEXT: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };
/** Toasts stay at least this far below the top of the screen when the sheet is full. */
const TOAST_ROOM_PX = 140;

function snapHeight(snap: Snap, container: number): number {
  if (snap === "peek") return SHEET_PEEK_PX;
  if (snap === "half") return Math.round(container * 0.5);
  return container - 16;
}

export function BottomSheet({
  snap,
  onSnap,
  peek,
  children,
}: {
  snap: Snap;
  onSnap(snap: Snap): void;
  peek: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  /** Set when a drag just ended, so the click that follows it doesn't also cycle. */
  const justDragged = useRef(false);
  const reduced = usePrefersReducedMotion();

  // Publish the sheet's height so the command bar stacks toasts above it (known bug fix).
  useEffect(() => {
    const el = ref.current;
    const screen = el?.closest<HTMLElement>("[data-screen]");
    const container = el?.parentElement;
    if (!el || !screen || !container) return;
    const update = () => {
      const room = Math.max(0, container.clientHeight - TOAST_ROOM_PX);
      screen.style.setProperty("--sheet-height", `${Math.min(el.offsetHeight, room)}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observer.observe(container);
    update();
    return () => {
      observer.disconnect();
      screen.style.removeProperty("--sheet-height");
    };
  }, []);

  function containerHeight(): number {
    return ref.current?.parentElement?.clientHeight ?? window.innerHeight;
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startHeight: ref.current?.offsetHeight ?? SHEET_PEEK_PX,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 6) d.moved = true;
    if (!d.moved) return;
    const max = snapHeight("full", containerHeight());
    setDragHeight(Math.min(max, Math.max(SHEET_PEEK_PX, d.startHeight + dy)));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved || dragHeight === null) return;
    const container = containerHeight();
    justDragged.current = true;
    const nearest = ORDER.reduce((best, s) =>
      Math.abs(snapHeight(s, container) - dragHeight) <
      Math.abs(snapHeight(best, container) - dragHeight)
        ? s
        : best,
    );
    setDragHeight(null);
    onSnap(nearest);
  }

  const expanded = snap !== "peek";
  return (
    <section
      ref={ref}
      className={styles.sheet}
      aria-label="Details"
      data-snap={snap}
      data-dragging={dragHeight !== null || undefined}
      data-reduced={reduced || undefined}
      style={dragHeight !== null ? { height: dragHeight } : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && expanded && !e.defaultPrevented) {
          e.preventDefault();
          onSnap("peek");
        }
      }}
    >
      <button
        type="button"
        className={styles.sheetHandle}
        aria-expanded={expanded}
        aria-controls="sheet-body"
        aria-label={snap === "full" ? "Collapse panel" : "Expand panel"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragHeight(null);
        }}
        onClick={() => {
          // A drag ends with a click event; only a tap cycles.
          if (justDragged.current) {
            justDragged.current = false;
            return;
          }
          onSnap(NEXT[snap]);
        }}
      >
        <span className={styles.sheetGrip} aria-hidden />
      </button>
      <div className={styles.sheetPeek} data-testid="sheet-peek">
        {peek}
      </div>
      <div id="sheet-body" className={styles.sheetBody} inert={!expanded}>
        {children}
      </div>
    </section>
  );
}
