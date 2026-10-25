import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api, getToken } from "../lib/api.js";
import { Spinner, Empty, StatusBadge, PriorityBadge } from "../components/ui.jsx";

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const load = () => api("/tickets").then(d => setTickets(d.tickets)).catch(() => setTickets([]));
  const wsRef = useRef(null);

  useEffect(() => {
    load();
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket("ws://localhost:4000/ws?token=" + token);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type && m.type.startsWith("ticket.")) load();
      } catch {}
    };
    return () => ws.close();
  }, []);

  return (
    <>
      <div className="page-head">
        <h2>My Tickets</h2>
        <p>Updates appear here live — no refresh needed.</p>
      </div>
      {!tickets ? <Spinner /> : tickets.length === 0 ? (
        <Empty>You haven’t submitted any tickets yet.<br /><Link to="/new-ticket">Raise your first query →</Link></Empty>
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
                <span>{t.book?.title || "General / Account"}</span>
                <span>{t.category || t.aiCategory || "Uncategorised"}</span>
                <span>{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
              <p style={{ color: "var(--ink-2)", fontSize: 14, margin: "8px 0 0" }}>{t.description.slice(0, 140)}{t.description.length > 140 ? "…" : ""}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
