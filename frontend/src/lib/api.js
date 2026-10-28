const BASE = (import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE.replace(/\/$/, "") : "/api";
export function getToken(){ return localStorage.getItem("token"); }
export function setToken(t){ localStorage.setItem("token", t); }
export function clearToken(){ localStorage.removeItem("token"); }
export async function api(path, options={}){
  const token = getToken();
  // path now includes leading "/" so concatenation is safe
  const url = (BASE || "") + path;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type":"application/json", ...(token?{Authorization:"Bearer "+token}:{}), ...(options.headers||{}) },
  });
  if (!res.ok) { const e = await res.json().catch(()=>({error:res.statusText})); throw new Error(e.error||"Request failed"); }
  return res.json();
}
