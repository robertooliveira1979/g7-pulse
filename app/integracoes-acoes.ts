"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/empresa";
import { lerCertificado } from "@/lib/certificado";

const volta = (q: string): never => redirect("/integracoes?" + q);

export async function enviarCertificado(f: FormData) {
  const { sb, empresaId, papel } = await contexto();
  if (!["administrador", "operador_bpo"].includes(papel)) volta("erro=" + encodeURIComponent("Apenas administrador ou operador BPO pode enviar o certificado."));
  const arq = f.get("certificado") as File | null;
  const senha = String(f.get("senha") || "");
  if (!arq || !arq.size) volta("erro=" + encodeURIComponent("Selecione o arquivo .pfx do certificado."));
  if (arq!.size > 200 * 1024) volta("erro=" + encodeURIComponent("Arquivo grande demais para um certificado A1."));
  if (!senha) volta("erro=" + encodeURIComponent("Digite a senha do certificado."));
  const buf = Buffer.from(await arq!.arrayBuffer());
  let info;
  try { info = lerCertificado(buf, senha); } catch (e) { volta("erro=" + encodeURIComponent((e as Error).message)); }
  const { error } = await sb.rpc("salvar_certificado_nfse", {
    p_empresa: empresaId, p_pfx_base64: buf.toString("base64"), p_senha: senha,
    p_titular: info!.titular, p_cnpj: info!.cnpj, p_validade: info!.validade,
  });
  if (error) volta("erro=" + encodeURIComponent(error.message));
  revalidatePath("/integracoes");
  volta("ok=" + encodeURIComponent(`Certificado de ${info!.titular} guardado no cofre. Válido até ${info!.validade.split("-").reverse().join("/")}.`));
}

export async function salvarConfigNfse(f: FormData) {
  const { sb, empresaId } = await contexto();
  const aliq = String(f.get("aliquota") || "").replace(",", ".").trim();
  const { error } = await sb.from("integracoes").upsert({
    empresa_id: empresaId,
    nfse_ambiente: String(f.get("ambiente")) === "producao" ? "producao" : "producao_restrita",
    nfse_codigo_tributacao_padrao: String(f.get("codigo") || "").trim() || null,
    nfse_aliquota_iss_padrao: aliq ? Number(aliq) : null,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "empresa_id" });
  if (error) volta("erro=" + encodeURIComponent(error.message));
  revalidatePath("/integracoes");
  volta("ok=" + encodeURIComponent("Configuração da NFS-e salva."));
}
