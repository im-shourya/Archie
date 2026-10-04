"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getRepository } from "@archie/database";

/**
 * Read interviewer questions aloud (FR-052, docs/design §7.4) with the browser's speechSynthesis.
 * Persisted in the `tts` setting (default on); hidden where speechSynthesis is missing. Callers
 * cancel speech whenever the candidate starts answering, so it never talks over dictation.
 */
const noopSubscribe = () => () => {};

export function useTts() {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => false,
  );
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    void getRepository()
      .then((repo) => repo.getSetting("tts"))
      .then(setEnabled)
      .catch(() => {});
  }, []);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !enabled) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = document.documentElement.lang || "en";
      window.speechSynthesis.speak(utterance);
    },
    [supported, enabled],
  );

  const toggle = useCallback(() => {
    setEnabled((on) => {
      if (on && supported) window.speechSynthesis.cancel();
      void getRepository().then((repo) => repo.setSetting("tts", !on));
      return !on;
    });
  }, [supported]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && cancel();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      cancel();
    };
  }, [cancel]);

  return { supported, enabled, speak, cancel, toggle };
}
