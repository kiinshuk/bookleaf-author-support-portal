import { config } from "../config.js";
import OpenAI from "openai";

/*
 * AI service — classification, priority scoring, and response drafting.
 *
 * Provider chain: OpenAI (gpt-4o-mini) -> Ollama (if configured) -> deterministic heuristics.
 * Every exported function degrades gracefully: a model outage degrades output quality,
 * never ticket creation or the admin's ability to work manually.
 *
 * Cost controls:
 *  - classifyAndScore() is ONE call returning category + priority together (was two).
 *  - draftResponse() is cached per ticket, keyed on the ticket's last update.
 *  - Prompts send only the current query + the relevant book/author record. The KB is
 *    condensed policy (~350 words), not the full assignment document.
 *  - Every call records token usage in AI_USAGE; transient errors retry with backoff.
 */

// ---------- provider plumbing ----------

let openaiClient = null;
function getOpenAI() {
  if (!config.openaiApiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  return openaiClient;
}

// in-process usage log — makes cost visible in code and in logs, not just in the README
export const AI_USAGE = [];
function recordUsage(call, provider, usage, cached = false) {
  const entry = {
    call,
    provider,
    cached,
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    at: new Date().toISOString(),
  };
  AI_USAGE.push(entry);
  if (AI_USAGE.length > 500) AI_USAGE.shift();
  console.log(`[ai] ${call} via ${provider}${cached ? " (cached)" : ""} tokens=${entry.promptTokens}+${entry.completionTokens}`);
  return entry;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTransient = (e) => {
  const status = e?.status ?? e?.response?.status;
  return status === 429 || status === 408 || (status >= 500 && status < 600) || e?.code === "ECONNRESET";
};

/**
 * Single LLM call site. Returns { content, provider } or null when no provider answered.
 * Retries transient failures (429/5xx/network) with exponential backoff before falling through —
 * a rate limit should cost one delayed answer, not a degraded one.
 */
async function callLLM(call, systemPrompt, userPrompt) {
  const openai = getOpenAI();
  if (openai) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await openai.chat.completions.create({
          model: config.openaiModel,
          temperature: 0.4,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
        const content = res.choices[0]?.message?.content?.trim() || "";
        if (!content) return null;
        recordUsage(call, config.openaiModel, res.usage);
        return { content, provider: "openai" };
      } catch (e) {
        console.error(`OpenAI error (${call}, attempt ${attempt + 1}):`, e.message);
        if (!isTransient(e) || attempt === 1) break; // non-transient or already retried
        await sleep(600 * (attempt + 1));
      }
    }
  }
  // Ollama fallback (local, free — only attempted when configured)
  if (config.ollamaModel) {
    try {
      const resp = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
        }),
      });
      if (resp.ok) {
        const j = await resp.json();
        const content = j.message?.content?.trim() || "";
        if (!content) return null;
        recordUsage(call, config.ollamaModel, {
          promptTokens: j.prompt_eval_count ?? 0,
          completionTokens: j.eval_count ?? 0,
        });
        return { content, provider: "ollama" };
      }
    } catch (e) {
      console.error("Ollama error:", e.message);
    }
  }
  return null; // caller falls back to deterministic heuristics
}

// ---------- knowledge base ----------
// Condensed from the BookLeaf KB. Only the sections relevant to a ticket's category are
// selected per call (see KB_BY_CATEGORY) rather than sending everything every time.

const KNOWLEDGE_BASE = `BookLeaf Publishing: self-publishing in India & US.
Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium with marketing/distribution).
Services: cover design, typesetting, ISBN assignment, printing, distribution, royalty management.
Printing: in-house facility + warehouse in Delhi; partners Repro India and Epitome Books.
Royalty: 80/20 split (80% to author). Net profit = MRP - printing cost - platform commission - shipping. Quarterly payouts within 45 days of quarter end. Minimum payout threshold 1000 INR rolling over. Bank transfer to linked account. Detailed breakdown per platform available.
ISBN: unique ISBN assigned by BookLeaf under BookLeaf imprint. To get author own imprint, obtain independently. ISBN errors reported treated high-priority, escalated to production.
Printing & Quality: standard turnaround 5-7 business days. Quality issues (misprints, binding, color) get free reprint after verification; may need photos. Reprint timeline 5-7 days.
Distribution: Amazon India, Flipkart, Amazon US, Amazon UK, BookLeaf Store. New listings go live 7-10 business days after publication. Unavailable usually stock sync issue; re-sync within 24-48 hours.
Production stages: Manuscript Received -> Editing -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live. Updates via email. Delays typically Cover Design (waiting author approval) and Proofreading.
Tone: empathetic, professional, authors are partners. Acknowledge concern before solutions. Specific numbers/dates/statuses. Own BookLeaf faults. Clear timeline for escalation. End with clear next steps.`;

// Per-category slices of the KB. A royalty ticket doesn't need the production-stage ladder;
// sending only the relevant slice keeps prompt tokens down as the KB grows.
const KB_BY_CATEGORY = {
  "Royalty & Payments": ["Royalty: 80/20 split (80% to author). Net profit = MRP - printing cost - platform commission - shipping. Quarterly payouts within 45 days of quarter end. Minimum payout threshold 1000 INR rolling over. Bank transfer to linked account. Detailed breakdown per platform available."],
  "ISBN & Metadata Issues": ["ISBN: unique ISBN assigned by BookLeaf under BookLeaf imprint. To get author own imprint, obtain independently. ISBN errors reported treated high-priority, escalated to production."],
  "Printing & Quality": ["Printing: in-house facility + warehouse in Delhi; partners Repro India and Epitome Books.", "Printing & Quality: standard turnaround 5-7 business days. Quality issues (misprints, binding, color) get free reprint after verification; may need photos. Reprint timeline 5-7 days."],
  "Distribution & Availability": ["Distribution: Amazon India, Flipkart, Amazon US, Amazon UK, BookLeaf Store. New listings go live 7-10 business days after publication. Unavailable usually stock sync issue; re-sync within 24-48 hours."],
  "Book Status & Production Updates": ["Production stages: Manuscript Received -> Editing -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live. Updates via email. Delays typically Cover Design (waiting author approval) and Proofreading."],
};
const TONE_RULES = "Tone: empathetic, professional, authors are partners. Acknowledge concern before solutions. Specific numbers/dates/statuses. Own BookLeaf faults. Clear timeline for escalation. End with clear next steps.";

function kbFor(category) {
  const sections = KB_BY_CATEGORY[category];
  // fall back to the full KB when the category is unknown/general - a general query may touch anything
  return sections ? `${sections.join("\n")}\n${TONE_RULES}` : `${KNOWLEDGE_BASE}`;
}

// ---------- validation helpers ----------

export const VALID_CATEGORIES = ["Royalty & Payments", "ISBN & Metadata Issues", "Printing & Quality", "Distribution & Availability", "Book Status & Production Updates", "General Inquiry"];
export const VALID_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/**
 * LLMs wrap JSON in prose or code fences. Strip fences, then if parsing still fails,
 * pull the first balanced {...} object out of the text and try that. Returns null on
 * no parseable JSON - the caller then uses its deterministic fallback.
 */
export function extractJSON(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// ---------- exports ----------

export async function classifyTicket({ subject, description }) {
  const result = await classifyAndScore({ subject, description });
  return result.category;
}

export async function scorePriority({ subject, description }) {
  const result = await classifyAndScore({ subject, description });
  return result.priority;
}

/**
 * Combined classification + priority in a single LLM call - halves the per-ticket token
 * cost and latency versus calling the two functions separately. Exported separately
 * above for callers that only need one half (both route here).
 */
export async function classifyAndScore({ subject, description }) {
  const system = `You are a support ticket triage model for BookLeaf Publishing. Classify the ticket and score its priority.

Category — exactly one of: "Royalty & Payments", "ISBN & Metadata Issues", "Printing & Quality", "Distribution & Availability", "Book Status & Production Updates", "General Inquiry".
Priority — exactly one of: CRITICAL, HIGH, MEDIUM, LOW. Judge impact and urgency: unpaid royalties and wrong-ISBN listings are HIGH/CRITICAL; cosmetic questions are LOW/MEDIUM.

Respond with JSON only, no prose: {"category":"...","priority":"...","confidence":0.0-1.0,"reason":"one short sentence"}`;
  const user = `Subject: ${subject}\nDescription: ${description}`;

  const res = await callLLM("classify", system, user);
  let category = null, priority = null;
  if (res) {
    const parsed = extractJSON(res.content);
    if (parsed) {
      if (VALID_CATEGORIES.includes(parsed.category)) category = parsed.category;
      if (VALID_PRIORITIES.includes(String(parsed.priority || "").toUpperCase())) priority = String(parsed.priority).toUpperCase();
    }
    if (!category) {
      // salvage: the model answered in prose - find a known category/priority by name
      category = VALID_CATEGORIES.find(c => res.content.toLowerCase().includes(c.toLowerCase())) || null;
      priority = VALID_PRIORITIES.find(p => res.content.toUpperCase().includes(p)) || null;
    }
  }
  // deterministic fallbacks (also the safety net when the model output fails validation)
  if (!category) {
    const text = (subject + " " + description).toLowerCase().replace(/['']/g, "");
    if (text.includes("royalt") || text.includes("payment") || text.includes("payout")) category = "Royalty & Payments";
    else if (text.includes("isbn") || text.includes("metadata")) category = "ISBN & Metadata Issues";
    else if (text.includes("print") || text.includes("quality") || text.includes("binding")) category = "Printing & Quality";
    else if (text.includes("unavailable") || text.includes("amazon") || text.includes("distribution")) category = "Distribution & Availability";
    else if (text.includes("typeset") || text.includes("production") || text.includes("status")) category = "Book Status & Production Updates";
    else category = "General Inquiry";
  }
  if (!priority) {
    // normalize first: authors type "havent" as often as "haven't", and the spec's own
    // example ("haven't received any royalty for 6 months") must never miss the heuristic
    const text = (subject + " " + description).toLowerCase().replace(/[''']/g, "");
    if ((text.includes("havent received") || text.includes("didnt receive") || text.includes("not received")) && text.includes("royalt")) priority = "HIGH";
    else if (text.includes("isbn") && (text.includes("error") || text.includes("wrong") || text.includes("mismatch"))) priority = "HIGH";
    else if (text.includes("urgent") || text.includes("asap")) priority = "HIGH";
    else if (text.includes("overdue") || text.includes("6 months") || text.includes("months late")) priority = "HIGH";
    else priority = "MEDIUM";
  }
  return { category, priority, provider: res?.provider || "deterministic" };
}

// draft cache: ticketId -> { key, draft, provider }
const draftCache = new Map();

/** Exposed for tests and ops introspection. */
export function clearDraftCache() { draftCache.clear(); }

export async function draftResponse({ ticket, author, book, history }) {
  // Cache key includes the ticket's updatedAt + response count, so an edited ticket or a
  // new message invalidates the entry. Regenerating an unchanged draft spends tokens for
  // an identical answer - this makes "generate draft" idempotent within a ticket state.
  const cacheKey = `${ticket.updatedAt || ""}|${(history || []).length}`;
  const hit = draftCache.get(ticket.id);
  if (hit && hit.key === cacheKey) {
    recordUsage("draft", hit.provider, null, true);
    return hit.draft;
  }

  // Only the relevant KB slice travels with the prompt, not the whole corpus.
  const kb = kbFor(ticket.category || ticket.aiCategory);
  const system = `You are a BookLeaf Publishing support representative. Use the knowledge base below. Tone: empathetic, professional, specific numbers/dates/status. Acknowledge concern before solution. Own BookLeaf faults. Clear timeline for escalation. End with clear next steps. Do not invent facts beyond provided context. Keep under 250 words.

KNOWLEDGE BASE:
${kb}`;
  const ctx = buildAuthorContext(author, book);
  const hist = (history || []).map(r => `${r.fromAdmin ? "Admin" : "Author"}: ${r.body}`).join("\n");
  const user = `Ticket subject: ${ticket.subject}\nCategory: ${ticket.category || ticket.aiCategory}\nPriority: ${ticket.priority}\nDescription: ${ticket.description}\n${ctx}\n${hist ? "Prior messages:\n" + hist : ""}\n\nDraft a response to this author.`;

  const res = await callLLM("draft", system, user);
  const draft = res?.content || fallbackDraft(author, book);
  const provider = res?.provider || "deterministic";
  draftCache.set(ticket.id, { key: cacheKey, draft, provider });
  if (draftCache.size > 200) draftCache.delete(draftCache.keys().next().value);
  return draft;
}

function fallbackDraft(author, book) {
  return `Hi ${author?.name || "there"},

Thank you for reaching out, and I'm sorry to hear about this. I've logged your concern and our team will review it shortly. Based on your account details${book ? ` for "${book.title}"` : ""}, we'll get back to you within 48 hours with a clear update and next steps.

Warm regards,
BookLeaf Support Team`;
}

function buildAuthorContext(author, book) {
  if (!author) return "";
  const parts = [
    `Author: ${author.name} (${author.email}), city ${author.city}, joined ${author.joinedDate}.`,
  ];
  if (book) {
    parts.push(
      `Book: "${book.title}" (${book.id}), ISBN ${book.isbn || "N/A"}, genre ${book.genre}, status ${book.status}, publication ${book.publicationDate || "N/A"}, MRP ${book.mrp ?? "N/A"}, royalty per copy ${book.authorRoyaltyPerCopy ?? "N/A"}, sold ${book.totalCopiesSold}, earned ${book.totalRoyaltyEarned}, paid ${book.royaltyPaid}, pending ${book.royaltyPending}, last payout ${book.lastRoyaltyPayoutDate || "none"}, print partner ${book.printPartner || "N/A"}, platforms ${(Array.isArray(book.availableOn) ? book.availableOn : (function(v){try{return JSON.parse(v||"[]")}catch{return []}})(book.availableOn)).join(", ")}.`
    );
  }
  return parts.join(" ");
}
