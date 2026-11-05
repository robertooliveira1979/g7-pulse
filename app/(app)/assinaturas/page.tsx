import { notFound } from "next/navigation";
import Topo from "@/components/Topo";
import Icone from "@/components/Icone";
import { contexto } from "@/lib/empresa";
import { brl, dataBR, hojeSP, addDias } from "@/lib/format";
import { EMPRESA_ASAAS, FORMAS, STATUS_COB } from "@/lib/asaas";
import { salvarConfigAsaas, salvarPlano, criarAssinatura, sincronizarAssinatura, cancelarAssinatura } from "@/app/assinaturas-acoes";

export const dynamic = "force-dynamic";

const PILL: Record<string, [string, string]> = { ativa: ["ok", "Ativa"], pendente: ["pend", "Aguardando 1º pagamento"], em_atraso: ["late", "Em atraso"], cancelada: ["off", "Cancelada"] };

export default async function Assinaturas({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { sb } = await contexto();
  const { data: sup } = await sb.rpc("e_superadmin");
  if (!sup) notFound();

  const [{ data: integ }, { data: token }, { data: planos }, { data: assin }, { data: empresas }, { data: cobs }, { data: eventos }, { data: dona }] = await Promise.all([
    sb.from("integracoes").select("asaas_ambiente,asaas_ativo,asaas_api_key_secret").eq("empresa_id", EMPRESA_ASAAS).maybeSingle(),
    sb.rpc("asaas_webhook_token", { p_empresa: EMPRESA_ASAAS }),
    sb.from("planos").select("*").order("valor_mensal"),
    sb.from("assinaturas").select("*, empresas(razao_social,nome_fantasia,cnpj), planos(nome)").order("criado_em", { ascending: false }),
    sb.from("empresas").select("id,razao_social,nome_fantasia,cnpj,assinatura_status").order("razao_social"),
    sb.from("assinatura_cobrancas").select("*").order("vencimento", { ascending: false }).limit(200),
    sb.from("asaas_eventos").select("id,evento,payment_id,recebido_em").order("recebido_em", { ascending: false }).limit(8),
    sb.from("empresas").select("razao_social,cnpj").eq("id", EMPRESA_ASAAS).maybeSingle(),
  ]);
  const conectado = !!integ?.asaas_api_key_secret;
  const lista = (assin || []) as any[];
  const ativas = lista.filter((a) => a.status === "ativa");
  const mrr = ativas.reduce((s, a) => s + Number(a.valor), 0);
  const atraso = lista.filter((a) => a.status === "em_atraso");
  const pend = lista.filter((a) => a.status === "pendente");
  const comAssinatura = new Set(lista.filter((a) => a.status !== "cancelada").map((a) => a.empresa_id));
  const livres = (empresas || []).filter((e) => !comAssinatura.has(e.id) && e.id !== EMPRESA_ASAAS);
  const cobsPor = (id: string) => (cobs || []).filter((c) => c.assinatura_id === id);
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://www.g7pulse.com.br";

  return (
    <>
      <Topo titulo="Assinaturas · Asaas" />
      <div className="view">
        {sp.erro && <div className="notice bad"><Icone n="alert" /><div>{sp.erro}</div></div>}
        {sp.ok && <div className="notice ok"><Icone n="check" /><div>{sp.ok}</div></div>}
        <div className="notice"><Icone n="alert" /><div>Área visível só para administradores do sistema. A conta Asaas é a de <b>{dona?.razao_social || "—"}</b> ({dona?.cnpj}).</div></div>

        <div className="grid k4">
          {[["MRR (ativas)", brl(mrr), `${ativas.length} assinaturas`, "wallet"], ["Em atraso", String(atraso.length), brl(atraso.reduce((s, a) => s + Number(a.valor), 0)) + "/mês", "alert"],
            ["Aguardando 1º pagamento", String(pend.length), brl(pend.reduce((s, a) => s + Number(a.valor), 0)) + "/mês", "pulse"], ["Empresas na base", String((empresas || []).length), `${livres.length} sem assinatura`, "users"]].map(([l, v, s, ic]) => (
            <div key={l} className="card kpi"><div className="ic" style={{ background: "color-mix(in srgb, var(--brand) 14%, transparent)", color: "var(--brand-text)" }}><Icone n={ic} /></div>
              <div><div className="l">{l}</div><div className="v">{v}</div><div className="s">{s}</div></div></div>
          ))}
        </div>

        <div className="card">
          <div className="card-h"><h2>Assinaturas</h2><span className="muted" style={{ fontSize: 13 }}>Situação atualizada pelo webhook do Asaas</span></div>
          <div className="tbl"><table>
            <thead><tr><th>Empresa</th><th>Plano</th><th className="r">Valor/mês</th><th>Forma</th><th>Próx. vencimento</th><th>Situação</th><th className="r">Ações</th></tr></thead>
            <tbody>
              {lista.map((a) => {
                const [cls, rot] = PILL[a.status] || ["off", a.status];
                const cs = cobsPor(a.id);
                return (
                  <tr key={a.id}>
                    <td style={{ minWidth: 220 }}><b style={{ fontWeight: 500 }}>{a.empresas?.nome_fantasia || a.empresas?.razao_social}</b><span className="sub mono">{a.empresas?.cnpj}</span>
                      {cs.length > 0 && <details style={{ marginTop: 4 }}><summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>{cs.length} cobrança(s)</summary>
                        <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                          {cs.map((c) => <span key={c.asaas_payment_id}>{dataBR(c.vencimento)} · {brl(Number(c.valor))} · {STATUS_COB[c.status] || c.status}{c.pago_em ? ` em ${dataBR(c.pago_em)}` : ""}{c.link && <> · <a href={c.link} target="_blank" rel="noreferrer">fatura</a></>}</span>)}
                        </div></details>}
                    </td>
                    <td>{a.planos?.nome || "—"}</td>
                    <td className="r num">{brl(Number(a.valor))}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{FORMAS[a.forma] || a.forma}</td>
                    <td className="num">{dataBR(a.proximo_vencimento)}</td>
                    <td><span className={"pill " + cls}>{rot}</span></td>
                    <td className="r" style={{ whiteSpace: "nowrap" }}>
                      {a.link_pagamento && a.status !== "cancelada" && <a className="btn sm p" href={a.link_pagamento} target="_blank" rel="noreferrer">Link de pagamento</a>}{" "}
                      <form action={sincronizarAssinatura} style={{ display: "inline" }}><input type="hidden" name="id" value={a.id} /><button className="btn sm">Atualizar</button></form>{" "}
                      {a.status !== "cancelada" && <details style={{ display: "inline-block" }}><summary className="btn sm danger">Cancelar</summary>
                        <form action={cancelarAssinatura} style={{ marginTop: 6 }}><input type="hidden" name="id" value={a.id} /><button className="btn sm danger">Confirmar cancelamento</button></form></details>}
                    </td>
                  </tr>
                );
              })}
              {!lista.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 28 }}>Nenhuma assinatura ainda.</td></tr>}
            </tbody>
          </table></div>
        </div>

        <div className="grid k2">
          <div className="card">
            <div className="card-h"><h2>Nova assinatura</h2></div>
            {!conectado ? <p className="muted" style={{ margin: 0 }}>Conecte o Asaas ao lado para criar assinaturas.</p> : !(planos || []).some((p) => p.ativo) ? <p className="muted" style={{ margin: 0 }}>Cadastre um plano primeiro.</p> : (
              <form action={criarAssinatura} className="form">
                <div className="field s6"><label htmlFor="empresa_id">Empresa cliente</label><select id="empresa_id" name="empresa_id" required><option value="">Selecione…</option>{livres.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social} · {e.cnpj}</option>)}</select></div>
                <div className="field s3"><label htmlFor="plano_id">Plano</label><select id="plano_id" name="plano_id" required>{(planos || []).filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome} · {brl(Number(p.valor_mensal))}</option>)}</select></div>
                <div className="field s3"><label htmlFor="valor">Valor mensal (vazio = do plano)</label><input id="valor" className="input num" name="valor" placeholder="Ex.: 149,90" /></div>
                <div className="field s3"><label htmlFor="forma">Forma de pagamento</label><select id="forma" name="forma" defaultValue="UNDEFINED">{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="field s3"><label htmlFor="vencimento">1º vencimento</label><input id="vencimento" className="input" type="date" name="vencimento" defaultValue={addDias(hojeSP(), 3)} min={hojeSP()} required /></div>
                <div className="field s6"><label htmlFor="email">E-mail de cobrança</label><input id="email" className="input" type="email" name="email" placeholder="financeiro@cliente.com.br" required /></div>
                <div className="s6" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span className="muted" style={{ fontSize: 12 }}>O Asaas gera a cobrança todo mês e envia o link ao cliente.</span>
                  <button className="btn p">Criar assinatura</button>
                </div>
              </form>
            )}
          </div>

          <div className="card">
            <div className="card-h"><h2>Conexão com o Asaas</h2><span className={"pill " + (conectado ? "ok" : "off")}>{conectado ? (integ?.asaas_ambiente === "producao" ? "Produção" : "Sandbox") : "Não conectado"}</span></div>
            <form action={salvarConfigAsaas} className="form">
              <div className="field s2"><label htmlFor="ambiente">Ambiente</label><select id="ambiente" name="ambiente" defaultValue={integ?.asaas_ambiente || "sandbox"}><option value="sandbox">Sandbox (testes)</option><option value="producao">Produção</option></select></div>
              <div className="field s4"><label htmlFor="api_key">Chave da API</label><input id="api_key" className="input mono" type="password" name="api_key" autoComplete="off" placeholder={conectado ? "•••••• guardada no cofre (preencha só para trocar)" : "$aact_..."} /></div>
              <div className="s6"><button className="btn">Salvar e testar conexão</button></div>
            </form>
            {token && <div className="sumtbl" style={{ fontSize: 13 }}>
              <div className="r"><span>URL do webhook</span><span className="mono" style={{ wordBreak: "break-all" }}>{site}/api/asaas/webhook</span></div>
              <div className="r"><span>Token de autenticação</span><span className="mono" style={{ wordBreak: "break-all" }}>{token as string}</span></div>
            </div>}
            {token && <p className="muted" style={{ margin: 0, fontSize: 12 }}>No Asaas: Integrações → Webhooks → Adicionar. Cole a URL e o token acima, versão da API v3, envio sequencial, e marque os eventos de <b>Cobranças</b> e <b>Assinaturas</b>.</p>}
            {(eventos || []).length > 0 && <div style={{ fontSize: 12 }}><div className="muted" style={{ marginBottom: 4 }}>Últimos eventos recebidos</div>
              {(eventos || []).map((e) => <div key={e.id} className="mono">{new Date(e.recebido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {e.evento}</div>)}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h2>Planos</h2></div>
          <div className="tbl"><table>
            <thead><tr><th>Plano</th><th>Descrição</th><th className="r">Valor/mês</th><th>Situação</th><th className="r">Editar</th></tr></thead>
            <tbody>
              {(planos || []).map((p) => (
                <tr key={p.id}>
                  <td><b style={{ fontWeight: 500 }}>{p.nome}</b></td><td className="muted">{p.descricao || "—"}</td>
                  <td className="r num">{brl(Number(p.valor_mensal))}</td><td><span className={"pill " + (p.ativo ? "ok" : "off")}>{p.ativo ? "Ativo" : "Inativo"}</span></td>
                  <td className="r"><details><summary className="btn sm">Editar</summary>
                    <form action={salvarPlano} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <input className="input" style={{ width: 140 }} name="nome" defaultValue={p.nome} aria-label="Nome" />
                      <input className="input" style={{ width: 200 }} name="descricao" defaultValue={p.descricao || ""} aria-label="Descrição" />
                      <input className="input num" style={{ width: 100 }} name="valor" defaultValue={Number(p.valor_mensal).toFixed(2).replace(".", ",")} aria-label="Valor" />
                      <select name="ativo" defaultValue={p.ativo ? "sim" : "nao"} style={{ width: 100 }} aria-label="Situação"><option value="sim">Ativo</option><option value="nao">Inativo</option></select>
                      <button className="btn p sm">Salvar</button>
                    </form></details></td>
                </tr>
              ))}
              {!(planos || []).length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>Nenhum plano cadastrado.</td></tr>}
            </tbody>
          </table></div>
          <form action={salvarPlano} className="form">
            <div className="field s2"><label htmlFor="p-nome">Novo plano</label><input id="p-nome" className="input" name="nome" placeholder="Ex.: Essencial" required /></div>
            <div className="field s2"><label htmlFor="p-desc">Descrição</label><input id="p-desc" className="input" name="descricao" placeholder="Até 1 empresa, 3 usuários" /></div>
            <div className="field s1"><label htmlFor="p-valor">Valor/mês</label><input id="p-valor" className="input num" name="valor" placeholder="99,90" required /></div>
            <div className="s1" style={{ display: "flex", alignItems: "flex-end" }}><button className="btn">Adicionar</button></div>
          </form>
        </div>
      </div>
    </>
  );
}
