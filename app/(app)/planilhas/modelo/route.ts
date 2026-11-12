import { contexto } from "@/lib/empresa";
import { gerarXlsx } from "@/lib/planilha";
import { abasModelo } from "@/lib/importacao";
import { todos } from "@/lib/dados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Modelo de importação, já com o plano de contas, contas e centros de custo da empresa ativa */
export async function GET() {
  const { sb, empresaId } = await contexto();
  const [categorias, contas, centros] = await Promise.all([
    todos((de, ate) => sb.from("categorias").select("id,codigo,nome,nivel").eq("empresa_id", empresaId).eq("ativa", true).order("codigo").range(de, ate)),
    todos((de, ate) => sb.from("contas_bancarias").select("id,nome").eq("empresa_id", empresaId).eq("ativa", true).order("nome").range(de, ate)),
    todos((de, ate) => sb.from("centros_custo").select("id,codigo,nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome").range(de, ate)),
  ]);
  const buf = gerarXlsx(abasModelo({ categorias, contas, centros }));
  return new Response(new Uint8Array(buf), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="G7Pulse-modelo-importacao.xlsx"', "Cache-Control": "no-store",
  } });
}
