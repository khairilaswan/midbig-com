"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isFresh, type LivePrice, type ServerMessage } from "@midbig/shared";

/**
 * One WebSocket per tab to the price service. Components ask for the ids they
 * show; the store subscribes to exactly those and re-renders only the
 * components whose price changed.
 */
class LiveStore {
  private url: string | null = null;
  private ws: WebSocket | null = null;
  private prices = new Map<string, LivePrice>();
  private listeners = new Map<string, Set<() => void>>();
  private refCount = new Map<string, number>();
  private pending = new Set<string>();
  private flushQueued = false;
  private backoff = 1000;
  /** Server clock minus local clock, so freshness checks survive a wrong device clock. */
  offset = 0;

  configure(url: string): void {
    if (this.url === url) return;
    this.url = url;
    this.connect();
  }

  get(id: string): LivePrice | undefined {
    return this.prices.get(id);
  }

  /** Seeds a price from server rendering so the first paint matches. */
  seed(lp: LivePrice | null): void {
    if (!lp) return;
    const cur = this.prices.get(lp.id);
    if (!cur || cur.asOf < lp.asOf) this.prices.set(lp.id, lp);
  }

  subscribe(id: string, cb: () => void): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(cb);
    const n = (this.refCount.get(id) ?? 0) + 1;
    this.refCount.set(id, n);
    if (n === 1) this.queueSub(id);
    return () => {
      set.delete(cb);
      const left = (this.refCount.get(id) ?? 1) - 1;
      if (left > 0) {
        this.refCount.set(id, left);
        return;
      }
      this.refCount.delete(id);
      this.send({ op: "unsub", ids: [id] });
    };
  }

  private queueSub(id: string): void {
    this.pending.add(id);
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      if (this.pending.size === 0) return;
      this.send({ op: "sub", ids: [...this.pending] });
      this.pending.clear();
    });
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private connect(): void {
    if (!this.url || typeof window === "undefined") return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 1000;
      this.pending.clear();
      if (this.refCount.size > 0) this.send({ op: "sub", ids: [...this.refCount.keys()] });
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type !== "ticks") return;
      this.offset = msg.now - Date.now();
      for (const lp of msg.data) {
        this.prices.set(lp.id, lp);
        this.listeners.get(lp.id)?.forEach((cb) => cb());
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, 30_000);
      setTimeout(() => this.connect(), delay);
    };
  }
}

export const liveStore = new LiveStore();

/** Mounted once in the layout; points the store at the price service. */
export function LiveConnection({ url }: { url: string | null }) {
  useEffect(() => {
    const resolved =
      url || `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
    liveStore.configure(resolved);
  }, [url]);
  return null;
}

/** Latest live price for an asset, starting from the server-rendered one. */
export function useLivePrice(id: string, initial: LivePrice | null): LivePrice | null {
  // Seed synchronously so the first client render matches the server HTML.
  liveStore.seed(initial);
  return (
    useSyncExternalStore(
      (cb) => liveStore.subscribe(id, cb),
      () => liveStore.get(id),
      () => initial ?? undefined,
    ) ?? null
  );
}

/** Re-renders every `ms` so "x seconds ago" labels and the delayed state stay current. */
export function useNow(ms = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now + liveStore.offset;
}

export function isLive(lp: LivePrice | null, now: number): boolean {
  return lp != null && isFresh(lp.asOf, now);
}

/**
 * Latest live prices for several assets at once, for totals that depend on
 * all of them. Re-renders whenever any of them ticks.
 */
export function useLivePrices(initial: { id: string; live: LivePrice | null }[]): Map<string, LivePrice> {
  for (const r of initial) liveStore.seed(r.live);
  const key = initial.map((r) => r.id).join(",");
  const [, setVersion] = useState(0);
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    let queued = false;
    // Coalesce a batch of ticks into one render.
    const bump = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        setVersion((v) => v + 1);
      });
    };
    const unsubs = ids.map((id) => liveStore.subscribe(id, bump));
    return () => unsubs.forEach((u) => u());
  }, [key]);
  const out = new Map<string, LivePrice>();
  for (const r of initial) {
    const lp = liveStore.get(r.id);
    if (lp) out.set(r.id, lp);
  }
  return out;
}
