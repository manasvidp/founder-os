import axios from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { todayStr } from "./fmt";

// Same address as the app in production. Set REACT_APP_BACKEND_URL only if the API lives elsewhere.
export const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
export const http = axios.create({ baseURL: API, withCredentials: true });

http.interceptors.request.use((c) => {
  const t = localStorage.getItem("fos_token");
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

let refreshing = null;
export const refreshToken = () => {
  refreshing = refreshing || http.post("/auth/refresh").then((r) => {
    if (r.data.access_token) localStorage.setItem("fos_token", r.data.access_token);
  }).finally(() => { refreshing = null; });
  return refreshing;
};

http.interceptors.response.use((r) => r, async (err) => {
  const cfg = err.config || {};
  if (err.response?.status === 401 && !cfg._retry && !String(cfg.url).includes("/auth/")) {
    cfg._retry = true;
    try { await refreshToken(); return http(cfg); } catch { /* fall through */ }
  }
  return Promise.reject(err);
});

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "Something went wrong. Please try again.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => `${(x.loc || []).slice(-1)[0] || ""} ${x.msg}`.trim()).join("; ");
  return d.msg || String(d);
}

export const useGet = (url, params, opts = {}) =>
  useQuery({ queryKey: [url, params], queryFn: () => http.get(url, { params }).then((r) => r.data), ...opts });

export function useMut() {
  const qc = useQueryClient();
  return async (method, url, data, success) => {
    try {
      const r = method === "delete" ? await http.delete(url, { data }) : await http[method](url, data);
      qc.invalidateQueries();
      if (success) toast.success(success);
      return r.data;
    } catch (e) {
      toast.error(errMsg(e));
      throw e;
    }
  };
}

export async function streamChat({ message, session_id, title, onSession, onDelta, onDone, onError }, retry = true) {
  const t = localStorage.getItem("fos_token");
  const res = await fetch(`${API}/ai/chat`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ message, session_id: session_id || null, title: title || null, date: todayStr() }),
  });
  if (res.status === 401 && retry) {
    try { await refreshToken(); return streamChat({ message, session_id, title, onSession, onDelta, onDone, onError }, false); } catch { /* noop */ }
  }
  if (!res.ok) {
    let d; try { d = (await res.json()).detail; } catch { /* noop */ }
    onError?.(typeof d === "string" ? d : `Request failed (${res.status})`);
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!chunk.startsWith("data: ")) continue;
      const ev = JSON.parse(chunk.slice(6));
      if (ev.type === "session") onSession?.(ev.session_id);
      if (ev.type === "delta") onDelta?.(ev.text);
      if (ev.type === "done") onDone?.(ev);
      if (ev.type === "error") onError?.(ev.detail);
    }
  }
}
