import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { Field, Alert } from "../components/ui.jsx";

export default function NewTicket() {
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  useEffect(() => { api("/books").then(d => setBooks(d.books)).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await api("/tickets", { method: "POST", body: JSON.stringify({ bookId: bookId || null, subject, description }) });
      nav("/tickets");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <h2>Submit a support query</h2>
        <p>Our team reviews every ticket. Most get a reply within one business day.</p>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <Alert kind="err">{err}</Alert>
        <form onSubmit={submit}>
          <Field label="Which book is this about?">
            <select value={bookId} onChange={e=>setBookId(e.target.value)}>
              <option value="">General / Account Level</option>
              {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </Field>
          <Field label="Subject">
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Short summary of your question" required />
          </Field>
          <Field label="Description" hint="Include specifics — dates, amounts, platform names — so we can help faster.">
            <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe your issue in detail…" required />
          </Field>
          <div className="btn-row">
            <button className="btn primary" disabled={busy}>{busy ? "Submitting…" : "Submit ticket"}</button>
            <button type="button" className="btn ghost" onClick={() => nav(-1)}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  );
}
