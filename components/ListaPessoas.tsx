import Link from "next/link";
import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";

export default async function ListaPessoas({ tipo, q }: { tipo: "clientes" | "fornecedores"; q?: string }) {
  const { sb, empresaId, podeEditar } = await contexto();
  let qr = sb.from("pessoas").select("id,razao_social,nome_fantasia,cnpj_cpf,email,ddd,telefone,cidade,uf,ativo").eq("empresa_id", empresaId).eq(tipo === "clientes" ? "e_cliente" : "e_fornecedor", true).order("razao_social");
  if (q) { const s = q.replace(/[%,()]/g, " "); qr = qr.or(`razao_social.ilike.%${s}%,nome_fantasia.ilike.%${s}%,cnpj_cpf.ilike.%${s}%,cidade.ilike.%${s}%`); }
  const { data } = await qr;
  const nome = tipo === "clientes" ? "cliente" : "fornecedor";
  return (
    <>
      <Topo titulo={tipo === "clientes" ? "Clientes" : "Fornecedores"}>{podeEditar && <Link className="btn p" href={`/pessoas/novo?tipo=${tipo}`}>+ Novo {nome}</Link>}</Topo>
      <div className="view">
        <form className="toolbar" action={"/" + tipo}><input className="input" style={{ flex: 1 }} name="q" defaultValue={q} placeholder="Buscar por nome, CNPJ/CPF ou cidade…" aria-label="Buscar" /><button className="btn">Buscar</button></form>
        <div className="tbl"><table>
          <thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>Contato</th><th>Cidade</th><th>Status</th></tr></thead>
          <tbody>{(data || []).map((p) => (
            <tr key={p.id}>
              <td><Link href={`/pessoas/${p.id}`} style={{ color: "var(--fg)", fontWeight: 500 }}>{p.nome_fantasia || p.razao_social}</Link><span className="sub">{p.razao_social}</span></td>
              <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{p.cnpj_cpf || "—"}</td>
              <td><span className="sub" style={{ color: "var(--fg)" }}>{p.email || "—"}</span><span className="sub">{p.telefone ? `(${p.ddd}) ${p.telefone}` : ""}</span></td>
              <td>{p.cidade ? `${p.cidade}/${p.uf}` : "—"}</td>
              <td><span className={"pill " + (p.ativo ? "ok" : "late")}>{p.ativo ? "Ativo" : "Inativo"}</span></td>
            </tr>))}
            {!data?.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 32 }}>Nenhum {nome} cadastrado.</td></tr>}
          </tbody></table></div>
      </div>
    </>
  );
}
