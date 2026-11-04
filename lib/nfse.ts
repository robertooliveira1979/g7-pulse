import https from "node:https";
import crypto from "node:crypto";
import zlib from "node:zlib";
import forge from "node-forge";

/** NFS-e Nacional (Sefin) — layout DPS v1.01. XML gerado já na forma canônica (C14N) para a assinatura. */

const NS = "http://www.sped.fazenda.gov.br/nfse";
const DSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
export const SEFIN = {
  producao: "https://sefin.nfse.gov.br/SefinNacional",
  producao_restrita: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
} as const;
export type Ambiente = keyof typeof SEFIN;
export const ADN = {
  producao: "https://adn.nfse.gov.br",
  producao_restrita: "https://adn.producaorestrita.nfse.gov.br",
} as const;

export type DadosDPS = {
  ambiente: Ambiente;
  serie: string;
  numero: number;
  competencia: string; // AAAA-MM-DD
  municipioIbge: string; // emissor e local da prestação
  prestador: { cnpj: string; fone?: string | null; email?: string | null; opSimpNac: 1 | 2 | 3; regApTribSN?: 1 | 2 | 3 | null };
  tomador: { doc: string; nome: string; email?: string | null };
  servico: { cTribNac: string; descricao: string; cNBS?: string | null; municipioPrestacao?: string | null };
  valor: number;
  issRetido?: boolean;
  aliquota?: number | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const so = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
const el = (n: string, v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "" : `<${n}>${esc(String(v))}</${n}>`);
const limpa = (s: string, max: number) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Data-hora em -03:00, recuada 1 minuto (a Sefin rejeita dhEmi no futuro). */
export function dhEmiSP(d = new Date()) {
  const t = new Date(d.getTime() - 60_000 - 3 * 3600_000);
  return t.toISOString().slice(0, 19) + "-03:00";
}

export function idDPS(municipio: string, cnpj: string, serie: string, numero: number) {
  return "DPS" + municipio.padStart(7, "0") + "2" + so(cnpj).padStart(14, "0") + so(serie).padStart(5, "0") + String(numero).padStart(15, "0");
}

/** Monta o infDPS canônico (com o xmlns herdado declarado, como sai na C14N) */
export function montarInfDPS(d: DadosDPS) {
  const id = idDPS(d.municipioIbge, d.prestador.cnpj, d.serie, d.numero);
  const dhEmi = dhEmiSP();
  const comp = d.competencia > dhEmi.slice(0, 10) ? dhEmi.slice(0, 10) : d.competencia;
  const doc = so(d.tomador.doc);
  const p = d.prestador;
  // NT 009 (leiaute de 20/10/2026, já ativo na produção restrita): finNFSe obrigatório e xDescServ ao final do cServ
  const nt009 = d.ambiente === "producao_restrita";
  const corpo =
    el("tpAmb", d.ambiente === "producao" ? 1 : 2) + el("dhEmi", dhEmi) + el("verAplic", "G7Pulse_1.0") +
    el("serie", so(d.serie)) + el("nDPS", d.numero) + el("dCompet", comp) + el("tpEmit", 1) + (nt009 ? el("finNFSe", 0) : "") + el("cLocEmi", d.municipioIbge) +
    `<prest>${el("CNPJ", so(p.cnpj))}${el("fone", so(p.fone) || null)}${el("email", p.email)}` +
    `<regTrib>${el("opSimpNac", p.opSimpNac)}${p.opSimpNac === 3 ? el("regApTribSN", p.regApTribSN || 1) : ""}${el("regEspTrib", 0)}</regTrib></prest>` +
    `<toma>${doc.length === 11 ? el("CPF", doc) : el("CNPJ", doc)}${el("xNome", limpa(d.tomador.nome, 300))}${el("email", d.tomador.email?.trim() || null)}</toma>` +
    `<serv><locPrest>${el("cLocPrestacao", d.servico.municipioPrestacao || d.municipioIbge)}</locPrest>` +
    `<cServ>${el("cTribNac", so(d.servico.cTribNac))}${nt009 ? "" : el("xDescServ", limpa(d.servico.descricao, 2000))}${el("cNBS", so(d.servico.cNBS) || null)}${nt009 ? el("xDescServ", limpa(d.servico.descricao, 2000)) : ""}</cServ></serv>` +
    `<valores><vServPrest>${el("vServ", d.valor.toFixed(2))}</vServPrest><trib>` +
    `<tribMun>${el("tribISSQN", 1)}${el("tpRetISSQN", d.issRetido ? 2 : 1)}${d.aliquota ? el("pAliq", d.aliquota.toFixed(2)) : ""}</tribMun>` +
    `<tribFed><piscofins>${el("CST", "00")}${el("tpRetPisCofins", 0)}</piscofins></tribFed>` +
    `<totTrib>${p.opSimpNac === 1 ? `<indTotTrib>0</indTotTrib>` : el("pTotTribSN", "0.00")}</totTrib></trib></valores>`;
  return { id, dhEmi, canonico: `<infDPS xmlns="${NS}" Id="${id}">${corpo}</infDPS>`, corpo };
}

export type Credencial = { keyPem: string; certPem: string; certDerB64: string };

/** Abre o .pfx e separa chave e certificado do titular (e-CNPJ) */
export function abrirPfx(pfxB64: string, senha: string): Credencial {
  const asn1 = forge.asn1.fromDer(forge.util.decode64(pfxB64));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  const keys = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const key = keys[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!key) throw new Error("Certificado sem chave privada.");
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[];
  // o certificado do titular é o que tem a mesma chave pública da chave privada
  const cert = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(key.n)) || certs[0];
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return { keyPem: forge.pki.privateKeyToPem(key), certPem: forge.pki.certificateToPem(cert), certDerB64: forge.util.encode64(der) };
}

/** Assina (XMLDSig enveloped, C14N, RSA-SHA1 como os emissores homologados) e devolve o XML completo da DPS */
export function assinarDPS(inf: { id: string; canonico: string; corpo: string }, cred: Credencial) {
  const digest = crypto.createHash("sha1").update(inf.canonico, "utf8").digest("base64");
  const signedInfo =
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${DSIG}rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${inf.id}"><Transforms><Transform Algorithm="${DSIG}enveloped-signature"></Transform>` +
    `<Transform Algorithm="${C14N}"></Transform></Transforms><DigestMethod Algorithm="${DSIG}sha1"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue></Reference>`;
  const sig = crypto.createSign("RSA-SHA1").update(`<SignedInfo xmlns="${DSIG}">${signedInfo}</SignedInfo>`, "utf8").sign(cred.keyPem, "base64");
  return (
    `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NS}" versao="1.01"><infDPS Id="${inf.id}">${inf.corpo}</infDPS>` +
    `<Signature xmlns="${DSIG}"><SignedInfo>${signedInfo}</SignedInfo><SignatureValue>${sig}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${cred.certDerB64}</X509Certificate></X509Data></KeyInfo></Signature></DPS>`
  );
}

export type RespostaSefin = { status: number; corpo: any; texto: string; bruto: Buffer; tipo: string };

/** Requisição mTLS à Sefin Nacional */
export function sefin(ambiente: Ambiente, metodo: "GET" | "POST", caminho: string, cred: Credencial, json?: unknown): Promise<RespostaSefin> {
  return mtls(SEFIN[ambiente] + caminho, metodo, cred, json);
}

/** PDF oficial (DANFSe) gerado pelo Ambiente de Dados Nacional */
export async function baixarDanfse(ambiente: Ambiente, chave: string, cred: Credencial): Promise<Buffer> {
  let ultimo = "";
  for (let i = 0; i < 3; i++) {
    const r = await mtls(`${ADN[ambiente]}/danfse/${chave}`, "GET", cred, undefined, "application/pdf");
    if (r.status === 200 && r.bruto.subarray(0, 4).toString() === "%PDF") return r.bruto;
    ultimo = `${r.status} ${r.texto.slice(0, 200)}`;
    await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); // a nota leva alguns segundos para chegar ao ADN
  }
  throw new Error("DANFSe indisponível no momento (" + ultimo + ")");
}

function mtls(endereco: string, metodo: "GET" | "POST", cred: Credencial, json?: unknown, aceita = "application/json"): Promise<RespostaSefin> {
  const url = new URL(endereco);
  const body = json === undefined ? undefined : Buffer.from(JSON.stringify(json));
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: metodo, hostname: url.hostname, path: url.pathname + url.search, key: cred.keyPem, cert: cred.certPem,
        headers: { Accept: aceita, ...(body ? { "Content-Type": "application/json", "Content-Length": body.length } : {}) },
        timeout: 30_000,
      },
      (res) => {
        const parts: Buffer[] = [];
        res.on("data", (c) => parts.push(c));
        res.on("end", () => {
          const bruto = Buffer.concat(parts);
          const tipo = String(res.headers["content-type"] || "");
          const texto = tipo.includes("pdf") ? "" : bruto.toString("utf8");
          let corpo: any = null;
          try { corpo = JSON.parse(texto); } catch { /* não-JSON */ }
          resolve({ status: res.statusCode || 0, corpo, texto, bruto, tipo });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado falando com a Sefin Nacional")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export type ResultadoEmissao =
  | { ok: true; chave: string; numero: string; xml: string; idDps: string; alertas: any[] }
  | { ok: false; erros: { codigo: string; descricao: string; complemento?: string }[]; idDps: string; status: number };

export async function emitirDPS(d: DadosDPS, cred: Credencial): Promise<ResultadoEmissao> {
  const inf = montarInfDPS(d);
  const xml = assinarDPS(inf, cred);
  const r = await sefin(d.ambiente, "POST", "/nfse", cred, { dpsXmlGZipB64: zlib.gzipSync(Buffer.from(xml, "utf8")).toString("base64") });
  const c = r.corpo || {};
  if (r.status >= 200 && r.status < 300 && c.chaveAcesso) {
    const nfse = c.nfseXmlGZipB64 ? zlib.gunzipSync(Buffer.from(c.nfseXmlGZipB64, "base64")).toString("utf8") : "";
    const numero = nfse.match(/<nNFSe>(\d+)<\/nNFSe>/)?.[1] || "";
    return { ok: true, chave: c.chaveAcesso, numero, xml: nfse, idDps: inf.id, alertas: c.alertas || [] };
  }
  const lista = (c.erros || c.Erros || (c.erro ? [c.erro] : [])) as any[];
  const erros = lista.length
    ? lista.map((e) => ({ codigo: String(e.Codigo ?? e.codigo ?? ""), descricao: String(e.Descricao ?? e.descricao ?? ""), complemento: e.Complemento ?? e.complemento }))
    : [{ codigo: String(r.status), descricao: r.texto.slice(0, 500) || "Resposta vazia da Sefin" }];
  return { ok: false, erros, idDps: inf.id, status: r.status };
}
