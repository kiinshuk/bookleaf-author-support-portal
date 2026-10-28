import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { Field, Alert } from "../components/ui.jsx";

export default function NewTicket() {
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  useEffect(() => { api("/books").then(d => setBooks(d.books)).catch(() => {}); }, []);

  const onFiles = (e) => {
    const picked = Array.from(e.target.files || []).map(f => ({ name: f.name, size: f.size }));
    setFiles(prev => [...prev, ...picked].slice(0, 5)); // cap at 5
    e.target.value = ""; // allow re-selecting the same file
  };
  const dropFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i));

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

          <div className="field">
            <span>Attachments <em style={{ fontWeight: 400, color: "var(--ink-3)" }}>(optional)</em></span>
            <label className="file-add">
              + Add files
              <input type="file" multiple onChange={onFiles} accept="image/*,.pdf,.doc,.docx" />
            </label>
            {files.length > 0 && (
              <ul className="file-list">
                {files.map((f, i) => (
                  <li key={f.name + i}>
                    <span className="file-name">{f.name}</span>
                    <span className="file-size">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" className="file-remove" onClick={() => dropFile(i)} aria-label={`Remove ${f.name}`}>×</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="hint">Photos of print defects or screenshots help us resolve faster. Up to 5 files.</div>
          </div>

          <div className="btn-row">
            <button className="btn primary" disabled={busy}>{busy ? "Submitting…" : "Submit ticket"}</button>
            <button type="button" className="btn ghost" onClick={() => nav(-1)}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  );
}
