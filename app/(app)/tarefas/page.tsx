import Topo from "@/components/Topo";
import QuadroTarefas from "@/components/QuadroTarefas";
import { contexto } from "@/lib/empresa";
import { hojeSP } from "@/lib/format";
import type { Coluna, Tarefa } from "@/app/tarefas-acoes";

export const dynamic = "force-dynamic";

export default async function Tarefas({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const { sb, empresaId, user } = await contexto();
  await sb.rpc("garantir_colunas_tarefas", { p_empresa: empresaId });
  const [{ data: colunas }, { data: tarefas }, { data: vinc }] = await Promise.all([
    sb.from("tarefa_colunas").select("id,nome,cor,ordem,concluida").eq("empresa_id", empresaId).order("ordem"),
    sb.from("tarefas").select("id,coluna_id,titulo,descricao,responsavel_id,prazo,prioridade,etiquetas,ordem,concluida_em,criado_em").eq("empresa_id", empresaId).order("ordem").limit(3000),
    sb.from("vinculos").select("usuario_id, perfis(id,nome,email)").eq("empresa_id", empresaId),
  ]);
  const membros = (vinc || []).map((x: any) => ({ id: x.usuario_id as string, nome: (x.perfis?.nome || x.perfis?.email || "Usuário") as string }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return (
    <>
      <Topo titulo="Tarefas" />
      <div className="view">
        <QuadroTarefas colunasIni={(colunas || []) as Coluna[]} tarefasIni={(tarefas || []) as Tarefa[]} membros={membros} eu={user.id} hoje={hojeSP()} visaoIni={v === "lista" ? "lista" : "kanban"} />
      </div>
    </>
  );
}
