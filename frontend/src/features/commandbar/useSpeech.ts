"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Browser speech fallback (FR-062) for people without Wispr Flow. Wispr Flow stays the main
 * path: it types into the bar like a keyboard. This hook only exists where the browser has the
 * Web Speech API (Chrome, Edge, Safari). Chrome sends the audio to its own speech service.
 */

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

export type SpeechError = "blocked" | "no-speech" | "failed";

export function speechErrorMessage(error: SpeechError): string {
  switch (error) {
    case "blocked":
      return "Microphone access is blocked. Allow it in the browser, or dictate with Wispr Flow (the main way to talk to Archie).";
    case "no-speech":
      return "I didn’t hear anything. Try again, or dictate with Wispr Flow.";
    default:
      return "Browser speech recognition stopped. Dictating with Wispr Flow works everywhere.";
  }
}

export function useSpeech(handlers: {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(error: SpeechError): void;
}) {
  // Known only in the browser; the server render shows no button.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => recognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  const stop = useCallback(() => {
    const r = recognition.current;
    recognition.current = null;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      r.abort();
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i]!;
        text += result[0].transcript;
        if (result.isFinal) final = true;
      }
      text = text.trim();
      if (final) {
        stop();
        if (text) latest.current.onFinal(text);
      } else {
        latest.current.onInterim(text);
      }
    };
    r.onerror = (e) => {
      stop();
      if (e.error === "aborted") return;
      latest.current.onError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "blocked"
          : e.error === "no-speech"
            ? "no-speech"
            : "failed",
      );
    };
    r.onend = () => {
      if (recognition.current === r) recognition.current = null;
      setListening(false);
    };
    recognition.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      stop();
      latest.current.onError("failed");
    }
  }, [stop]);

  // Stop when the tab is hidden, and on unmount.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [stop]);

  return { supported, listening, start, stop };
}
