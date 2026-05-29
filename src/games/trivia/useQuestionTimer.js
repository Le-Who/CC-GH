import { useEffect, useMemo, useRef, useState } from "react";

export function getQuestionTiming(startedAt, answeredAt = Date.now(), limitMs = 15000, pausedMs = 0) {
  const start = Math.max(0, Number(startedAt) || answeredAt);
  const answered = Math.max(start, Number(answeredAt) || Date.now());
  const limit = Math.max(1000, Number(limitMs) || 15000);
  const pause = Math.max(0, Number(pausedMs) || 0);
  const elapsedMs = Math.min(limit, Math.max(0, answered - start - pause));
  return {
    elapsedMs,
    timeMs: elapsedMs,
    remainingMs: Math.max(0, limit - elapsedMs),
    progress: Math.max(0, Math.min(1, (limit - elapsedMs) / limit)),
  };
}

export function useQuestionTimer(question, limitMs = 15000, paused = false) {
  const startedAtRef = useRef(Date.now());
  const pauseStartedAtRef = useRef(null);
  const pausedMsRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [pausedMs, setPausedMs] = useState(0);

  useEffect(() => {
    const resetAt = Date.now();
    startedAtRef.current = resetAt;
    pauseStartedAtRef.current = null;
    pausedMsRef.current = 0;
    setPausedMs(0);
    setNow(resetAt);
  }, [question?.id, question?.question]);

  useEffect(() => {
    const current = Date.now();
    if (paused) {
      if (pauseStartedAtRef.current == null) {
        pauseStartedAtRef.current = current;
        setNow(current);
      }
      return;
    }
    if (pauseStartedAtRef.current != null) {
      const nextPausedMs = pausedMsRef.current + Math.max(0, current - pauseStartedAtRef.current);
      pauseStartedAtRef.current = null;
      pausedMsRef.current = nextPausedMs;
      setPausedMs(nextPausedMs);
      setNow(current);
    }
  }, [paused]);

  useEffect(() => {
    if (paused) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [paused]);

  return useMemo(() => ({
    startedAt: startedAtRef.current,
    pausedMs,
    ...getQuestionTiming(startedAtRef.current, now, limitMs, pausedMs),
  }), [limitMs, now, pausedMs]);
}
