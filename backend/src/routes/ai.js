import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AI_USAGE } from "../services/ai.js";
import { config } from "../config.js";

const router = Router();

/**
 * GET /ai/usage — admin-only cost/observability endpoint.
 * Answers "are you being smart about tokens?" with data instead of prose: every model
 * call is logged with its provider, token counts, and whether it was served from cache.
 * Lists only whether a key is configured — never the key itself.
 */
router.get("/usage", requireAuth, requireRole("ADMIN"), (req, res) => {
  const totals = AI_USAGE.reduce(
    (acc, e) => ({
      promptTokens: acc.promptTokens + e.promptTokens,
      completionTokens: acc.completionTokens + e.completionTokens,
      calls: acc.calls + 1,
      cachedCalls: acc.cachedCalls + (e.cached ? 1 : 0),
    }),
    { promptTokens: 0, completionTokens: 0, calls: 0, cachedCalls: 0 }
  );
  res.json({
    provider: {
      primary: config.openaiApiKey ? `openai (${config.openaiModel})` : "openai not configured",
      fallback: config.ollamaModel ? `ollama (${config.ollamaModel})` : "ollama not configured",
      terminal: "deterministic heuristics",
    },
    totals,
    recent: AI_USAGE.slice(-50).reverse(),
  });
});

export default router;
