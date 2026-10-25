import React, { useState, useEffect, useContext, createContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api, getToken, setToken, clearToken } from "./lib/api.js";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import MyBooks from "./pages/MyBooks.jsx";
import MyTickets from "./pages/MyTickets.jsx";
import NewTicket from "./pages/NewTicket.jsx";
import TicketDetail from "./pages/TicketDetail.jsx";
import AdminQueue from "./pages/AdminQueue.jsx";
import { Spinner } from "./components/ui.jsx";

const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

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

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "ADMIN" ? "/admin/queue" : "/books"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/books" element={<Protected role="AUTHOR"><MyBooks /></Protected>} />
        <Route path="/tickets" element={<Protected role="AUTHOR"><MyTickets /></Protected>} />
        <Route path="/new-ticket" element={<Protected role="AUTHOR"><NewTicket /></Protected>} />
        <Route path="/tickets/:id" element={<Protected><TicketDetail /></Protected>} />
        <Route path="/admin/queue" element={<Protected role="ADMIN"><AdminQueue /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
