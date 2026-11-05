import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Webhook do Asaas: o token configurado no painel do Asaas chega no cabeçalho asaas-access-token */
export async function POST(req: Request) {
  const token = req.headers.get("asaas-access-token") || "";
  let evento: unknown;
  try { evento = await req.json(); } catch { return new Response("corpo inválido", { status: 400 }); }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("asaas_webhook", { p_token: token, p_evento: evento });
  if (error) {
    if (/token/i.test(error.message)) return new Response("não autorizado", { status: 401 });
    console.error("webhook asaas", error.message);
    return new Response("erro ao processar", { status: 500 });
  }
  return Response.json({ recebido: data });
}
