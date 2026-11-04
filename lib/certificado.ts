import forge from "node-forge";

export type InfoCertificado = { titular: string; cnpj: string; validade: string; emissor: string };

/** Abre o .pfx com a senha e extrai titular, CNPJ (padrão ICP-Brasil) e validade. Lança erro legível. */
export function lerCertificado(pfx: Buffer, senha: string): InfoCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch (e) {
    const m = String((e as Error)?.message || e);
    if (/mac|password|invalid/i.test(m)) throw new Error("Senha incorreta para este certificado.");
    throw new Error("Não consegui abrir o arquivo. Envie o certificado A1 no formato .pfx ou .p12.");
  }
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[];
  const temChave = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []).length + (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []).length;
  if (!temChave) throw new Error("O arquivo não contém a chave privada. Exporte o certificado A1 completo (.pfx).");
  // ICP-Brasil: o CNPJ do titular vem no CN ("RAZAO SOCIAL:00000000000000") ou no SAN otherName 2.16.76.1.3.3.
  // Outros campos (OU) podem trazer o CNPJ da Autoridade de Registro, que NÃO é o titular.
  const cnpjDe = (c: forge.pki.Certificate) => {
    const cn = String(c.subject.getField("CN")?.value || "");
    const m = cn.match(/:\s*(\d{14})\s*$/) || cn.match(/(\d{14})/);
    if (m) return m[1];
    const san = c.getExtension("subjectAltName") as { value?: string } | null;
    if (san?.value) {
      try {
        const bin = forge.util.createBuffer(san.value).getBytes();
        const idx = bin.indexOf(forge.asn1.oidToDer("2.16.76.1.3.3").getBytes());
        if (idx >= 0) { const d = bin.slice(idx, idx + 40).match(/(\d{14})/); if (d) return d[1]; }
      } catch { /* segue sem SAN */ }
    }
    return "";
  };
  const cert = certs.find((c) => /:\s*\d{14}\s*$/.test(String(c.subject.getField("CN")?.value || ""))) || certs.find((c) => cnpjDe(c)) || certs[0];
  if (!cert) throw new Error("Nenhum certificado encontrado dentro do arquivo.");
  const cnpj = cnpjDe(cert);
  if (!cnpj) throw new Error("Este certificado não é um e-CNPJ (não encontrei o CNPJ do titular).");
  const cn = String(cert.subject.getField("CN")?.value || "");
  return {
    titular: cn.split(":")[0].trim() || cn,
    cnpj: cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"),
    validade: cert.validity.notAfter.toISOString().slice(0, 10),
    emissor: String(cert.issuer.getField("CN")?.value || ""),
  };
}
