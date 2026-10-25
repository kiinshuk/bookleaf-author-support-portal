import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../App.jsx";
import { Alert } from "../components/ui.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const u = await login(email, password);
      nav(u.role === "ADMIN" ? "/admin/queue" : "/books");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="hero">
      <header className="hero-top">
        <div className="logo">Book<span>Leaf</span></div>
        <nav className="hero-links">
          <a href="#portal">Author Portal</a>
          <a href="#portal">Admin Portal</a>
        </nav>
      </header>

      <div className="hero-body">
        <section className="hero-copy">
          <p className="eyebrow">Author Support &amp; Communication Portal</p>
          <h1>Support that keeps pace with your book.</h1>
          <p className="lede">
            Royalties, ISBNs, printing and distribution — raise a query, follow it in real
            time, and get answers grounded in how BookLeaf actually works.
          </p>
          <dl className="hero-stats">
            <div><dt>22,000+</dt><dd>titles in catalogue</dd></div>
            <div><dt>1,200+</dt><dd>books processed monthly</dd></div>
            <div><dt>24–48h</dt><dd>typical first response</dd></div>
          </dl>
        </section>

        <section className="hero-panel" id="portal">
          <div className="panel">
            <h2>Sign in</h2>
            <p className="panel-sub">Use your BookLeaf author or operations account.</p>
            <Alert kind="err">{err}</Alert>
            <form onSubmit={submit}>
              <label className="field">
                <span>Email</span>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" required autoFocus />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
              </label>
              <button className="btn primary" style={{ width: "100%", height: 48 }} disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <div className="creds">
              Demo access<br />
              Author: <code>priya.sharma@email.com</code> / <code>author123</code><br />
              Admin: <code>admin@bookleaf.com</code> / <code>admin123</code>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
