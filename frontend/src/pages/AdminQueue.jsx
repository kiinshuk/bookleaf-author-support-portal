import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, getToken } from "../lib/api.js";
import { Spinner, Empty, StatusBadge, PriorityBadge, PRIORITY } from "../components/ui.jsx";

const CATEGORIES = ["Royalty & Payments","ISBN & Metadata Issues","Printing & Quality","Distribution & Availability","Book Status & Production Updates","General Inquiry"];
const STATUSES = ["OPEN","IN_PROGRESS","RESOLVED","CLOSED"];
const LABEL = { OPEN: "Open", IN_PROGRESS: "In Progress", RESOLVED: "Resolved", CLOSED: "Closed" };

export default function AdminQueue() {
  const [tickets, setTickets] = useState(null);
  const [filters, setFilters] = useState({ status: "", category: "", priority: "" });
  const load = (f) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).toString();
    api("/tickets" + (q ? "?" + q : "")).then(d => setTickets(d.tickets)).catch(() => setTickets([]));
  };
  useEffect(() => { load(filters); }, [filters]);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket("ws://localhost:4000/ws?token=" + token);
    ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.type?.startsWith("ticket.")) load(filters); } catch {} };
    return () => ws.close();
  }, [filters]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <div className="page-head">
        <h2>Ticket Queue</h2>
        <p>Sorted by priority (Critical → Low), then oldest first.</p>
      </div>

      <div className="filters">
        <select value={filters.status} onChange={set("status")} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
        <select value={filters.category} onChange={set("category")} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.priority} onChange={set("priority")} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {Object.keys(PRIORITY).map(p => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
        </select>
        {tickets && <span className="pill-count">{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</span>}
      </div>

      {!tickets ? <Spinner /> : tickets.length === 0 ? (
        <Empty>No tickets match these filters.</Empty>
      ) : (
        <div className="grid">
          {tickets.map(t => (
            <div className="card" key={t.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <Link to={`/tickets/${t.id}`} style={{ fontSize: 16, fontWeight: 600 }}>{t.subject}</Link>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              </div>
              <div className="meta">
                <span>{t.author?.name}</span>
                <span>{t.book?.title || "General / Account"}</span>
                <span>{t.category || t.aiCategory || "Uncategorised"}</span>
                <span>{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
              <p style={{ color: "var(--ink-2)", fontSize: 14, margin: "8px 0 0" }}>{t.description.slice(0, 120)}{t.description.length > 120 ? "…" : ""}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
