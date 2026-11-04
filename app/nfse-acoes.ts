"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/empresa";
import { hojeSP } from "@/lib/format";
import { emitirDPS, type Ambiente } from "@/lib/nfse";
import { credencial, guardarArquivos, obterPdf, obterXml, enviarEmail, type NotaArquivos } from "@/lib/notas";
import { brl, dataBR } from "@/lib/format";

export async function emitirNfse(f: FormData) {
  const id = String(f.get("titulo_id") || "");
  const volta = (q: string): never => redirect(`/titulos/${id}?${q}`);
  const { sb, empresaId, podeEditar } = await contexto();
  if (!podeEditar) volta("erro=" + encodeURIComponent("Seu perfil não pode emitir notas."));

  const [{ data: t }, { data: cfg }, { data: empresa }] = await Promise.all([
    sb.from("titulos").select("*, pessoas(cnpj_cpf, razao_social, email)").eq("id", id).eq("empresa_id", empresaId).single(),
    sb.from("integracoes").select("*").eq("empresa_id", empresaId).maybeSingle(),
    sb.from("empresas").select("cnpj, municipio_ibge, regime_tributario").eq("id", empresaId).single(),
  ]);
  if (!t || t.tipo !== "receber") volta("erro=" + encodeURIComponent("Nota só pode ser emitida para uma conta a receber."));
  const pessoa = (t as any).pessoas;
  if (!pessoa?.cnpj_cpf || pessoa.cnpj_cpf.replace(/\D/g, "").length < 11) volta("erro=" + encodeURIComponent("O cliente precisa ter CNPJ ou CPF cadastrado."));
  if (!cfg?.nfse_certificado_secret) volta("erro=" + encodeURIComponent("Envie o certificado A1 em Integrações antes de emitir."));
  if (!cfg?.nfse_codigo_tributacao_padrao) volta("erro=" + encodeURIComponent("Informe o código de tributação nacional em Integrações."));
  const e = empresa as any;
  if (!e?.cnpj || !e?.municipio_ibge) volta("erro=" + encodeURIComponent("Cadastro da empresa sem CNPJ ou código IBGE do município."));

  const ambiente = (cfg!.nfse_ambiente === "producao" ? "producao" : "producao_restrita") as Ambiente;
  let cred;
  try { cred = await credencial(sb, empresaId); } catch (x) { volta("erro=" + encodeURIComponent((x as Error).message)); }

  const { data: dps, error: eDps } = await sb.rpc("reservar_dps_nfse", { p_empresa: empresaId, p_ambiente: ambiente });
  if (eDps || !dps?.[0]) volta("erro=" + encodeURIComponent("Não consegui reservar o número da DPS: " + (eDps?.message || "")));
  const { serie, numero } = dps![0] as { serie: string; numero: number };

  const valor = Number(t!.valor_original) - Number(t!.desconto || 0) + Number(t!.acrescimo || 0);
  const regime = String(e.regime_tributario || "");
  let r;
  try {
    r = await emitirDPS({
      ambiente, serie, numero: Number(numero), competencia: String(t!.data_emissao || hojeSP()), municipioIbge: e.municipio_ibge,
      prestador: { cnpj: e.cnpj, opSimpNac: regime === "MEI" ? 2 : regime === "Simples Nacional" ? 3 : 1, regApTribSN: 1 },
      tomador: { doc: pessoa.cnpj_cpf, nome: pessoa.razao_social, email: pessoa.email },
      servico: { cTribNac: cfg!.nfse_codigo_tributacao_padrao, descricao: t!.descricao || cfg!.nfse_descricao_padrao || "Prestação de serviços", cNBS: cfg!.nfse_cnbs_padrao },
      valor, aliquota: cfg!.nfse_aliquota_iss_padrao ? Number(cfg!.nfse_aliquota_iss_padrao) : null,
    }, cred!);
  } catch (x) {
    volta("erro=" + encodeURIComponent("Falha de comunicação com a Sefin Nacional: " + (x as Error).message));
  }

  const serieGravada = ambiente === "producao" ? serie : "R" + serie;
  const base = {
    empresa_id: empresaId, titulo_id: id, pessoa_id: t!.pessoa_id, serie: serieGravada, data_emissao: hojeSP(), valor,
    origem: "portal_nacional", codigo_tributacao_nacional: cfg!.nfse_codigo_tributacao_padrao,
    aliquota_iss: cfg!.nfse_aliquota_iss_padrao, ambiente, dps_id: r!.idDps,
  };
  const res = r!;
  if (res.ok) {
    const { data: nota } = await sb.from("notas_fiscais").insert({ ...base, numero: res.numero || String(numero), status: "autorizada", chave_acesso: res.chave }).select("id").single();
    let pdfOk = false;
    if (nota) pdfOk = !!(await guardarArquivos(sb, { id: nota.id, empresa_id: empresaId, chave_acesso: res.chave, ambiente }, res.xml, cred!));
    revalidatePath(`/titulos/${id}`);
    return volta("ok=" + encodeURIComponent(`NFS-e nº ${res.numero} autorizada${ambiente === "producao" ? "" : " (ambiente de teste, sem valor fiscal)"}.${pdfOk ? "" : " O PDF ainda está sendo gerado pela Receita; ele é buscado automaticamente ao abrir ou enviar."}`));
  }
  await sb.from("notas_fiscais").insert({ ...base, numero: `DPS ${numero}`, status: "rejeitada", erros: res.erros });
  revalidatePath(`/titulos/${id}`);
  volta("erro=" + encodeURIComponent("Sefin recusou: " + res.erros.map((x) => `${x.codigo} ${x.descricao}${x.complemento ? " (" + x.complemento + ")" : ""}`).join(" · ")));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Envia o PDF (e o XML) da nota por e-mail ao cliente */
export async function enviarNotaEmail(f: FormData) {
  const notaId = String(f.get("nota_id") || "");
  const tituloId = String(f.get("titulo_id") || "");
  const volta = (q: string): never => redirect(`/titulos/${tituloId}?${q}`);
  const { sb, empresaId, podeEditar, user, perfil } = await contexto();
  if (!podeEditar) volta("erro=" + encodeURIComponent("Seu perfil não pode enviar notas."));
  const para = String(f.get("para") || "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!para.length || para.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) volta("erro=" + encodeURIComponent("Informe e-mail(s) válido(s), separados por vírgula."));
  if (para.length > 5) volta("erro=" + encodeURIComponent("No máximo 5 destinatários por envio."));
  const mensagem = String(f.get("mensagem") || "").slice(0, 2000);

  const [{ data: n }, { data: emp }] = await Promise.all([
    sb.from("notas_fiscais").select("id,empresa_id,chave_acesso,ambiente,pdf_path,xml_path,numero,valor,data_emissao,status,pessoas(razao_social,nome_fantasia)").eq("id", notaId).eq("empresa_id", empresaId).single(),
    sb.from("empresas").select("razao_social,nome_fantasia,cnpj").eq("id", empresaId).single(),
  ]);
  if (!n || n.status !== "autorizada") volta("erro=" + encodeURIComponent("Só é possível enviar notas autorizadas."));
  let pdf: Buffer | undefined; let xml: Buffer | null = null;
  try { pdf = await obterPdf(sb, n as unknown as NotaArquivos); xml = await obterXml(sb, n as unknown as NotaArquivos); }
  catch (x) { volta("erro=" + encodeURIComponent((x as Error).message)); }

  const nomeEmp = emp?.nome_fantasia || emp?.razao_social || "G7 Pulse";
  const cliente = (n as any).pessoas?.nome_fantasia || (n as any).pessoas?.razao_social || "";
  const teste = n!.ambiente === "producao_restrita";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1d2a30;line-height:1.5">
    <p>Olá${cliente ? ", " + esc(cliente) : ""}!</p>
    ${mensagem ? `<p>${esc(mensagem).replace(/\n/g, "<br>")}</p>` : `<p>Segue em anexo a nota fiscal de serviço referente aos nossos serviços.</p>`}
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#5b6b72">NFS-e</td><td><b>nº ${esc(n!.numero)}</b>${teste ? " (teste, sem valor fiscal)" : ""}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5b6b72">Emissão</td><td>${dataBR(n!.data_emissao)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5b6b72">Valor</td><td>${brl(Number(n!.valor || 0))}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5b6b72">Chave</td><td style="font-family:monospace;font-size:12px">${esc(n!.chave_acesso || "")}</td></tr>
    </table>
    <p style="color:#5b6b72;font-size:12px">A autenticidade pode ser consultada em nfse.gov.br. Responda este e-mail para falar com ${esc(nomeEmp)}.</p>
  </div>`;
  try {
    await enviarEmail({
      para, responderPara: (perfil as any)?.email || user.email, remetenteNome: nomeEmp,
      assunto: `${teste ? "[TESTE] " : ""}NFS-e nº ${n!.numero} - ${nomeEmp}`, html,
      anexos: [{ nome: `NFS-e-${n!.numero}.pdf`, conteudo: pdf! }, ...(xml ? [{ nome: `NFS-e-${n!.numero}.xml`, conteudo: xml }] : [])],
    });
  } catch (x) { volta("erro=" + encodeURIComponent((x as Error).message)); }
  await sb.from("notas_fiscais").update({ email_enviado_em: new Date().toISOString(), email_enviado_para: para.join(", ") }).eq("id", notaId);
  revalidatePath(`/titulos/${tituloId}`);
  volta("ok=" + encodeURIComponent(`Nota enviada para ${para.join(", ")}.`));
}
