import Link from "next/link";
import Topo from "@/components/Topo";
import Icone from "@/components/Icone";
import { contexto } from "@/lib/empresa";
import { brl, dataBR, addDias } from "@/lib/format";
import { importarOFX, conciliar, conciliarSugestoes } from "@/app/conciliacao-acoes";

type Trn = { id: string; conta_id: string; fitid: string; data: string; valor: number; descricao: string | null; status: string; titulo_id: string | null };
type Tit = { id: string; tipo: string; vencimento: string; saldo: number; descricao: string | null; razao_social: string | null; nome_fantasia: string | null; categoria_nome: string };
type Bx = { id: string; data: string; valor: number; conta_id: string; titulos: { tipo: string; descricao: string | null; pessoas: { nome_fantasia: string | null; razao_social: string } | null } | null };
type Sug = { kind: "b" | "t"; ref: string; texto: string; dias: number };

const dif = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 864e5);
const palavras = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Z0-9]+/).filter((w) => w.length > 3);

export default async function Conciliacao({ searchParams }: { searchParams: Promise<{ st?: string; conta?: string; erro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const st = sp.st || "pendente";
  const { sb, empresaId, podeEditar } = await contexto();
  const { data: contas } = await sb.from("contas_bancarias").select("id,nome").eq("empresa_id", empresaId).eq("ativa", true).order("nome");
  let q = sb.from("extrato_transacoes").select("id,conta_id,fitid,data,valor,descricao,status,titulo_id").eq("empresa_id", empresaId).order("data", { ascending: st !== "pendente" ? false : true }).limit(400);
  if (st !== "todos") q = q.eq("status", st);
  if (sp.conta) q = q.eq("conta_id", sp.conta);
  const [{ data: trn }, { data: imps }, { data: contagem }] = await Promise.all([
    q,
    sb.from("extrato_importacoes").select("id,arquivo,conta_id,periodo_ini,periodo_fim,saldo_final,data_saldo,qtd_lidas,qtd_novas,criado_em").eq("empresa_id", empresaId).order("criado_em", { ascending: false }).limit(5),
    sb.from("extrato_transacoes").select("status").eq("empresa_id", empresaId).limit(10000),
  ]);
  const T = (trn || []) as Trn[];
  const cont = (s: string) => (contagem || []).filter((x) => s === "todos" || x.status === s).length;
  const nomeConta = Object.fromEntries((contas || []).map((c) => [c.id, c.nome]));

  // Dados para sugestões (só na aba de pendentes)
  const pend = T.filter((t) => t.status === "pendente");
  let abertos: Tit[] = [], baixas: Bx[] = [], cats: { id: string; codigo: string; nome: string }[] = [], pessoas: { id: string; razao_social: string; nome_fantasia: string | null; e_cliente: boolean; e_fornecedor: boolean }[] = [];
  const sug: Record<string, Sug | undefined> = {};
  if (pend.length) {
    const de = addDias(pend[0].data, -7), ate = addDias(pend[pend.length - 1].data, 7);
    const [a, b, usados, c, p] = await Promise.all([
      sb.from("v_titulos").select("id,tipo,vencimento,saldo,descricao,razao_social,nome_fantasia,categoria_nome").eq("empresa_id", empresaId).neq("status", "Quitado").order("vencimento").limit(3000),
      sb.from("baixas").select("id,data,valor,conta_id,titulos(tipo,descricao,pessoas(nome_fantasia,razao_social))").eq("empresa_id", empresaId).gte("data", de).lte("data", ate).limit(5000),
      sb.from("extrato_transacoes").select("baixa_id").eq("empresa_id", empresaId).not("baixa_id", "is", null).limit(10000),
      sb.from("categorias").select("id,codigo,nome").eq("empresa_id", empresaId).eq("nivel", 3).eq("ativa", true).order("codigo"),
      sb.from("pessoas").select("id,razao_social,nome_fantasia,e_cliente,e_fornecedor").eq("empresa_id", empresaId).eq("ativo", true).order("razao_social"),
    ]);
    abertos = (a.data || []) as Tit[];
    const jaUsadas = new Set((usados.data || []).map((x) => x.baixa_id));
    baixas = ((b.data || []) as unknown as Bx[]).filter((x) => !jaUsadas.has(x.id));
    cats = c.data || []; pessoas = p.data || [];
    const tomadas = new Set<string>();
    for (const t of pend) {
      const tipo = t.valor > 0 ? "receber" : "pagar", v = Math.abs(t.valor), pw = palavras(t.descricao || "");
      const bx = baixas.filter((x) => !tomadas.has("b" + x.id) && x.conta_id === t.conta_id && x.titulos?.tipo === tipo && Math.abs(Number(x.valor) - v) < 0.01 && dif(x.data, t.data) <= 5).sort((x, y) => dif(x.data, t.data) - dif(y.data, t.data))[0];
      if (bx) {
        tomadas.add("b" + bx.id);
        const pe = bx.titulos?.pessoas;
        sug[t.id] = { kind: "b", ref: bx.id, dias: dif(bx.data, t.data), texto: `Já baixado em ${dataBR(bx.data)} · ${pe?.nome_fantasia || pe?.razao_social || bx.titulos?.descricao || ""}` };
        continue;
      }
      const score = (x: Tit) => dif(x.vencimento, t.data) - (pw.some((w) => `${x.nome_fantasia} ${x.razao_social}`.toUpperCase().includes(w)) ? 5 : 0);
      const ti = abertos.filter((x) => !tomadas.has("t" + x.id) && x.tipo === tipo && Math.abs(Number(x.saldo) - v) < 0.01 && dif(x.vencimento, t.data) <= 10).sort((x, y) => score(x) - score(y))[0];
      if (ti) { tomadas.add("t" + ti.id); sug[t.id] = { kind: "t", ref: ti.id, dias: dif(ti.vencimento, t.data), texto: `${ti.nome_fantasia || ti.razao_social || ti.descricao} · vence ${dataBR(ti.vencimento)}` }; }
    }
  }
  const comSug = pend.filter((t) => sug[t.id]);
  const qs = new URLSearchParams({ st, ...(sp.conta ? { conta: sp.conta } : {}) }).toString();
  const ultima = imps?.[0];

  return (
    <>
      <Topo titulo="Conciliação bancária (OFX)" />
      <div className="view">
        {sp.erro && <div className="notice bad"><Icone n="alert" /><div>{sp.erro}</div></div>}
        {sp.ok && <div className="notice ok"><Icone n="check" /><div>{sp.ok}</div></div>}
        <div className="grid k3">
          <form action={importarOFX} className="card span-all" style={{ gridColumn: "span 2" }}>
            <div className="card-h"><h2>Importar extrato</h2></div>
            <div className="drop">
              <div className="form">
                <div className="field s2"><label htmlFor="conta_id">Conta do extrato</label><select id="conta_id" name="conta_id" required>{(contas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                <div className="field s4"><label htmlFor="arquivo">Arquivo OFX (exportado do internet banking)</label><input id="arquivo" className="input" type="file" name="arquivo" accept=".ofx,.OFX,application/x-ofx" required /></div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {podeEditar && <button className="btn p"><Icone n="upload" /> Importar e sugerir conciliações</button>}
                <span className="muted" style={{ fontSize: 12 }}>Lançamentos repetidos são ignorados pelo identificador do banco. Pode importar períodos sobrepostos.</span>
              </div>
            </div>
          </form>
          <div className="card">
            <div className="card-h"><h2>Última importação</h2></div>
            {ultima ? <div className="sumtbl" style={{ fontSize: 13 }}>
              <div className="r"><span>Arquivo</span><span className="muted" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ultima.arquivo}</span></div>
              <div className="r"><span>Conta · período</span><span>{nomeConta[ultima.conta_id]} · {dataBR(ultima.periodo_ini)} a {dataBR(ultima.periodo_fim)}</span></div>
              <div className="r"><span>Lidos / novos</span><span className="num">{ultima.qtd_lidas} / {ultima.qtd_novas}</span></div>
              {ultima.saldo_final !== null && <div className="r"><span>Saldo no banco em {dataBR(ultima.data_saldo)}</span><b className="num">{brl(ultima.saldo_final)}</b></div>}
            </div> : <p className="muted" style={{ margin: 0 }}>Nenhum extrato importado ainda.</p>}
          </div>
        </div>

        <div className="toolbar">
          <div className="chips">{[["pendente", "A conciliar"], ["conciliado", "Conciliados"], ["ignorado", "Ignorados"], ["todos", "Todos"]].map(([k, l]) => (
            <Link key={k} href={`/conciliacao?st=${k}${sp.conta ? "&conta=" + sp.conta : ""}`} className={"chip " + (st === k ? "on" : "")}>{l}<span className="n">{cont(k)}</span></Link>
          ))}</div>
          <span className="grow" />
          {st === "pendente" && comSug.length > 0 && podeEditar && (
            <form action={conciliarSugestoes}>
              <input type="hidden" name="pares" value={comSug.map((t) => `${t.id}:${sug[t.id]!.kind}:${sug[t.id]!.ref}`).join(",")} />
              <button className="btn p"><Icone n="check" /> Confirmar as {comSug.length} sugestões</button>
            </form>
          )}
        </div>

        <div className="tbl"><table>
          <thead><tr><th>Data</th><th>Lançamento do banco</th><th className="r">Valor</th><th>Sugestão do G7 Pulse</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {T.map((t) => {
              const s = sug[t.id], tipo = t.valor > 0 ? "receber" : "pagar", v = Math.abs(t.valor);
              const candidatos = abertos.filter((x) => x.tipo === tipo).sort((a, b) => Math.abs(Number(a.saldo) - v) - Math.abs(Number(b.saldo) - v)).slice(0, 25);
              const prefixos = tipo === "receber" ? ["01", "03"] : ["02", "04", "05"];
              return (
                <tr key={t.id}>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{dataBR(t.data)}<span className="sub">{nomeConta[t.conta_id]}</span></td>
                  <td style={{ minWidth: 220 }}><span style={{ fontWeight: 500 }}>{t.descricao}</span><span className="sub mono">{t.fitid}</span></td>
                  <td className={"r num " + (t.valor > 0 ? "pos" : "neg")}><b>{brl(t.valor)}</b></td>
                  <td style={{ minWidth: 220 }}>
                    {t.status === "conciliado" ? <span className="pill ok">Conciliado</span> : t.status === "ignorado" ? <span className="pill off">Ignorado</span> :
                      s ? <div className="match"><span className={"pill " + (s.kind === "b" ? "info" : "pend")}>{s.kind === "b" ? "Vincular à baixa existente" : "Baixar título em aberto"}</span><b>{s.texto}</b>{s.dias > 0 && <span className="muted">{s.dias.toFixed(0)} dia(s) de diferença</span>}</div>
                        : <span className="muted">Sem correspondência: escolha um título ou lance como novo.</span>}
                  </td>
                  <td className="r">
                    {podeEditar && (t.status === "pendente" ? (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {s && <form action={conciliar}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="q" value={qs} />
                          <input type="hidden" name="acao" value={s.kind === "b" ? "vincular_baixa" : "baixar"} /><input type="hidden" name={s.kind === "b" ? "baixa_id" : "titulo_id"} value={s.ref} />
                          <button className="btn p sm"><Icone n="check" /> Confirmar</button></form>}
                        <details className="baixa"><summary className="btn sm">Outras opções</summary>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8, minWidth: 320, textAlign: "left" }}>
                            <form action={conciliar} style={{ display: "flex", gap: 6 }}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="q" value={qs} /><input type="hidden" name="acao" value="baixar" />
                              <select name="titulo_id" aria-label="Título em aberto" defaultValue=""><option value="">Baixar um título em aberto…</option>{candidatos.map((x) => <option key={x.id} value={x.id}>{dataBR(x.vencimento)} · {(x.nome_fantasia || x.razao_social || x.descricao || "").slice(0, 28)} · {brl(x.saldo)}</option>)}</select>
                              <button className="btn sm">Baixar</button></form>
                            <form action={conciliar} style={{ display: "flex", flexDirection: "column", gap: 6 }}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="q" value={qs} /><input type="hidden" name="acao" value="lancar" />
                              <select name="categoria_id" aria-label="Categoria" defaultValue=""><option value="">Lançar como novo: categoria…</option>{cats.filter((c) => prefixos.some((p) => c.codigo.startsWith(p))).map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}</select>
                              <div style={{ display: "flex", gap: 6 }}><select name="pessoa_id" aria-label={tipo === "receber" ? "Cliente" : "Fornecedor"} defaultValue=""><option value="">{tipo === "receber" ? "Cliente" : "Fornecedor"} (opcional)</option>{pessoas.filter((p) => (tipo === "receber" ? p.e_cliente : p.e_fornecedor)).map((p) => <option key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</option>)}</select>
                                <button className="btn sm">Lançar e baixar</button></div></form>
                            <form action={conciliar}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="q" value={qs} /><input type="hidden" name="acao" value="ignorar" /><button className="btn sm ghost">Ignorar este lançamento</button></form>
                          </div>
                        </details>
                      </div>
                    ) : (
                      <form action={conciliar}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="q" value={qs} /><input type="hidden" name="acao" value="reabrir" /><button className="btn sm ghost">Reabrir</button></form>
                    ))}
                  </td>
                </tr>
              );
            })}
            {!T.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 32 }}>{st === "pendente" ? "Nada a conciliar. Importe um extrato OFX acima." : "Nenhum lançamento nesta aba."}</td></tr>}
          </tbody>
        </table></div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>Ao reabrir um lançamento conciliado, a baixa feita por ele continua no título. Estorne em Contas a pagar/receber se precisar desfazer.</p>
      </div>
    </>
  );
}
