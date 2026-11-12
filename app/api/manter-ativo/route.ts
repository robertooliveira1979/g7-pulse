import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chamado 1x por dia pelo cron da Vercel: uma consulta leve evita que o Supabase gratuito pause o banco por inatividade. */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.get("authorization") !== `Bearer ${segredo}`) return new Response("não autorizado", { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await sb.from("planos").select("id", { count: "exact", head: true });
  return Response.json({ ok: !error, em: new Date().toISOString() });
}
