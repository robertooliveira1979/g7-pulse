import { notFound } from "next/navigation";
import Topo from "@/components/Topo";
import { contexto } from "@/lib/empresa";
import { hojeSP } from "@/lib/format";
import { salvarTitulo, excluirTitulo } from "@/app/acoes";
import { emitirNfse, enviarNotaEmail } from "@/app/nfse-acoes";
import { brl, dataBR } from "@/lib/format";

const FORMAS = { receber: ["boleto", "pix", "cartao credito", "transferencia", "dinheiro", "outros"], pagar: ["pix", "boleto", "debito em conta", "cartao credito", "transferencia", "dinheiro", "outros"] };

export default async function Titulo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string; erro?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { sb, empresaId, podeEditar } = await contexto();
  let t: Record<string, any> = {};
  if (id !== "novo") {
    const { data } = await sb.from("titulos").select("*").eq("id", id).eq("empresa_id", empresaId).single();
    if (!data) notFound();
    t = data;
  }
  const tipo = (t.tipo || (sp.tipo === "pagar" ? "pagar" : "receber")) as "pagar" | "receber";
  const prefixos = tipo === "receber" ? ["01", "03"] : ["02", "04", "05"];
  const [{ data: cats }, { data: pessoas }, { data: contas }] = await Promise.all([
    sb.from("categorias").select("id,codigo,nome").eq("empresa_id", empresaId).eq("nivel", 3).eq("ativa", true).order("codigo"),
    sb.from("pessoas").select("id,razao_social,nome_fantasia").eq("empresa_id", empresaId).eq(tipo === "receber" ? "e_cliente" : "e_fornecedor", true).eq("ativo", true).order("razao_social"),
    sb.from("contas_bancarias").select("id,nome").eq("empresa_id", empresaId).eq("ativa", true).order("nome"),
  ]);
  const { data: notas } = t.id ? await sb.from("notas_fiscais").select("id,numero,serie,data_emissao,valor,status,ambiente,chave_acesso,erros,pdf_url_externo,xml_path,email_enviado_em,email_enviado_para,pessoas(email)").eq("titulo_id", t.id).order("criado_em", { ascending: false }) : { data: [] as any[] };
  const F = (k: string, label: string, cls = "s2", tipoInput = "text", extra: Record<string, any> = {}) => (
    <div className={"field " + cls}><label htmlFor={k}>{label}</label><input className="input" id={k} name={k} type={tipoInput} defaultValue={t[k] ?? extra.def ?? ""} {...(extra.req ? { required: true } : {})} /></div>
  );
  return (
    <>
      <Topo titulo={`${id === "novo" ? "Nova" : "Editar"} conta a ${tipo}`} />
      <div className="view">
        <form action={salvarTitulo} className="card form" style={{ maxWidth: 900 }}>
          <input type="hidden" name="id" value={t.id || ""} /><input type="hidden" name="tipo" value={tipo} />
          <div className="sec" style={{ borderTop: 0, paddingTop: 0 }}>Identificação</div>
          {F("descricao", "Descrição", "s4")}{F("documento", "Documento")}
          <div className="field s3"><label htmlFor="pessoa_id">{tipo === "receber" ? "Cliente" : "Fornecedor"}</label>
            <select id="pessoa_id" name="pessoa_id" defaultValue={t.pessoa_id || ""} required><option value="">Selecione…</option>{(pessoas || []).map((p) => <option key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</option>)}</select></div>
          <div className="field s3"><label htmlFor="categoria_id">Categoria</label>
            <select id="categoria_id" name="categoria_id" defaultValue={t.categoria_id || ""} required><option value="">Selecione…</option>{(cats || []).filter((c) => prefixos.some((p) => c.codigo.startsWith(p))).map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}</select></div>
          <div className="sec">Valores e datas</div>
          {F("valor_original", "Valor original (R$)", "s2", "text", { req: true })}{F("desconto", "Desconto", "s2")}{F("acrescimo", "Acréscimo", "s2")}
          {F("data_emissao", "Emissão (competência)", "s2", "date", { def: hojeSP() })}{F("vencimento", "Vencimento", "s2", "date", { req: true })}
          {id === "novo" ? F("repetir", "Repetir por (meses)", "s2", "number", { def: 1 }) : <div className="s2" />}
          <div className="field s3"><label htmlFor="conta_id">Conta</label><select id="conta_id" name="conta_id" defaultValue={t.conta_id || contas?.[0]?.id}>{(contas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div className="field s3"><label htmlFor="forma_cobranca">{tipo === "receber" ? "Tipo de cobrança" : "Forma de pagamento"}</label><select id="forma_cobranca" name="forma_cobranca" defaultValue={t.forma_cobranca || FORMAS[tipo][0]}>{FORMAS[tipo].map((f) => <option key={f}>{f}</option>)}</select></div>
          {tipo === "pagar" && <><div className="field s2"><label htmlFor="tipo_gasto">Tipo de gasto</label><select id="tipo_gasto" name="tipo_gasto" defaultValue={t.tipo_gasto || "Fixo"}><option>Fixo</option><option>Variável</option></select></div>{F("chave_pix", "Chave PIX / linha digitável", "s4")}</>}
          <div className="sec">Controle</div>
          {F("centro_custo", "Centro de custo")}{F(tipo === "pagar" ? "projeto" : "codigo_referencia", tipo === "pagar" ? "Projeto" : "Código de referência")}{F(tipo === "pagar" ? "ordem_compra" : "ordem_servico", tipo === "pagar" ? "Ordem de compra" : "Ordem de serviço")}
          <div className="field s6"><label htmlFor="observacoes">Observações</label><textarea id="observacoes" name="observacoes" defaultValue={t.observacoes || ""} /></div>
          {sp.erro && <div className="err s6">{sp.erro}</div>}
          {podeEditar && <div className="s6" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button className="btn p">Salvar</button></div>}
        </form>
        {tipo === "receber" && t.id && (
          <div className="card" id="nota" style={{ maxWidth: 900 }}>
            <div className="card-h"><h2>Nota fiscal de serviço</h2>
              {podeEditar && !(notas || []).some((n) => n.status === "autorizada" && n.ambiente === "producao") && (
                <form action={emitirNfse}><input type="hidden" name="titulo_id" value={t.id} /><button className="btn p">Emitir NFS-e</button></form>
              )}
            </div>
            {sp.ok && <div className="ok-msg" style={{ color: "var(--ok, #35C487)", marginBottom: 10 }}>{sp.ok}</div>}
            {(notas || []).length === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhuma nota emitida para esta conta.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(notas || []).map((n: any) => (
                  <div key={n.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <b>NFS-e {n.numero}</b>{n.ambiente === "producao_restrita" && <span className="muted"> · teste</span>}
                        <span className="muted"> · {dataBR(n.data_emissao)} · {brl(Number(n.valor || 0))} · {n.status}</span>
                      </div>
                      {n.status === "autorizada" && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <a className="btn" href={`/notas/${n.id}/pdf`} target="_blank" rel="noreferrer">Ver PDF</a>
                          {n.xml_path && <a className="btn" href={`/notas/${n.id}/xml`}>Baixar XML</a>}
                        </div>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6, wordBreak: "break-all" }}>
                      {n.chave_acesso ? <>Chave {n.chave_acesso}</> : (n.erros || []).map((e: any) => `${e.codigo} ${e.descricao}`).join(" · ")}
                    </div>
                    {n.status === "autorizada" && podeEditar && (
                      <form action={enviarNotaEmail} className="form" style={{ marginTop: 10 }}>
                        <input type="hidden" name="nota_id" value={n.id} /><input type="hidden" name="titulo_id" value={t.id} />
                        <div className="field s3"><label htmlFor={`para-${n.id}`}>Enviar por e-mail para</label><input id={`para-${n.id}`} className="input" name="para" defaultValue={n.email_enviado_para || n.pessoas?.email || ""} placeholder="cliente@empresa.com.br, outro@empresa.com.br" required /></div>
                        <div className="field s3"><label htmlFor={`msg-${n.id}`}>Mensagem (opcional)</label><input id={`msg-${n.id}`} className="input" name="mensagem" placeholder="Segue a nota referente a outubro." /></div>
                        <div className="s6" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                          <span className="muted" style={{ fontSize: 12 }}>{n.email_enviado_em ? `Último envio em ${dataBR(String(n.email_enviado_em).slice(0, 10))} para ${n.email_enviado_para}` : "PDF e XML vão anexados."}</span>
                          <button className="btn p">{n.email_enviado_em ? "Reenviar" : "Enviar nota"}</button>
                        </div>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {podeEditar && t.id && <form action={excluirTitulo}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="tipo" value={tipo} /><button className="btn danger">Excluir este título</button></form>}
      </div>
    </>
  );
}
