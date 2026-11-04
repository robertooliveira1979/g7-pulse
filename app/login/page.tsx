"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Provider = "google" | "azure" | "apple" | "facebook" | "linkedin_oidc";
const PROVEDORES: [Provider, string][] = [
  ["google", "Google"], ["azure", "Microsoft"], ["apple", "Apple"], ["facebook", "Facebook"], ["linkedin_oidc", "LinkedIn"],
];

const LOGOS: Record<Provider, React.ReactNode> = {
  google: <svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.8 2.4 2.6 6.7 2.6 12s4.2 9.6 9.4 9.6c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6z" /></svg>,
  azure: <svg viewBox="0 0 24 24"><path fill="#F25022" d="M3 3h8.5v8.5H3z" /><path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" /><path fill="#00A4EF" d="M3 12.5h8.5V21H3z" /><path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" /></svg>,
  apple: <svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8c-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.2.8 1.1 1.7 2.3 2.9 2.3 1.2-.1 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-.9-2.5-3.6zM14.1 5.6c.6-.8 1.1-1.8 1-2.9-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.7-1.3z" /></svg>,
  facebook: <svg viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" /></svg>,
  linkedin_oidc: <svg viewBox="0 0 24 24"><path fill="#0A66C2" d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5V9h3zM6.5 7.7a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 0 3.5zM19 19h-3v-4.9c0-1.2 0-2.7-1.6-2.7s-1.9 1.3-1.9 2.6v5h-3V9h2.9v1.4c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.7 2 3.7 4.7z" /></svg>,
};

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
    <div className="login">
      <div className="login-brand">
        <div className="logo" style={{ padding: 0 }}><img src="/icon.svg" width={40} height={40} alt="" />G7 <span>Pulse</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="claim">O pulso financeiro da sua <span>empresa de serviço</span>.</div>
          <p>Contas a pagar e receber, DRE gerencial, notas fiscais e cobrança recorrente em um só lugar. Para empresas e para quem faz BPO financeiro de várias delas.</p>
        </div>
        <svg className="pulse" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 80 H170 L185 68 L200 80 H240 L252 92 L268 14 L284 104 L296 80 H330 L350 66 L370 80 H600" fill="none" stroke="#F5B83D" strokeWidth="3" strokeLinejoin="round" opacity=".75" />
        </svg>
      </div>
      <div className="login-form">
        <form onSubmit={enviar} className="login-card">
          <div><h2 style={{ fontSize: 24 }}>{modo === "entrar" ? "Entrar" : "Criar conta"}</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>{modo === "entrar" ? "Acesse com sua conta ou com e-mail e senha." : "Depois de confirmar o e-mail, você já entra na sua empresa."}</p></div>
          <div className="socials">
            {PROVEDORES.map(([p, n]) => (
              <button key={p} type="button" className="social" onClick={() => social(p)}>{LOGOS[p]}<span>{n}</span></button>
            ))}
          </div>
          <div className="or">ou com e-mail</div>
          {modo === "criar" && (
            <div className="field"><label htmlFor="nome">Nome</label><input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
          )}
          <div className="field"><label htmlFor="email">E-mail</label><input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></div>
          <div className="field"><label htmlFor="senha">Senha</label><input id="senha" className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoComplete={modo === "entrar" ? "current-password" : "new-password"} /></div>
          {modo === "criar" && (
            <label className="check"><input type="checkbox" checked={bpo} onChange={(e) => setBpo(e.target.checked)} /> Faço BPO financeiro para várias empresas</label>
          )}
          {msg && <div className={msg.t === "err" ? "err" : "pos"}>{msg.m}</div>}
          <button className="btn p" disabled={carregando} style={{ justifyContent: "center", padding: 11 }}>{modo === "entrar" ? "Entrar" : "Criar conta"}</button>
          {modo === "entrar" && <button type="button" className="btn" style={{ justifyContent: "center" }} onClick={linkMagico}>Receber link de acesso por e-mail</button>}
          <button type="button" className="link" style={{ alignSelf: "center" }} onClick={() => { setModo(modo === "entrar" ? "criar" : "entrar"); setMsg(null); }}>
            {modo === "entrar" ? "Ainda não tem conta? Criar conta" : "Já tenho conta"}
          </button>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Acesso protegido e registro de cada ação por usuário.</p>
        </form>
      </div>
    </div>
  );
}
