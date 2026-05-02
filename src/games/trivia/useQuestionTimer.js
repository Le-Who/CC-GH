import { useEffect, useMemo, useRef, useState } from "react";

export function getQuestionTiming(startedAt, answeredAt = Date.now(), limitMs = 15000) {
  const start = Math.max(0, Number(startedAt) || answeredAt);
  const answered = Math.max(start, Number(answeredAt) || Date.now());
  const limit = Math.max(1000, Number(limitMs) || 15000);
  const elapsedMs = Math.min(limit, Math.max(0, answered - start));
  return {
    elapsedMs,
    timeMs: elapsedMs,
    remainingMs: Math.max(0, limit - elapsedMs),
    progress: Math.max(0, Math.min(1, (limit - elapsedMs) / limit)),
  };
}

export function useQuestionTimer(question, limitMs = 15000) {
  const startedAtRef = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    startedAtRef.current = Date.now();
    setNow(startedAtRef.current);
  }, [question?.id, question?.question]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => ({
    startedAt: startedAtRef.current,
    ...getQuestionTiming(startedAtRef.current, now, limitMs),
  }), [limitMs, now]);
}
