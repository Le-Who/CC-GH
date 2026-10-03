import { io } from "socket.io-client";
import { getTelegramAuthData } from "../platform/telegram.js";
import { getPublicConfig } from "./apiClient.js";

let socket = null;
let connectionSession = 0;

// Connection availability does not acknowledge an in-flight HTTP refresh or
// outbox drain. Their completion owns the shared syncing indicator.
export function applyRealtimeConnectionStatus(hub, nextStatus) {
  if (nextStatus !== 'online' && nextStatus !== 'offline') return;
  hub.setState(state => state.snapshotRequestPending || state.status === 'syncing'
    ? state
    : { status: nextStatus === 'online' ? 'ready' : 'offline' });
}

async function getSocketAuth() {
  const initData = getTelegramAuthData();
  if (initData) return { initData };
  const config = await getPublicConfig().catch(() => ({}));
  if (config.devAuthEnabled) {
    let devUserId = localStorage.getItem("gh_dev_user_id");
    if (!devUserId) {
      devUserId = `dev_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      localStorage.setItem("gh_dev_user_id", devUserId);
    }
    return { devUserId };
  }
  return {};
}

export async function connectRealtime(onSync, onStatus, options = {}) {
  if (options.isCurrent && !options.isCurrent()) return () => {};
  const session = ++connectionSession;
  socket?.disconnect();
  socket = null;
  const auth = await getSocketAuth();
  if (session !== connectionSession || (options.isCurrent && !options.isCurrent())) return () => {};
  if (!auth.initData && !auth.devUserId) {
    onStatus?.("offline");
    return () => {};
  }

  const connection = socket = io(window.location.origin, {
    auth,
    autoConnect: true,
    reconnectionAttempts: 8,
  });

  const ownsConnection = () => session === connectionSession && socket === connection;
  const isCurrent = () => ownsConnection() && (!options.isCurrent || options.isCurrent());
  const lastSequences = new Map();
  connection.on("connect", () => { if (isCurrent()) onStatus?.("online"); });
  connection.on("disconnect", () => { if (isCurrent()) onStatus?.("offline"); });
  connection.on("connect_error", () => { if (isCurrent()) onStatus?.("offline"); });
  connection.on("player_sync", (event) => {
    if (!isCurrent()) return;
    const accountId = event?.payload?.accountId;
    if (typeof accountId !== "string" || !accountId) return;
    const seq = Number(event?.seq || 0);
    if (seq && seq <= (lastSequences.get(accountId) || 0)) return;
    if (seq) lastSequences.set(accountId, seq);
    onSync?.(event.payload, event);
  });

  const onVisibility = () => {
    if (!isCurrent()) return;
    if (document.hidden) connection.disconnect();
    else connection.connect();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (ownsConnection()) { socket = null; connectionSession++; }
    connection.disconnect();
  };
}
