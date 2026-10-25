import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Spinner, Empty, StatusBadge } from "../components/ui.jsx";

const inr = (n) => (n == null ? null : "₹" + Number(n).toLocaleString("en-IN"));
const orDash = (v) => (v === null || v === undefined || v === "" ? "—" : v);
function platforms(v) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || "[]"); } catch { return []; }
}

function BookCard({ b }) {
  const pub = b.status === "Published & Live";
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <h3 style={{ fontSize: 18, fontWeight: 500 }}>{b.title}</h3>
        <StatusBadge status={pub ? "RESOLVED" : "OPEN"} />
      </div>
      <div className="meta">{b.genre || "—"} · {orDash(b.status)}</div>

      <dl className="kv">
        <dt>ISBN</dt><dd>{orDash(b.isbn)}</dd>
        <dt>Published</dt><dd>{b.publicationDate || (pub ? "—" : "In production")}</dd>
        <dt>MRP</dt><dd>{inr(b.mrp) ?? "—"}</dd>
      </dl>

      <div style={{ marginTop: 14 }}>
        <div className="section-title">Sales &amp; Royalty</div>
        <div className="row"><span>Copies sold</span><strong>{b.totalCopiesSold ?? 0}</strong></div>
        <div className="row"><span>Royalty earned</span><strong>{inr(b.totalRoyaltyEarned) ?? "—"}</strong></div>
        <div className="row"><span>Paid</span><strong>{inr(b.royaltyPaid) ?? "—"}</strong></div>
        <div className="row">
          <span>Pending</span>
          <strong style={{ color: (b.royaltyPending||0) > 0 ? "var(--commerce)" : "inherit" }}>
            {inr(b.royaltyPending) ?? "—"}
          </strong>
        </div>
      </div>

      {platforms(b.availableOn).length > 0 && (
        <div className="meta" style={{ marginTop: 12 }}>
          {platforms(b.availableOn).map((p) => <span key={p} className="badge b-low">{p}</span>)}
        </div>
      )}
    </div>
  );
}

export default function MyBooks() {
  const [books, setBooks] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/books").then(d => setBooks(d.books)).catch(e => setErr(e.message)); }, []);
  if (err) return <Empty>Couldn’t load your books: {err}</Empty>;
  if (!books) return <Spinner />;
  return (
    <>
      <div className="page-head">
        <h2>My Books</h2>
        <p>{books.length} title{books.length === 1 ? "" : "s"} in your catalogue.</p>
      </div>
      {books.length === 0 ? (
        <Empty>No books yet.</Empty>
      ) : (
        <div className="grid books">{books.map((b) => <BookCard key={b.id} b={b} />)}</div>
      )}
    </>
  );
}
