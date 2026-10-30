import http from "node:http";
import { Redis } from "ioredis";
import { WebSocketServer, WebSocket } from "ws";
import {
  MAX_SUBSCRIPTIONS,
  PRICES_KEY,
  TICKS_CHANNEL,
  type ClientMessage,
  type LivePrice,
  type ServerMessage,
} from "@midbig/shared";
import { logger } from "./log.js";

const log = logger("gateway");

const MAX_CONNECTIONS = 10_000;
const PING_INTERVAL_MS = 30_000;

interface Client {
  ws: WebSocket;
  subs: Set<string>;
  alive: boolean;
}

export interface Health {
  ok: boolean;
  [key: string]: unknown;
}

/**
 * HTTP server for the browser WebSocket (/ws) and the health check (/health).
 * It only reads from Redis, so it can move to its own process later without
 * changes. Each browser subscribes to the asset ids on its page and receives
 * at most one batch per second.
 */
export async function startGateway(opts: {
  port: number;
  redisUrl: string;
  health: () => Health;
}): Promise<() => Promise<void>> {
  const latest = new Map<string, LivePrice>();
  const clients = new Set<Client>();

  const redis = new Redis(opts.redisUrl);
  for (const [id, json] of Object.entries(await redis.hgetall(PRICES_KEY))) {
    try {
      latest.set(id, JSON.parse(json) as LivePrice);
    } catch {
      // ignore a corrupt entry; the next tick replaces it
    }
  }
  redis.disconnect();

  const sub = new Redis(opts.redisUrl);
  await sub.subscribe(TICKS_CHANNEL);
  sub.on("message", (_channel, raw: string) => {
    let batch: { now: number; data: LivePrice[] };
    try {
      batch = JSON.parse(raw);
    } catch {
      return;
    }
    for (const lp of batch.data) latest.set(lp.id, lp);
    for (const c of clients) {
      if (c.subs.size === 0) continue;
      const data = batch.data.filter((lp) => c.subs.has(lp.id));
      if (data.length > 0) send(c.ws, { type: "ticks", now: batch.now, data });
    }
  });

  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/ws/health") {
      const h = { ...opts.health(), clients: clients.size };
      res.writeHead(h.ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(h));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws") || clients.size >= MAX_CONNECTIONS) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket) => {
    const client: Client = { ws, subs: new Set(), alive: true };
    clients.add(client);
    ws.on("pong", () => (client.alive = true));
    ws.on("close", () => clients.delete(client));
    ws.on("error", () => ws.terminate());
    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || !Array.isArray(msg.ids)) return;
      const ids = msg.ids.filter((id): id is string => typeof id === "string" && id.length <= 100);
      if (msg.op === "sub") {
        const added: LivePrice[] = [];
        for (const id of ids) {
          if (client.subs.size >= MAX_SUBSCRIPTIONS) break;
          client.subs.add(id);
          const lp = latest.get(id);
          if (lp) added.push(lp);
        }
        // Send what we have right away so the page doesn't wait for the next tick.
        if (added.length > 0) send(ws, { type: "ticks", now: Date.now(), data: added });
      } else if (msg.op === "unsub") {
        for (const id of ids) client.subs.delete(id);
      }
    });
  });

  const pinger = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, PING_INTERVAL_MS);

  await new Promise<void>((resolve) => server.listen(opts.port, resolve));
  log.info(`listening on :${opts.port}`);

  return async () => {
    clearInterval(pinger);
    for (const c of clients) c.ws.close(1001, "server restarting");
    sub.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}

function send(ws: WebSocket, msg: ServerMessage): void {
  // Skip slow readers instead of buffering without limit; the next batch catches them up.
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000) ws.send(JSON.stringify(msg));
}
