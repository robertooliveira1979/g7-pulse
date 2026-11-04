import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";
import { brl } from "@/lib/format";
import { salvarConta } from "@/app/acoes";

const TIPOS: [string, string][] = [["corrente", "Conta corrente"], ["poupanca", "Poupança"], ["aplicacao", "Aplicação"], ["caixa", "Caixa (dinheiro)"], ["cartao_credito", "Cartão de crédito"], ["gateway", "Carteira digital / gateway"]];

export default async function Contas({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { sb, empresaId, podeEditar } = await contexto();
  const [{ data: contas }, { data: saldos }] = await Promise.all([
    sb.from("contas_bancarias").select("*").eq("empresa_id", empresaId).order("nome"),
    sb.from("v_saldo_contas").select("id,entradas,saidas,saldo").eq("empresa_id", empresaId),
  ]);
  const S = Object.fromEntries((saldos || []).map((s) => [s.id, s]));
  const Form = ({ c }: { c?: Record<string, any> }) => (
    <form action={salvarConta} className="form">
      <input type="hidden" name="id" value={c?.id || ""} />
      <div className="field s3"><label>Nome</label><input className="input" name="nome" defaultValue={c?.nome} required /></div>
      <div className="field s3"><label>Tipo</label><select name="tipo" defaultValue={c?.tipo || "corrente"}>{TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="field s2"><label>Banco</label><input className="input" name="banco" defaultValue={c?.banco || ""} /></div>
      <div className="field s2"><label>Agência</label><input className="input" name="agencia" defaultValue={c?.agencia || ""} /></div>
      <div className="field s2"><label>Conta / DV</label><div style={{ display: "flex", gap: 6 }}><input className="input" name="numero" defaultValue={c?.numero || ""} /><input className="input" style={{ width: 60 }} name="dv" defaultValue={c?.dv || ""} /></div></div>
      <div className="field s2"><label>Tipo de pessoa</label><select name="tipo_pessoa" defaultValue={c?.tipo_pessoa || "PJ"}><option>PJ</option><option>PF</option></select></div>
      <div className="field s2"><label>Saldo inicial (R$)</label><input className="input num" name="saldo_inicial" defaultValue={c?.saldo_inicial ?? 0} /></div>
      <div className="field s2"><label>Data do saldo inicial</label><input className="input" type="date" name="data_saldo_inicial" defaultValue={c?.data_saldo_inicial || ""} /></div>
      <label className="s3" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="ativa" defaultChecked={c ? c.ativa : true} /> Conta ativa</label>
      {podeEditar && <div className="s3" style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn p">Salvar</button></div>}
    </form>
  );
  return (
    <>
      <Topo titulo="Contas e caixas" />
      <div className="view">
        {erro && <div className="err">{erro}</div>}
        <div className="grid k2">
          {(contas || []).map((c) => (
            <div className="card" key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><h2>{c.nome}</h2><span className={"pill " + (c.ativa ? "ok" : "late")}>{c.ativa ? "Ativa" : "Inativa"}</span></div>
              <div className="kpi"><span className={"v " + (Number(S[c.id]?.saldo) < 0 ? "neg" : "")}>{brl(S[c.id]?.saldo)}</span><span className="muted">Entradas {brl(S[c.id]?.entradas)} · Saídas {brl(S[c.id]?.saidas)}</span></div>
              <details><summary className="btn sm">Editar</summary><div style={{ marginTop: 12 }}><Form c={c} /></div></details>
            </div>
          ))}
          {podeEditar && <div className="card"><h2>Nova conta</h2><Form /></div>}
        </div>
      </div>
    </>
  );
}
