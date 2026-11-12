"use server";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/empresa";
import { lerXlsx, lerCsv, type Planilha } from "@/lib/planilha";
import { planejar, type Problema, type Plano } from "@/lib/importacao";
import { todos } from "@/lib/dados";

export type ResultadoImportacao = {
  ok: boolean; gravado: boolean; mensagem: string;
  erros: Problema[]; avisos: Problema[]; resumo?: Plano["resumo"];
};

export async function importarPlanilha(_: ResultadoImportacao | null, f: FormData): Promise<ResultadoImportacao> {
  const vazio = { erros: [], avisos: [] };
  const { sb, empresaId, podeEditar } = await contexto();
  if (!podeEditar) return { ok: false, gravado: false, mensagem: "Seu perfil não pode importar dados.", ...vazio };
  const arq = f.get("arquivo");
  if (!(arq instanceof File) || !arq.size) return { ok: false, gravado: false, mensagem: "Escolha o arquivo da planilha (.xlsx ou .csv).", ...vazio };
  if (arq.size > 10 * 1024 * 1024) return { ok: false, gravado: false, mensagem: "Arquivo maior que 10 MB. Divida em partes.", ...vazio };
  const gravar = f.get("modo") === "importar";

  let pl: Planilha;
  try {
    const buf = Buffer.from(await arq.arrayBuffer());
    if (/\.csv$/i.test(arq.name) || buf.subarray(0, 2).toString() !== "PK") {
      let texto = buf.toString("utf8");
      if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(buf); // CSV salvo pelo Excel em ANSI
      const linhas = lerCsv(texto);
      pl = new Map([[/venc/i.test(String(linhas[0] || "")) ? "Lançamentos" : "Clientes e fornecedores", linhas]]);
    } else pl = lerXlsx(buf);
  } catch (e) {
    return { ok: false, gravado: false, mensagem: "Não consegui ler o arquivo: " + (e as Error).message + " Salve como .xlsx ou .csv e tente de novo.", ...vazio };
  }

  try {
    const [pessoas, categorias, contas, centros, existentes] = await Promise.all([
      todos((de, ate) => sb.from("pessoas").select("id,cnpj_cpf,razao_social,nome_fantasia,e_cliente,e_fornecedor").eq("empresa_id", empresaId).range(de, ate)),
      todos((de, ate) => sb.from("categorias").select("id,codigo,nome,nivel").eq("empresa_id", empresaId).eq("ativa", true).range(de, ate)),
      todos((de, ate) => sb.from("contas_bancarias").select("id,nome").eq("empresa_id", empresaId).range(de, ate)),
      todos((de, ate) => sb.from("centros_custo").select("id,codigo,nome").eq("empresa_id", empresaId).range(de, ate)),
      todos((de, ate) => sb.from("titulos").select("tipo,pessoa_id,vencimento,valor_original,documento").eq("empresa_id", empresaId).range(de, ate), 200000),
    ]);
    const plano = planejar(pl, { pessoas, categorias, contas, centros, existentes }, { ignorarDuplicados: f.get("duplicados") !== "nao" }, () => crypto.randomUUID());
    const base = { erros: plano.erros.slice(0, 300), avisos: plano.avisos.slice(0, 300), resumo: plano.resumo };
    if (plano.erros.length) return { ok: false, gravado: false, mensagem: `Encontrei ${plano.erros.length} linha(s) com erro. Corrija na planilha e envie de novo — nada foi gravado.`, ...base };
    const total = plano.pessoas.length + plano.titulos.length + plano.flags.length;
    if (!total) return { ok: false, gravado: false, mensagem: "Nada novo para importar nesta planilha.", ...base };
    if (!gravar) return { ok: true, gravado: false, mensagem: "Planilha válida. Confira o resumo e clique em Importar para gravar.", ...base };

    const { error } = await sb.rpc("importar_lote", { p_empresa: empresaId, p: { centros: plano.centros, pessoas: plano.pessoas, flags: plano.flags, titulos: plano.titulos, baixas: plano.baixas } });
    if (error) return { ok: false, gravado: false, mensagem: "O banco recusou a importação (nada foi gravado): " + error.message, ...base };
    for (const r of ["/", "/receber", "/pagar", "/clientes", "/fornecedores", "/centros", "/contas", "/gerencial"]) revalidatePath(r);
    return { ok: true, gravado: true, mensagem: "Importação concluída.", ...base };
  } catch (e) {
    return { ok: false, gravado: false, mensagem: "Falha ao importar: " + (e as Error).message, ...vazio };
  }
}
