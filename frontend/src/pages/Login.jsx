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
    <div className="login">
      <div className="panel">
        <div className="brand">
          <div className="mark">Book<span>Leaf</span></div>
          <p>Author Support &amp; Communication Portal</p>
        </div>
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
    </div>
  );
}
