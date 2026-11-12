import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";
import { brl, dataBR, hojeSP } from "@/lib/format";
import { salvarTransferencia, excluirTransferencia } from "@/app/cadastros-acoes";

export default async function Transferencias({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; mes?: string }> }) {
  const sp = await searchParams;
  const { sb, empresaId, podeEditar } = await contexto();
  let q = sb.from("transferencias").select("*").eq("empresa_id", empresaId).order("data", { ascending: false }).order("criado_em", { ascending: false });
  if (sp.mes) {
    const [y, m] = sp.mes.split("-").map(Number);
    q = q.gte("data", `${sp.mes}-01`).lte("data", new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
  }
  const [{ data: lista }, { data: contas }, { data: saldos }] = await Promise.all([
    q.limit(500),
    sb.from("contas_bancarias").select("id,nome,ativa").eq("empresa_id", empresaId).order("nome"),
    sb.from("v_saldo_contas").select("id,saldo").eq("empresa_id", empresaId),
  ]);
  const nome = Object.fromEntries((contas || []).map((c) => [c.id, c.nome]));
  const saldo = Object.fromEntries((saldos || []).map((s) => [s.id, Number(s.saldo)]));
  const ativas = (contas || []).filter((c) => c.ativa);
  const total = (lista || []).reduce((s, t) => s + Number(t.valor), 0);
  const Opcoes = () => <>{ativas.map((c) => <option key={c.id} value={c.id}>{c.nome} · saldo {brl(saldo[c.id] || 0)}</option>)}</>;
  return (
    <>
      <Topo titulo="Transferências entre contas" />
      <div className="view">
        {sp.erro && <div className="err">{sp.erro}</div>}
        {sp.ok && <div className="notice ok"><div>Transferência registrada. Os saldos das duas contas já foram atualizados.</div></div>}
        <p className="muted" style={{ margin: 0 }}>Movimentações entre contas da própria empresa (ex.: banco → caixa, conta → aplicação). Elas mudam o saldo de cada conta, mas não entram na DRE nem nas contas a pagar e receber.</p>
        {podeEditar && ativas.length >= 2 && (
          <form action={salvarTransferencia} className="card form">
            <div className="field s2"><label htmlFor="origem">Sai da conta</label><select id="origem" name="origem" required defaultValue=""><option value="" disabled>Selecione…</option><Opcoes /></select></div>
            <div className="field s2"><label htmlFor="destino">Entra na conta</label><select id="destino" name="destino" required defaultValue=""><option value="" disabled>Selecione…</option><Opcoes /></select></div>
            <div className="field s1"><label htmlFor="data">Data</label><input id="data" className="input" type="date" name="data" defaultValue={hojeSP()} required /></div>
            <div className="field s1"><label htmlFor="valor">Valor (R$)</label><input id="valor" className="input num" name="valor" placeholder="0,00" required /></div>
            <div className="field s4"><label htmlFor="descricao">Descrição (opcional)</label><input id="descricao" className="input" name="descricao" placeholder="Ex.: Reforço de caixa, aplicação CDB" /></div>
            <div className="s2" style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}><button className="btn p">Registrar transferência</button></div>
          </form>
        )}
        {ativas.length < 2 && <div className="notice"><div>Cadastre pelo menos duas contas ativas em <a href="/contas">Contas e caixas</a> para registrar transferências.</div></div>}
        <form className="toolbar" action="/transferencias">
          <input className="input" style={{ width: "auto" }} type="month" name="mes" defaultValue={sp.mes} aria-label="Mês" />
          <button className="btn">Filtrar</button>
        </form>
        <div className="tbl"><table>
          <thead><tr><th>Data</th><th>Sai de</th><th>Entra em</th><th>Descrição</th><th className="r">Valor</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {(lista || []).map((t) => (
              <tr key={t.id}>
                <td className="num">{dataBR(t.data)}</td>
                <td>{nome[t.conta_origem_id] || "—"}</td><td>{nome[t.conta_destino_id] || "—"}</td>
                <td className="muted">{t.descricao || "—"}</td>
                <td className="r num"><b>{brl(Number(t.valor))}</b></td>
                <td className="r">{podeEditar && (
                  <details><summary className="btn sm">Editar</summary>
                    <form action={salvarTransferencia} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <select name="origem" defaultValue={t.conta_origem_id} style={{ width: 150 }} aria-label="Origem">{(contas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                      <select name="destino" defaultValue={t.conta_destino_id} style={{ width: 150 }} aria-label="Destino">{(contas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                      <input className="input" type="date" name="data" defaultValue={t.data} style={{ width: 140 }} aria-label="Data" />
                      <input className="input num" name="valor" defaultValue={Number(t.valor).toFixed(2).replace(".", ",")} style={{ width: 110 }} aria-label="Valor" />
                      <input className="input" name="descricao" defaultValue={t.descricao || ""} style={{ width: 180 }} aria-label="Descrição" />
                      <button className="btn p sm">Salvar</button>
                    </form>
                    <form action={excluirTransferencia} style={{ marginTop: 6 }}><input type="hidden" name="id" value={t.id} /><button className="btn sm danger">Excluir transferência</button></form>
                  </details>
                )}</td>
              </tr>
            ))}
            {!(lista || []).length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 28 }}>Nenhuma transferência{sp.mes ? " neste mês" : ""}.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={4}><b>{(lista || []).length} transferência(s)</b></td><td className="r num"><b>{brl(total)}</b></td><td></td></tr></tfoot>
        </table></div>
      </div>
    </>
  );
}
