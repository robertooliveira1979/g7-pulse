import Link from "next/link";
import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";
import { brl, dataBR, hojeSP } from "@/lib/format";
import { baixarTitulo, estornarTitulo } from "@/app/acoes";

type Filtros = { st?: string; q?: string; mes?: string; erro?: string };

export default async function ListaTitulos({ tipo, filtros }: { tipo: "pagar" | "receber"; filtros: Filtros }) {
  const { sb, empresaId, podeEditar } = await contexto();
  const st = filtros.st || "abertos";
  let q = sb.from("v_titulos").select("*").eq("empresa_id", empresaId).eq("tipo", tipo);
  if (st === "abertos") q = q.neq("status", "Quitado");
  else if (st !== "todos") q = q.eq("status", st);
  if (filtros.mes) {
    const [y, m] = filtros.mes.split("-").map(Number);
    q = q.gte("vencimento", `${filtros.mes}-01`).lte("vencimento", new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
  }
  if (filtros.q) {
    const s = filtros.q.replace(/[%,()]/g, " ");
    q = q.or(`descricao.ilike.%${s}%,razao_social.ilike.%${s}%,nome_fantasia.ilike.%${s}%,categoria_nome.ilike.%${s}%,documento.ilike.%${s}%`);
  }
  q = st === "Quitado" ? q.order("data_quitacao", { ascending: false }) : q.order("vencimento");
  const [{ data }, { data: contas }] = await Promise.all([
    q.limit(500),
    sb.from("contas_bancarias").select("id,nome").eq("empresa_id", empresaId).eq("ativa", true).order("nome"),
  ]);
  const lista = data || [];
  const total = lista.reduce((s, t) => s + Number(t.status === "Quitado" ? t.valor_baixado : t.saldo), 0);
  const base = "/" + tipo;
  const link = (o: Partial<Filtros>) => {
    const p = new URLSearchParams({ ...(filtros.q ? { q: filtros.q } : {}), ...(filtros.mes ? { mes: filtros.mes } : {}), st, ...o } as Record<string, string>);
    return `${base}?${p}`;
  };
  const voltaAtual = link({});
  const nomeTipo = tipo === "receber" ? "receber" : "pagar";
  return (
    <>
      <Topo titulo={`Contas a ${nomeTipo}`}>
        {podeEditar && <Link className="btn p" href={`/titulos/novo?tipo=${tipo}`}>+ Nova conta a {nomeTipo}</Link>}
      </Topo>
      <div className="view">
        <form className="toolbar" action={base}>
          <input type="hidden" name="st" value={st} />
          <input className="input" style={{ flex: "1 1 240px", width: "auto" }} name="q" defaultValue={filtros.q} placeholder={`Buscar por ${tipo === "receber" ? "cliente" : "fornecedor"}, descrição, categoria…`} aria-label="Buscar" />
          <input className="input" style={{ width: "auto" }} type="month" name="mes" defaultValue={filtros.mes} aria-label="Mês de vencimento" />
          <button className="btn">Filtrar</button>
        </form>
        <div className="chips">
          {[["abertos", "Em aberto"], ["Atrasado", "Atrasados"], ["Pendente", "A vencer"], ["Quitado", tipo === "receber" ? "Recebidos" : "Pagos"], ["todos", "Todos"]].map(([k, l]) => (
            <Link key={k} href={link({ st: k })} className={"chip " + (st === k ? "on" : "")}>{l}</Link>
          ))}
        </div>
        {filtros.erro && <div className="err">{filtros.erro}</div>}
        <div className="tbl"><table>
          <thead><tr><th>Vencimento</th><th>{tipo === "receber" ? "Cliente" : "Fornecedor"} / descrição</th><th>Categoria</th><th>Forma</th><th className="r">Valor</th><th>Status</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.id}>
                <td className="num">{dataBR(t.vencimento)}{t.data_quitacao && <span className="sub">Baixa {dataBR(t.data_quitacao)}</span>}</td>
                <td style={{ minWidth: 220 }}><Link href={`/titulos/${t.id}`} style={{ color: "var(--fg)", fontWeight: 500 }}>{t.nome_fantasia || t.razao_social || "—"}</Link><span className="sub">{t.descricao || t.observacoes || "—"}</span></td>
                <td><span className="sub" style={{ color: "var(--fg)" }}>{t.categoria_nome}</span><span className="sub mono">{t.categoria_codigo}</span></td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{t.forma_cobranca}</td>
                <td className={"r num " + (tipo === "receber" ? "pos" : "neg")}><b>{brl(t.status === "Quitado" ? t.valor_baixado : t.saldo)}</b></td>
                <td><span className={"pill " + (t.status === "Quitado" ? "ok" : t.status === "Atrasado" ? "late" : "pend")}>{t.status === "Quitado" ? (tipo === "receber" ? "Recebido" : "Pago") : t.status}</span></td>
                <td className="r">{podeEditar && (t.status !== "Quitado" ? (
                  <details className="baixa"><summary className="btn sm">Baixar</summary>
                    <form action={baixarTitulo} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <input type="hidden" name="titulo_id" value={t.id} /><input type="hidden" name="volta" value={voltaAtual} />
                      <input className="input" style={{ width: 140 }} type="date" name="data" defaultValue={hojeSP()} aria-label="Data da baixa" />
                      <input className="input num" style={{ width: 110 }} name="valor" defaultValue={Number(t.saldo).toFixed(2)} aria-label="Valor" />
                      <select name="conta_id" defaultValue={t.conta_id || contas?.[0]?.id} style={{ width: 130 }} aria-label="Conta">{(contas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                      <button className="btn p sm">Confirmar</button>
                    </form>
                  </details>
                ) : (
                  <form action={estornarTitulo}><input type="hidden" name="titulo_id" value={t.id} /><input type="hidden" name="volta" value={voltaAtual} /><button className="btn sm">Estornar</button></form>
                ))}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 32 }}>Nenhum título com esses filtros.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={4}><b>{lista.length} títulos{lista.length === 500 ? " (primeiros 500)" : ""}</b></td><td className="r num"><b>{brl(total)}</b></td><td colSpan={2}></td></tr></tfoot>
        </table></div>
      </div>
    </>
  );
}
