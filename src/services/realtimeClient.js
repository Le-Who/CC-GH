import { io } from "socket.io-client";
import { getTelegramAuthData } from "../platform/telegram.js";
import { getPublicConfig } from "./apiClient.js";

let socket = null;
let lastSeq = 0;

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

export async function connectRealtime(onSync, onStatus) {
  const auth = await getSocketAuth();
  if (!auth.initData && !auth.devUserId) {
    onStatus?.("offline");
    return () => {};
  }

  socket = io(window.location.origin, {
    auth,
    autoConnect: true,
    reconnectionAttempts: 8,
  });

  socket.on("connect", () => onStatus?.("online"));
  socket.on("disconnect", () => onStatus?.("offline"));
  socket.on("connect_error", () => onStatus?.("offline"));
  socket.on("player_sync", (event) => {
    const seq = Number(event?.seq || 0);
    if (seq && seq <= lastSeq) return;
    if (seq) lastSeq = seq;
    onSync?.(event.payload, event);
  });

  const onVisibility = () => {
    if (!socket) return;
    if (document.hidden) socket.disconnect();
    else socket.connect();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    socket?.disconnect();
    socket = null;
  };
}
