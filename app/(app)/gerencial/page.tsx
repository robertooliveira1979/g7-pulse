import Link from "next/link";
import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";
import { brl, hojeSP, MESES } from "@/lib/format";

const LINHAS: { k: string; label: string; tot?: (v: (k: string) => number) => number }[] = [
  { k: "01", label: "Receitas operacionais" },
  { k: "02", label: "(−) Impostos sobre serviços" },
  { k: "RL", label: "= Receita líquida", tot: (v) => v("01") + v("02") },
  { k: "03", label: "(−) Custos da prestação de serviço" },
  { k: "MC", label: "= Margem de contribuição", tot: (v) => v("01") + v("02") + v("03") },
  { k: "04", label: "(−) Pessoal" },
  { k: "05", label: "(−) Marketing e vendas" },
  { k: "06", label: "(−) Administrativas" },
  { k: "07", label: "(−) Despesas financeiras" },
  { k: "GCO", label: "= Geração de caixa operacional", tot: (v) => ["01", "02", "03", "04", "05", "06", "07"].reduce((s, k) => s + v(k), 0) },
  { k: "08", label: "(+) Entradas não operacionais" },
  { k: "09", label: "(−) Saídas não operacionais" },
  { k: "GCL", label: "= Geração de caixa líquida", tot: (v) => ["01", "02", "03", "04", "05", "06", "07", "08", "09"].reduce((s, k) => s + v(k), 0) },
  { k: "10", label: "(−) Distribuição de lucros" },
  { k: "RES", label: "= Resultado após distribuição", tot: (v) => ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].reduce((s, k) => s + v(k), 0) },
];

export default async function Gerencial({ searchParams }: { searchParams: Promise<{ regime?: string; ano?: string }> }) {
  const sp = await searchParams;
  const regime = sp.regime === "competencia" ? "competencia" : "caixa";
  const ano = sp.ano || hojeSP().slice(0, 4);
  const { sb, empresaId } = await contexto();
  const { data } = await sb.from("v_dre_mensal").select("mes,linha,valor").eq("empresa_id", empresaId).eq("regime", regime).gte("mes", `${ano}-01-01`).lte("mes", `${ano}-12-01`);
  const D = (data || []) as { mes: string; linha: string; valor: number }[];
  const val = (m: number | null) => (k: string) => D.filter((x) => x.linha?.startsWith(k) && (m === null || Number(x.mes.slice(5, 7)) === m + 1)).reduce((s, x) => s + Number(x.valor), 0);
  const cel = (L: (typeof LINHAS)[number], m: number | null) => (L.tot ? L.tot(val(m)) : val(m)(L.k));
  const receita = val(null)("01");
  const gco = cel(LINHAS[9], null);
  return (
    <>
      <Topo titulo="Gerencial e DRE">
        <div className="chips">
          <Link className={"chip " + (regime === "caixa" ? "on" : "")} href={`/gerencial?regime=caixa&ano=${ano}`}>Caixa</Link>
          <Link className={"chip " + (regime === "competencia" ? "on" : "")} href={`/gerencial?regime=competencia&ano=${ano}`}>Competência</Link>
        </div>
      </Topo>
      <div className="view">
        <div className="grid k3">
          <div className="card kpi"><span className="l">Receita {ano}</span><span className="v">{brl(receita)}</span></div>
          <div className="card kpi"><span className="l">Geração de caixa operacional</span><span className="v">{brl(gco)}</span></div>
          <div className="card kpi"><span className="l">Margem operacional</span><span className="v">{receita ? ((gco / receita) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—"}</span></div>
        </div>
        <div className="tbl"><table className="dre">
          <thead><tr><th>Linha</th>{MESES.map((m) => <th key={m} className="r">{m}</th>)}<th className="r">Total</th><th className="r">AV%</th></tr></thead>
          <tbody>{LINHAS.map((L) => {
            const tot = cel(L, null);
            return (
              <tr key={L.k} className={L.tot ? "tot" : ""}>
                <td>{L.label}</td>
                {MESES.map((_, m) => { const v = cel(L, m); return <td key={m} className={"r num " + (v < 0 ? "neg" : "")}>{v ? brl(v) : "—"}</td>; })}
                <td className={"r num " + (tot < 0 ? "neg" : "")}>{brl(tot)}</td>
                <td className="r num muted">{receita ? ((tot / receita) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>
    </>
  );
}
