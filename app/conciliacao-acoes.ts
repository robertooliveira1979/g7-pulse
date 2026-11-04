"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/empresa";
import { decodificar, lerOFX } from "@/lib/ofx";

const volta = (q: string): never => redirect("/conciliacao" + (q ? "?" + q : ""));

export async function importarOFX(f: FormData) {
  const { sb, empresaId, user, podeEditar } = await contexto();
  if (!podeEditar) volta("erro=" + encodeURIComponent("Seu papel nesta empresa não permite importar extratos."));
  const arq = f.get("arquivo") as File | null;
  const conta = String(f.get("conta_id") || "");
  if (!arq || !arq.size) volta("erro=" + encodeURIComponent("Selecione um arquivo .ofx."));
  if (arq!.size > 5 * 1024 * 1024) volta("erro=" + encodeURIComponent("Arquivo acima de 5 MB."));
  const ext = lerOFX(decodificar(await arq!.arrayBuffer()));
  if (!ext.transacoes.length) volta("erro=" + encodeURIComponent("Não encontrei lançamentos nesse arquivo. Confira se é um extrato OFX."));
  const { data: imp, error: e1 } = await sb.from("extrato_importacoes").insert({
    empresa_id: empresaId, conta_id: conta, arquivo: arq!.name, banco: ext.banco, agencia_conta: ext.conta,
    periodo_ini: ext.inicio, periodo_fim: ext.fim, saldo_final: isFinite(ext.saldo ?? NaN) ? ext.saldo : null, data_saldo: ext.dataSaldo,
    qtd_lidas: ext.transacoes.length, criado_por: user.id,
  }).select("id").single();
  if (e1) volta("erro=" + encodeURIComponent(e1.message));
  const linhas = ext.transacoes.map((t) => ({ empresa_id: empresaId, conta_id: conta, importacao_id: imp!.id, fitid: t.fitid, data: t.data, valor: t.valor, descricao: t.descricao, tipo_ofx: t.tipo }));
  const { data: novas, error: e2 } = await sb.from("extrato_transacoes").upsert(linhas, { onConflict: "conta_id,fitid", ignoreDuplicates: true }).select("id");
  if (e2) volta("erro=" + encodeURIComponent(e2.message));
  await sb.from("extrato_importacoes").update({ qtd_novas: novas?.length || 0 }).eq("id", imp!.id);
  revalidatePath("/conciliacao");
  volta(`ok=${encodeURIComponent(`${ext.transacoes.length} lançamentos lidos, ${novas?.length || 0} novos para conciliar.`)}`);
}

async function marcar(sb: Awaited<ReturnType<typeof contexto>>["sb"], id: string, userId: string, dados: Record<string, unknown>) {
  return sb.from("extrato_transacoes").update({ ...dados, conciliado_por: userId, conciliado_em: new Date().toISOString() }).eq("id", id);
}

export async function conciliar(f: FormData) {
  const { sb, empresaId, user } = await contexto();
  const id = String(f.get("id"));
  const acao = String(f.get("acao"));
  const { data: t } = await sb.from("extrato_transacoes").select("*").eq("id", id).eq("empresa_id", empresaId).single();
  if (!t) volta("erro=Lançamento não encontrado");
  const valor = Math.abs(Number(t!.valor));
  const tipo = Number(t!.valor) > 0 ? "receber" : "pagar";

  if (acao === "ignorar") { await marcar(sb, id, user.id, { status: "ignorado" }); }
  else if (acao === "reabrir") { await sb.from("extrato_transacoes").update({ status: "pendente", titulo_id: null, baixa_id: null, conciliado_por: null, conciliado_em: null }).eq("id", id); }
  else if (acao === "vincular_baixa") {
    const baixa = String(f.get("baixa_id"));
    const { data: b } = await sb.from("baixas").select("titulo_id").eq("id", baixa).single();
    await marcar(sb, id, user.id, { status: "conciliado", baixa_id: baixa, titulo_id: b?.titulo_id });
  } else if (acao === "baixar") {
    const titulo = String(f.get("titulo_id") || "");
    if (!titulo) volta("erro=" + encodeURIComponent("Escolha o título a baixar."));
    const { data: b, error } = await sb.from("baixas").insert({ empresa_id: empresaId, titulo_id: titulo, data: t!.data, valor, conta_id: t!.conta_id, origem: "conciliacao", referencia_externa: t!.fitid, criado_por: user.id }).select("id").single();
    if (error) volta("erro=" + encodeURIComponent(error.message));
    await marcar(sb, id, user.id, { status: "conciliado", titulo_id: titulo, baixa_id: b!.id });
  } else if (acao === "lancar") {
    const categoria = String(f.get("categoria_id") || "");
    if (!categoria) volta("erro=" + encodeURIComponent("Escolha a categoria para lançar."));
    const pessoa = String(f.get("pessoa_id") || "") || null;
    const { data: nt, error } = await sb.from("titulos").insert({
      empresa_id: empresaId, tipo, descricao: t!.descricao, categoria_id: categoria, pessoa_id: pessoa, conta_id: t!.conta_id,
      forma_cobranca: "conciliação OFX", data_emissao: t!.data, vencimento: t!.data, valor_original: valor, criado_por: user.id,
    }).select("id").single();
    if (error) volta("erro=" + encodeURIComponent(error.message));
    const { data: b, error: e2 } = await sb.from("baixas").insert({ empresa_id: empresaId, titulo_id: nt!.id, data: t!.data, valor, conta_id: t!.conta_id, origem: "conciliacao", referencia_externa: t!.fitid, criado_por: user.id }).select("id").single();
    if (e2) volta("erro=" + encodeURIComponent(e2.message));
    await marcar(sb, id, user.id, { status: "conciliado", titulo_id: nt!.id, baixa_id: b!.id });
  }
  revalidatePath("/conciliacao");
  volta(String(f.get("q") || ""));
}

export async function conciliarSugestoes(f: FormData) {
  const { sb, empresaId, user } = await contexto();
  const pares = String(f.get("pares") || "").split(",").filter(Boolean);
  let n = 0;
  for (const p of pares) {
    const [id, kind, ref] = p.split(":");
    const { data: t } = await sb.from("extrato_transacoes").select("*").eq("id", id).eq("empresa_id", empresaId).eq("status", "pendente").single();
    if (!t) continue;
    if (kind === "b") {
      const { data: b } = await sb.from("baixas").select("titulo_id").eq("id", ref).single();
      await marcar(sb, id, user.id, { status: "conciliado", baixa_id: ref, titulo_id: b?.titulo_id }); n++;
    } else if (kind === "t") {
      const { data: b, error } = await sb.from("baixas").insert({ empresa_id: empresaId, titulo_id: ref, data: t.data, valor: Math.abs(Number(t.valor)), conta_id: t.conta_id, origem: "conciliacao", referencia_externa: t.fitid, criado_por: user.id }).select("id").single();
      if (!error) { await marcar(sb, id, user.id, { status: "conciliado", titulo_id: ref, baixa_id: b!.id }); n++; }
    }
  }
  revalidatePath("/conciliacao");
  volta("ok=" + encodeURIComponent(`${n} lançamentos conciliados.`));
}
