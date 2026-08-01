"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CANNED_INTERIM, CANNED_TRANSCRIPT } from "./canned";

/**
 * Live dictation on the Web Speech API, with a clean degradation path.
 *
 * Firefox has no SpeechRecognition at all, several Safari builds expose it but
 * refuse to start, and headless Chromium defines it then errors with `network`.
 * In every one of those cases we fall back to the prototype's canned transcript
 * so the screen still demos and Playwright can drive it deterministically. A
 * missing or hostile API must never throw out of this hook.
 */

interface SpeechAlternative {
  readonly transcript: string;
}

interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: SpeechAlternative;
}

interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}

interface SpeechResultEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}

interface SpeechErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechCapture {
  /** True when a real SpeechRecognition constructor exists in this browser. */
  supported: boolean;
  listening: boolean;
  /** What to show while listening — interim results, or the canned opener. */
  interim: string;
  start: () => void;
  /** Stops capture; the final transcript arrives via `onTranscript`. */
  stop: () => void;
}

/** Feature detection has to survive SSR, hence the server snapshot of `false`. */
const subscribeNever = () => () => {};
const readSupported = () => getRecognitionCtor() !== null;
const readSupportedOnServer = () => false;

export function useSpeechRecognition(
  onTranscript: (transcript: string) => void,
): SpeechCapture {
  const supported = useSyncExternalStore(
    subscribeNever,
    readSupported,
    readSupportedOnServer,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const settledRef = useRef(false);
  /** Set once the rep has asked to stop — only then may we deliver. */
  const stopRequestedRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  useEffect(() => {
    return () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      try {
        recognitionRef.current?.abort();
      } catch {
        // Aborting an already-dead recogniser is not an error worth surfacing.
      }
      recognitionRef.current = null;
    };
  }, []);

  /** Deliver exactly once per capture, whatever route we got here by. */
  const settle = useCallback((transcript: string) => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    setListening(false);
    setInterim("");
    onTranscriptRef.current(transcript.trim() || CANNED_TRANSCRIPT);
  }, []);

  const start = useCallback(() => {
    finalRef.current = "";
    settledRef.current = false;
    stopRequestedRef.current = false;
    setInterim("");
    setListening(true);

    const Ctor = getRecognitionCtor();
    if (!Ctor) return; // No API — stop() will hand back the canned transcript.

    try {
      const recognition = new Ctor();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let pending = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) finalRef.current += text;
          else pending += text;
        }
        setInterim(`${finalRef.current}${pending}`.trim());
      };

      // Permission denied, no network, headless — the recogniser is dead, but
      // the capture is not. Drop it and keep listening so the *rep's* second
      // tap is what ends the note; anything else would submit mid-sentence.
      recognition.onerror = () => {
        recognitionRef.current = null;
        if (stopRequestedRef.current) settle(finalRef.current);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (stopRequestedRef.current) settle(finalRef.current);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }, [settle]);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    const recognition = recognitionRef.current;
    if (!recognition) {
      settle(finalRef.current);
      return;
    }
    try {
      recognition.stop(); // `onend` settles.
      // A recogniser that accepts stop() but never fires `onend` would hang the
      // capture, so the tap always resolves within a beat either way.
      watchdogRef.current = setTimeout(() => settle(finalRef.current), 900);
    } catch {
      recognitionRef.current = null;
      settle(finalRef.current);
    }
  }, [settle]);

  return {
    supported,
    listening,
    interim: interim || CANNED_INTERIM,
    start,
    stop,
  };
}
