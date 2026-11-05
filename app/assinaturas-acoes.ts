"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { asaas, EMPRESA_ASAAS } from "@/lib/asaas";
import { hojeSP } from "@/lib/format";

const CAMINHO = "/assinaturas";
const volta = (q: string): never => redirect(`${CAMINHO}?${q}`);
const erro = (m: string): never => volta("erro=" + encodeURIComponent(m));
const num = (v: FormDataEntryValue | null) => Number(String(v || "").replace(/\./g, "").replace(",", "."));

/** Somente administradores do sistema */
async function admin() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: ok } = await sb.rpc("e_superadmin");
  if (!ok) redirect("/");
  return { sb, user };
}

export async function salvarConfigAsaas(f: FormData) {
  const { sb } = await admin();
  const chave = String(f.get("api_key") || "").trim();
  const { error } = await sb.rpc("salvar_asaas_config", { p_empresa: EMPRESA_ASAAS, p_ambiente: String(f.get("ambiente")), p_api_key: chave || null });
  if (error) erro(error.message);
  let msg = "";
  try {
    const a = await asaas(sb);
    await a.req("GET", "/customers?limit=1");
    const conta = await a.req("GET", "/myAccount/commercialInfo").catch(() => null);
    msg = `Conexão com o Asaas (${a.ambiente === "producao" ? "produção" : "sandbox"}) funcionando${conta?.name ? " · conta " + conta.name : ""}.`;
  } catch (e) { erro((e as Error).message); }
  revalidatePath(CAMINHO);
  volta("ok=" + encodeURIComponent(msg));
}

export async function salvarPlano(f: FormData) {
  const { sb } = await admin();
  const id = String(f.get("id") || "");
  const dados = { nome: String(f.get("nome") || "").trim(), descricao: String(f.get("descricao") || "").trim() || null, valor_mensal: num(f.get("valor")), ativo: f.get("ativo") !== "nao" };
  if (!dados.nome || !(dados.valor_mensal >= 0)) erro("Informe nome e valor do plano.");
  const { error } = id ? await sb.from("planos").update(dados).eq("id", id) : await sb.from("planos").insert(dados);
  if (error) erro(error.message);
  revalidatePath(CAMINHO);
  volta("ok=" + encodeURIComponent(`Plano ${dados.nome} salvo.`));
}

/** Cria cliente + assinatura recorrente no Asaas e guarda o link de pagamento */
export async function criarAssinatura(f: FormData) {
  const { sb, user } = await admin();
  const empresaId = String(f.get("empresa_id") || "");
  const planoId = String(f.get("plano_id") || "");
  const email = String(f.get("email") || "").trim();
  const forma = String(f.get("forma") || "UNDEFINED");
  const venc = String(f.get("vencimento") || hojeSP());
  const [{ data: emp }, { data: plano }, { data: existente }] = await Promise.all([
    sb.from("empresas").select("id,razao_social,nome_fantasia,cnpj").eq("id", empresaId).single(),
    sb.from("planos").select("*").eq("id", planoId).single(),
    sb.from("assinaturas").select("id,status").eq("empresa_id", empresaId).maybeSingle(),
  ]);
  if (!emp) erro("Empresa não encontrada.");
  if (!plano) erro("Escolha um plano.");
  if (existente && existente.status !== "cancelada") erro("Esta empresa já tem assinatura. Cancele a atual antes de criar outra.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erro("Informe o e-mail de cobrança.");
  const doc = String(emp!.cnpj || "").replace(/\D/g, "");
  if (doc.length !== 14 && doc.length !== 11) erro("A empresa precisa ter CNPJ cadastrado.");
  const valor = f.get("valor") ? num(f.get("valor")) : Number(plano!.valor_mensal);
  if (!(valor > 0)) erro("Valor da assinatura inválido.");

  let a;
  try { a = await asaas(sb); } catch (e) { erro((e as Error).message); }
  try {
    // reaproveita o cliente se já existir no Asaas com o mesmo CPF/CNPJ
    const busca = await a!.req("GET", `/customers?cpfCnpj=${doc}&limit=1`);
    const cliente = busca?.data?.[0] || (await a!.req("POST", "/customers", {
      name: emp!.razao_social, cpfCnpj: doc, email, externalReference: emp!.id, notificationDisabled: false,
    }));
    const sub = await a!.req("POST", "/subscriptions", {
      customer: cliente.id, billingType: forma, value: valor, nextDueDate: venc, cycle: "MONTHLY",
      description: `G7 Pulse · plano ${plano!.nome}`, externalReference: emp!.id,
    });
    const pags = await a!.req("GET", `/subscriptions/${sub.id}/payments?limit=12`);
    const primeira = (pags?.data || []).sort((x: any, y: any) => String(x.dueDate).localeCompare(String(y.dueDate)))[0];

    const linha = {
      empresa_id: emp!.id, plano_id: plano!.id, valor, forma, ciclo: "MONTHLY", status: "pendente", email_cobranca: email,
      asaas_customer_id: cliente.id, asaas_subscription_id: sub.id, proximo_vencimento: primeira?.dueDate || venc,
      link_pagamento: primeira?.invoiceUrl || null, criado_por: user.id, atualizado_em: new Date().toISOString(),
    };
    const { error } = existente ? await sb.from("assinaturas").update(linha).eq("id", existente.id) : await sb.from("assinaturas").insert(linha);
    if (error) throw new Error("Assinatura criada no Asaas, mas não gravou aqui: " + error.message);
    for (const p of pags?.data || []) await sb.rpc("asaas_aplicar_pagamento", { p });
    await sb.from("empresas").update({ plano: plano!.nome }).eq("id", emp!.id);
  } catch (e) { erro((e as Error).message); }
  revalidatePath(CAMINHO);
  volta("ok=" + encodeURIComponent(`Assinatura de ${emp!.nome_fantasia || emp!.razao_social} criada. O link de pagamento já está disponível.`));
}

/** Busca no Asaas as cobranças da assinatura e atualiza a situação */
export async function sincronizarAssinatura(f: FormData) {
  const { sb } = await admin();
  const { data: s } = await sb.from("assinaturas").select("*").eq("id", String(f.get("id"))).single();
  if (!s?.asaas_subscription_id) erro("Assinatura não encontrada.");
  try {
    const a = await asaas(sb);
    const [sub, pags] = await Promise.all([
      a.req("GET", `/subscriptions/${s!.asaas_subscription_id}`),
      a.req("GET", `/subscriptions/${s!.asaas_subscription_id}/payments?limit=50`),
    ]);
    for (const p of pags?.data || []) await sb.rpc("asaas_aplicar_pagamento", { p });
    if (sub?.deleted || sub?.status === "INACTIVE") {
      await sb.from("assinaturas").update({ status: "cancelada", atualizado_em: new Date().toISOString() }).eq("id", s!.id);
    }
  } catch (e) { erro((e as Error).message); }
  revalidatePath(CAMINHO);
  volta("ok=" + encodeURIComponent("Assinatura atualizada com os dados do Asaas."));
}

export async function cancelarAssinatura(f: FormData) {
  const { sb } = await admin();
  const { data: s } = await sb.from("assinaturas").select("*").eq("id", String(f.get("id"))).single();
  if (!s) erro("Assinatura não encontrada.");
  try {
    if (s!.asaas_subscription_id) await (await asaas(sb)).req("DELETE", `/subscriptions/${s!.asaas_subscription_id}`);
  } catch (e) { erro((e as Error).message); }
  await sb.from("assinaturas").update({ status: "cancelada", atualizado_em: new Date().toISOString() }).eq("id", s!.id);
  await sb.from("empresas").update({ assinatura_status: "cancelada" }).eq("id", s!.empresa_id);
  revalidatePath(CAMINHO);
  volta("ok=" + encodeURIComponent("Assinatura cancelada no Asaas. Cobranças futuras não serão geradas."));
}
