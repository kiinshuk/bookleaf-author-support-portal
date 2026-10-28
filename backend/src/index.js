import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { initWebSocket } from "./lib/websocket.js";

import authRoutes from "./routes/auth.js";
import authorRoutes from "./routes/authors.js";
import bookRoutes from "./routes/books.js";
import ticketRoutes from "./routes/tickets.js";
import aiRoutes from "./routes/ai.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openapi = JSON.parse(readFileSync(join(__dirname, "..", "openapi.json"), "utf8"));

const API_PREFIX = "/api";
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, keyGenerator: (req) => req.ip || req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "anon", validate: { ip: false } });
app.use(globalLimiter);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => req.ip || req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "anon", validate: { ip: false } });

app.get(API_PREFIX + "/health", (req, res) => res.json({ status: "ok", env: config.nodeEnv }));

app.use(API_PREFIX + "/auth", authLimiter, authRoutes);
app.use(API_PREFIX + "/authors", authorRoutes);
app.use(API_PREFIX + "/books", bookRoutes);
app.use(API_PREFIX + "/tickets", ticketRoutes);
app.use(API_PREFIX + "/ai", aiRoutes);

app.use(API_PREFIX + "/docs", swaggerUi.serve, swaggerUi.setup(openapi));

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err && err.message ? err.message : err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

let server;
export function startServer() {
  if (server) return server;
  server = createServer(app);
  initWebSocket(server);
  const port = Number(config.port);
  server.listen(port, () => {
    console.log(`BookLeaf backend listening on :${port}`);
  });
  return server;
}

export { app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

process.on("SIGINT", async () => { await prisma.$disconnect(); process.exit(0); });
