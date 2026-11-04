/** Leitor de extratos OFX (SGML 1.x e XML 2.x), usado pelos bancos brasileiros. */
export type TransacaoOFX = { fitid: string; data: string; valor: number; descricao: string; tipo: string };
export type ExtratoOFX = { banco?: string; conta?: string; inicio?: string; fim?: string; saldo?: number; dataSaldo?: string; transacoes: TransacaoOFX[] };

export function decodificar(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const cabecalho = new TextDecoder("latin1").decode(bytes.slice(0, 600)).toUpperCase();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (/CHARSET:\s*(1252|ISO-8859-1|8859-1)/.test(cabecalho) || utf8.includes("�")) return new TextDecoder("windows-1252").decode(bytes);
  return utf8;
}

const tag = (bloco: string, nome: string) => {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : undefined;
};
const data = (v?: string) => (v && /^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : undefined);
const numero = (v?: string) => {
  if (!v) return NaN;
  const s = v.trim();
  return Number(s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, ""));
};
const limpa = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export function lerOFX(texto: string): ExtratoOFX {
  const corpo = texto.slice(texto.search(/<OFX>/i) >= 0 ? texto.search(/<OFX>/i) : 0);
  const blocos = corpo.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const transacoes: TransacaoOFX[] = [];
  for (const b of blocos) {
    const valor = numero(tag(b, "TRNAMT"));
    const dt = data(tag(b, "DTPOSTED"));
    if (!dt || !isFinite(valor) || valor === 0) continue;
    const memo = tag(b, "MEMO") || "", nome = tag(b, "NAME") || "";
    const descricao = limpa([nome, memo].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ")) || "Sem descrição";
    const fitid = tag(b, "FITID") || `${dt}|${valor.toFixed(2)}|${descricao.slice(0, 40)}|${tag(b, "CHECKNUM") || ""}`;
    transacoes.push({ fitid, data: dt, valor: Math.round(valor * 100) / 100, descricao, tipo: tag(b, "TRNTYPE") || "" });
  }
  const bal = corpo.split(/<LEDGERBAL>/i)[1] || "";
  return {
    banco: tag(corpo, "BANKID") || tag(corpo, "ORG"),
    conta: [tag(corpo, "BRANCHID"), tag(corpo, "ACCTID")].filter(Boolean).join(" / "),
    inicio: data(tag(corpo, "DTSTART")),
    fim: data(tag(corpo, "DTEND")),
    saldo: bal ? numero(tag(bal, "BALAMT")) : undefined,
    dataSaldo: bal ? data(tag(bal, "DTASOF")) : undefined,
    transacoes,
  };
}
