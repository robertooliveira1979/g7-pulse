// TEMPORÁRIO: testa a chave do Asaas e cadastra o webhook do G7 Pulse na conta (removido após o uso).
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { EMPRESA_ASAAS } from "@/lib/asaas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = { sandbox: "https://api-sandbox.asaas.com/v3", producao: "https://api.asaas.com/v3" } as const;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chave = process.env.NFSE_CHAVE_SERVICO || "";
  const token = crypto.createHash("sha256").update(chave + ":asaas").digest("hex").slice(0, 32);
  if (!chave || u.searchParams.get("t") !== token) return new Response("não encontrado", { status: 404 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("obter_asaas_config", { p_empresa: EMPRESA_ASAAS, p_chave: chave });
  if (error || !data?.[0]?.api_key) return Response.json({ etapa: "cofre", erro: error?.message || "sem chave" });
  const amb = data[0].ambiente === "producao" ? "producao" : "sandbox";
  const { data: wt } = await sb.rpc("asaas_webhook_token_servico", { p_empresa: EMPRESA_ASAAS, p_chave: chave });
  const call = async (m: string, p: string, body?: unknown) => {
    const r = await fetch(BASE[amb] + p, { method: m, headers: { access_token: data[0].api_key, "Content-Type": "application/json", "User-Agent": "G7Pulse/1.0" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { j = t.slice(0, 300); }
    return { status: r.status, j };
  };
  const conta = await call("GET", "/myAccount");
  if (conta.status !== 200) return Response.json({ etapa: "conexao", ambiente: amb, status: conta.status, resposta: conta.j });
  const url = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.g7pulse.com.br") + "/api/asaas/webhook";
  const lista = await call("GET", "/webhooks?limit=50");
  const existente = (lista.j?.data || []).find((w: any) => w.url === url);
  const corpo = {
    name: "G7 Pulse", url, email: conta.j.email, enabled: true, interrupted: false, apiVersion: 3, authToken: wt, sendType: "SEQUENTIALLY",
    events: ["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_RESTORED", "PAYMENT_REFUNDED",
      "SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED", "SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"],
  };
  const wh = existente ? await call("PUT", `/webhooks/${existente.id}`, corpo) : await call("POST", "/webhooks", corpo);
  return Response.json({ etapa: "ok", ambiente: amb, conta: { nome: conta.j.name, cpfCnpj: conta.j.cpfCnpj }, webhook: { status: wh.status, id: wh.j?.id, enabled: wh.j?.enabled, erros: wh.j?.errors } });
}
