import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";
import { brl } from "@/lib/format";
import { salvarCentro, excluirCentro } from "@/app/cadastros-acoes";

export default async function Centros({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { sb, empresaId, podeEditar } = await contexto();
  const ano = new Date().getFullYear();
  const [{ data: centros }, { data: tits }] = await Promise.all([
    sb.from("centros_custo").select("*").eq("empresa_id", empresaId).order("codigo", { nullsFirst: false }).order("nome"),
    sb.from("v_titulos").select("centro_custo_id,tipo,valor_original,desconto,acrescimo").eq("empresa_id", empresaId).not("centro_custo_id", "is", null).gte("data_emissao", `${ano}-01-01`).limit(10000),
  ]);
  const tot: Record<string, { rec: number; desp: number; n: number }> = {};
  for (const t of tits || []) {
    const k = t.centro_custo_id as string; const v = Number(t.valor_original) - Number(t.desconto) + Number(t.acrescimo);
    tot[k] ||= { rec: 0, desp: 0, n: 0 }; tot[k].n++; if (t.tipo === "receber") tot[k].rec += v; else tot[k].desp += v;
  }
  return (
    <>
      <Topo titulo="Centros de custo" />
      <div className="view">
        {erro && <div className="err">{erro}</div>}
        <p className="muted" style={{ margin: 0 }}>Use centros de custo para separar receitas e despesas por área, unidade, projeto ou cliente. Cada lançamento pode ter um centro, e a DRE pode ser filtrada por ele.</p>
        <div className="card">
          <div className="tbl"><table>
            <thead><tr><th>Código</th><th>Centro de custo</th><th className="r">Receitas {ano}</th><th className="r">Despesas {ano}</th><th className="r">Resultado</th><th>Situação</th><th className="r">Ações</th></tr></thead>
            <tbody>
              {(centros || []).map((c) => {
                const t = tot[c.id] || { rec: 0, desp: 0, n: 0 };
                return (
                  <tr key={c.id}>
                    <td className="mono">{c.codigo || "—"}</td>
                    <td><b style={{ fontWeight: 500 }}>{c.nome}</b><span className="sub">{t.n} lançamento(s) em {ano}</span></td>
                    <td className="r num pos">{brl(t.rec)}</td><td className="r num neg">{brl(t.desp)}</td>
                    <td className={"r num " + (t.rec - t.desp < 0 ? "neg" : "")}><b>{brl(t.rec - t.desp)}</b></td>
                    <td><span className={"pill " + (c.ativo ? "ok" : "off")}>{c.ativo ? "Ativo" : "Inativo"}</span></td>
                    <td className="r">{podeEditar && (
                      <details><summary className="btn sm">Editar</summary>
                        <form action={salvarCentro} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <input type="hidden" name="id" value={c.id} />
                          <input className="input" style={{ width: 90 }} name="codigo" defaultValue={c.codigo || ""} placeholder="Código" aria-label="Código" />
                          <input className="input" style={{ width: 200 }} name="nome" defaultValue={c.nome} required aria-label="Nome" />
                          <select name="ativo" defaultValue={c.ativo ? "sim" : "nao"} style={{ width: 100 }} aria-label="Situação"><option value="sim">Ativo</option><option value="nao">Inativo</option></select>
                          <button className="btn p sm">Salvar</button>
                        </form>
                        {!t.n && <form action={excluirCentro} style={{ marginTop: 6 }}><input type="hidden" name="id" value={c.id} /><button className="btn sm danger">Excluir</button></form>}
                      </details>
                    )}</td>
                  </tr>
                );
              })}
              {!(centros || []).length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 28 }}>Nenhum centro de custo cadastrado.</td></tr>}
            </tbody>
          </table></div>
          {podeEditar && (
            <form action={salvarCentro} className="form">
              <div className="field s1"><label htmlFor="codigo">Código</label><input id="codigo" className="input" name="codigo" placeholder="CC01" /></div>
              <div className="field s4"><label htmlFor="nome">Novo centro de custo</label><input id="nome" className="input" name="nome" placeholder="Ex.: Comercial, Operação, Unidade Centro" required /></div>
              <div className="s1" style={{ display: "flex", alignItems: "flex-end" }}><button className="btn p">Adicionar</button></div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
