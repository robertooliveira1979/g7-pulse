// TEMPORÁRIO: diagnóstico da integração com a Sefin Nacional (somente produção restrita, sem gravar nada).
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { abrirPfx, emitirDPS, sefin } from "@/lib/nfse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chave = process.env.NFSE_CHAVE_SERVICO || "";
  const token = crypto.createHash("sha256").update(chave + ":diag").digest("hex").slice(0, 32);
  if (!chave || u.searchParams.get("t") !== token) return new Response("não encontrado", { status: 404 });
  const empresa = process.env.G7_EMPRESA_MODELO!;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("obter_certificado_nfse", { p_empresa: empresa, p_chave: chave });
  if (error || !data?.[0]?.pfx_base64) return Response.json({ etapa: "cofre", erro: error?.message || "sem certificado" });
  let cred;
  try { cred = abrirPfx(data[0].pfx_base64, data[0].senha); } catch (e) { return Response.json({ etapa: "pfx", erro: String((e as Error).message) }); }
  try {
    if (u.searchParams.get("acao") === "emitir") {
      const r = await emitirDPS({
        ambiente: "producao_restrita", serie: "900", numero: Math.floor(Date.now() / 1000) - 1_790_000_000, competencia: new Date().toISOString().slice(0, 10),
        municipioIbge: "4314902",
        prestador: { cnpj: "42283257000148", opSimpNac: 3, regApTribSN: 1 },
        tomador: { doc: "36448480000103", nome: "MARVEE TECNOLOGIA E FRANCHISING LTDA", email: "financeiro@marvee.com.br" },
        servico: { cTribNac: "170601", descricao: "Teste de integração G7 Pulse - sem valor fiscal", cNBS: "114061900" },
        valor: 1,
      }, cred);
      return Response.json({ etapa: "emissao", ...r, xml: r.ok ? r.xml.slice(0, 3000) : undefined });
    }
    const r = await sefin("producao_restrita", "GET", "/nfse/" + "0".repeat(50), cred);
    return Response.json({ etapa: "tls", status: r.status, resposta: r.texto.slice(0, 800) });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    return Response.json({ etapa: "rede", erro: err.message, codigo: err.code });
  }
}
