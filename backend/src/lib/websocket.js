import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import url from "url";

let wss;
const clients = new Map(); // socket -> {userId, role, authorId}

export function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const q = url.parse(req.url, true).query;
    const token = q.token;
    if (!token) { ws.close(1008, "Missing token"); return; }
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret); } catch { ws.close(1008, "Invalid token"); return; }
    clients.set(ws, { userId: payload.id, role: payload.role, authorId: payload.authorId });
    ws.on("close", () => clients.delete(ws));
    ws.send(JSON.stringify({ type: "connected", payload: { role: payload.role } }));
  });
  return wss;
}

export function broadcast(event, filterFn) {
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const [ws, info] of clients) {
    if (ws.readyState !== 1) continue;
    if (filterFn && !filterFn(info)) continue;
    ws.send(data);
  }
}
