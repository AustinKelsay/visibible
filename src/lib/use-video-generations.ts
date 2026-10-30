"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";
import type {
  VideoConfiguration,
  VideoGenerationRequest,
  VideoJobResponse,
} from "./video-generation";

type VideoInput = Omit<
  VideoGenerationRequest,
  "requestId" | "reference" | "translation"
>;

/** Only an unacknowledged request ID is local. Jobs, billing, and history live on the server. */
export function useVideoGenerations({
  sid,
  verseId,
  reference,
  translation,
}: {
  sid: string | null;
  verseId: string;
  reference: string;
  translation: string;
}) {
  const storageKey = `visibible:video-intent:v2:${sid}:${verseId}`;
  const [config, setConfig] = useState<VideoConfiguration | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<VideoGenerationRequest | null>(null);
  const [accepted, setAccepted] = useState<VideoJobResponse | null>(null);
  const inFlight = useRef(false);
  const requestRef = useRef<VideoGenerationRequest | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const stored = localStorage.getItem(storageKey);
        const saved: VideoGenerationRequest | null = stored
          ? JSON.parse(stored)
          : null;
        if (
          saved &&
          typeof saved.requestId === "string" &&
          saved.reference === reference &&
          typeof saved.translation === "string" &&
          [5, 10].includes(saved.duration) &&
          ["480p", "768p"].includes(saved.resolution) &&
          Number.isFinite(saved.maxCredits)
        ) {
          requestRef.current = saved;
          setRequest(saved);
        }
      } catch {
        /* A blocked browser store does not affect server-owned jobs. */
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [storageKey, reference]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(
      new Error("Video pricing timed out. Please reload pricing."),
    ), 20_000);
    fetch("/api/generate-video", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data: VideoConfiguration = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Video pricing is temporarily unavailable.",
          );
        if (!Array.isArray(data.quotes))
          throw new Error("Video pricing is temporarily unavailable.");
        if (active) {
          setConfig(data);
          setConfigError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setConfig(null);
          setConfigError(
            cause instanceof Error
              ? cause.message
              : "Video pricing is temporarily unavailable.",
          );
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [revision]);

  const persist = useCallback(
    (value: VideoGenerationRequest | null) => {
      requestRef.current = value;
      setRequest(value);
      try {
        if (value) localStorage.setItem(storageKey, JSON.stringify(value));
        else localStorage.removeItem(storageKey);
      } catch {
        /* Repeated submissions in this mount still share their request ID. */
      }
    },
    [storageKey],
  );

  const submit = async (intent: VideoGenerationRequest) => {
    if (inFlight.current || !sid || !ready) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    persist(intent);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(
      new Error("Connection timed out. Check your previous request below."),
    ), 60_000);
    try {
      const csrf = document.cookie
        .split("; ")
        .find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`))
        ?.slice(CSRF_COOKIE_NAME.length + 1);
      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrf ? decodeURIComponent(csrf) : "",
        },
        body: JSON.stringify(intent),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        // A definite rejection cannot have created a new job. Unknown failures retain the ID.
        if ([400, 401, 402, 403, 409, 413, 422, 429].includes(response.status))
          persist(null);
        if (response.status === 409) setRevision((value) => value + 1);
        throw new Error(data.error || "Video could not be started.");
      }
      if (typeof data.id !== "string" || typeof data.status !== "string") {
        throw new Error(
          "The service did not confirm your request. Check it again safely below.",
        );
      }
      setAccepted(data);
      persist(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Connection interrupted. Check your request again.",
      );
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const generate = (input: VideoInput) =>
    submit(
      requestRef.current ?? {
        ...input,
        reference,
        translation,
        requestId: crypto.randomUUID(),
      },
    );
  const retrySubmission = () =>
    requestRef.current ? submit(requestRef.current) : Promise.resolve();
  const refreshConfiguration = () => setRevision((value) => value + 1);

  return {
    config,
    configError,
    ready,
    submitting,
    error,
    request,
    accepted,
    generate,
    retrySubmission,
    refreshConfiguration,
  };
}
