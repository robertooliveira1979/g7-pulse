import Link from "next/link";
import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";
import { brl, dataBR, hojeSP, addDias } from "@/lib/format";

type T = { tipo: "pagar" | "receber"; vencimento: string; saldo: number; valor_baixado: number; data_quitacao: string | null; status: string; razao_social: string | null; nome_fantasia: string | null; id: string };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { sb, empresaId } = await contexto();
  const dias = Number((await searchParams).dias) || 7;
  const hoje = hojeSP(), ano = hoje.slice(0, 4), m0 = hoje.slice(0, 8) + "01";
  const fimMes = addDias(addDias(m0, 32).slice(0, 8) + "01", -1);
  const [{ data: contas }, { data: tit }, { data: dre }] = await Promise.all([
    sb.from("v_saldo_contas").select("*").eq("empresa_id", empresaId).eq("ativa", true).order("nome"),
    sb.from("v_titulos").select("id,tipo,vencimento,saldo,valor_baixado,data_quitacao,status,razao_social,nome_fantasia").eq("empresa_id", empresaId).or(`status.neq.Quitado,data_quitacao.gte.${ano}-01-01`).limit(5000),
    sb.from("v_dre_mensal").select("mes,linha,valor").eq("empresa_id", empresaId).eq("regime", "caixa").gte("mes", `${ano}-01-01`),
  ]);
  const T = (tit || []) as T[];
  const saldo = (contas || []).reduce((s, c) => s + Number(c.saldo), 0);
  const soma = (f: (t: T) => boolean, v: (t: T) => number) => T.filter(f).reduce((s, t) => s + Number(v(t)), 0);
  const ab = (t: T) => t.status !== "Quitado";
  const bloco = (tipo: "pagar" | "receber") => [
    [tipo === "receber" ? "Inadimplência" : "Em atraso", soma((t) => t.tipo === tipo && t.status === "Atrasado", (t) => t.saldo)],
    ["Para hoje", soma((t) => t.tipo === tipo && ab(t) && t.vencimento === hoje, (t) => t.saldo)],
    ["Para este mês", soma((t) => t.tipo === tipo && ab(t) && t.vencimento >= hoje && t.vencimento <= fimMes, (t) => t.saldo)],
    ["Para este ano", soma((t) => t.tipo === tipo && ab(t) && t.vencimento >= hoje && t.vencimento <= `${ano}-12-31`, (t) => t.saldo)],
    [tipo === "receber" ? "Recebido no mês" : "Pago no mês", soma((t) => t.tipo === tipo && !!t.data_quitacao && t.data_quitacao >= m0, (t) => t.valor_baixado)],
    [tipo === "receber" ? "Recebido no ano" : "Pago no ano", soma((t) => t.tipo === tipo && !!t.data_quitacao, (t) => t.valor_baixado)],
  ] as [string, number][];
  const ate = addDias(hoje, dias);
  const recF = soma((t) => t.tipo === "receber" && ab(t) && t.vencimento >= hoje && t.vencimento <= ate, (t) => t.saldo);
  const pagF = soma((t) => t.tipo === "pagar" && ab(t) && t.vencimento >= hoje && t.vencimento <= ate, (t) => t.saldo);
  const L = (dre || []) as { mes: string; linha: string; valor: number }[];
  const linha = (f: (l: string) => boolean, mes?: string) => L.filter((x) => f(x.linha) && (!mes || x.mes === mes)).reduce((s, x) => s + Number(x.valor), 0);
  const op = (l: string) => l < "08";
  const liq = (l: string) => l < "10";
  const dist = (l: string) => l.startsWith("10");
  const agenda = T.filter((t) => ab(t) && t.vencimento >= hoje && t.vencimento <= addDias(hoje, 10)).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 8);
  return (
    <>
      <Topo titulo="Dashboard" />
      <div className="view">
        <div className="grid k4">
          <div className="card kpi"><span className="l">Saldo total das contas</span><span className={"v " + (saldo < 0 ? "neg" : "")}>{brl(saldo)}</span></div>
          <div className="card kpi"><span className="l">Geração de caixa operacional · mês</span><span className="v">{brl(linha(op, m0))}</span><span className="muted">Ano: {brl(linha(op))}</span></div>
          <div className="card kpi"><span className="l">Geração de caixa líquida · mês</span><span className="v">{brl(linha(liq, m0))}</span><span className="muted">Ano: {brl(linha(liq))}</span></div>
          <div className="card kpi"><span className="l">Distribuição de lucros · mês</span><span className="v">{brl(linha(dist, m0))}</span><span className="muted">Ano: {brl(linha(dist))}</span></div>
        </div>
        <div className="grid k3">
          <div className="card"><h2>Saldo das contas</h2><div className="rows">
            {(contas || []).map((c) => <div className="r2" key={c.id}><span>{c.nome}</span><b className={"num " + (Number(c.saldo) < 0 ? "neg" : "")}>{brl(c.saldo)}</b></div>)}
          </div><Link href="/contas">Gerenciar contas</Link></div>
          <div className="card"><div style={{ display: "flex", justifyContent: "space-between" }}><h2>Saldo previsto</h2>
            <div className="chips">{[7, 15, 30, 60, 90].map((d) => <Link key={d} href={`/?dias=${d}`} className={"chip " + (d === dias ? "on" : "")}>{d}d</Link>)}</div></div>
            <div className="rows">
              <div className="r2"><span>Recebimentos futuros</span><b className="num pos">{brl(recF)}</b></div>
              <div className="r2"><span>Pagamentos futuros</span><b className="num neg">−{brl(pagF)}</b></div>
              <div className="r2"><span>Saldo previsto em {dataBR(ate)}</span><b className="num">{brl(saldo + recF - pagF)}</b></div>
            </div></div>
          <div className="card"><h2>Próximos 10 dias</h2><div className="rows">
            {agenda.length ? agenda.map((t) => <div className="r2" key={t.id}><span><span className="muted num">{dataBR(t.vencimento)}</span> {(t.nome_fantasia || t.razao_social || "").slice(0, 28)}</span><span className={"num " + (t.tipo === "receber" ? "pos" : "neg")}>{brl(t.saldo)}</span></div>) : <span className="muted">Nada vencendo.</span>}
          </div></div>
        </div>
        <div className="grid k2">
          {(["receber", "pagar"] as const).map((tp) => (
            <div className="card" key={tp}><div style={{ display: "flex", justifyContent: "space-between" }}><h2>Contas a {tp}</h2><Link href={"/" + tp}>Ver todas</Link></div>
              <div className="rows">{bloco(tp).map(([l, v]) => <div className="r2" key={l}><span>{l}</span><span className={"num " + (tp === "receber" ? (l === "Inadimplência" && v ? "neg" : "pos") : "neg")}>{brl(v)}</span></div>)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
