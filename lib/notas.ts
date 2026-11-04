import type { supabaseServer } from "@/lib/supabase/server";
type SupabaseClient = Awaited<ReturnType<typeof supabaseServer>>;
import { abrirPfx, baixarDanfse, type Ambiente, type Credencial } from "@/lib/nfse";

/** Certificado A1 da empresa, lido do cofre pelo servidor */
export async function credencial(sb: SupabaseClient, empresaId: string): Promise<Credencial> {
  const { data, error } = await sb.rpc("obter_certificado_nfse", { p_empresa: empresaId, p_chave: process.env.NFSE_CHAVE_SERVICO || "" });
  if (error || !data?.[0]?.pfx_base64) throw new Error("Não consegui ler o certificado no cofre: " + (error?.message || "vazio"));
  return abrirPfx(data[0].pfx_base64, data[0].senha);
}

const caminho = (empresaId: string, chave: string, ext: "pdf" | "xml") => `${empresaId}/${chave}.${ext}`;

/** Grava o XML autorizado (se houver) e busca o PDF oficial no ADN. Devolve o PDF ou null. */
export async function guardarArquivos(sb: SupabaseClient, nota: { id: string; empresa_id: string; chave_acesso: string; ambiente: string }, xml?: string, cred?: Credencial) {
  const upd: Record<string, string> = {};
  if (xml) {
    const p = caminho(nota.empresa_id, nota.chave_acesso, "xml");
    const { error } = await sb.storage.from("notas").upload(p, Buffer.from(xml, "utf8"), { contentType: "application/xml", upsert: true });
    if (!error) upd.xml_path = p;
  }
  let pdf: Buffer | null = null;
  try {
    pdf = await baixarDanfse(nota.ambiente as Ambiente, nota.chave_acesso, cred || (await credencial(sb, nota.empresa_id)));
    const p = caminho(nota.empresa_id, nota.chave_acesso, "pdf");
    const { error } = await sb.storage.from("notas").upload(p, pdf, { contentType: "application/pdf", upsert: true });
    if (!error) upd.pdf_path = p;
  } catch { /* o PDF pode ser buscado depois */ }
  if (Object.keys(upd).length) await sb.from("notas_fiscais").update(upd).eq("id", nota.id);
  return pdf;
}

export type NotaArquivos = { id: string; empresa_id: string; chave_acesso: string | null; ambiente: string; pdf_path: string | null; xml_path: string | null; numero: string };

/** PDF da nota: do Storage, ou baixado do ADN na hora (e guardado) */
export async function obterPdf(sb: SupabaseClient, n: NotaArquivos): Promise<Buffer> {
  if (n.pdf_path) {
    const { data } = await sb.storage.from("notas").download(n.pdf_path);
    if (data) return Buffer.from(await data.arrayBuffer());
  }
  if (!n.chave_acesso) throw new Error("Esta nota não tem chave de acesso para buscar o PDF.");
  const pdf = await guardarArquivos(sb, { id: n.id, empresa_id: n.empresa_id, chave_acesso: n.chave_acesso, ambiente: n.ambiente });
  if (!pdf) throw new Error("O PDF ainda não está disponível no Ambiente Nacional. Tente de novo em alguns minutos.");
  return pdf;
}

export async function obterXml(sb: SupabaseClient, n: NotaArquivos): Promise<Buffer | null> {
  if (!n.xml_path) return null;
  const { data } = await sb.storage.from("notas").download(n.xml_path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

/** Envio por e-mail via Resend (https://resend.com) */
export async function enviarEmail(p: { para: string[]; responderPara?: string; remetenteNome: string; assunto: string; html: string; anexos: { nome: string; conteudo: Buffer }[] }) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) throw new Error("O envio de e-mail ainda não foi configurado (falta a chave do Resend).");
  const de = process.env.EMAIL_REMETENTE || "notas@g7pulse.com.br";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${p.remetenteNome.replace(/[<>"]/g, "")} <${de}>`, to: p.para, reply_to: p.responderPara || undefined,
      subject: p.assunto, html: p.html, attachments: p.anexos.map((a) => ({ filename: a.nome, content: a.conteudo.toString("base64") })),
    }),
  });
  if (!r.ok) throw new Error("O provedor de e-mail recusou o envio: " + (await r.text()).slice(0, 300));
}
