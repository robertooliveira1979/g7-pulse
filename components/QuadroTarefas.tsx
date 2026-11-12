"use client";
import { useMemo, useState, useTransition, useEffect } from "react";
import { criarTarefa, atualizarTarefa, excluirTarefa, criarColuna, atualizarColuna, excluirColuna, type Tarefa, type Coluna } from "@/app/tarefas-acoes";

type Membro = { id: string; nome: string };
const PRIOR: Record<Tarefa["prioridade"], { rot: string; cor: string }> = {
  baixa: { rot: "Baixa", cor: "#6B8A96" }, media: { rot: "Média", cor: "#3E8ED0" }, alta: { rot: "Alta", cor: "#EF7A43" }, urgente: { rot: "Urgente", cor: "#E5484D" },
};
const CORES = ["#5B7A86", "#3E8ED0", "#8B7CF6", "#F5B83D", "#EF7A43", "#E5484D", "#35C487", "#14B8A6", "#EC4899"];
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const dataBR = (d: string) => d.split("-").reverse().join("/");
/** ordem entre dois vizinhos (permite reordenar sem renumerar tudo) */
const entre = (a?: number, b?: number) => (a === undefined && b === undefined ? 1 : a === undefined ? b! - 1 : b === undefined ? a + 1 : (a + b) / 2);

export default function QuadroTarefas({ colunasIni, tarefasIni, membros, eu, hoje, visaoIni }: { colunasIni: Coluna[]; tarefasIni: Tarefa[]; membros: Membro[]; eu: string; hoje: string; visaoIni: "kanban" | "lista" }) {
  const [colunas, setColunas] = useState(colunasIni);
  const [tarefas, setTarefas] = useState(tarefasIni);
  const [visao, setVisao] = useState(visaoIni);
  const [busca, setBusca] = useState("");
  const [resp, setResp] = useState("");
  const [prio, setPrio] = useState("");
  const [aberta, setAberta] = useState<Tarefa | "nova" | null>(null);
  const [erro, setErro] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ col: string; antes: string | null } | null>(null);
  const [, start] = useTransition();
  const nome = useMemo(() => Object.fromEntries(membros.map((m) => [m.id, m.nome])), [membros]);

  useEffect(() => { setColunas(colunasIni); }, [colunasIni]);
  useEffect(() => { setTarefas(tarefasIni); }, [tarefasIni]);
  useEffect(() => { const u = new URL(location.href); u.searchParams.set("v", visao); history.replaceState(null, "", u); }, [visao]);

  const cols = [...colunas].sort((a, b) => a.ordem - b.ordem);
  const filtradas = tarefas.filter((t) =>
    (!busca || (t.titulo + " " + (t.descricao || "") + " " + t.etiquetas.join(" ")).toLowerCase().includes(busca.toLowerCase())) &&
    (!resp || (resp === "eu" ? t.responsavel_id === eu : resp === "ninguem" ? !t.responsavel_id : t.responsavel_id === resp)) &&
    (!prio || t.prioridade === prio));
  const daColuna = (id: string) => filtradas.filter((t) => t.coluna_id === id).sort((a, b) => a.ordem - b.ordem);
  const roda = <T,>(p: Promise<{ ok: true; dado: T } | { ok: false; erro: string }>, depois?: (d: T) => void, desfazer?: () => void) =>
    start(async () => { const r = await p; if (r.ok) { setErro(""); depois?.(r.dado); } else { setErro(r.erro); desfazer?.(); } });

  /* ---- tarefas ---- */
  const salvarLocal = (t: Tarefa) => setTarefas((xs) => (xs.some((x) => x.id === t.id) ? xs.map((x) => (x.id === t.id ? t : x)) : [...xs, t]));
  const mover = (id: string, col: string, antes: string | null) => {
    const t = tarefas.find((x) => x.id === id); if (!t) return;
    const lista = tarefas.filter((x) => x.coluna_id === col && x.id !== id).sort((a, b) => a.ordem - b.ordem);
    let i = antes ? lista.findIndex((x) => x.id === antes) : lista.length;
    if (i < 0) i = lista.length;
    const ordem = entre(lista[i - 1]?.ordem, lista[i]?.ordem);
    if (t.coluna_id === col && Math.abs(t.ordem - ordem) < 1e-9) return;
    const antigo = { ...t };
    const destinoConcl = cols.find((c) => c.id === col)?.concluida;
    salvarLocal({ ...t, coluna_id: col, ordem, concluida_em: destinoConcl ? t.concluida_em || new Date().toISOString() : null });
    roda(atualizarTarefa(id, { coluna_id: col, ordem }), salvarLocal, () => salvarLocal(antigo));
  };
  const rapida = (col: string, titulo: string) => {
    const lista = tarefas.filter((x) => x.coluna_id === col);
    const ordem = entre(Math.max(0, ...lista.map((x) => x.ordem)), undefined);
    roda(criarTarefa({ coluna_id: col, titulo, ordem }), salvarLocal);
  };

  /* ---- colunas ---- */
  const novaColuna = () => {
    const n = prompt("Nome da nova coluna:"); if (!n?.trim()) return;
    roda(criarColuna(n, CORES[colunas.length % CORES.length], entre(cols[cols.length - 1]?.ordem, undefined)), (c) => setColunas((xs) => [...xs, c]));
  };
  const editarColuna = (c: Coluna, p: Partial<Coluna>) => {
    const antiga = { ...c }; setColunas((xs) => xs.map((x) => (x.id === c.id ? { ...x, ...p } : x)));
    roda(atualizarColuna(c.id, p), (n) => { setColunas((xs) => xs.map((x) => (x.id === n.id ? n : x))); if (p.concluida !== undefined) setTarefas((ts) => ts.map((t) => (t.coluna_id === c.id ? { ...t, concluida_em: p.concluida ? t.concluida_em || new Date().toISOString() : null } : t))); },
      () => setColunas((xs) => xs.map((x) => (x.id === c.id ? antiga : x))));
  };
  const moverColuna = (c: Coluna, dir: -1 | 1) => {
    const i = cols.findIndex((x) => x.id === c.id); const j = i + dir; if (j < 0 || j >= cols.length) return;
    const viz = cols[j], alem = cols[j + dir];
    editarColuna(c, { ordem: dir > 0 ? entre(viz.ordem, alem?.ordem) : entre(alem?.ordem, viz.ordem) });
  };
  const apagarColuna = (c: Coluna) => {
    const n = tarefas.filter((t) => t.coluna_id === c.id).length;
    const outras = cols.filter((x) => x.id !== c.id);
    if (!outras.length) return setErro("O quadro precisa ter pelo menos uma coluna.");
    let destino: string | null = null;
    if (n) {
      const op = prompt(`A coluna "${c.nome}" tem ${n} tarefa(s). Para qual coluna movê-las?\n` + outras.map((o, i) => `${i + 1}. ${o.nome}`).join("\n"), "1");
      const k = Number(op) - 1; if (!(k >= 0 && k < outras.length)) return;
      destino = outras[k].id;
    } else if (!confirm(`Excluir a coluna "${c.nome}"?`)) return;
    roda(excluirColuna(c.id, destino), () => { setColunas((xs) => xs.filter((x) => x.id !== c.id)); if (destino) setTarefas((ts) => ts.map((t) => (t.coluna_id === c.id ? { ...t, coluna_id: destino! } : t))); });
  };

  const total = tarefas.length, feitas = tarefas.filter((t) => t.concluida_em).length;
  const atrasadas = tarefas.filter((t) => !t.concluida_em && t.prazo && t.prazo < hoje).length;

  return (
    <div className="tq">
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <div className="seg" role="tablist" aria-label="Visualização">
          <button className={visao === "kanban" ? "on" : ""} onClick={() => setVisao("kanban")}>Kanban</button>
          <button className={visao === "lista" ? "on" : ""} onClick={() => setVisao("lista")}>Lista</button>
        </div>
        <input className="input" style={{ width: 220 }} placeholder="Buscar tarefa ou etiqueta" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <select style={{ width: "auto" }} value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável">
          <option value="">Todos os responsáveis</option><option value="eu">Minhas tarefas</option><option value="ninguem">Sem responsável</option>
          {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <select style={{ width: "auto" }} value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Prioridade">
          <option value="">Todas as prioridades</option>{Object.entries(PRIOR).map(([k, v]) => <option key={k} value={k}>{v.rot}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 13, marginLeft: "auto" }}>{total} tarefas · {feitas} concluídas{atrasadas ? <> · <b className="neg">{atrasadas} atrasada(s)</b></> : null}</span>
        <button className="btn p" onClick={() => setAberta("nova")}>+ Nova tarefa</button>
      </div>
      {erro && <div className="notice bad" style={{ marginTop: 10 }}><div>{erro}</div></div>}

      {visao === "kanban" ? (
        <div className="kb">
          {cols.map((c, ci) => {
            const ts = daColuna(c.id);
            return (
              <section key={c.id} className={"kb-col" + (alvo?.col === c.id ? " alvo" : "")}
                onDragOver={(e) => { if (!arrastando) return; e.preventDefault();
                  const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-tid]")].filter((el) => el.dataset.tid !== arrastando);
                  const prox = cards.find((el) => { const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
                  setAlvo({ col: c.id, antes: prox?.dataset.tid || null }); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a?.col === c.id ? null : a)); }}
                onDrop={(e) => { e.preventDefault(); if (arrastando && alvo) mover(arrastando, alvo.col, alvo.antes); setArrastando(null); setAlvo(null); }}>
                <header className="kb-h">
                  <span className="kb-dot" style={{ background: c.cor }} />
                  <input className="kb-nome" defaultValue={c.nome} key={c.nome} aria-label="Nome da coluna"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nome) editarColuna(c, { nome: v }); else e.target.value = c.nome; }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { (e.target as HTMLInputElement).value = c.nome; (e.target as HTMLInputElement).blur(); } }} />
                  <span className="kb-n">{ts.length}</span>
                  <details className="kb-menu">
                    <summary aria-label="Opções da coluna">⋯</summary>
                    <div className="kb-pop">
                      <div className="kb-cores">{CORES.map((k) => <button key={k} aria-label={"Cor " + k} style={{ background: k, outline: k === c.cor ? "2px solid var(--fg)" : "none" }} onClick={() => editarColuna(c, { cor: k })} />)}</div>
                      <label className="kb-chk"><input type="checkbox" checked={c.concluida} onChange={(e) => editarColuna(c, { concluida: e.target.checked })} /> Tarefas aqui contam como concluídas</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn sm" disabled={ci === 0} onClick={() => moverColuna(c, -1)}>← Mover</button>
                        <button className="btn sm" disabled={ci === cols.length - 1} onClick={() => moverColuna(c, 1)}>Mover →</button>
                      </div>
                      <button className="btn sm danger" onClick={() => apagarColuna(c)}>Excluir coluna</button>
                    </div>
                  </details>
                </header>
                <div className="kb-lista">
                  {ts.map((t) => (
                    <div key={t.id}>
                      {alvo?.col === c.id && alvo.antes === t.id && <div className="kb-marca" />}
                      <Cartao t={t} nome={nome} hoje={hoje} arrastando={arrastando === t.id}
                        onDragStart={() => setArrastando(t.id)} onDragEnd={() => { setArrastando(null); setAlvo(null); }} onAbrir={() => setAberta(t)} />
                    </div>
                  ))}
                  {alvo?.col === c.id && alvo.antes === null && <div className="kb-marca" />}
                </div>
                <AddRapida onAdd={(titulo) => rapida(c.id, titulo)} />
              </section>
            );
          })}
          <button className="kb-nova" onClick={novaColuna}>+ Adicionar coluna</button>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          <div className="tbl"><table>
            <thead><tr><th>Tarefa</th><th>Status</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th></tr></thead>
            {cols.map((c) => {
              const ts = daColuna(c.id);
              return (
                <tbody key={c.id}>
                  <tr className="tq-grupo"><td colSpan={5}><span className="kb-dot" style={{ background: c.cor }} /> <b>{c.nome}</b> <span className="muted">· {ts.length}</span></td></tr>
                  {ts.map((t) => (
                    <tr key={t.id} className="tq-linha">
                      <td style={{ minWidth: 260 }}><button className="tq-tit" onClick={() => setAberta(t)}>
                        <span className={t.concluida_em ? "feita" : ""}>{t.titulo}</span></button>
                        {t.etiquetas.length > 0 && <span className="sub">{t.etiquetas.map((e) => "#" + e).join("  ")}</span>}</td>
                      <td><select value={t.coluna_id} onChange={(e) => mover(t.id, e.target.value, null)} aria-label="Status" style={{ width: "auto" }}>{cols.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></td>
                      <td>{t.responsavel_id ? <span className="av-l"><span className="av">{iniciais(nome[t.responsavel_id] || "?")}</span>{nome[t.responsavel_id] || "—"}</span> : <span className="muted">—</span>}</td>
                      <td className={"num " + (!t.concluida_em && t.prazo && t.prazo < hoje ? "neg" : "")}>{t.prazo ? dataBR(t.prazo) : <span className="muted">—</span>}</td>
                      <td><span className="tq-prio" style={{ color: PRIOR[t.prioridade].cor }}>{PRIOR[t.prioridade].rot}</span></td>
                    </tr>
                  ))}
                  {!ts.length && <tr><td colSpan={5} className="muted" style={{ fontSize: 13 }}>Nenhuma tarefa.</td></tr>}
                </tbody>
              );
            })}
          </table></div>
        </div>
      )}

      {aberta && (
        <Editor tarefa={aberta === "nova" ? null : aberta} cols={cols} membros={membros} eu={eu}
          onFechar={() => setAberta(null)}
          onSalvar={(d) => {
            if (aberta === "nova") {
              const lista = tarefas.filter((x) => x.coluna_id === d.coluna_id);
              roda(criarTarefa({ ...d, ordem: entre(Math.max(0, ...lista.map((x) => x.ordem)), undefined) }), (t) => { salvarLocal(t); setAberta(null); });
            } else {
              const mudouCol = d.coluna_id !== aberta.coluna_id;
              const ordem = mudouCol ? entre(Math.max(0, ...tarefas.filter((x) => x.coluna_id === d.coluna_id).map((x) => x.ordem)), undefined) : aberta.ordem;
              roda(atualizarTarefa(aberta.id, { ...d, ordem }), (t) => { salvarLocal(t); setAberta(null); });
            }
          }}
          onExcluir={aberta === "nova" ? undefined : () => { if (!confirm("Excluir esta tarefa?")) return; const id = aberta.id; roda(excluirTarefa(id), () => { setTarefas((xs) => xs.filter((x) => x.id !== id)); setAberta(null); }); }} />
      )}
    </div>
  );
}

function Cartao({ t, nome, hoje, arrastando, onDragStart, onDragEnd, onAbrir }: { t: Tarefa; nome: Record<string, string>; hoje: string; arrastando: boolean; onDragStart: () => void; onDragEnd: () => void; onAbrir: () => void }) {
  const atras = !t.concluida_em && t.prazo && t.prazo < hoje;
  return (
    <article className={"kb-card" + (arrastando ? " fantasma" : "")} data-tid={t.id} draggable tabIndex={0} role="button" aria-label={t.titulo}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); onDragStart(); }} onDragEnd={onDragEnd}
      onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}>
      <div className="kb-tit"><span className={t.concluida_em ? "feita" : ""}>{t.titulo}</span></div>
      {t.etiquetas.length > 0 && <div className="kb-tags">{t.etiquetas.map((e) => <span key={e}>{e}</span>)}</div>}
      <div className="kb-meta">
        <span className="tq-prio" style={{ color: PRIOR[t.prioridade].cor }}>{PRIOR[t.prioridade].rot}</span>
        {t.prazo && <span className={atras ? "neg" : "muted"}>{atras ? "Atrasada · " : ""}{dataBR(t.prazo)}</span>}
        {t.descricao && <span className="muted" title="Tem descrição">≡</span>}
        {t.responsavel_id && <span className="av" title={nome[t.responsavel_id]} style={{ marginLeft: "auto" }}>{iniciais(nome[t.responsavel_id] || "?")}</span>}
      </div>
    </article>
  );
}

function AddRapida({ onAdd }: { onAdd: (t: string) => void }) {
  const [aberto, setAberto] = useState(false); const [v, setV] = useState("");
  if (!aberto) return <button className="kb-add" onClick={() => setAberto(true)}>+ Adicionar tarefa</button>;
  return (
    <form className="kb-addf" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(""); } }}>
      <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Título da tarefa e Enter" aria-label="Título da nova tarefa"
        onKeyDown={(e) => { if (e.key === "Escape") { setAberto(false); setV(""); } }} onBlur={() => { if (!v.trim()) setAberto(false); }} />
    </form>
  );
}

type Dados = { titulo: string; descricao: string | null; coluna_id: string; responsavel_id: string | null; prazo: string | null; prioridade: Tarefa["prioridade"]; etiquetas: string[] };
function Editor({ tarefa, cols, membros, eu, onFechar, onSalvar, onExcluir }: { tarefa: Tarefa | null; cols: Coluna[]; membros: Membro[]; eu: string; onFechar: () => void; onSalvar: (d: Dados) => void; onExcluir?: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onFechar]);
  return (
    <div className="tq-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <form className="tq-modal card" role="dialog" aria-label={tarefa ? "Editar tarefa" : "Nova tarefa"}
        onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
          onSalvar({ titulo: String(f.get("titulo") || ""), descricao: String(f.get("descricao") || "") || null, coluna_id: String(f.get("coluna_id")),
            responsavel_id: String(f.get("responsavel_id") || "") || null, prazo: String(f.get("prazo") || "") || null, prioridade: String(f.get("prioridade")) as Tarefa["prioridade"],
            etiquetas: String(f.get("etiquetas") || "").split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean) }); }}>
        <div className="card-h"><h2>{tarefa ? "Editar tarefa" : "Nova tarefa"}</h2><button type="button" className="btn sm" onClick={onFechar} aria-label="Fechar">✕</button></div>
        <div className="form" style={{ padding: 0, border: 0 }}>
          <div className="field s6"><label htmlFor="t-titulo">Título</label><input id="t-titulo" className="input" name="titulo" defaultValue={tarefa?.titulo} required autoFocus maxLength={300} /></div>
          <div className="field s6"><label htmlFor="t-desc">Descrição</label><textarea id="t-desc" className="input" name="descricao" rows={4} defaultValue={tarefa?.descricao || ""} placeholder="Detalhes, links, checklist…" /></div>
          <div className="field s3"><label htmlFor="t-col">Status</label><select id="t-col" name="coluna_id" defaultValue={tarefa?.coluna_id || cols[0]?.id}>{cols.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div className="field s3"><label htmlFor="t-resp">Responsável</label><select id="t-resp" name="responsavel_id" defaultValue={tarefa ? tarefa.responsavel_id || "" : eu}><option value="">— Ninguém —</option>{membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
          <div className="field s2"><label htmlFor="t-prazo">Prazo</label><input id="t-prazo" className="input" type="date" name="prazo" defaultValue={tarefa?.prazo || ""} /></div>
          <div className="field s2"><label htmlFor="t-prio">Prioridade</label><select id="t-prio" name="prioridade" defaultValue={tarefa?.prioridade || "media"}>{Object.entries(PRIOR).map(([k, v]) => <option key={k} value={k}>{v.rot}</option>)}</select></div>
          <div className="field s2"><label htmlFor="t-tags">Etiquetas</label><input id="t-tags" className="input" name="etiquetas" defaultValue={tarefa?.etiquetas.join(", ")} placeholder="fechamento, banco" /></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>{tarefa ? `Criada em ${new Date(tarefa.criado_em).toLocaleDateString("pt-BR")}${tarefa.concluida_em ? " · concluída em " + new Date(tarefa.concluida_em).toLocaleDateString("pt-BR") : ""}` : "Enter salva · Esc fecha"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {onExcluir && <button type="button" className="btn danger" onClick={onExcluir}>Excluir</button>}
            <button className="btn p">Salvar</button>
          </div>
        </div>
      </form>
    </div>
  );
}
