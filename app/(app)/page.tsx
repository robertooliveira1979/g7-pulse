import Link from "next/link";
import Topo from "@/components/Topo";
import Icone from "@/components/Icone";
import { Rosca, Velocimetro, Area, BarrasMes } from "@/components/Graficos";
import { contexto } from "@/lib/empresa";
import { brl, dataBR, hojeSP, addDias, addMeses } from "@/lib/format";

type T = { id: string; tipo: "pagar" | "receber"; vencimento: string; saldo: number; valor_baixado: number; data_quitacao: string | null; status: string; razao_social: string | null; nome_fantasia: string | null };
const CORES = ["var(--data)", "var(--brand)", "var(--data-2)", "var(--pos)"];
const pct = (v: number) => (isFinite(v) ? (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—");

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { sb, empresaId } = await contexto();
  const dias = Number((await searchParams).dias) || 7;
  const hoje = hojeSP(), ano = hoje.slice(0, 4), m0 = hoje.slice(0, 8) + "01";
  const fimMes = addDias(addMeses(m0, 1), -1);
  const [{ data: contas }, { data: tit }, { data: dre }] = await Promise.all([
    sb.from("v_saldo_contas").select("*").eq("empresa_id", empresaId).eq("ativa", true).order("nome"),
    sb.from("v_titulos").select("id,tipo,vencimento,saldo,valor_baixado,data_quitacao,status,razao_social,nome_fantasia").eq("empresa_id", empresaId).or(`status.neq.Quitado,data_quitacao.gte.${ano}-01-01`).limit(10000),
    sb.from("v_dre_mensal").select("mes,linha,valor").eq("empresa_id", empresaId).eq("regime", "caixa").gte("mes", `${Number(ano) - 1}-12-01`),
  ]);
  const L = (tit || []) as T[];
  const soma = (f: (t: T) => boolean, v: (t: T) => number) => L.filter(f).reduce((s, t) => s + Number(v(t)), 0);
  const ab = (t: T) => t.status !== "Quitado";
  const saldo = (contas || []).reduce((s, c) => s + Number(c.saldo), 0);

  // DRE caixa
  const D = (dre || []) as { mes: string; linha: string; valor: number }[];
  const lin = (f: (l: string) => boolean, de: string, ate: string) => D.filter((x) => x.linha && f(x.linha) && x.mes >= de && x.mes <= ate).reduce((s, x) => s + Number(x.valor), 0);
  const op = (l: string) => l < "08", liq = (l: string) => l < "10", dist = (l: string) => l.startsWith("10");
  const mAnt = addMeses(m0, -1);
  const mes = { gco: lin(op, m0, m0), gcl: lin(liq, m0, m0), dist: lin(dist, m0, m0) };
  const ant = { gco: lin(op, mAnt, mAnt), gcl: lin(liq, mAnt, mAnt) };
  const anual = { gco: lin(op, `${ano}-01-01`, `${ano}-12-01`), gcl: lin(liq, `${ano}-01-01`, `${ano}-12-01`), dist: lin(dist, `${ano}-01-01`, `${ano}-12-01`) };
  const temMov = L.some((t) => t.data_quitacao && t.data_quitacao >= m0);
  const delta = (a: number, b: number) => {
    if (!temMov) return <>Mês em andamento · anterior: <b>{brl(b)}</b></>;
    if (!b) return <>sem base no mês anterior</>;
    const d = (a - b) / Math.abs(b);
    return <><b className={d >= 0 ? "pos" : "neg"}>{d >= 0 ? "▲" : "▼"} {pct(Math.abs(d))}</b> vs. mês anterior</>;
  };

  // Saúde do caixa
  const in30 = addDias(hoje, 30);
  const rec30 = soma((t) => t.tipo === "receber" && ab(t) && t.vencimento >= hoje && t.vencimento <= in30, (t) => t.saldo);
  const pag30 = soma((t) => t.tipo === "pagar" && ab(t) && t.vencimento <= in30, (t) => t.saldo);
  const cob = (Math.max(0, saldo) + rec30) / Math.max(1, pag30);
  const atrasR = soma((t) => t.tipo === "receber" && t.status === "Atrasado", (t) => t.saldo);
  const recAno = soma((t) => t.tipo === "receber" && !!t.data_quitacao && t.data_quitacao >= `${ano}-01-01`, (t) => t.valor_baixado);
  const inad = atrasR / Math.max(1, recAno + atrasR);
  const m3 = addMeses(hoje, -3);
  const saida3 = soma((t) => t.tipo === "pagar" && !!t.data_quitacao && t.data_quitacao > m3 && t.data_quitacao <= hoje, (t) => t.valor_baixado) / 3;
  const runway = saldo > 0 ? saldo / Math.max(1, saida3) : 0;
  const saude = Math.min(1, cob / 1.5) * 0.4 + Math.max(0, 1 - inad * 5) * 0.3 + Math.min(1, runway / 3) * 0.3;

  // Saldo previsto + projeção
  const ate = addDias(hoje, dias);
  const recF = soma((t) => t.tipo === "receber" && ab(t) && t.vencimento >= hoje && t.vencimento <= ate, (t) => t.saldo);
  const pagF = soma((t) => t.tipo === "pagar" && ab(t) && t.vencimento >= hoje && t.vencimento <= ate, (t) => t.saldo);
  const proj: number[] = [], rot: string[] = [];
  let s = saldo;
  for (let i = 0; i <= 30; i++) {
    const d = addDias(hoje, i);
    s += soma((t) => t.tipo === "receber" && ab(t) && t.vencimento === d, (t) => t.saldo) - soma((t) => t.tipo === "pagar" && ab(t) && t.vencimento === d, (t) => t.saldo);
    proj.push(s); rot.push(dataBR(d).slice(0, 5));
  }

  // Blocos CR/CP
  const bloco = (tipo: "pagar" | "receber") => [
    [tipo === "receber" ? "Inadimplência" : "Em atraso", soma((t) => t.tipo === tipo && t.status === "Atrasado", (t) => t.saldo), true],
    ["Para hoje", soma((t) => t.tipo === tipo && ab(t) && t.vencimento === hoje, (t) => t.saldo), false],
    ["Para este mês", soma((t) => t.tipo === tipo && ab(t) && t.vencimento >= hoje && t.vencimento <= fimMes, (t) => t.saldo), false],
    ["Para este ano", soma((t) => t.tipo === tipo && ab(t) && t.vencimento >= hoje && t.vencimento <= `${ano}-12-31`, (t) => t.saldo), false],
    [tipo === "receber" ? "Recebido no mês" : "Pago no mês", soma((t) => t.tipo === tipo && !!t.data_quitacao && t.data_quitacao >= m0, (t) => t.valor_baixado), false],
    [tipo === "receber" ? "Recebido no ano" : "Pago no ano", soma((t) => t.tipo === tipo && !!t.data_quitacao && t.data_quitacao >= `${ano}-01-01`, (t) => t.valor_baixado), false],
  ] as [string, number, boolean][];
  const agenda = L.filter((t) => ab(t) && t.vencimento >= hoje && t.vencimento <= addDias(hoje, 10)).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 8);

  // Fluxo mensal
  const porMes = (tipo: string) => Array.from({ length: 12 }, (_, m) => {
    const p = `${ano}-${String(m + 1).padStart(2, "0")}`;
    return soma((t) => t.tipo === tipo && !!t.data_quitacao && t.data_quitacao.startsWith(p), (t) => t.valor_baixado);
  });
  const gclMes = Array.from({ length: 12 }, (_, m) => { const p = `${ano}-${String(m + 1).padStart(2, "0")}-01`; return lin(liq, p, p); });

  const semSaldoIni = (contas || []).filter((c) => !Number(c.saldo_inicial) && (Number(c.entradas) || Number(c.saidas)));

  return (
    <>
      <Topo titulo="Dashboard" />
      <div className="view">
        {semSaldoIni.length > 0 && <div className="notice"><Icone n="alert" /><div><b>Informe o saldo inicial de {semSaldoIni.map((c) => c.nome).join(", ")}.</b> Sem ele, o saldo mostra só a soma das entradas e saídas baixadas. <Link href="/contas">Ajustar em Contas e caixas</Link></div></div>}
        <div className="grid k4">
          <div className="card kpi"><div className="ic" style={{ background: "color-mix(in srgb,var(--pos) 22%,transparent)" }}><Icone n="wallet" /></div><div style={{ minWidth: 0 }}><div className="l">Saldo total das contas</div><div className={"v " + (saldo < 0 ? "neg" : "")}>{brl(saldo)}</div><div className="s">{(contas || []).length} contas ativas</div></div></div>
          <div className="card kpi"><div className="ic" style={{ background: "color-mix(in srgb,var(--data) 22%,transparent)" }}><Icone n="pulse" /></div><div style={{ minWidth: 0 }}><div className="l">Geração de caixa operacional · mês</div><div className="v">{brl(mes.gco)}</div><div className="s">{delta(mes.gco, ant.gco)}<br />Ano: <b className={anual.gco < 0 ? "neg" : ""}>{brl(anual.gco)}</b></div></div></div>
          <div className="card kpi"><div className="ic" style={{ background: "color-mix(in srgb,var(--data-2) 24%,transparent)" }}><Icone n="swap" /></div><div style={{ minWidth: 0 }}><div className="l">Geração de caixa líquida · mês</div><div className="v">{brl(mes.gcl)}</div><div className="s">{delta(mes.gcl, ant.gcl)}<br />Ano: <b className={anual.gcl < 0 ? "neg" : ""}>{brl(anual.gcl)}</b></div></div></div>
          <div className="card kpi"><div className="ic" style={{ background: "color-mix(in srgb,var(--brand) 24%,transparent)" }}><Icone n="share" /></div><div style={{ minWidth: 0 }}><div className="l">Distribuição de lucros · mês</div><div className="v">{brl(-mes.dist)}</div><div className="s">Ano: <b>{brl(-anual.dist)}</b></div></div></div>
        </div>

        <div className="grid k3">
          <div className="card">
            <div className="card-h"><h2>Saldo das contas</h2><Link href="/contas" className="link">Gerenciar</Link></div>
            <Rosca total={saldo} partes={(contas || []).map((c, i) => ({ valor: Number(c.saldo), cor: CORES[i % 4] }))} />
            <div>{(contas || []).map((c, i) => (
              <div className="acct" key={c.id}><span className="sw" style={{ background: CORES[i % 4] }} /><span className="nm">{c.nome}<small>{c.tipo}</small></span><b className={"num " + (Number(c.saldo) < 0 ? "neg" : "")}>{brl(c.saldo)}</b></div>
            ))}</div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Saúde do caixa</h2><span className={"pill " + (saude >= 0.7 ? "ok" : saude >= 0.4 ? "pend" : "late")}>{saude >= 0.7 ? "Saudável" : saude >= 0.4 ? "Atenção" : "Crítico"}</span></div>
            <Velocimetro v={saude} />
            <div className="sumtbl" style={{ fontSize: 13 }}>
              <div className="r"><span>Cobertura 30 dias <small className="muted">(peso 40%)</small></span><span className="num">{cob.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×</span></div>
              <div className="r"><span>Inadimplência <small className="muted">(peso 30%)</small></span><span className="num">{pct(inad)}</span></div>
              <div className="r"><span>Fôlego de caixa <small className="muted">(peso 30%)</small></span><span className="num">{runway.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses</span></div>
            </div>
          </div>
          <div className="card span-all">
            <div className="card-h"><h2>Saldo previsto</h2>
              <div className="chips">{[7, 15, 30, 60, 90].map((d) => <Link key={d} href={`/?dias=${d}`} className={"chip " + (d === dias ? "on" : "")}>{d}d</Link>)}</div></div>
            <div className="sumtbl">
              <div className="r"><span>Recebimentos futuros</span><b className="num pos">{brl(recF)}</b></div>
              <div className="r"><span>Pagamentos futuros</span><b className="num neg">−{brl(pagF)}</b></div>
              <div className="r"><span>Saldo previsto em {dataBR(ate)}</span><b className={"num " + (saldo + recF - pagF < 0 ? "neg" : "")} style={{ font: "700 18px var(--f-display)" }}>{brl(saldo + recF - pagF)}</b></div>
            </div>
            <Area pontos={proj} rotulos={rot} />
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Projeção dos próximos 30 dias. Não inclui títulos já atrasados.</p>
          </div>
        </div>

        <div className="grid k3">
          {(["receber", "pagar"] as const).map((tp) => (
            <div className="card" key={tp}>
              <div className="card-h"><h2>Contas a {tp}</h2><Link href={"/" + tp} className="link">Ver todas</Link></div>
              <div className="sumtbl">{bloco(tp).map(([l, v, atr]) => (
                <div className="r" key={l}><span style={{ fontWeight: 500 }}>{l}</span><span className={"num " + (tp === "receber" ? (atr && v ? "neg" : "pos") : "neg")}>{tp === "pagar" && v ? "−" : ""}{brl(v)}</span></div>
              ))}</div>
            </div>
          ))}
          <div className="card span-all">
            <div className="card-h"><h2>Agenda dos próximos 10 dias</h2></div>
            {agenda.length ? <div className="sumtbl">{agenda.map((t) => (
              <div className="r" key={t.id}><span style={{ minWidth: 0 }}><span className="muted num" style={{ fontSize: 12 }}>{dataBR(t.vencimento)}</span><br /><span style={{ fontWeight: 500 }}>{(t.nome_fantasia || t.razao_social || "").slice(0, 34)}</span></span><span className={"num " + (t.tipo === "receber" ? "pos" : "neg")} style={{ whiteSpace: "nowrap" }}>{t.tipo === "pagar" ? "−" : ""}{brl(t.saldo)}</span></div>
            ))}</div> : <p className="muted" style={{ margin: 0 }}>Nada vencendo nos próximos 10 dias.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h2>Entradas e saídas realizadas · {ano}</h2>
            <div className="legend"><span><i style={{ background: "var(--pos)" }} />Recebido</span><span><i style={{ background: "var(--neg)" }} />Pago</span><span><i style={{ background: "var(--brand)" }} />Geração de caixa líquida</span></div></div>
          <BarrasMes series={[{ nome: "Recebido", cor: "var(--pos)", valores: porMes("receber") }, { nome: "Pago", cor: "var(--neg)", valores: porMes("pagar") }]} linha={{ nome: "Geração de caixa líquida", cor: "var(--brand)", valores: gclMes }} />
        </div>
      </div>
    </>
  );
}
