"use client";
import { useActionState, useRef, useState, startTransition } from "react";
import { importarPlanilha, type ResultadoImportacao } from "@/app/planilhas-acoes";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ImportarForm() {
  const [res, acao, pendente] = useActionState<ResultadoImportacao | null, FormData>(importarPlanilha, null);
  const form = useRef<HTMLFormElement>(null);
  const [trocou, setTrocou] = useState(false); // arquivo trocado depois da validação: exige validar de novo
  const enviar = (modo: "validar" | "importar") => {
    if (!form.current) return;
    if (modo === "validar") setTrocou(false);
    const fd = new FormData(form.current); fd.set("modo", modo);
    startTransition(() => acao(fd)); // envio manual: o arquivo continua selecionado entre "Validar" e "Importar"
  };
  const r = res?.resumo;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <form ref={form} className="form" onSubmit={(e) => { e.preventDefault(); enviar("validar"); }}>
        <div className="field s4"><label htmlFor="arquivo">Planilha preenchida (.xlsx ou .csv)</label>
          <input id="arquivo" className="input" type="file" name="arquivo" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required onChange={() => setTrocou(true)} /></div>
        <div className="field s2"><label htmlFor="duplicados">Lançamentos repetidos</label>
          <select id="duplicados" name="duplicados" defaultValue="sim"><option value="sim">Ignorar os que já existem</option><option value="nao">Importar mesmo assim</option></select></div>
        <div className="s6" style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          {pendente && <span className="muted" style={{ fontSize: 13 }}>Processando…</span>}
          <button className="btn" type="submit" disabled={pendente}>1. Validar planilha</button>
          <button className="btn p" type="button" disabled={pendente || trocou || !res?.ok || res.gravado} onClick={() => enviar("importar")}>2. Importar</button>
        </div>
      </form>

      {res && res.mensagem && (
        <div className={"notice " + (res.gravado ? "ok" : res.ok ? "" : "bad")}><div><b>{res.mensagem}</b></div></div>
      )}
      {r && (res?.ok || res?.gravado) && (
        <div className="grid k4">
          {[["Clientes/fornecedores novos", String(r.pessoasNovas), r.pessoasExistentes ? `${r.pessoasExistentes} já existiam` : ""],
            ["Contas a receber", String(r.receber), brl(r.valorReceber)], ["Contas a pagar", String(r.pagar), brl(r.valorPagar)],
            ["Baixas (já pagos)", String(r.baixas), [r.centrosNovos ? `${r.centrosNovos} centro(s) de custo novo(s)` : "", r.duplicados ? `${r.duplicados} repetido(s) ignorado(s)` : ""].filter(Boolean).join(" · ")]].map(([l, v, s]) => (
            <div key={l} className="card"><div className="muted" style={{ fontSize: 12 }}>{l}</div><div style={{ font: "700 22px var(--f-display)" }}>{v}</div><div className="muted" style={{ fontSize: 12 }}>{s}</div></div>
          ))}
        </div>
      )}
      {res && res.erros.length > 0 && (
        <div className="card"><div className="card-h"><h2>Linhas a corrigir</h2><span className="pill late">{res.erros.length}</span></div>
          <div className="tbl"><table><thead><tr><th>Aba</th><th>Linha</th><th>Problema</th></tr></thead>
            <tbody>{res.erros.map((e, i) => <tr key={i}><td>{e.aba}</td><td className="num">{e.linha || "—"}</td><td>{e.msg}</td></tr>)}</tbody></table></div></div>
      )}
      {res && res.avisos.length > 0 && (
        <details className="card"><summary style={{ cursor: "pointer" }}><b>Avisos</b> <span className="muted">({res.avisos.length}) — não impedem a importação</span></summary>
          <div className="tbl" style={{ marginTop: 10 }}><table><thead><tr><th>Aba</th><th>Linha</th><th>Aviso</th></tr></thead>
            <tbody>{res.avisos.map((e, i) => <tr key={i}><td>{e.aba}</td><td className="num">{e.linha || "—"}</td><td>{e.msg}</td></tr>)}</tbody></table></div></details>
      )}
    </div>
  );
}
