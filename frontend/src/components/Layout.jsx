import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../App.jsx";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isAuth = user?.role === "AUTHOR";
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">Book<span>Leaf</span></div>
        {isAuth ? (
          <>
            <NavLink to="/books" className={({ isActive }) => (isActive ? "active" : "")}>My Books</NavLink>
            <NavLink to="/tickets" className={({ isActive }) => (isActive ? "active" : "")}>My Tickets</NavLink>
            <NavLink to="/new-ticket" className={({ isActive }) => (isActive ? "active" : "")}>New Ticket</NavLink>
          </>
        ) : (
          <NavLink to="/admin/queue" className={({ isActive }) => (isActive ? "active" : "")}>Ticket Queue</NavLink>
        )}
        <div className="spacer" />
        <div className="who">{user?.email}<br />{isAuth ? "Author" : "Operations Admin"}</div>
        <button className="btn on-dark" onClick={() => { logout(); nav("/login"); }}>Sign out</button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
