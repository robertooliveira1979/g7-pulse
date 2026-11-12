"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/empresa";

const txt = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const valor = (f: FormData, k: string) => {
  const s = String(f.get(k) ?? "").trim();
  return s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
};

/* ---------- Centros de custo ---------- */
export async function salvarCentro(f: FormData) {
  const { sb, empresaId, podeEditar } = await contexto();
  if (!podeEditar) redirect("/centros?erro=" + encodeURIComponent("Seu perfil não pode alterar cadastros."));
  const id = txt(f, "id");
  const dados = { empresa_id: empresaId, codigo: txt(f, "codigo"), nome: txt(f, "nome")!, ativo: f.get("ativo") !== "nao" };
  if (!dados.nome) redirect("/centros?erro=" + encodeURIComponent("Informe o nome do centro de custo."));
  const { error } = id ? await sb.from("centros_custo").update(dados).eq("id", id) : await sb.from("centros_custo").insert(dados);
  if (error) redirect("/centros?erro=" + encodeURIComponent(error.code === "23505" ? "Já existe um centro de custo com esse nome." : error.message));
  revalidatePath("/centros");
  redirect("/centros");
}

export async function excluirCentro(f: FormData) {
  const { sb, empresaId } = await contexto();
  const id = String(f.get("id"));
  const { count } = await sb.from("titulos").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("centro_custo_id", id);
  if (count) redirect("/centros?erro=" + encodeURIComponent(`Este centro tem ${count} lançamento(s). Inative-o em vez de excluir.`));
  const { error } = await sb.from("centros_custo").delete().eq("id", id).eq("empresa_id", empresaId);
  if (error) redirect("/centros?erro=" + encodeURIComponent(error.message));
  revalidatePath("/centros");
  redirect("/centros");
}

/* ---------- Transferências ---------- */
export async function salvarTransferencia(f: FormData) {
  const { sb, empresaId, podeEditar, user } = await contexto();
  const erro = (m: string): never => redirect("/transferencias?erro=" + encodeURIComponent(m));
  if (!podeEditar) erro("Seu perfil não pode registrar transferências.");
  const id = txt(f, "id");
  const dados = {
    empresa_id: empresaId, conta_origem_id: txt(f, "origem")!, conta_destino_id: txt(f, "destino")!,
    data: txt(f, "data")!, valor: valor(f, "valor"), descricao: txt(f, "descricao"),
  };
  if (!dados.conta_origem_id || !dados.conta_destino_id) erro("Escolha a conta de origem e a de destino.");
  if (dados.conta_origem_id === dados.conta_destino_id) erro("Origem e destino precisam ser contas diferentes.");
  if (!(dados.valor > 0)) erro("Informe um valor maior que zero.");
  if (!dados.data) erro("Informe a data.");
  const { error } = id
    ? await sb.from("transferencias").update(dados).eq("id", id).eq("empresa_id", empresaId)
    : await sb.from("transferencias").insert({ ...dados, criado_por: user.id });
  if (error) erro(error.message);
  revalidatePath("/transferencias"); revalidatePath("/contas"); revalidatePath("/");
  redirect("/transferencias?ok=1");
}

export async function excluirTransferencia(f: FormData) {
  const { sb, empresaId, podeEditar } = await contexto();
  if (!podeEditar) redirect("/transferencias");
  const { error } = await sb.from("transferencias").delete().eq("id", String(f.get("id"))).eq("empresa_id", empresaId);
  if (error) redirect("/transferencias?erro=" + encodeURIComponent(error.message));
  revalidatePath("/transferencias"); revalidatePath("/contas"); revalidatePath("/");
  redirect("/transferencias");
}
