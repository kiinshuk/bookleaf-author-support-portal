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

test("WebSocket rejects unauthenticated", async () => {
  const WebSocket = (await import("ws")).default;
  await new Promise((resolve) => {
    const ws = new WebSocket(base.replace("http", "ws") + "/ws");
    ws.on("close", (code) => { assert.ok(code !== 1000); resolve(); });
    ws.on("error", () => resolve());
  });
});
