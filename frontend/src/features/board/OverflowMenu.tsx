"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import styles from "./board.module.css";

/**
 * Top-bar overflow menu on phones (docs/design §5.9), WAI-ARIA menu button: Enter/Space/↓ opens
 * and focuses the first item, ↑/↓ move, Home/End jump, Escape or Tab closes, focus returns to
 * the button, outside pointerdown closes.
 */

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect(): void;
}

export function OverflowMenu({
  items,
  label = "More actions",
  trigger,
  buttonClassName,
}: {
  items: MenuItem[];
  /** Accessible name of the button and the menu. */
  label?: string;
  /** Visible button content (defaults to the ⋯ icon). */
  trigger?: ReactNode;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const id = useId();

  const focusItem = (index: number) => {
    const els = menu.current?.querySelectorAll<HTMLElement>("[role='menuitem']");
    if (!els?.length) return;
    els[(index + els.length) % els.length]!.focus();
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => focusItem(0));
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  return (
    <div className={styles.menuWrap}>
      <button
        ref={button}
        type="button"
        className={buttonClassName ?? styles.iconButton}
        aria-label={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === "Escape" && open) {
            // Focus moves into the menu a frame after it opens; Escape before that still closes it.
            e.preventDefault();
            setOpen(false);
          }
        }}
      >
        {trigger ?? <Ellipsis size={16} aria-hidden />}
      </button>
      {open && (
        <ul
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          className={styles.menu}
          onKeyDown={(e) => {
            const els = [
              ...(menu.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []),
            ];
            const index = els.indexOf(document.activeElement as HTMLElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              focusItem(index + 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusItem(index - 1);
            } else if (e.key === "Home") {
              e.preventDefault();
              focusItem(0);
            } else if (e.key === "End") {
              e.preventDefault();
              focusItem(els.length - 1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "Tab") {
              close(false);
            }
          }}
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
