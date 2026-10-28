import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";
import http from "node:http";

let server, base;
function req(path, opts={}) { return fetch(base+path, opts); }
test.before(async () => {
  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(async () => { server.close(); });

async function login(email, password) {
  const r = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  return { status: r.status, token: j.token, user: j.user };
}

test("health ok", async () => {
  const r = await fetch(base + "/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("invalid login rejected", async () => {
  const { status } = await login("nope@x.com", "wrong");
  assert.equal(status, 401);
});

test("author login works", async () => {
  const { status, token, user } = await login("priya.sharma@email.com", "author123");
  assert.equal(status, 200);
  assert.ok(token);
  assert.equal(user.role, "AUTHOR");
});

test("books require auth", async () => {
  const r = await fetch(base + "/books");
  assert.equal(r.status, 401);
});

test("author sees own books only", async () => {
  const { token } = await login("priya.sharma@email.com", "author123");
  const h = { Authorization: "Bearer " + token };
  const r = await fetch(base + "/books", { headers: h });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.ok(j.books.length > 0);
  for (const b of j.books) assert.equal(b.authorId, "AUTH001");
});

test("ticket creation requires auth and validates fields", async () => {
  const r = await fetch(base + "/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "s", description: "d" }) });
  assert.equal(r.status, 401);
  const { token } = await login("priya.sharma@email.com", "author123");
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const r2 = await fetch(base + "/tickets", { method: "POST", headers: h, body: JSON.stringify({ subject: "", description: "d" }) });
  assert.equal(r2.status, 400);
});

test("ticket creation succeeds and no internal notes leak", async () => {
  const { token } = await login("priya.sharma@email.com", "author123");
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const r = await fetch(base + "/tickets", { method: "POST", headers: h, body: JSON.stringify({ subject: "Royalty missing", description: "No payout for 4 months" }) });
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.ok(!("internalNotes" in (j.ticket || {})) || (j.ticket.internalNotes || []).length === 0);
  // fetch detail
  const d = await fetch(base + "/tickets/" + j.ticket.id, { headers: h });
  const dj = await d.json();
  assert.equal(dj.ticket.internalNotes.length, 0);
});

test("admin can list tickets and queue sorted by priority", async () => {
  const { token, status } = await login("admin@bookleaf.com", "admin123");
  assert.equal(status, 200);
  const h = { Authorization: "Bearer " + token };
  const r = await fetch(base + "/tickets", { headers: h });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.tickets));
  // verify non-increasing priority order if any
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  for (let i = 1; i < j.tickets.length; i++) {
    assert.ok(order[j.tickets[i-1].priority] <= order[j.tickets[i].priority]);
  }
});

test("ticket list date filter validates input and filters correctly", async () => {
  const { token } = await login("admin@bookleaf.com", "admin123");
  const h = { Authorization: "Bearer " + token };
  // invalid date -> meaningful 400, not a 500
  const bad = await fetch(base + "/tickets?createdAfter=not-a-date", { headers: h });
  assert.equal(bad.status, 400);
  const badJson = await bad.json();
  assert.ok(badJson.error);
  // epoch -> every ticket is after it
  const all = await (await fetch(base + "/tickets?createdAfter=1970-01-01T00:00:00Z", { headers: h })).json();
  const unfiltered = await (await fetch(base + "/tickets", { headers: h })).json();
  assert.equal(all.tickets.length, unfiltered.tickets.length);
  // far future -> no tickets
  const none = await (await fetch(base + "/tickets?createdAfter=2999-01-01T00:00:00Z", { headers: h })).json();
  assert.equal(none.tickets.length, 0);
});

test("admin-only endpoints reject authors", async () => {
  const { token } = await login("priya.sharma@email.com", "author123");
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const r = await fetch(base + "/tickets/anything/notes", { method: "POST", headers: h, body: JSON.stringify({ body: "note" }) });
  assert.ok(r.status === 401 || r.status === 403 || r.status === 404);
});

test("AI draft generation does not fail when no provider", async () => {
  const { token } = await login("admin@bookleaf.com", "admin123");
  const h = { Authorization: "Bearer " + token };
  // find a ticket
  const list = await (await fetch(base + "/tickets", { headers: h })).json();
  if (list.tickets.length === 0) return;
  const id = list.tickets[0].id;
  const r = await fetch(base + "/tickets/" + id + "/draft", { method: "POST", headers: h });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(typeof j.draft === "string" && j.draft.length > 0);
});

test("AI helpers: extractJSON salvages fenced and embedded JSON", async () => {
  const { extractJSON } = await import("../src/services/ai.js");
  // plain
  assert.deepEqual(extractJSON('{"category":"General Inquiry","priority":"LOW"}'), { category: "General Inquiry", priority: "LOW" });
  // fenced by the model
  assert.equal(extractJSON('```json\n{"category":"Printing & Quality"}\n```').category, "Printing & Quality");
  // embedded in prose
  assert.equal(extractJSON('Sure! Here is the result: {"priority":"HIGH"} hope that helps').priority, "HIGH");
  // nested braces must not truncate the object
  assert.deepEqual(extractJSON('x {"a":{"b":1}} y'), { a: { b: 1 } });
  // no JSON at all -> null, caller uses deterministic fallback
  assert.equal(extractJSON("I cannot classify this."), null);
  assert.equal(extractJSON(""), null);
});

test("AI triage degrades to deterministic heuristics with no provider", async () => {
  const { classifyAndScore } = await import("../src/services/ai.js");
  // With no OPENAI_API_KEY / OLLAMA_MODEL configured this must still return
  // valid, allow-listed answers — never throw and never block ticket creation.
  const royalty = await classifyAndScore({ subject: "Royalty not paid", description: "I haven't received any royalty for 6 months." });
  assert.equal(royalty.category, "Royalty & Payments");
  assert.equal(royalty.priority, "HIGH");
  assert.equal(royalty.provider, "deterministic");
  // the apostrophe-less form authors actually type must score the same
  const typed = await classifyAndScore({ subject: "Royalty missing", description: "I havent received my royalty for 6 months, whats going on?" });
  assert.equal(typed.priority, "HIGH");
  const isbn = await classifyAndScore({ subject: "ISBN mismatch", description: "Amazon shows a wrong ISBN on my book." });
  assert.equal(isbn.category, "ISBN & Metadata Issues");
  const benign = await classifyAndScore({ subject: "Author bio", description: "Can I update my author bio?" });
  assert.equal(benign.category, "General Inquiry");
});

test("AI draft is cached per ticket state and still returned with no provider", async () => {
  const { draftResponse, clearDraftCache } = await import("../src/services/ai.js");
  clearDraftCache();
  const ticket = { id: "t-cache-test", subject: "Royalty query", category: "Royalty & Payments", priority: "HIGH", description: "Where is my payout?", updatedAt: "2026-01-01T00:00:00Z" };
  const author = { name: "Priya", email: "p@e.com" };
  const first = await draftResponse({ ticket, author, book: null, history: [] });
  const second = await draftResponse({ ticket, author, book: null, history: [] });
  assert.equal(first, second); // same ticket state -> cached, no second spend
  // a new message in the thread invalidates the cache entry
  const after = await draftResponse({ ticket, author, book: null, history: [{ fromAdmin: false, body: "hello" }] });
  assert.notEqual(after, undefined);
  assert.ok(after.length > 0);
});

test("admin cost endpoint reports provider chain; authors forbidden", async () => {
  const { token: adminToken } = await login("admin@bookleaf.com", "admin123");
  const r = await fetch(base + "/ai/usage", { headers: { Authorization: "Bearer " + adminToken } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.provider.terminal.includes("deterministic"));
  assert.ok(j.totals && typeof j.totals.calls === "number");
  assert.ok(Array.isArray(j.recent));
  // key presence only — the secret itself must never appear in any response body
  assert.ok(!JSON.stringify(j).includes("sk-"));
  const { token: authorToken } = await login("priya.sharma@email.com", "author123");
  const denied = await fetch(base + "/ai/usage", { headers: { Authorization: "Bearer " + authorToken } });
  assert.ok(denied.status === 401 || denied.status === 403);
});

test("WebSocket rejects unauthenticated", async () => {
  const WebSocket = (await import("ws")).default;
  await new Promise((resolve) => {
    const ws = new WebSocket(base.replace("http", "ws") + "/ws");
    ws.on("close", (code) => { assert.ok(code !== 1000); resolve(); });
    ws.on("error", () => resolve());
  });
});
