import React from "react";

export const STATUS = {
  OPEN: { label: "Open", cls: "b-open" },
  IN_PROGRESS: { label: "In Progress", cls: "b-progress" },
  RESOLVED: { label: "Resolved", cls: "b-resolved" },
  CLOSED: { label: "Closed", cls: "b-closed" },
};
export const PRIORITY = {
  CRITICAL: { label: "Critical", cls: "b-critical", rank: 0 },
  HIGH: { label: "High", cls: "b-high", rank: 1 },
  MEDIUM: { label: "Medium", cls: "b-medium", rank: 2 },
  LOW: { label: "Low", cls: "b-low", rank: 3 },
};

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status || "—", cls: "b-closed" };
  return <span className={"badge " + s.cls}>{s.label}</span>;
}
export function PriorityBadge({ priority }) {
  const p = PRIORITY[priority] || { label: priority || "—", cls: "b-low" };
  return <span className={"badge " + p.cls}>{p.label}</span>;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}

export function Spinner() { return <div className="spinner" role="status" aria-label="Loading" />; }

export function Empty({ children }) { return <div className="state">{children}</div>; }

export function Alert({ kind = "err", children }) {
  if (!children) return null;
  return <div className={"alert " + kind} role={kind === "err" ? "alert" : "status"}>{children}</div>;
}
