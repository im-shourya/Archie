"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/*
 * Scroll-driven motion for the home page (docs/06 · Motion), Apple's "scroll-scrubbing": the
 * scroll position is the timeline, so stopping the scroll freezes the animation where it is.
 * No scroll-jacking: the page scrolls natively and these components only read its position.
 *
 * Each component writes one custom property, --p (0 → 1), and CSS turns it into transforms and
 * colours. One passive listener per element, batched into requestAnimationFrame, and only while
 * the element is near the viewport. With reduced motion, --p is pinned at 1 (the final state).
 */

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

type Mode =
  /** A tall section with a sticky child: 0 as it enters, 1 when its pinned stretch ends. */
  | "pin"
  /** An element passing up the viewport: 0 at 90% of the viewport height, 1 at 45%. */
  | "pass";

function progress(el: HTMLElement, mode: Mode): number {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (mode === "pass") return clamp((vh * 0.9 - rect.top) / (vh * 0.45));
  const start = vh * 0.9;
  const end = -(rect.height - vh);
  return clamp((start - rect.top) / (start - end));
}

export function ScrollProgress({
  mode,
  className,
  children,
  as: Tag = "div",
  style,
}: {
  mode: Mode;
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "li";
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (p: number) => el.style.setProperty("--p", p.toFixed(4));
    if (reducedMotion()) {
      set(1);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      set(progress(el, mode));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    let listening = false;
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      const method = on ? "addEventListener" : "removeEventListener";
      window[method]("scroll", onScroll, { passive: true } as AddEventListenerOptions);
      window[method]("resize", onScroll);
    };
    // Only track while the element is on or near the screen.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        listen(visible);
        if (visible) onScroll();
      },
      { rootMargin: "25% 0px" },
    );
    io.observe(el);
    update();
    return () => {
      io.disconnect();
      listen(false);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mode]);

  return (
    <Tag ref={ref as never} className={className} style={style} data-scroll={mode}>
      {children}
    </Tag>
  );
}

/** Fades and lifts its content in once, the first time it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Stagger, in ms. */
  delay?: number;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      el.dataset.shown = "";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.dataset.shown = "";
        io.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={className}
      data-reveal=""
      style={delay ? ({ "--delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Text that lights up word by word as it scrolls past (the AirPods-page effect). Words go from
 * muted to ink, never to near-invisible, so every state keeps AA contrast. Screen readers get
 * the sentence once, from the visually hidden copy.
 */
export function WordReveal({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <ScrollProgress mode="pass" className={className}>
      <span data-words="" aria-hidden style={{ "--n": words.length } as CSSProperties}>
        {words.map((w, i) => (
          <span key={i} style={{ "--i": i } as CSSProperties}>
            {w}{" "}
          </span>
        ))}
      </span>
      <span data-sr-only="">{text}</span>
    </ScrollProgress>
  );
}
