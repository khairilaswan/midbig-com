import WebSocket from "ws";
import type { MarketState } from "../market.js";
import { logger } from "../log.js";

/** Reconnects if a feed says nothing for this long (both feeds send heartbeats every second or so). */
const SILENCE_TIMEOUT_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * One long-lived WebSocket to an exchange. Handles reconnects with backoff and
 * a silence watchdog; subclasses parse messages and decide what to subscribe.
 */
export abstract class Feed {
  protected readonly log;
  private ws: WebSocket | null = null;
  private backoff = 1000;
  private stopped = false;
  private watchdog: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;

  constructor(
    readonly name: string,
    private readonly url: string,
    protected readonly state: MarketState,
    /** Upper-case ticker symbol -> asset id, refreshed by the metadata sync. */
    protected readonly symbols: () => Map<string, string>,
  ) {
    this.log = logger(name);
  }

  start(): void {
    this.stopped = false;
    this.connect();
    this.watchdog = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN && Date.now() - this.lastMessageAt > SILENCE_TIMEOUT_MS) {
        this.log.warn("feed went silent, reconnecting");
        this.ws.terminate();
      }
    }, 5_000);
  }

  stop(): void {
    this.stopped = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.ws?.close();
  }

  /** Drops the connection so it reconnects and subscribes to the current symbol list. */
  restart(): void {
    this.ws?.terminate();
  }

  /** Called on each (re)connect; send subscriptions here. */
  protected abstract onOpen(ws: WebSocket): Promise<void>;
  protected abstract onMessage(msg: unknown, ws: WebSocket): void;

  protected send(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.url, { handshakeTimeout: 15_000 });
    this.ws = ws;
    this.lastMessageAt = Date.now();

    ws.on("open", () => {
      this.log.info(`connected to ${this.url}`);
      this.onOpen(ws).catch((err) => {
        this.log.error("subscribe failed", err);
        ws.terminate();
      });
    });
    ws.on("message", (data) => {
      this.lastMessageAt = Date.now();
      this.backoff = 1000;
      this.state.alive(this.name, this.lastMessageAt);
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      try {
        this.onMessage(msg, ws);
      } catch (err) {
        this.log.error("message handler failed", err);
      }
    });
    ws.on("error", (err) => this.log.warn("socket error", err));
    ws.on("close", () => {
      if (this.ws === ws) this.ws = null;
      this.state.down(this.name);
      if (this.stopped) return;
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
      this.log.warn(`disconnected, reconnecting in ${delay / 1000}s`);
      setTimeout(() => this.connect(), delay);
    });
  }
}

/** Parses exchange timestamps like "2026-10-30T03:36:05.123456Z" to ms. */
export function parseTime(iso: string): number {
  // Trim sub-millisecond digits; not every engine parses them.
  return Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
}
