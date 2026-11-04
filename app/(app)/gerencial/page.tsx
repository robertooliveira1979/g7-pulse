import Link from "next/link";
import Topo from "@/components/Topo";
import { BarrasMes, BarrasH } from "@/components/Graficos";
import { contexto } from "@/lib/empresa";
import { brl, hojeSP, MESES } from "@/lib/format";

type Linha = { k: string; label: string; grupos?: string[]; tot?: string[] };
const LINHAS: Linha[] = [
  { k: "rb", label: "Receitas operacionais", grupos: ["01"] },
  { k: "imp", label: "(−) Impostos sobre serviços", grupos: ["02"] },
  { k: "rl", label: "= Receita líquida", tot: ["01", "02"] },
  { k: "cs", label: "(−) Custos da prestação de serviço", grupos: ["03"] },
  { k: "mc", label: "= Margem de contribuição", tot: ["01", "02", "03"] },
  { k: "pes", label: "(−) Salários, encargos e pessoal", grupos: ["04"] },
  { k: "mkt", label: "(−) Marketing e vendas", grupos: ["05"] },
  { k: "adm", label: "(−) Despesas administrativas", grupos: ["06"] },
  { k: "ebitda", label: "= Resultado antes do financeiro", tot: ["01", "02", "03", "04", "05", "06"] },
  { k: "fin", label: "(−) Despesas financeiras", grupos: ["07"] },
  { k: "gco", label: "= Geração de caixa operacional", tot: ["01", "02", "03", "04", "05", "06", "07"] },
  { k: "rno", label: "(+) Entradas não operacionais", grupos: ["08"] },
  { k: "dno", label: "(−) Saídas não operacionais", grupos: ["09"] },
  { k: "gcl", label: "= Geração de caixa líquida", tot: ["01", "02", "03", "04", "05", "06", "07", "08", "09"] },
  { k: "dist", label: "(−) Distribuição de lucros", grupos: ["10"] },
  { k: "res", label: "= Resultado após distribuição", tot: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] },
];
const pct = (v: number) => (isFinite(v) ? (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—");

export default async function Gerencial({ searchParams }: { searchParams: Promise<{ regime?: string; ano?: string; abrir?: string }> }) {
  const sp = await searchParams;
  const regime = sp.regime === "competencia" ? "competencia" : "caixa";
  const ano = sp.ano || hojeSP().slice(0, 4);
  const abertos = new Set((sp.abrir || "").split(",").filter(Boolean));
  const { sb, empresaId } = await contexto();
  const [{ data }, { data: rec }] = await Promise.all([
    sb.from("v_dre_mensal").select("mes,linha,codigo,nome,valor").eq("empresa_id", empresaId).eq("regime", regime).gte("mes", `${ano}-01-01`).lte("mes", `${ano}-12-01`),
    sb.from("v_titulos").select("razao_social,nome_fantasia,valor_original,valor_baixado,vencimento,data_quitacao,data_emissao,status").eq("empresa_id", empresaId).eq("tipo", "receber").limit(10000),
  ]);
  const D = (data || []) as { mes: string; linha: string | null; codigo: string; nome: string; valor: number }[];
  const g = (x: { linha: string | null }) => (x.linha || "").slice(0, 2);
  const val = (grupos: string[], m: number | null, codigo?: string) =>
    D.filter((x) => grupos.includes(g(x)) && (m === null || Number(x.mes.slice(5, 7)) === m + 1) && (!codigo || x.codigo === codigo)).reduce((s, x) => s + Number(x.valor), 0);
  const cel = (L: Linha, m: number | null) => val(L.grupos || L.tot!, m);
  const T = Object.fromEntries(LINHAS.map((L) => [L.k, cel(L, null)])) as Record<string, number>;
  const rb = T.rb;

  const link = (k: string) => {
    const n = new Set(abertos); n.has(k) ? n.delete(k) : n.add(k);
    return `/gerencial?regime=${regime}&ano=${ano}&abrir=${[...n].join(",")}`;
  };

  // ---------- Insights ----------
  const nMeses = Math.max(1, new Set(D.filter((x) => Number(x.valor) !== 0).map((x) => x.mes)).size);
  const mo = rb ? T.gco / rb : NaN;
  const mcPct = rb ? T.mc / rb : 0;
  const fixos = -(T.pes + T.mkt + T.adm + T.fin);
  const pe = mcPct > 0 ? fixos / nMeses / mcPct : NaN;
  const recMed = rb / nMeses;
  const R = (rec || []) as { razao_social: string | null; nome_fantasia: string | null; valor_original: number; valor_baixado: number; vencimento: string; data_quitacao: string | null; data_emissao: string; status: string }[];
  const porCli: Record<string, number> = {};
  R.filter((t) => (regime === "caixa" ? t.data_quitacao?.startsWith(ano) : t.data_emissao?.startsWith(ano))).forEach((t) => {
    const n = t.nome_fantasia || t.razao_social || "—";
    porCli[n] = (porCli[n] || 0) + Number(regime === "caixa" ? t.valor_baixado : t.valor_original);
  });
  const rk = Object.entries(porCli).sort((a, b) => b[1] - a[1]);
  const tt = rk.reduce((s, x) => s + x[1], 0) || 1;
  const top1 = rk[0] ? rk[0][1] / tt : 0, top3 = rk.slice(0, 3).reduce((s, x) => s + x[1], 0) / tt;
  const recor = val(["01"], null, "01.01.01");
  const quit = R.filter((t) => t.data_quitacao);
  const atrasos = quit.map((t) => (new Date(t.data_quitacao!).getTime() - new Date(t.vencimento).getTime()) / 864e5);
  const pmr = atrasos.length ? atrasos.reduce((a, b) => a + b, 0) / atrasos.length : 0;
  const pont = atrasos.filter((x) => x <= 0).length / Math.max(1, atrasos.length);
  const fp = rb ? -T.fin / rb : NaN;
  const desp: Record<string, number> = {};
  D.filter((x) => Number(x.valor) < 0 && g(x) !== "10").forEach((x) => { desp[x.nome] = (desp[x.nome] || 0) - Number(x.valor); });
  const topDesp = Object.entries(desp).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const dist = -T.dist;

  const ins: { t: string; v: string; s: "ok" | "pend" | "late" | "info"; p: React.ReactNode; a: string }[] = [
    { t: "Margem operacional", v: pct(mo), s: mo >= 0.15 ? "ok" : mo >= 0.05 ? "pend" : "late", p: `Geração de caixa operacional de ${brl(T.gco)} sobre ${brl(rb)} de receita.`, a: mo < 0.15 ? "Referência para serviços: acima de 15%. Revise as maiores despesas antes de reajustar preço." : "Margem saudável. Proteja-a com reajuste anual dos contratos." },
    { t: "Ponto de equilíbrio mensal", v: isFinite(pe) ? brl(pe) : "—", s: recMed >= pe ? "ok" : "late", p: `Receita média de ${brl(recMed)}/mês com margem de contribuição de ${pct(mcPct)}.`, a: recMed >= pe ? `Folga de ${brl(recMed - pe)}/mês acima do equilíbrio.` : `Faltam ${brl(pe - recMed)}/mês de receita para cobrir a estrutura.` },
    { t: "Concentração de receita", v: pct(top3), s: top1 > 0.3 ? "late" : top3 > 0.5 ? "pend" : "ok", p: `Os 3 maiores clientes somam ${pct(top3)} da receita. O maior (${rk[0]?.[0] || "—"}) responde por ${pct(top1)}.`, a: top1 > 0.3 ? "Risco alto: perder esse cliente compromete o caixa. Priorize prospecção." : "Carteira bem distribuída." },
    { t: "Receita recorrente (fee mensal)", v: pct(rb ? recor / rb : NaN), s: rb && recor / rb >= 0.7 ? "ok" : "pend", p: `${brl(recor)} vieram de contratos recorrentes.`, a: "Quanto maior a recorrência, mais previsível o caixa. Ofereça a conversão de jobs pontuais em fee." },
    { t: "Pontualidade dos clientes", v: pct(pont), s: pont >= 0.85 ? "ok" : pont >= 0.65 ? "pend" : "late", p: `Atraso médio de ${pmr.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias entre vencimento e recebimento.`, a: "Ative a régua de cobrança automática (aviso 3 dias antes, no dia e 3 dias depois)." },
    { t: "Custo financeiro", v: pct(fp), s: fp <= 0.02 ? "ok" : fp <= 0.05 ? "pend" : "late", p: `${brl(-T.fin)} em juros, tarifas, IOF e multas.`, a: fp > 0.02 ? "Acima de 2% da receita: negocie o pacote de tarifas e evite pagar com atraso." : "Dentro do esperado." },
    { t: "Maiores despesas", v: topDesp[0] ? brl(topDesp[0][1]) : "—", s: "info", p: <>{topDesp.map(([n, v]) => <span key={n} style={{ display: "block" }}>{n}: {brl(v)}</span>)}</>, a: "Comece cortes e renegociações por aqui: são as linhas que mais movem o resultado." },
    { t: "Distribuição × geração de caixa", v: T.gcl ? pct(dist / Math.max(1, T.gcl)) : "—", s: dist > T.gcl ? "late" : "ok", p: `Distribuído ${brl(dist)} contra ${brl(T.gcl)} de caixa gerado.`, a: dist > T.gcl ? "Os sócios retiraram mais do que a empresa gerou: o excedente saiu da reserva." : "Retiradas compatíveis com a geração de caixa." },
  ];
  const Card = (i: (typeof ins)[number]) => (
    <div className="card insight" key={i.t}>
      <div className="card-h"><h2 style={{ fontSize: 14 }}>{i.t}</h2><span className={"pill " + i.s}>{{ ok: "Bom", pend: "Atenção", late: "Crítico", info: "Análise" }[i.s]}</span></div>
      <div className="big">{i.v}</div><p>{i.p}</p><div className="act">{i.a}</div>
    </div>
  );

  const meses = MESES.map((_, m) => m);
  const partes: [string, number][] = ([["Impostos", -T.imp], ["Custos do serviço", -T.cs], ["Pessoal", -T.pes], ["Marketing e vendas", -T.mkt], ["Administrativas", -T.adm], ["Financeiras", -T.fin], ["Não operacionais", -T.dno], ["Distribuição", -T.dist]] as [string, number][]).filter((p) => p[1] > 0).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <Topo titulo="Gerencial e DRE">
        <div className="chips">
          <Link className={"chip " + (regime === "caixa" ? "on" : "")} href={`/gerencial?regime=caixa&ano=${ano}`}>Regime de caixa</Link>
          <Link className={"chip " + (regime === "competencia" ? "on" : "")} href={`/gerencial?regime=competencia&ano=${ano}`}>Competência</Link>
        </div>
      </Topo>
      <div className="view">
        <p className="muted" style={{ margin: 0 }}>{regime === "caixa" ? "Pela data de pagamento/recebimento e valor baixado." : "Pela data de emissão e valor original, pago ou não."} Ano {ano}.</p>
        <div className="grid k4">{ins.slice(0, 4).map(Card)}</div>
        <div className="card">
          <div className="card-h"><h2>DRE gerencial · {ano}</h2><span className="muted" style={{ fontSize: 12 }}>Clique nos grupos para abrir as categorias</span></div>
          <div className="tbl-wrap" style={{ border: 0 }}><table className="dre">
            <thead><tr><th>Linha</th>{MESES.map((m) => <th key={m} className="r">{m}</th>)}<th className="r">Total</th><th className="r">AV%</th></tr></thead>
            <tbody>{LINHAS.flatMap((L) => {
              const tot = cel(L, null);
              const c = (v: number, k: string) => <td key={k} className={"r num " + (v < 0 ? "neg" : "")}>{v ? brl(v) : <span className="muted">—</span>}</td>;
              const aberto = abertos.has(L.k);
              const rows = [
                <tr key={L.k} className={L.tot ? "tot" : "grp" + (aberto ? " open" : "")}>
                  <td>{L.grupos ? <Link href={link(L.k)}>{L.label}</Link> : L.label}</td>
                  {meses.map((m) => c(cel(L, m), String(m)))}{c(tot, "t")}
                  <td className="r num muted">{rb ? pct(tot / rb) : "—"}</td>
                </tr>,
              ];
              if (L.grupos && aberto) {
                const cats = [...new Map(D.filter((x) => L.grupos!.includes(g(x))).map((x) => [x.codigo, x.nome])).entries()].sort();
                cats.forEach(([cod, nome]) => {
                  const tc = val(L.grupos!, null, cod);
                  rows.push(<tr key={L.k + cod} className="sub"><td>{nome}</td>{meses.map((m) => c(val(L.grupos!, m, cod), String(m)))}{c(tc, "t")}<td className="r num">{rb ? pct(tc / rb) : "—"}</td></tr>);
                });
              }
              return rows;
            })}</tbody>
          </table></div>
        </div>
        <div className="grid k2">
          <div className="card"><div className="card-h"><h2>Receita, despesas e resultado</h2>
            <div className="legend"><span><i style={{ background: "var(--data)" }} />Receita</span><span><i style={{ background: "var(--neg)" }} />Despesas operacionais</span><span><i style={{ background: "var(--brand)" }} />Geração de caixa operacional</span></div></div>
            <BarrasMes series={[{ nome: "Receita", cor: "var(--data)", valores: meses.map((m) => val(["01"], m)) }, { nome: "Despesas operacionais", cor: "var(--neg)", valores: meses.map((m) => -val(["02", "03", "04", "05", "06", "07"], m)) }]} linha={{ nome: "Geração de caixa operacional", cor: "var(--brand)", valores: meses.map((m) => val(["01", "02", "03", "04", "05", "06", "07"], m)) }} />
          </div>
          <div className="card"><div className="card-h"><h2>Para onde vai o dinheiro · {ano}</h2></div><BarrasH itens={partes} cor="var(--data-2)" /></div>
        </div>
        <div><h2 style={{ fontSize: 17, marginBottom: 12 }}>Insights para a gestão</h2><div className="grid k4">{ins.slice(4).map(Card)}</div></div>
      </div>
    </>
  );
}
