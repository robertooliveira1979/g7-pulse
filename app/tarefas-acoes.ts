"use server";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/empresa";

export type Tarefa = {
  id: string; coluna_id: string; titulo: string; descricao: string | null; responsavel_id: string | null; prazo: string | null;
  prioridade: "baixa" | "media" | "alta" | "urgente"; etiquetas: string[]; ordem: number; concluida_em: string | null; criado_em: string;
};
export type Coluna = { id: string; nome: string; cor: string; ordem: number; concluida: boolean };
type R<T = null> = { ok: true; dado: T } | { ok: false; erro: string };

const CAMPOS = "id,coluna_id,titulo,descricao,responsavel_id,prazo,prioridade,etiquetas,ordem,concluida_em,criado_em";
const limpa = (s: unknown, max = 500) => String(s ?? "").trim().slice(0, max);
const fim = <T,>(dado: T): R<T> => { revalidatePath("/tarefas"); return { ok: true, dado }; };

/* ---------- Tarefas ---------- */
export async function criarTarefa(d: { coluna_id: string; titulo: string; ordem: number; responsavel_id?: string | null; prazo?: string | null; prioridade?: Tarefa["prioridade"]; descricao?: string | null; etiquetas?: string[] }): Promise<R<Tarefa>> {
  const { sb, empresaId } = await contexto();
  const titulo = limpa(d.titulo, 300);
  if (!titulo) return { ok: false, erro: "Escreva o título da tarefa." };
  const { data, error } = await sb.from("tarefas").insert({
    empresa_id: empresaId, coluna_id: d.coluna_id, titulo, ordem: d.ordem, responsavel_id: d.responsavel_id || null, prazo: d.prazo || null,
    prioridade: d.prioridade || "media", descricao: d.descricao ? limpa(d.descricao, 5000) : null, etiquetas: (d.etiquetas || []).map((e) => limpa(e, 40)).filter(Boolean).slice(0, 10),
  }).select(CAMPOS).single();
  if (error) return { ok: false, erro: error.message };
  return fim(data as Tarefa);
}

export async function atualizarTarefa(id: string, p: Partial<Omit<Tarefa, "id" | "concluida_em" | "criado_em">>): Promise<R<Tarefa>> {
  const { sb, empresaId } = await contexto();
  const patch: Record<string, unknown> = {};
  if (p.titulo !== undefined) { patch.titulo = limpa(p.titulo, 300); if (!patch.titulo) return { ok: false, erro: "O título não pode ficar vazio." }; }
  if (p.descricao !== undefined) patch.descricao = p.descricao ? limpa(p.descricao, 5000) : null;
  if (p.coluna_id !== undefined) patch.coluna_id = p.coluna_id;
  if (p.ordem !== undefined) patch.ordem = p.ordem;
  if (p.responsavel_id !== undefined) patch.responsavel_id = p.responsavel_id || null;
  if (p.prazo !== undefined) patch.prazo = p.prazo || null;
  if (p.prioridade !== undefined) patch.prioridade = p.prioridade;
  if (p.etiquetas !== undefined) patch.etiquetas = p.etiquetas.map((e) => limpa(e, 40)).filter(Boolean).slice(0, 10);
  const { data, error } = await sb.from("tarefas").update(patch).eq("id", id).eq("empresa_id", empresaId).select(CAMPOS).single();
  if (error) return { ok: false, erro: error.message };
  return fim(data as Tarefa);
}

export async function excluirTarefa(id: string): Promise<R> {
  const { sb, empresaId } = await contexto();
  const { error } = await sb.from("tarefas").delete().eq("id", id).eq("empresa_id", empresaId);
  return error ? { ok: false, erro: error.message } : fim(null);
}

/* ---------- Colunas ---------- */
export async function criarColuna(nome: string, cor: string, ordem: number): Promise<R<Coluna>> {
  const { sb, empresaId } = await contexto();
  const n = limpa(nome, 60);
  if (!n) return { ok: false, erro: "Dê um nome para a coluna." };
  const { data, error } = await sb.from("tarefa_colunas").insert({ empresa_id: empresaId, nome: n, cor: /^#[0-9a-f]{6}$/i.test(cor) ? cor : "#5B7A86", ordem }).select("id,nome,cor,ordem,concluida").single();
  if (error) return { ok: false, erro: error.message };
  return fim(data as Coluna);
}

export async function atualizarColuna(id: string, p: Partial<Omit<Coluna, "id">>): Promise<R<Coluna>> {
  const { sb, empresaId } = await contexto();
  const patch: Record<string, unknown> = {};
  if (p.nome !== undefined) { patch.nome = limpa(p.nome, 60); if (!patch.nome) return { ok: false, erro: "O nome da coluna não pode ficar vazio." }; }
  if (p.cor !== undefined && /^#[0-9a-f]{6}$/i.test(p.cor)) patch.cor = p.cor;
  if (p.ordem !== undefined) patch.ordem = p.ordem;
  if (p.concluida !== undefined) patch.concluida = p.concluida;
  const { data, error } = await sb.from("tarefa_colunas").update(patch).eq("id", id).eq("empresa_id", empresaId).select("id,nome,cor,ordem,concluida").single();
  if (error) return { ok: false, erro: error.message };
  if (p.concluida !== undefined) {
    // reaplica a regra de conclusão nas tarefas da coluna (o gatilho recalcula concluida_em)
    await sb.from("tarefas").update({ coluna_id: id }).eq("coluna_id", id).eq("empresa_id", empresaId);
  }
  return fim(data as Coluna);
}

/** Exclui a coluna; se tiver tarefas, elas vão para a coluna de destino */
export async function excluirColuna(id: string, destino: string | null): Promise<R> {
  const { sb, empresaId } = await contexto();
  const { count } = await sb.from("tarefas").select("id", { count: "exact", head: true }).eq("coluna_id", id).eq("empresa_id", empresaId);
  if (count) {
    if (!destino || destino === id) return { ok: false, erro: "Escolha para qual coluna mover as tarefas." };
    const { error } = await sb.from("tarefas").update({ coluna_id: destino }).eq("coluna_id", id).eq("empresa_id", empresaId);
    if (error) return { ok: false, erro: error.message };
  }
  const { count: total } = await sb.from("tarefa_colunas").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId);
  if ((total || 0) <= 1) return { ok: false, erro: "O quadro precisa ter pelo menos uma coluna." };
  const { error } = await sb.from("tarefa_colunas").delete().eq("id", id).eq("empresa_id", empresaId);
  return error ? { ok: false, erro: error.message } : fim(null);
}
