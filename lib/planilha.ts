import zlib from "node:zlib";

/**
 * Leitura e escrita de planilhas .xlsx (e .csv) sem dependências externas.
 * Um .xlsx é um ZIP com XMLs; aqui há o mínimo para gerar e ler planilhas simples.
 */

/* ---------------- ZIP ---------------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Buffer) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zipar(arquivos: { nome: string; dados: Buffer }[]) {
  const partes: Buffer[] = []; const central: Buffer[] = []; let off = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, "utf8"); const comp = zlib.deflateRawSync(a.dados); const crc = crc32(a.dados);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(a.dados.length, 22); lh.writeUInt16LE(nome.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(a.dados.length, 24); ch.writeUInt16LE(nome.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
    partes.push(lh, nome, comp); central.push(ch, nome); off += 30 + nome.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, cd, fim]);
}

function deszipar(buf: Buffer): Map<string, Buffer> {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("Arquivo não é um .xlsx válido.");
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  const out = new Map<string, Buffer>();
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Estrutura do .xlsx corrompida.");
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20), ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32), loc = buf.readUInt32LE(p + 42);
    const nome = buf.subarray(p + 46, p + 46 + ln).toString("utf8");
    const ini = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
    const dados = buf.subarray(ini, ini + tam);
    out.set(nome, metodo === 8 ? zlib.inflateRawSync(dados) : Buffer.from(dados));
    p += 46 + ln + le + lc;
  }
  return out;
}

/* ---------------- Escrita ---------------- */
export type Celula = string | number | null | undefined | { data: string | null } | { moeda: number | null };
export type Aba = { nome: string; colunas: { titulo: string; largura?: number }[]; linhas: Celula[][]; nota?: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const col = (i: number) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const serial = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;

function celula(v: Celula, ref: string, cab = false): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : "";
  if (typeof v === "object" && "data" in v) return v.data && /^\d{4}-\d{2}-\d{2}/.test(v.data) ? `<c r="${ref}" s="2"><v>${serial(v.data)}</v></c>` : "";
  if (typeof v === "object" && "moeda" in v) return v.moeda === null || !Number.isFinite(v.moeda) ? "" : `<c r="${ref}" s="3"><v>${Math.round(v.moeda * 100) / 100}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${cab ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

export function gerarXlsx(abas: Aba[]): Buffer {
  const arq: { nome: string; dados: Buffer }[] = [];
  const B = (s: string) => Buffer.from(s, "utf8");
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  arq.push({ nome: "[Content_Types].xml", dados: B(`${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`) });
  arq.push({ nome: "_rels/.rels", dados: B(`${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) });
  arq.push({ nome: "xl/workbook.xml", dados: B(`${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas.map((a, i) => `<sheet name="${esc(a.nome.replace(/[\\/?*[\]:]/g, " ").slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) });
  arq.push({ nome: "xl/_rels/workbook.xml.rels", dados: B(`${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
  arq.push({ nome: "xl/styles.xml", dados: B(`${X}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F4C5C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) });
  abas.forEach((a, i) => {
    const cols = a.colunas.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.largura || Math.max(10, Math.min(45, c.titulo.length + 4))}" customWidth="1"/>`).join("");
    const linhas = [a.colunas.map((c) => c.titulo), ...a.linhas];
    const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, j) => celula(v, col(j) + (r + 1), r === 0)).join("")}</row>`).join("");
    const ult = col(Math.max(0, a.colunas.length - 1)) + Math.max(1, linhas.length);
    const filtro = a.linhas.length && a.colunas.length > 1 ? `<autoFilter ref="A1:${ult}"/>` : "";
    arq.push({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: B(`${X}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData>${filtro}</worksheet>`) });
  });
  return zipar(arq);
}

/* ---------------- Leitura ---------------- */
export type Valor = string | number | null;
export type Planilha = Map<string, Valor[][]>; // nome da aba → linhas (datas já em AAAA-MM-DD)

const desesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
const textoDe = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => desesc(m[1])).join("");
const idxCol = (ref: string) => { const l = ref.replace(/\d+/g, ""); let n = 0; for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const isoDeSerial = (n: number) => new Date(Math.round(n * 86400000) + Date.UTC(1899, 11, 30)).toISOString().slice(0, 10);

export function lerXlsx(buf: Buffer): Planilha {
  const z = deszipar(buf);
  const txt = (n: string) => z.get(n)?.toString("utf8") || "";
  const wb = txt("xl/workbook.xml");
  const rels = txt("xl/_rels/workbook.xml.rels");
  const alvo: Record<string, string> = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1]; const t = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && t) alvo[id] = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
  }
  const ss = [...txt("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  // estilos de data
  const st = txt("xl/styles.xml");
  const fmtData = new Set<number>([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  for (const m of st.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const f = desesc(m[2]).replace(/\[[^\]]*\]|"[^"]*"/g, "").toLowerCase();
    if (/[dy]/.test(f) || (/m/.test(f) && !/[#0]/.test(f))) fmtData.add(+m[1]);
  }
  const xfs = (st.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || "").match(/<xf\b[^>]*>/g) || [];
  const estiloData = xfs.map((x) => fmtData.has(+(x.match(/numFmtId="(\d+)"/)?.[1] || 0)));

  const out: Planilha = new Map();
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = desesc(m[0].match(/name="([^"]*)"/)?.[1] || "");
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1] || m[0].match(/\bid="([^"]+)"/)?.[1] || "";
    const xml = txt(alvo[rid] || "");
    const linhas: Valor[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const nr = +(r[1].match(/\br="(\d+)"/)?.[1] || linhas.length + 1) - 1;
      const linha: Valor[] = [];
      let j = 0;
      for (const c of (r[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = c[1]; const corpo = c[2] || "";
        const ref = at.match(/\br="([A-Z]+\d+)"/)?.[1]; if (ref) j = idxCol(ref);
        const t = at.match(/\bt="(\w+)"/)?.[1]; const s = +(at.match(/\bs="(\d+)"/)?.[1] || 0);
        const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val: Valor = null;
        if (t === "s") val = v !== undefined ? ss[+v] ?? null : null;
        else if (t === "inlineStr") val = textoDe(corpo);
        else if (t === "str" || t === "e") val = v !== undefined ? desesc(v) : null;
        else if (t === "b") val = v === "1" ? "VERDADEIRO" : "FALSO";
        else if (v !== undefined && v !== "") { const n = Number(v); val = estiloData[s] && n > 0 && n < 2958466 ? isoDeSerial(n) : n; }
        linha[j++] = typeof val === "string" ? val.trim() || null : val;
      }
      linhas[nr] = linha;
    }
    out.set(nome, Array.from(linhas, (l) => l || []));
  }
  return out;
}

export function lerCsv(texto: string): Valor[][] {
  texto = texto.replace(/^﻿/, "");
  const prim = texto.split(/\r?\n/, 1)[0] || "";
  const sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? ";" : ",";
  const linhas: Valor[][] = []; let campo = ""; let linha: Valor[] = []; let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) { if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; continue; }
    if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo.trim() || null); campo = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && texto[i + 1] === "\n") i++; linha.push(campo.trim() || null); linhas.push(linha); linha = []; campo = ""; }
    else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo.trim() || null); linhas.push(linha); }
  return linhas;
}
