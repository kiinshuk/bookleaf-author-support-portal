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

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 300 });
app.use(globalLimiter);
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 });

app.get("/health", (req, res) => res.json({ status: "ok", env: config.nodeEnv }));

app.use("/auth", authLimiter, authRoutes);
app.use("/authors", authorRoutes);
app.use("/books", bookRoutes);
app.use("/tickets", ticketRoutes);
app.use("/ai", aiRoutes);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

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
  server.listen(config.port, () => {
    console.log(`BookLeaf backend listening on :${config.port}`);
  });
  return server;
}

export { app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

process.on("SIGINT", async () => { await prisma.$disconnect(); process.exit(0); });
