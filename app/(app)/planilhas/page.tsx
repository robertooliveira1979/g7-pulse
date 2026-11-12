import Topo from "@/components/Topo";
import Icone from "@/components/Icone";
import ImportarForm from "@/components/ImportarForm";
import { contexto } from "@/lib/empresa";

export default async function Planilhas() {
  const { sb, empresaId, empresa, podeEditar } = await contexto();
  const [{ count: nPes }, { count: nTit }, { count: nBx }] = await Promise.all([
    sb.from("pessoas").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId),
    sb.from("titulos").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId),
    sb.from("baixas").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId),
  ]);
  const nome = empresa?.nome_fantasia || empresa?.razao_social;
  return (
    <>
      <Topo titulo="Importar e exportar" />
      <div className="view">
        <div className="grid k2">
          <div className="card">
            <div className="card-h"><h2>Exportar a base</h2></div>
            <p className="muted" style={{ margin: 0 }}>Baixa um Excel com toda a base de <b>{nome}</b>: clientes e fornecedores, lançamentos (com situação e saldo), baixas, transferências, contas com saldo, plano de contas e centros de custo.</p>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{nPes ?? 0} cadastros · {nTit ?? 0} lançamentos · {nBx ?? 0} baixas. As abas de cadastros e lançamentos usam o mesmo formato do modelo de importação.</p>
            <div><a className="btn p" href="/planilhas/exportar"><Icone n="download" /> Baixar base em Excel</a></div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Modelo de importação</h2></div>
            <p className="muted" style={{ margin: 0 }}>Planilha com as abas <b>Clientes e fornecedores</b> e <b>Lançamentos</b>, mais abas de consulta com o plano de contas, as contas e os centros de custo desta empresa.</p>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              <li>Baixe o modelo e preencha (pode colar dados de outro sistema).</li>
              <li>Envie abaixo e clique em <b>Validar</b>: o sistema aponta as linhas com problema.</li>
              <li>Com tudo certo, clique em <b>Importar</b>. É tudo ou nada: se der erro, nada é gravado.</li>
            </ol>
            <div><a className="btn" href="/planilhas/modelo"><Icone n="download" /> Baixar modelo (.xlsx)</a></div>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Importar em lote</h2><span className="muted" style={{ fontSize: 13 }}>Até 5.000 linhas por aba · .xlsx ou .csv</span></div>
          {podeEditar ? <ImportarForm /> : <p className="muted" style={{ margin: 0 }}>Seu perfil pode exportar, mas não importar dados.</p>}
        </div>
      </div>
    </>
  );
}
