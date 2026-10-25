const BASE = "http://localhost:4000";
export function getToken(){ return localStorage.getItem("token"); }
export function setToken(t){ localStorage.setItem("token", t); }
export function clearToken(){ localStorage.removeItem("token"); }
export async function api(path, options={}){
  const token = getToken();
  const res = await fetch(BASE+path, {
    ...options,
    headers: { "Content-Type":"application/json", ...(token?{Authorization:"Bearer "+token}:{}), ...(options.headers||{}) },
  });
  if (!res.ok) { const e = await res.json().catch(()=>({error:res.statusText})); throw new Error(e.error||"Request failed"); }
  return res.json();
}
