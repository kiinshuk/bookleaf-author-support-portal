import React, { useState, useEffect, useContext, createContext } from "react";
import { Routes, Route, Navigate, Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken, setToken, clearToken } from "./lib/api.js";

const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      if (getToken()) {
        try { const d = await api("/auth/me"); setUser(d.user); } catch { clearToken(); }
      }
      setLoading(false);
    })();
  }, []);
  const login = async (email, password) => {
    const d = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setToken(d.token); setUser(d.user); return d.user;
  };
  const logout = () => { clearToken(); setUser(null); };
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
const useAuth = () => useContext(AuthContext);

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) return <Navigate to="/" />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <nav style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", gap: 12 }}>
      {user.role === "AUTHOR" ? (
        <>
          <Link to="/books">My Books</Link>
          <Link to="/tickets">My Tickets</Link>
          <Link to="/new-ticket">New Ticket</Link>
        </>
      ) : (
        <>
          <Link to="/admin/queue">Ticket Queue</Link>
        </>
      )}
      <span style={{ marginLeft: "auto" }}>{user.email}</span>
      <button onClick={logout}>Logout</button>
    </nav>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const { login } = useAuth();
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    try { const u = await login(email, password); nav(u.role === "ADMIN" ? "/admin/queue" : "/books"); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div style={{ maxWidth: 400, margin: "60px auto" }}>
      <h2>Login</h2>
      {err && <p style={{ color: "red" }}>{err}</p>}
      <form onSubmit={submit}>
        <div><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" style={{ width: "100%", marginBottom: 8 }} /></div>
        <div><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="password" style={{ width: "100%", marginBottom: 8 }} /></div>
        <button type="submit">Login</button>
      </form>
      <p style={{ fontSize: 12, color: "#666", marginTop: 16 }}>Author accounts: any author email / author123. Admin: admin@bookleaf.com / admin123.</p>
    </div>
  );
}

function AuthorBooks() {
  const [books, setBooks] = useState([]);
  useEffect(() => { api("/books").then(d => setBooks(d.books)).catch(console.error); }, []);
  return (
    <div style={{ padding: 20 }}>
      <h2>My Books</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {books.map(b => (
          <div key={b.id} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
            <h3>{b.title}</h3>
            <p>{b.genre} | {b.status}</p>
            <p>ISBN: {b.isbn || "—"}</p>
            <p>Publication: {b.publicationDate || "—"}</p>
            <p>MRP: {b.mrp != null ? "?"+b.mrp : "—"}</p>
            <p>Copies sold: {b.totalCopiesSold}</p>
            <p>Royalty earned: ?{b.totalRoyaltyEarned}</p>
            <p>Paid: ?{b.royaltyPaid} | Pending: ?{b.royaltyPending}</p>
            <p>Available on: {(b.availableOn||[]).join(", ")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewTicket() {
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const nav = useNavigate();
  useEffect(() => { api("/books").then(d => setBooks(d.books)); }, []);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api("/tickets", { method: "POST", body: JSON.stringify({ bookId: bookId || null, subject, description }) });
      nav("/tickets");
    } catch (e) { setMsg(e.message); }
  };
  return (
    <div style={{ padding: 20, maxWidth: 600 }}>
      <h2>Submit Support Query</h2>
      {msg && <p style={{ color: "red" }}>{msg}</p>}
      <form onSubmit={submit}>
        <div style={{ marginBottom: 8 }}>
          <select value={bookId} onChange={e=>setBookId(e.target.value)} style={{ width: "100%" }}>
            <option value="">General / Account Level</option>
            {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject" required style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description" required rows={6} style={{ width: "100%" }} />
        </div>
        <button type="submit">Submit Ticket</button>
      </form>
    </div>
  );
}

function AuthorTickets() {
  const [tickets, setTickets] = useState([]);
  const load = () => api("/tickets").then(d => setTickets(d.tickets));
  useEffect(() => {
    load();
    const token = getToken();
    const ws = new WebSocket("ws://localhost:4000/ws?token="+token);
    ws.onmessage = (ev) => {
      try { const m = JSON.parse(ev.data); if (m.type.startsWith("ticket.")) load(); } catch {}
    };
    return () => ws.close();
  }, []);
  return (
    <div style={{ padding: 20 }}>
      <h2>My Tickets</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {tickets.map(t => (
          <li key={t.id} style={{ border: "1px solid #ddd", padding: 12, marginBottom: 8, borderRadius: 8 }}>
            <Link to={`/tickets/${t.id}`}><strong>{t.subject}</strong></Link>
            <div>Status: {t.status} | Priority: {t.priority} | Category: {t.category || t.aiCategory || "—"}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [reply, setReply] = useState("");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const isAdmin = user?.role === "ADMIN";
  const load = () => api(`/tickets/${id}`).then(d => setTicket(d.ticket));
  useEffect(() => {
    load();
    const token = getToken();
    const ws = new WebSocket("ws://localhost:4000/ws?token="+token);
    ws.onmessage = (ev) => { try { const m=JSON.parse(ev.data); if (m.payload?.ticketId===id) load(); } catch {} };
    return () => ws.close();
  }, [id]);
  if (!ticket) return <div>Loading...</div>;
  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    await api(`/tickets/${id}/responses`, { method: "POST", body: JSON.stringify({ body: reply }) });
    setReply(""); load();
  };
  const getDraft = async () => {
    const d = await api(`/tickets/${id}/draft`, { method: "POST" });
    setDraft(d.draft); setReply(d.draft);
  };
  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    await api(`/tickets/${id}/notes`, { method: "POST", body: JSON.stringify({ body: note }) });
    setNote(""); load();
  };
  const updateStatus = async (status) => {
    await api(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  };
  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <h2>{ticket.subject}</h2>
      <p>{ticket.description}</p>
      <div>Author: {ticket.author?.name}</div>
      <div>Book: {ticket.book?.title || "General"}</div>
      <div>Status: {ticket.status} | Priority: {ticket.priority} (AI: {ticket.aiPriority}) | Category: {ticket.category}</div>
      {isAdmin && (
        <div style={{ margin: "12px 0", display: "flex", gap: 8 }}>
          {["OPEN","IN_PROGRESS","RESOLVED","CLOSED"].map(s => <button key={s} onClick={()=>updateStatus(s)}>{s}</button>)}
          <button onClick={getDraft}>AI Draft</button>
        </div>
      )}
      <h3>Responses</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {(ticket.responses||[]).map(r => (
          <li key={r.id} style={{ border: "1px solid #eee", padding: 8, marginBottom: 6, background: r.fromAdmin ? "#eef" : "#fef" }}>
            <strong>{r.authorName}</strong>: {r.body}
          </li>
        ))}
      </ul>
      <form onSubmit={sendReply} style={{ marginTop: 12 }}>
        <textarea value={reply} onChange={e=>setReply(e.target.value)} rows={4} style={{ width: "100%" }} placeholder="Write a response..." />
        <button type="submit">Send</button>
      </form>
      {isAdmin && (
        <div style={{ marginTop: 16 }}>
          <h3>Internal Notes</h3>
          <ul>{(ticket.internalNotes||[]).map(n => <li key={n.id}>{n.body}</li>)}</ul>
          <form onSubmit={addNote}>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Internal note" style={{ width: "70%" }} />
            <button type="submit">Add Note</button>
          </form>
        </div>
      )}
    </div>
  );
}

function AdminQueue() {
  const [tickets, setTickets] = useState([]);
  const [filters, setFilters] = useState({ status: "", category: "", priority: "" });
  const load = () => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v])=>v))).toString();
    api("/tickets"+(q.toString()?"?"+q.toString():"")).then(d => setTickets(d.tickets)).catch(console.error);
  };
  useEffect(() => { load(); }, [filters]);
  useEffect(() => {
    const token = getToken();
    const ws = new WebSocket("ws://localhost:4000/ws?token="+token);
    ws.onmessage = (ev) => { try { const m=JSON.parse(ev.data); if (m.type.startsWith("ticket.")) load(); } catch {} };
    return () => ws.close();
  }, []);
  return (
    <div style={{ padding: 20 }}>
      <h2>Ticket Queue</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}>
          <option value="">All statuses</option>
          {["OPEN","IN_PROGRESS","RESOLVED","CLOSED"].map(s=><option key={s}>{s}</option>)}
        </select>
        <select value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})}>
          <option value="">All categories</option>
          {["Royalty & Payments","ISBN & Metadata Issues","Printing & Quality","Distribution & Availability","Book Status & Production Updates","General Inquiry"].map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={filters.priority} onChange={e=>setFilters({...filters,priority:e.target.value})}>
          <option value="">All priorities</option>
          {["CRITICAL","HIGH","MEDIUM","LOW"].map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {tickets.map(t => (
          <li key={t.id} style={{ border: "1px solid #ddd", padding: 12, marginBottom: 8, borderRadius: 8 }}>
            <Link to={`/tickets/${t.id}`}><strong>{t.subject}</strong></Link>
            <div>{t.author?.name} | {t.book?.title || "General"}</div>
            <div>Status: {t.status} | Priority: {t.priority} | Category: {t.category || t.aiCategory}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return <Navigate to={user.role === "ADMIN" ? "/admin/queue" : "/books"} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/books" element={<Protected role="AUTHOR"><AuthorBooks/></Protected>} />
        <Route path="/tickets" element={<Protected role="AUTHOR"><AuthorTickets/></Protected>} />
        <Route path="/tickets/:id" element={<Protected><TicketDetail/></Protected>} />
        <Route path="/new-ticket" element={<Protected role="AUTHOR"><NewTicket/></Protected>} />
        <Route path="/admin/queue" element={<Protected role="ADMIN"><AdminQueue/></Protected>} />
      </Routes>
    </AuthProvider>
  );
}
