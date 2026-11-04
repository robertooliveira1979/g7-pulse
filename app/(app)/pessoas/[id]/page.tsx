import { notFound } from "next/navigation";
import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";
import { salvarPessoa } from "@/app/acoes";

export default async function Pessoa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string; erro?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { sb, empresaId, podeEditar } = await contexto();
  let p: Record<string, any> = { ativo: true, e_cliente: sp.tipo !== "fornecedores", e_fornecedor: sp.tipo === "fornecedores" };
  let contatos: any[] = [];
  if (id !== "novo") {
    const { data } = await sb.from("pessoas").select("*").eq("id", id).eq("empresa_id", empresaId).single();
    if (!data) notFound();
    p = data;
    contatos = (await sb.from("contatos").select("*").eq("pessoa_id", id)).data || [];
  }
  const F = (k: string, label: string, cls = "s2", type = "text") => (
    <div className={"field " + cls}><label htmlFor={k}>{label}</label><input className="input" id={k} name={k} type={type} defaultValue={p[k] ?? ""} {...(k === "razao_social" ? { required: true } : {})} /></div>
  );
  const C = (k: string, label: string) => <label className="s2" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name={k} defaultChecked={!!p[k]} /> {label}</label>;
  return (
    <>
      <Topo titulo={id === "novo" ? "Novo cadastro" : p.nome_fantasia || p.razao_social} />
      <div className="view">
        <form action={salvarPessoa} className="card form" style={{ maxWidth: 900 }}>
          <input type="hidden" name="id" value={p.id || ""} />
          <div className="sec" style={{ borderTop: 0, paddingTop: 0 }}>Dados cadastrais</div>
          {F("cnpj_cpf", "CNPJ/CPF")}{F("razao_social", "Razão social", "s4")}{F("nome_fantasia", "Nome fantasia", "s3")}{F("segmento", "Segmento", "s3")}
          {F("ddd", "DDD")}{F("telefone", "Telefone")}{F("email", "E-mail", "s2", "email")}
          {F("inscricao_municipal", "Inscrição municipal")}{F("chave_pix", "Chave PIX", "s4")}
          {C("e_cliente", "É cliente")}{C("e_fornecedor", "É fornecedor")}{C("ativo", "Ativo")}
          <div className="sec">Endereço</div>
          {F("cep", "CEP")}{F("uf", "UF")}{F("cidade", "Cidade")}{F("logradouro", "Logradouro", "s4")}{F("numero", "Número")}{F("bairro", "Bairro", "s3")}{F("complemento", "Complemento", "s3")}
          {sp.erro && <div className="err s6">{sp.erro}</div>}
          {podeEditar && <div className="s6" style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn p">Salvar</button></div>}
        </form>
        {contatos.length > 0 && (
          <div className="card" style={{ maxWidth: 900 }}><h2>Contatos</h2><div className="tbl"><table>
            <thead><tr><th>Nome</th><th>Cargo</th><th>Telefone / e-mail</th><th>Recebe</th></tr></thead>
            <tbody>{contatos.map((c) => <tr key={c.id}><td>{c.nome}{c.principal && " · principal"}</td><td>{c.cargo}</td><td><span className="sub" style={{ color: "var(--fg)" }}>{c.telefone}</span><span className="sub">{c.email}</span></td><td>{[c.enviar_nfse && "NFS-e", c.enviar_boleto && "Boleto"].filter(Boolean).join(", ") || "—"}</td></tr>)}</tbody>
          </table></div></div>
        )}
      </div>
    </>
  );
}
