import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, getToken } from "../lib/api.js";
import { useAuth } from "../App.jsx";
import { Spinner, Alert, StatusBadge, PriorityBadge, STATUS, PRIORITY } from "../components/ui.jsx";

const CATEGORIES = ["Royalty & Payments","ISBN & Metadata Issues","Printing & Quality","Distribution & Availability","Book Status & Production Updates","General Inquiry"];

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const nav = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const wsRef = useRef(null);

  const load = () => api(`/tickets/${id}`).then(d => setTicket(d.ticket)).catch(e => setErr(e.message));

  useEffect(() => {
    load();
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket("ws://localhost:4000/ws?token=" + token);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try { const m = JSON.parse(ev.data); if (m.payload?.ticketId === id) load(); } catch {}
    };
    return () => ws.close();
  }, [id]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy("reply");
    try { await api(`/tickets/${id}/responses`, { method: "POST", body: JSON.stringify({ body: reply }) }); setReply(""); await load(); flash("Response sent"); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  const getDraft = async () => {
    setBusy("draft");
    try { const d = await api(`/tickets/${id}/draft`, { method: "POST" }); setReply(d.draft); flash("Draft generated — edit before sending"); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy("note");
    try { await api(`/tickets/${id}/notes`, { method: "POST", body: JSON.stringify({ body: note }) }); setNote(""); await load(); flash("Note added"); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  const patch = async (data, msg) => {
    try { await api(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }); await load(); if (msg) flash(msg); }
    catch (e) { setErr(e.message); }
  };

  if (err && !ticket) return <Alert kind="err">{err}</Alert>;
  if (!ticket) return <Spinner />;

  return (
    <>
      <button className="btn ghost" onClick={() => nav(-1)} style={{ marginBottom: 14 }}>← Back</button>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h2>{ticket.subject}</h2>
          <div className="meta">
            <span>{ticket.author?.name}</span>
            <span>{ticket.book?.title || "General / Account"}</span>
            <span>{new Date(ticket.createdAt).toLocaleString()}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      <Alert kind="err">{err}</Alert>
      {toast && <Alert kind="ok">{toast}</Alert>}

      {isAdmin && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Admin controls</div>
          <div className="btn-row" style={{ marginBottom: 12 }}>
            {Object.keys(STATUS).map(s => (
              <button key={s} className={"btn" + (ticket.status === s ? " primary" : "")} onClick={() => patch({ status: s }, "Status updated")}>{STATUS[s].label}</button>
            ))}
          </div>
          <div className="btn-row" style={{ marginBottom: 12 }}>
            <button className="btn" onClick={getDraft} disabled={busy === "draft"}>{busy === "draft" ? "Drafting…" : "✨ AI draft response"}</button>
            <button className="btn" onClick={() => patch({ assignedToId: user?.id }, "Assigned to me")}>Assign to me</button>
          </div>
          <div className="btn-row">
            <label style={{ fontSize: 13 }}>Category
              <select className="pill-select" style={{ marginLeft: 6 }}
                value={ticket.category || ""}
                onChange={e => patch({ category: e.target.value }, "Category overridden")}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>Priority
              <select className="pill-select" style={{ marginLeft: 6 }}
                value={ticket.priority}
                onChange={e => patch({ priority: e.target.value }, "Priority overridden")}>
                {Object.keys(PRIORITY).map(p => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
              </select>
            </label>
            {ticket.assignedTo && <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Assigned: {ticket.assignedTo.email}</span>}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Original query</div>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", fontSize: 14 }}>{ticket.description}</pre>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Conversation</div>
        <div className="thread">
          {(ticket.responses || []).length === 0 && <div style={{ color: "var(--ink-3)", fontSize: 14 }}>No responses yet.</div>}
          {(ticket.responses || []).map(r => (
            <div key={r.id} className={"msg " + (r.fromAdmin ? "admin" : "author")}>
              <div className="who">{r.authorName || (r.fromAdmin ? "BookLeaf Support" : ticket.author?.name)} · {new Date(r.createdAt).toLocaleString()}</div>
              <pre>{r.body}</pre>
            </div>
          ))}
        </div>
        <form onSubmit={sendReply}>
          <textarea className="reply-box" value={reply} onChange={e=>setReply(e.target.value)} rows={4}
            placeholder={isAdmin ? "Write a reply to the author…" : "Write a reply…"} />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={busy === "reply"}>{busy === "reply" ? "Sending…" : "Send reply"}</button>
          </div>
        </form>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="section-title">Internal notes (never shown to author)</div>
          {(ticket.internalNotes || []).map(n => (
            <div className="note" key={n.id} style={{ marginBottom: 8 }}>{n.body}</div>
          ))}
          <form onSubmit={addNote} style={{ marginTop: 8 }}>
            <input className="note-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a private note for the team…" />
            <button className="btn" disabled={busy === "note"}>Add note</button>
          </form>
        </div>
      )}
    </>
  );
}
