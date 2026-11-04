import Topo from "@/components/Topo";
import Icone from "@/components/Icone";
import { contexto } from "@/lib/empresa";
import { dataBR, hojeSP } from "@/lib/format";
import { enviarCertificado, salvarConfigNfse } from "@/app/integracoes-acoes";

export default async function Integracoes({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { sb, empresaId, papel } = await contexto();
  const pode = ["administrador", "operador_bpo"].includes(papel);
  const [{ data: emp }, { data: integ }] = await Promise.all([
    sb.from("empresas").select("razao_social,cnpj,inscricao_municipal,municipio,uf,municipio_ibge,regime_tributario").eq("id", empresaId).single(),
    sb.from("integracoes").select("nfse_ambiente,nfse_certificado_validade,nfse_certificado_titular,nfse_certificado_cnpj,nfse_certificado_enviado_em,nfse_codigo_tributacao_padrao,nfse_aliquota_iss_padrao,nfse_cnbs_padrao,nfse_ativo").eq("empresa_id", empresaId).maybeSingle(),
  ]);
  const temCert = !!integ?.nfse_certificado_validade;
  const dias = temCert ? Math.round((new Date(integ!.nfse_certificado_validade!).getTime() - new Date(hojeSP()).getTime()) / 864e5) : 0;
  return (
    <>
      <Topo titulo="Integrações" />
      <div className="view">
        {sp.erro && <div className="notice bad"><Icone n="alert" /><div>{sp.erro}</div></div>}
        {sp.ok && <div className="notice ok"><Icone n="check" /><div>{sp.ok}</div></div>}
        {!pode && <div className="notice"><Icone n="alert" /><div>Só administrador ou operador BPO altera integrações. Você está vendo em modo leitura.</div></div>}
        <div className="grid k2">
          <div className="card">
            <div className="card-h"><h2>NFS-e · Portal Nacional</h2>
              <span className={"pill " + (temCert ? (dias > 30 ? "ok" : "pend") : "off")}>{temCert ? (dias > 30 ? "Certificado válido" : `Vence em ${dias} dias`) : "Sem certificado"}</span></div>
            <p className="muted" style={{ margin: 0 }}>Emissão direta no Sistema Nacional NFS-e, autenticada com o certificado digital A1 (e-CNPJ) da empresa.</p>
            <div className="sumtbl" style={{ fontSize: 13 }}>
              <div className="r"><span>Prestador</span><span>{emp?.razao_social} · {emp?.cnpj}</span></div>
              <div className="r"><span>Município</span><span>{emp?.municipio}/{emp?.uf} · IBGE {emp?.municipio_ibge || "—"}</span></div>
              <div className="r"><span>Inscrição municipal</span><span className="mono">{emp?.inscricao_municipal || "—"}</span></div>
              {temCert && <>
                <div className="r"><span>Certificado</span><span>{integ!.nfse_certificado_titular} · {integ!.nfse_certificado_cnpj}</span></div>
                <div className="r"><span>Válido até</span><span className={dias <= 30 ? "neg" : ""}>{dataBR(integ!.nfse_certificado_validade)}</span></div>
                <div className="r"><span>Enviado em</span><span>{dataBR(integ!.nfse_certificado_enviado_em?.slice(0, 10))}</span></div>
              </>}
            </div>
            {pode && <form action={enviarCertificado} className="drop">
              <div className="form">
                <div className="field s4"><label htmlFor="certificado">{temCert ? "Substituir certificado A1 (.pfx / .p12)" : "Certificado A1 (.pfx / .p12)"}</label><input id="certificado" className="input" type="file" name="certificado" accept=".pfx,.p12,application/x-pkcs12" required /></div>
                <div className="field s2"><label htmlFor="senha">Senha do certificado</label><input id="senha" className="input" type="password" name="senha" autoComplete="off" required /></div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn p"><Icone n="upload" /> Validar e guardar no cofre</button>
                <span className="muted" style={{ fontSize: 12 }}>O arquivo e a senha ficam criptografados no Supabase Vault. Ninguém consegue vê-los pela tela depois de enviados.</span>
              </div>
            </form>}
          </div>
          <div className="card">
            <div className="card-h"><h2>Configuração da emissão</h2></div>
            <form action={salvarConfigNfse} className="form">
              <div className="field s3"><label htmlFor="ambiente">Ambiente</label><select id="ambiente" name="ambiente" defaultValue={integ?.nfse_ambiente || "producao_restrita"} disabled={!pode}><option value="producao_restrita">Produção restrita (testes)</option><option value="producao">Produção (notas válidas)</option></select></div>
              <div className="field s2"><label htmlFor="codigo">Código de tributação nacional</label><input id="codigo" className="input" name="codigo" placeholder="Ex.: 17.06.01" defaultValue={integ?.nfse_codigo_tributacao_padrao || ""} disabled={!pode} /></div>
              <div className="field s2"><label htmlFor="aliquota">Alíquota ISS (%)</label><input id="aliquota" className="input" name="aliquota" placeholder="Simples: deixe vazio" defaultValue={integ?.nfse_aliquota_iss_padrao ?? ""} disabled={!pode} /></div>
              <div className="field s2"><label htmlFor="cnbs">Código NBS</label><input id="cnbs" className="input" name="cnbs" placeholder="Ex.: 114061900" defaultValue={integ?.nfse_cnbs_padrao || ""} disabled={!pode} /></div>
              <div className="field s3"><label>Regime tributário</label><input className="input" value={emp?.regime_tributario || "—"} disabled /></div>
              {pode && <div className="s6"><button className="btn">Salvar configuração</button></div>}
            </form>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Enviar o certificado A1 e conferir titular e validade.</li>
              <li>Informar código de tributação e alíquota.</li>
              <li>Emitir nota de teste em produção restrita.</li>
              <li>Mudar para produção.</li>
            </ol>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Asaas · cobranças e assinaturas</h2><span className="pill off">Próxima etapa</span></div>
          <p className="muted" style={{ margin: 0 }}>Boleto, PIX e cartão a partir das contas a receber, com baixa automática pelo webhook.</p>
        </div>
      </div>
    </>
  );
}
