"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Provider = "google" | "azure" | "apple" | "facebook" | "linkedin_oidc";
const PROVEDORES: [Provider, string][] = [
  ["google", "Google"], ["azure", "Microsoft"], ["apple", "Apple"], ["facebook", "Facebook"], ["linkedin_oidc", "LinkedIn"],
];

export default function Login() {
  const sb = supabaseBrowser();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [bpo, setBpo] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const callback = `${site}/auth/callback`;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true); setMsg(null);
    if (modo === "entrar") {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) setMsg({ t: "err", m: "E-mail ou senha incorretos." });
      else window.location.href = "/";
    } else {
      const { error } = await sb.auth.signUp({
        email, password: senha,
        options: { emailRedirectTo: callback, data: { full_name: nome, tipo: bpo ? "bpo" : "empresa" } },
      });
      setMsg(error ? { t: "err", m: error.message } : { t: "ok", m: "Conta criada. Confirme pelo link enviado ao seu e-mail." });
    }
    setCarregando(false);
  }
  async function linkMagico() {
    if (!email) return setMsg({ t: "err", m: "Informe o e-mail para receber o link." });
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: callback } });
    setMsg(error ? { t: "err", m: error.message } : { t: "ok", m: "Link de acesso enviado para " + email });
  }
  async function social(p: Provider) {
    const { error } = await sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: callback } });
    if (error) setMsg({ t: "err", m: `Login com ${p} ainda não está ativado.` });
  }

  return (
    <div style={{ minHeight: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
      <div style={{ background: "#0B1F2A", color: "#EAF1F2", padding: 48, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
        <div className="logo" style={{ padding: 0 }}><img src="/icon.svg" width={40} height={40} alt="" />G7 <span>Pulse</span></div>
        <h1 style={{ font: "800 40px/1.1 var(--f-display)", maxWidth: "14ch" }}>O pulso financeiro da sua <span style={{ color: "#F5B83D" }}>empresa de serviço</span>.</h1>
        <p style={{ color: "#9FB6BE", maxWidth: "44ch" }}>Contas a pagar e receber, DRE gerencial, notas fiscais e cobrança recorrente. Para empresas e para quem faz BPO financeiro de várias delas.</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <form onSubmit={enviar} style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ fontSize: 24 }}>{modo === "entrar" ? "Entrar" : "Criar conta"}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PROVEDORES.map(([p, n]) => (
              <button key={p} type="button" className="btn" style={{ justifyContent: "center" }} onClick={() => social(p)}>{n}</button>
            ))}
          </div>
          <div className="muted" style={{ textAlign: "center", fontSize: 12 }}>ou com e-mail</div>
          {modo === "criar" && (
            <div className="field"><label htmlFor="nome">Nome</label><input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
          )}
          <div className="field"><label htmlFor="email">E-mail</label><input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></div>
          <div className="field"><label htmlFor="senha">Senha</label><input id="senha" className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoComplete={modo === "entrar" ? "current-password" : "new-password"} /></div>
          {modo === "criar" && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={bpo} onChange={(e) => setBpo(e.target.checked)} /> Faço BPO financeiro para várias empresas</label>
          )}
          {msg && <div className={msg.t === "err" ? "err" : "pos"}>{msg.m}</div>}
          <button className="btn p" disabled={carregando} style={{ justifyContent: "center", padding: 11 }}>{modo === "entrar" ? "Entrar" : "Criar conta"}</button>
          {modo === "entrar" && <button type="button" className="btn" style={{ justifyContent: "center" }} onClick={linkMagico}>Receber link de acesso por e-mail</button>}
          <button type="button" className="btn" style={{ justifyContent: "center", border: 0, background: "none", color: "var(--data)" }} onClick={() => { setModo(modo === "entrar" ? "criar" : "entrar"); setMsg(null); }}>
            {modo === "entrar" ? "Ainda não tem conta? Criar conta" : "Já tenho conta"}
          </button>
        </form>
      </div>
    </div>
  );
}
