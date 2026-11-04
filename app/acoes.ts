"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { contexto, COOKIE_EMPRESA } from "@/lib/empresa";
import { addMeses, hojeSP } from "@/lib/format";

const txt = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (f: FormData, k: string) => Number(String(f.get(k) ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
const numSimples = (f: FormData, k: string) => {
  const s = String(f.get(k) ?? "").trim();
  if (!s) return 0;
  return s.includes(",") ? num(f, k) : Number(s) || 0;
};

/* ---------- Empresa ativa ---------- */
export async function escolherEmpresa(f: FormData) {
  const id = String(f.get("empresa_id"));
  (await cookies()).set(COOKIE_EMPRESA, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}

export async function criarEmpresa(f: FormData) {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("criar_empresa", {
    p_razao: txt(f, "razao_social"),
    p_fantasia: txt(f, "nome_fantasia"),
    p_cnpj: txt(f, "cnpj"),
    p_modelo: process.env.G7_EMPRESA_MODELO || null,
  });
  if (error) redirect("/empresas?erro=" + encodeURIComponent(error.message));
  await sb.from("contas_bancarias").insert({ empresa_id: data, nome: "Conta principal", tipo: "corrente" });
  (await cookies()).set(COOKIE_EMPRESA, String(data), { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  redirect("/");
}

/* ---------- Títulos ---------- */
export async function salvarTitulo(f: FormData) {
  const { sb, empresaId, user } = await contexto();
  const id = txt(f, "id");
  const tipo = String(f.get("tipo")) as "pagar" | "receber";
  const base = {
    empresa_id: empresaId,
    tipo,
    descricao: txt(f, "descricao"),
    documento: txt(f, "documento"),
    observacoes: txt(f, "observacoes"),
    categoria_id: txt(f, "categoria_id"),
    pessoa_id: txt(f, "pessoa_id"),
    conta_id: txt(f, "conta_id"),
    centro_custo: txt(f, "centro_custo"),
    projeto: txt(f, "projeto"),
    tipo_gasto: tipo === "pagar" ? txt(f, "tipo_gasto") : null,
    forma_cobranca: txt(f, "forma_cobranca"),
    data_emissao: txt(f, "data_emissao") || hojeSP(),
    vencimento: txt(f, "vencimento")!,
    valor_original: numSimples(f, "valor_original"),
    desconto: numSimples(f, "desconto"),
    acrescimo: numSimples(f, "acrescimo"),
    codigo_referencia: txt(f, "codigo_referencia"),
    ordem_servico: txt(f, "ordem_servico"),
    ordem_compra: txt(f, "ordem_compra"),
    chave_pix: txt(f, "chave_pix"),
  };
  let error;
  if (id) {
    ({ error } = await sb.from("titulos").update(base).eq("id", id));
  } else {
    const n = Math.min(36, Math.max(1, Math.floor(numSimples(f, "repetir") || 1)));
    const rec = n > 1 ? crypto.randomUUID() : null;
    const linhas = Array.from({ length: n }, (_, i) => ({
      ...base,
      vencimento: addMeses(base.vencimento, i),
      data_emissao: addMeses(base.data_emissao, i),
      descricao: n > 1 ? `${base.descricao ?? ""} (${i + 1}/${n})`.trim() : base.descricao,
      recorrencia_id: rec,
      criado_por: user.id,
    }));
    ({ error } = await sb.from("titulos").insert(linhas));
  }
  const volta = tipo === "pagar" ? "/pagar" : "/receber";
  if (error) redirect(`/titulos/${id || "novo"}?tipo=${tipo}&erro=${encodeURIComponent(error.message)}`);
  revalidatePath(volta);
  redirect(volta);
}

export async function excluirTitulo(f: FormData) {
  const { sb } = await contexto();
  const tipo = String(f.get("tipo"));
  await sb.from("titulos").delete().eq("id", String(f.get("id")));
  redirect(tipo === "pagar" ? "/pagar" : "/receber");
}

export async function baixarTitulo(f: FormData) {
  const { sb, empresaId, user } = await contexto();
  const { error } = await sb.from("baixas").insert({
    empresa_id: empresaId,
    titulo_id: String(f.get("titulo_id")),
    data: txt(f, "data") || hojeSP(),
    valor: numSimples(f, "valor"),
    conta_id: String(f.get("conta_id")),
    origem: "manual",
    criado_por: user.id,
  });
  const volta = String(f.get("volta") || "/");
  if (error) redirect(volta + (volta.includes("?") ? "&" : "?") + "erro=" + encodeURIComponent(error.message));
  revalidatePath(volta);
  redirect(volta);
}

export async function estornarTitulo(f: FormData) {
  const { sb } = await contexto();
  await sb.from("baixas").delete().eq("titulo_id", String(f.get("titulo_id")));
  const volta = String(f.get("volta") || "/");
  revalidatePath(volta);
  redirect(volta);
}

/* ---------- Pessoas ---------- */
export async function salvarPessoa(f: FormData) {
  const { sb, empresaId } = await contexto();
  const id = txt(f, "id");
  const dados = {
    empresa_id: empresaId,
    cnpj_cpf: txt(f, "cnpj_cpf"), razao_social: txt(f, "razao_social"), nome_fantasia: txt(f, "nome_fantasia"),
    e_cliente: f.get("e_cliente") === "on", e_fornecedor: f.get("e_fornecedor") === "on",
    ddd: txt(f, "ddd"), telefone: txt(f, "telefone"), email: txt(f, "email"), segmento: txt(f, "segmento"),
    cep: txt(f, "cep"), uf: txt(f, "uf"), cidade: txt(f, "cidade"), bairro: txt(f, "bairro"),
    logradouro: txt(f, "logradouro"), numero: txt(f, "numero"), complemento: txt(f, "complemento"),
    inscricao_municipal: txt(f, "inscricao_municipal"), chave_pix: txt(f, "chave_pix"),
    ativo: f.get("ativo") === "on",
  };
  const { error } = id ? await sb.from("pessoas").update(dados).eq("id", id) : await sb.from("pessoas").insert(dados);
  const volta = dados.e_cliente ? "/clientes" : "/fornecedores";
  if (error) redirect(`/pessoas/${id || "novo"}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(volta);
  redirect(volta);
}

/* ---------- Contas ---------- */
export async function salvarConta(f: FormData) {
  const { sb, empresaId } = await contexto();
  const id = txt(f, "id");
  const dados = {
    empresa_id: empresaId, nome: txt(f, "nome"), tipo: txt(f, "tipo"), banco: txt(f, "banco"),
    agencia: txt(f, "agencia"), numero: txt(f, "numero"), dv: txt(f, "dv"), tipo_pessoa: txt(f, "tipo_pessoa"),
    saldo_inicial: numSimples(f, "saldo_inicial"), data_saldo_inicial: txt(f, "data_saldo_inicial"),
    ativa: f.get("ativa") === "on",
  };
  const { error } = id ? await sb.from("contas_bancarias").update(dados).eq("id", id) : await sb.from("contas_bancarias").insert(dados);
  if (error) redirect("/contas?erro=" + encodeURIComponent(error.message));
  revalidatePath("/contas");
  redirect("/contas");
}
