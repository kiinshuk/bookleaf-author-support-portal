import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, getToken } from "../lib/api.js";
import { Spinner, Empty, StatusBadge, PriorityBadge, PRIORITY } from "../components/ui.jsx";

const CATEGORIES = ["Royalty & Payments","ISBN & Metadata Issues","Printing & Quality","Distribution & Availability","Book Status & Production Updates","General Inquiry"];
const STATUSES = ["OPEN","IN_PROGRESS","RESOLVED","CLOSED"];
const LABEL = { OPEN: "Open", IN_PROGRESS: "In Progress", RESOLVED: "Resolved", CLOSED: "Closed" };

// value = hours to look back; empty = no date filter
const DATE_RANGES = { "": "Any date", "24": "Last 24 hours", "168": "Last 7 days", "720": "Last 30 days" };
const UNRESOLVED = ["OPEN", "IN_PROGRESS"];

// age chip — only unresolved tickets can go stale, so that's where we flag it
function Age({ createdAt, status }) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  const stale = days >= 3 && UNRESOLVED.includes(status);
  return <span className={"age" + (stale ? " stale" : "")}>{days === 0 ? "today" : days + "d old"}</span>;
}

export default function AdminQueue() {
  const [tickets, setTickets] = useState(null);
  const [filters, setFilters] = useState({ status: "", category: "", priority: "", hours: "" });
  const load = (f) => {
    const params = new URLSearchParams();
    if (f.status) params.set("status", f.status);
    if (f.category) params.set("category", f.category);
    if (f.priority) params.set("priority", f.priority);
    if (f.hours) params.set("createdAfter", new Date(Date.now() - Number(f.hours) * 3600000).toISOString());
    const q = params.toString();
    api("/tickets" + (q ? "?" + q : "")).then(d => setTickets(d.tickets)).catch(() => setTickets([]));
  };
  useEffect(() => { load(filters); }, [filters]);
  useEffect(() => {
    const interval = setInterval(() => load(filters), 4000);
    return () => clearInterval(interval);
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
        <select value={filters.hours} onChange={set("hours")} aria-label="Filter by date">
          {Object.entries(DATE_RANGES).map(([h, label]) => <option key={h} value={h}>{label}</option>)}
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
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                  <Age createdAt={t.createdAt} status={t.status} />
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
