"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/empresa";
import { hojeSP } from "@/lib/format";
import { abrirPfx, emitirDPS, type Ambiente } from "@/lib/nfse";

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
  const { data: cert, error: eCert } = await sb.rpc("obter_certificado_nfse", { p_empresa: empresaId, p_chave: process.env.NFSE_CHAVE_SERVICO || "" });
  if (eCert || !cert?.[0]?.pfx_base64) volta("erro=" + encodeURIComponent("Não consegui ler o certificado no cofre: " + (eCert?.message || "vazio")));
  let cred;
  try { cred = abrirPfx(cert![0].pfx_base64, cert![0].senha); } catch (x) { volta("erro=" + encodeURIComponent("Certificado não abriu: " + (x as Error).message)); }

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
    await sb.from("notas_fiscais").insert({ ...base, numero: res.numero || String(numero), status: "autorizada", chave_acesso: res.chave });
    revalidatePath(`/titulos/${id}`);
    return volta("ok=" + encodeURIComponent(`NFS-e nº ${res.numero} autorizada${ambiente === "producao" ? "" : " (ambiente de teste, sem valor fiscal)"}.`));
  }
  await sb.from("notas_fiscais").insert({ ...base, numero: `DPS ${numero}`, status: "rejeitada", erros: res.erros });
  revalidatePath(`/titulos/${id}`);
  volta("erro=" + encodeURIComponent("Sefin recusou: " + res.erros.map((x) => `${x.codigo} ${x.descricao}${x.complemento ? " (" + x.complemento + ")" : ""}`).join(" · ")));
}
