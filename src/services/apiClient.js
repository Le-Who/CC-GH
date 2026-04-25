import { getTelegramAuthData } from "../platform/telegram.js";

const REQUEST_TIMEOUT_MS = 8000;
let configPromise = null;
let devUserId = null;

function getOrCreateDevUserId() {
  if (devUserId) return devUserId;
  try {
    devUserId = localStorage.getItem("gh_dev_user_id");
    if (!devUserId) {
      devUserId = `dev_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      localStorage.setItem("gh_dev_user_id", devUserId);
    }
  } catch {
    devUserId = `dev_${Math.random().toString(36).slice(2)}`;
  }
  return devUserId;
}

export async function getPublicConfig() {
  if (!configPromise) {
    configPromise = fetch("/api/config", { cache: "no-store" }).then((res) => res.json());
  }
  return configPromise;
}

export async function getAuthHeader() {
  const rawInitData = getTelegramAuthData();
  if (rawInitData) return `tma ${rawInitData}`;

  const config = await getPublicConfig().catch(() => ({}));
  if (config.devAuthEnabled) return `dev ${getOrCreateDevUserId()}`;
  return "";
}

export async function api(path, body, options = {}) {
  const auth = await getAuthHeader();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const headers = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = auth;
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return {
        ...data,
        error: data.error || `HTTP_${res.status}`,
        _httpStatus: res.status,
      };
    }
    return data;
  } catch (err) {
    return { error: err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

export function createBatcher(onDesync) {
  const queue = [];
  let timer = null;

  async function flush() {
    if (!queue.length) return;
    const pending = queue.splice(0, queue.length);
    const requests = pending.map((entry) => entry.request);
    const result = await api("/api/batch", { requests });
    if (result.error) {
      pending.forEach((entry) => entry.resolve({ success: true, _optimistic: true }));
      onDesync?.(result);
      return;
    }
    const results = result.results || [];
    for (const entry of pending) {
      const response = results.find((item) => item.id === entry.request.id);
      entry.resolve(response?.data || { success: true, _optimistic: true });
    }
    if (results.some((item) => item.status >= 500 || item.status === 401 || item.status === 403)) {
      onDesync?.(result);
    }
  }

  return function apiBatched(path, body) {
    const id = crypto.randomUUID?.() || `${Date.now()}_${Math.random()}`;
    const nonce = crypto.randomUUID?.() || `${Date.now()}_${Math.random()}`;
    const request = { id, nonce, path, body };
    return new Promise((resolve) => {
      queue.push({ request, resolve });
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, queue.length >= 10 ? 0 : 350);
    });
  };
}
