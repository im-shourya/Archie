"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChatsCircle, Trash } from "@phosphor-icons/react/dist/ssr";
import type { ChatTurn } from "@archie/database";
import { useBoardStore } from "../store/board.store";
import styles from "./chat.module.css";

/** How Archie handled a turn, shown under its reply. */
const KIND_LABEL: Record<NonNullable<ChatTurn["kind"]>, string> = {
  ops: "AI · changed the board",
  local: "local · changed the board",
  answer: "AI · answer",
  clarify: "AI · question",
  confirm: "AI · needs confirmation",
  noop: "AI · no change",
  error: "not done",
};

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The board's chat (docs/17 · Chat): every message and Archie's reply, saved with the board.
 * The last turns go to the AI with each command, so it can follow up on what was said before.
 * Sending here runs the same pipeline as the command bar (fast path first, then the AI).
 */
export function ChatPanel() {
  const chat = useBoardStore((s) => s.board?.chat);
  const submitFromChat = useBoardStore((s) => s.submitFromChat);
  const clearChat = useBoardStore((s) => s.clearChat);
  const setFocus = useBoardStore((s) => s.setFocus);
  const [text, setText] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const end = useRef<HTMLLIElement>(null);
  const turns = chat ?? [];
  const last = turns.at(-1)?.id;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [last]);

  const send = () => {
    if (!text.trim()) return;
    submitFromChat(text);
    setText("");
  };

  return (
    <section className={styles.chat} aria-label="Chat">
      <div className={styles.head}>
        <p className={styles.note}>Saved with this board. Archie reads the last 10 turns.</p>
        {turns.length > 0 &&
          (confirmClear ? (
            <span className={styles.confirm}>
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  clearChat();
                  setConfirmClear(false);
                }}
              >
                Clear chat
              </button>
              <button type="button" className={styles.link} onClick={() => setConfirmClear(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className={styles.iconButton} onClick={() => setConfirmClear(true)} aria-label="Clear chat">
              <Trash size={16} aria-hidden />
            </button>
          ))}
      </div>

      {turns.length === 0 ? (
        <div className={styles.empty}>
          <ChatsCircle size={28} aria-hidden />
          <p>Ask about your design or tell Archie what to change.</p>
          <p className={styles.example}>“What’s the bottleneck?” then “fix it”.</p>
        </div>
      ) : (
        <ol className={styles.list} aria-label="Messages" data-testid="chat-log">
          {turns.map((turn) => {
            const focus = turn.focus ?? [];
            const highlight = focus.length > 0;
            return (
              <li
                key={turn.id}
                className={styles.turn}
                data-role={turn.role}
                data-kind={turn.kind}
                tabIndex={highlight ? 0 : undefined}
                onMouseEnter={highlight ? () => setFocus(focus) : undefined}
                onMouseLeave={highlight ? () => setFocus([]) : undefined}
                onFocus={highlight ? () => setFocus(focus) : undefined}
                onBlur={highlight ? () => setFocus([]) : undefined}
              >
                <span className={styles.bubble}>{turn.text}</span>
                <span className={styles.meta}>
                  {turn.role === "user" ? "You" : `Archie${turn.kind ? ` · ${KIND_LABEL[turn.kind]}` : ""}`} · {time(turn.at)}
                </span>
              </li>
            );
          })}
          <li ref={end} aria-hidden className={styles.end} />
        </ol>
      )}

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          className={styles.input}
          value={text}
          rows={2}
          maxLength={4000}
          placeholder="Message Archie"
          aria-label="Chat message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" className={styles.send} disabled={!text.trim()} aria-label="Send">
          <ArrowUp size={16} weight="bold" aria-hidden />
        </button>
      </form>
    </section>
  );
}
