"use client";
import Icone from "./Icone";

export default function Tema() {
  function alternar() {
    const r = document.documentElement;
    const novo = r.dataset.theme === "light" ? "dark" : "light";
    r.dataset.theme = novo;
    try { localStorage.setItem("g7-tema", novo); } catch {}
  }
  return <button className="iconbtn" onClick={alternar} aria-label="Alternar tema claro/escuro" title="Tema claro/escuro"><Icone n="moon" /></button>;
}
