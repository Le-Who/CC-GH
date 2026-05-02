import { useEffect, useMemo, useState } from "react";

export function deriveServerNow(snapshot, localNow = Date.now()) {
  const serverTime = Number(snapshot?.serverTime);
  if (!Number.isFinite(serverTime) || serverTime <= 0) return localNow;
  const receivedAt = Number(snapshot?.receivedAt || snapshot?._receivedAt || snapshot?.clientReceivedAt);
  if (!Number.isFinite(receivedAt) || receivedAt <= 0) return serverTime;
  return serverTime + Math.max(0, localNow - receivedAt);
}

export function useServerClock(snapshot, tickMs = 1000) {
  const [localNow, setLocalNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setLocalNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return useMemo(() => deriveServerNow(snapshot, localNow), [localNow, snapshot]);
}
