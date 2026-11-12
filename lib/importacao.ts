import type { Planilha, Valor, Aba } from "@/lib/planilha";

/* Colunas dos modelos (também usadas na exportação, para a planilha exportada poder ser reimportada) */
export const COLS_PESSOAS = ["Tipo", "CNPJ/CPF", "Razão social", "Nome fantasia", "E-mail", "DDD", "Telefone", "CEP", "Logradouro", "Número", "Complemento", "Bairro", "Cidade", "UF", "Inscrição municipal", "Chave PIX"];
export const COLS_LANC = ["Tipo", "CNPJ/CPF", "Cliente/Fornecedor", "Descrição", "Documento", "Categoria", "Centro de custo", "Conta", "Emissão", "Vencimento", "Valor", "Desconto", "Acréscimo", "Forma de cobrança", "Data pagamento", "Valor pago", "Observações"];

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** apelidos aceitos em cada coluna (normalizados) */
const ALIAS: Record<string, string[]> = {
  tipo: ["tipo", "natureza", "receber pagar", "tipo lancamento"],
  doc: ["cnpj cpf", "cnpj", "cpf", "documento do cliente", "cpf cnpj", "cnpj cpf cliente fornecedor"],
  razao: ["razao social", "nome", "razao social nome"],
  fantasia: ["nome fantasia", "fantasia", "apelido"],
  email: ["e mail", "email"],
  ddd: ["ddd"], telefone: ["telefone", "fone", "celular", "whatsapp"], cep: ["cep"], logradouro: ["logradouro", "endereco", "rua"],
  numero: ["numero", "n", "nro"], complemento: ["complemento"], bairro: ["bairro"], cidade: ["cidade", "municipio"], uf: ["uf", "estado"],
  im: ["inscricao municipal", "im"], pix: ["chave pix", "pix"],
  pessoa: ["cliente fornecedor", "cliente", "fornecedor", "favorecido", "pagador", "pessoa", "nome do cliente fornecedor"],
  descricao: ["descricao", "historico"], documento: ["documento", "nota", "nf", "numero documento", "doc"],
  categoria: ["categoria", "plano de contas", "conta contabil", "classificacao"], centro: ["centro de custo", "centro custo", "cc"],
  conta: ["conta", "conta bancaria", "banco", "conta caixa"], emissao: ["emissao", "data emissao", "competencia", "data competencia"],
  vencimento: ["vencimento", "data vencimento", "vcto", "venc"], valor: ["valor", "valor original", "valor bruto"],
  desconto: ["desconto"], acrescimo: ["acrescimo", "juros multa", "juros"], forma: ["forma de cobranca", "forma de pagamento", "forma"],
  pago_em: ["data pagamento", "data recebimento", "data baixa", "pago em", "data quitacao", "pagamento"], valor_pago: ["valor pago", "valor recebido", "valor baixado"],
  obs: ["observacoes", "observacao", "obs"],
};

function mapearCabecalho(cab: Valor[]) {
  const m: Record<string, number> = {};
  cab.forEach((c, i) => {
    const n = norm(c);
    if (!n) return;
    for (const [k, al] of Object.entries(ALIAS)) if (m[k] === undefined && al.includes(n)) { m[k] = i; break; }
  });
  return m;
}

export function data(v: Valor): string | null | "inválida" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Math.round(v * 86400000) + Date.UTC(1899, 11, 30)).toISOString().slice(0, 10) : "inválida";
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = m[3].length === 2 ? "20" + m[3] : m[3]; const iso = `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d = new Date(iso + "T12:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === iso ? iso : "inválida";
  }
  return "inválida";
}

export function dinheiro(v: Valor): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Math.round(v * 100) / 100;
  let s = String(v).replace(/[R$\s]/g, "");
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-"); s = s.replace(/[()-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round((neg ? -n : n) * 100) / 100 : NaN;
}

export function formatarDoc(d: string) {
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}

const tipoLanc = (v: Valor): "receber" | "pagar" | null => {
  const n = norm(v);
  if (["receber", "r", "receita", "entrada", "a receber", "credito", "conta a receber"].includes(n)) return "receber";
  if (["pagar", "p", "despesa", "saida", "a pagar", "debito", "conta a pagar"].includes(n)) return "pagar";
  return null;
};
const tipoPessoa = (v: Valor) => {
  const n = norm(v);
  if (!n || n.startsWith("cliente")) return { c: true, f: false };
  if (n.startsWith("fornecedor")) return { c: false, f: true };
  if (n.startsWith("ambos") || n.includes("cliente") && n.includes("fornecedor")) return { c: true, f: true };
  return null;
};

export type Ref = {
  pessoas: { id: string; cnpj_cpf: string | null; razao_social: string; nome_fantasia: string | null; e_cliente: boolean; e_fornecedor: boolean }[];
  categorias: { id: string; codigo: string; nome: string; nivel: number }[];
  contas: { id: string; nome: string }[];
  centros: { id: string; codigo: string | null; nome: string }[];
  existentes: { tipo: string; pessoa_id: string | null; vencimento: string; valor_original: number; documento: string | null }[];
};

export type Problema = { aba: string; linha: number; msg: string };
export type Plano = {
  erros: Problema[]; avisos: Problema[];
  centros: { id: string; codigo: string | null; nome: string }[];
  pessoas: Record<string, unknown>[];
  flags: { id: string; e_cliente: boolean; e_fornecedor: boolean }[];
  titulos: Record<string, unknown>[];
  baixas: { titulo_id: string; data: string; valor: number; conta_id: string }[];
  resumo: { pessoasNovas: number; pessoasExistentes: number; receber: number; pagar: number; valorReceber: number; valorPagar: number; baixas: number; duplicados: number; centrosNovos: number };
};

const PREFIXOS = { receber: ["01", "03"], pagar: ["02", "04", "05"] };
const LIMITE = 5000;

/** Encontra as abas de pessoas e de lançamentos pelo nome ou pelas colunas */
function localizar(pl: Planilha) {
  let pes: Valor[][] | undefined, lan: Valor[][] | undefined;
  for (const [nome, linhas] of pl) {
    const n = norm(nome); const cab = mapearCabecalho(linhas[0] || []);
    if (!lan && (n.includes("lanc") || n.includes("titulo") || n.includes("contas a") || (cab.vencimento !== undefined && cab.valor !== undefined))) { lan = linhas; continue; }
    if (!pes && (n.includes("client") || n.includes("fornec") || n.includes("pessoa") || n.includes("cadastro") || (cab.razao !== undefined && cab.vencimento === undefined))) pes = linhas;
  }
  return { pes, lan };
}

export function planejar(pl: Planilha, ref: Ref, opcoes: { ignorarDuplicados: boolean }, uuid: () => string): Plano {
  const erros: Problema[] = [], avisos: Problema[] = [];
  const p: Plano = { erros, avisos, centros: [], pessoas: [], flags: [], titulos: [], baixas: [], resumo: { pessoasNovas: 0, pessoasExistentes: 0, receber: 0, pagar: 0, valorReceber: 0, valorPagar: 0, baixas: 0, duplicados: 0, centrosNovos: 0 } };
  const { pes, lan } = localizar(pl);
  if (!pes && !lan) { erros.push({ aba: "-", linha: 0, msg: "Não encontrei as abas \"Clientes e fornecedores\" nem \"Lançamentos\". Use o modelo do G7 Pulse." }); return p; }

  // índices de pessoas (existentes + novas)
  type P = { id: string; c: boolean; f: boolean; nova: boolean };
  const porDoc = new Map<string, P>(), porNome = new Map<string, P>();
  for (const x of ref.pessoas) {
    const reg = { id: x.id, c: x.e_cliente, f: x.e_fornecedor, nova: false };
    if (so(x.cnpj_cpf)) porDoc.set(so(x.cnpj_cpf), reg);
    porNome.set(norm(x.razao_social), reg); if (x.nome_fantasia) porNome.set(norm(x.nome_fantasia), porNome.get(norm(x.nome_fantasia)) || reg);
  }
  const flagsPend = new Map<string, { id: string; e_cliente: boolean; e_fornecedor: boolean }>();
  const garantirFlag = (reg: P, c: boolean, f: boolean) => {
    if ((c && !reg.c) || (f && !reg.f)) {
      reg.c ||= c; reg.f ||= f;
      if (reg.nova) { const np = p.pessoas.find((x) => x.id === reg.id)!; np.e_cliente = reg.c; np.e_fornecedor = reg.f; }
      else flagsPend.set(reg.id, { id: reg.id, e_cliente: reg.c, e_fornecedor: reg.f });
    }
  };

  // ---------- Clientes e fornecedores ----------
  if (pes && pes.length > 1) {
    const ABA = "Clientes e fornecedores";
    const m = mapearCabecalho(pes[0]);
    if (m.razao === undefined) erros.push({ aba: ABA, linha: 1, msg: "Coluna \"Razão social\" não encontrada no cabeçalho." });
    else pes.slice(1, LIMITE + 1).forEach((l, i) => {
      const n = i + 2; const g = (k: string) => (m[k] === undefined ? null : l[m[k]] ?? null);
      if (l.every((v) => v === null || v === undefined || v === "")) return;
      const razao = String(g("razao") ?? "").trim();
      if (!razao) { erros.push({ aba: ABA, linha: n, msg: "Razão social em branco." }); return; }
      const tp = tipoPessoa(g("tipo")); if (!tp) { erros.push({ aba: ABA, linha: n, msg: `Tipo "${g("tipo")}" inválido. Use Cliente, Fornecedor ou Ambos.` }); return; }
      const doc = so(g("doc"));
      if (doc && doc.length !== 11 && doc.length !== 14) { erros.push({ aba: ABA, linha: n, msg: `CNPJ/CPF "${g("doc")}" deve ter 11 ou 14 dígitos.` }); return; }
      const ja = (doc && porDoc.get(doc)) || (!doc && porNome.get(norm(razao)));
      if (ja) { garantirFlag(ja, tp.c, tp.f); if (!ja.nova) p.resumo.pessoasExistentes++; else avisos.push({ aba: ABA, linha: n, msg: `${razao} aparece mais de uma vez; mantida a primeira.` }); return; }
      const uf = String(g("uf") ?? "").trim().toUpperCase();
      const nova = {
        id: uuid(), cnpj_cpf: doc ? formatarDoc(doc) : null, razao_social: razao.slice(0, 200), nome_fantasia: g("fantasia") ? String(g("fantasia")) : null,
        e_cliente: tp.c, e_fornecedor: tp.f, email: g("email") ? String(g("email")) : null, ddd: so(g("ddd")) || null, telefone: g("telefone") ? String(g("telefone")) : null,
        cep: so(g("cep")) || null, logradouro: g("logradouro") ? String(g("logradouro")) : null, numero: g("numero") !== null ? String(g("numero")) : null,
        complemento: g("complemento") ? String(g("complemento")) : null, bairro: g("bairro") ? String(g("bairro")) : null, cidade: g("cidade") ? String(g("cidade")) : null,
        uf: uf.length === 2 ? uf : null, inscricao_municipal: g("im") !== null ? String(g("im")) : null, chave_pix: g("pix") ? String(g("pix")) : null,
      };
      p.pessoas.push(nova); p.resumo.pessoasNovas++;
      const reg = { id: nova.id, c: tp.c, f: tp.f, nova: true };
      if (doc) porDoc.set(doc, reg); porNome.set(norm(razao), reg); if (nova.nome_fantasia) porNome.set(norm(nova.nome_fantasia), porNome.get(norm(nova.nome_fantasia)) || reg);
    });
    if (pes.length - 1 > LIMITE) erros.push({ aba: ABA, linha: LIMITE + 2, msg: `Limite de ${LIMITE} linhas por importação. Divida o arquivo.` });
  }

  // ---------- Lançamentos ----------
  if (lan && lan.length > 1) {
    const ABA = "Lançamentos";
    const m = mapearCabecalho(lan[0]);
    const faltando = ["tipo", "categoria", "vencimento", "valor"].filter((k) => m[k] === undefined);
    if (faltando.length) { erros.push({ aba: ABA, linha: 1, msg: `Colunas obrigatórias não encontradas: ${faltando.map((k) => ({ tipo: "Tipo", categoria: "Categoria", vencimento: "Vencimento", valor: "Valor" })[k]).join(", ")}.` }); return p; }
    const cats3 = ref.categorias.filter((c) => c.nivel === 3);
    const catCod = new Map(cats3.map((c) => [c.codigo.trim(), c])), catNome = new Map(cats3.map((c) => [norm(c.nome), c]));
    const contaNome = new Map(ref.contas.map((c) => [norm(c.nome), c]));
    const centroIdx = new Map<string, string>(); for (const c of ref.centros) { centroIdx.set(norm(c.nome), c.id); if (c.codigo) centroIdx.set(norm(c.codigo), c.id); }
    const chave = (t: string, pid: string | null, v: string, val: number, d: string | null) => [t, pid || "", v, val.toFixed(2), norm(d)].join("|");
    const exist = new Set(ref.existentes.map((e) => chave(e.tipo, e.pessoa_id, e.vencimento, Number(e.valor_original), e.documento)));

    lan.slice(1, LIMITE + 1).forEach((l, i) => {
      const n = i + 2; const g = (k: string) => (m[k] === undefined ? null : l[m[k]] ?? null);
      if (l.every((v) => v === null || v === undefined || v === "")) return;
      const er = (msg: string) => erros.push({ aba: ABA, linha: n, msg });
      const tipo = tipoLanc(g("tipo")); if (!tipo) return er(`Tipo "${g("tipo") ?? ""}" inválido. Use Receber ou Pagar.`);
      // categoria
      const cv = String(g("categoria") ?? "").trim();
      const codigo = cv.match(/^\d{2}(\.\d{2}){2}/)?.[0];
      const cat = (codigo && catCod.get(codigo)) || catNome.get(norm(cv.replace(/^\d{2}(\.\d{2}){2}\s*[-–·]?\s*/, ""))) || catNome.get(norm(cv));
      if (!cv) return er("Categoria em branco.");
      if (!cat) return er(`Categoria "${cv}" não existe no plano de contas (veja a aba Categorias do modelo).`);
      if (!PREFIXOS[tipo].includes(cat.codigo.slice(0, 2))) return er(`Categoria ${cat.codigo} ${cat.nome} não é de conta a ${tipo}.`);
      // datas e valores
      const venc = data(g("vencimento")); if (!venc || venc === "inválida") return er(`Vencimento "${g("vencimento") ?? ""}" inválido. Use dd/mm/aaaa.`);
      const emis = data(g("emissao")); if (emis === "inválida") return er(`Emissão "${g("emissao")}" inválida.`);
      const valor = dinheiro(g("valor")); if (valor === null || !Number.isFinite(valor) || valor <= 0) return er(`Valor "${g("valor") ?? ""}" inválido (precisa ser maior que zero).`);
      const desc = dinheiro(g("desconto")) ?? 0, acr = dinheiro(g("acrescimo")) ?? 0;
      if (!Number.isFinite(desc) || !Number.isFinite(acr) || desc < 0 || acr < 0) return er("Desconto/acréscimo inválido.");
      const total = Math.round((valor - desc + acr) * 100) / 100;
      if (total < 0) return er("Desconto maior que o valor.");
      // conta
      const cn = String(g("conta") ?? "").trim();
      const conta = cn ? contaNome.get(norm(cn)) : undefined;
      if (cn && !conta) return er(`Conta "${cn}" não cadastrada. Cadastre em Contas e caixas ou deixe em branco.`);
      // pagamento
      const pago = data(g("pago_em")); if (pago === "inválida") return er(`Data de pagamento "${g("pago_em")}" inválida.`);
      let vp = dinheiro(g("valor_pago"));
      if (vp !== null && (!Number.isFinite(vp) || vp < 0)) return er("Valor pago inválido.");
      if (vp && !pago) return er("Informe a data de pagamento junto com o valor pago.");
      if (pago && !conta) return er("Para lançamento já pago, informe a Conta onde o dinheiro entrou ou saiu.");
      if (pago) { vp = vp ?? total; if (vp > total + 0.005) return er(`Valor pago (${vp.toFixed(2)}) maior que o total do lançamento (${total.toFixed(2)}).`); }
      // pessoa
      const doc = so(g("doc")); const nome = String(g("pessoa") ?? "").trim();
      if (doc && doc.length !== 11 && doc.length !== 14) return er(`CNPJ/CPF "${g("doc")}" deve ter 11 ou 14 dígitos.`);
      let pessoaId: string | null = null;
      if (doc || nome) {
        let reg = (doc && porDoc.get(doc)) || (nome ? porNome.get(norm(nome)) : undefined);
        if (!reg) {
          if (!nome) return er(`CNPJ/CPF ${g("doc")} não cadastrado e sem nome do ${tipo === "receber" ? "cliente" : "fornecedor"} para criar.`);
          const nova = { id: uuid(), cnpj_cpf: doc ? formatarDoc(doc) : null, razao_social: nome.slice(0, 200), nome_fantasia: null, e_cliente: tipo === "receber", e_fornecedor: tipo === "pagar" };
          p.pessoas.push(nova); p.resumo.pessoasNovas++;
          reg = { id: nova.id, c: nova.e_cliente, f: nova.e_fornecedor, nova: true };
          if (doc) porDoc.set(doc, reg); porNome.set(norm(nome), reg);
          avisos.push({ aba: ABA, linha: n, msg: `${nome} não estava cadastrado: será criado como ${tipo === "receber" ? "cliente" : "fornecedor"}.` });
        }
        garantirFlag(reg, tipo === "receber", tipo === "pagar");
        pessoaId = reg.id;
      }
      // centro de custo
      const ccv = String(g("centro") ?? "").trim();
      let centroId: string | null = null;
      if (ccv) {
        centroId = centroIdx.get(norm(ccv)) || null;
        if (!centroId) { centroId = uuid(); centroIdx.set(norm(ccv), centroId); p.centros.push({ id: centroId, codigo: null, nome: ccv.slice(0, 120) }); p.resumo.centrosNovos++; }
      }
      // duplicado?
      const documento = g("documento") !== null ? String(g("documento")) : null;
      const k = chave(tipo, pessoaId, venc, valor, documento);
      if (exist.has(k)) {
        if (opcoes.ignorarDuplicados) { p.resumo.duplicados++; avisos.push({ aba: ABA, linha: n, msg: "Já existe um lançamento igual (tipo, pessoa, vencimento, valor e documento): ignorado." }); return; }
      }
      exist.add(k);

      const id = uuid();
      p.titulos.push({
        id, tipo, pessoa_id: pessoaId, descricao: g("descricao") ? String(g("descricao")).slice(0, 500) : null, documento,
        observacoes: g("obs") ? String(g("obs")) : null, categoria_id: cat.id, centro_custo_id: centroId, conta_id: conta?.id || null,
        forma_cobranca: g("forma") ? String(g("forma")).toLowerCase() : null, data_emissao: emis || venc, vencimento: venc,
        valor_original: valor, desconto: desc, acrescimo: acr,
      });
      if (tipo === "receber") { p.resumo.receber++; p.resumo.valorReceber += total; } else { p.resumo.pagar++; p.resumo.valorPagar += total; }
      if (pago && vp && vp > 0) { p.baixas.push({ titulo_id: id, data: pago, valor: vp, conta_id: conta!.id }); p.resumo.baixas++; }
    });
    if (lan.length - 1 > LIMITE) erros.push({ aba: ABA, linha: LIMITE + 2, msg: `Limite de ${LIMITE} linhas por importação. Divida o arquivo.` });
  }
  p.flags = [...flagsPend.values()];
  if (!erros.length && !p.pessoas.length && !p.titulos.length && !p.flags.length) avisos.push({ aba: "-", linha: 0, msg: "A planilha não tem linhas novas para importar." });
  return p;
}

/** Planilha modelo com abas de referência */
export function abasModelo(ref: Pick<Ref, "categorias" | "contas" | "centros">): Aba[] {
  const instr = [
    ["Como usar este modelo"],
    ["1. Preencha a aba \"Clientes e fornecedores\" e/ou a aba \"Lançamentos\". Não mude os nomes das colunas."],
    ["2. Em Lançamentos, Tipo = Receber ou Pagar. Categoria = código do plano de contas (ex.: 01.01.01) — veja a aba Categorias."],
    ["3. Datas no formato dd/mm/aaaa. Valores em reais (ex.: 1.250,00)."],
    ["4. Cliente/Fornecedor: informe o CNPJ/CPF e/ou o nome. Se não existir no sistema, ele é criado automaticamente."],
    ["5. Centro de custo: se não existir, é criado. Conta: precisa já estar cadastrada (veja a aba Contas)."],
    ["6. Lançamento já pago/recebido: preencha Data pagamento e Conta (Valor pago é opcional; vazio = valor total)."],
    ["7. A importação é tudo ou nada: se houver erro em alguma linha, nada é gravado e o sistema mostra as linhas a corrigir."],
    [""],
    ["Exemplos de linhas de Lançamentos (não copie esta aba para importar):"],
    ["Receber | 12.345.678/0001-90 | Cliente Exemplo Ltda | Mensalidade novembro | NF 123 | 01.01.01 | Comercial | Banco Principal | 01/11/2026 | 10/11/2026 | 1.500,00 | | | boleto | | |"],
    ["Pagar | | Aluguel Imóveis Ltda | Aluguel sala | | (código de despesa) | Administrativo | Banco Principal | 01/11/2026 | 05/11/2026 | 2.800,00 | | | pix | 05/11/2026 | 2.800,00 |"],
  ];
  const uso = (c: string) => (["01", "03"].includes(c.slice(0, 2)) ? "Receber" : ["02", "04", "05"].includes(c.slice(0, 2)) ? "Pagar" : "");
  return [
    { nome: "Instruções", colunas: [{ titulo: "G7 Pulse · importação em lote", largura: 140 }], linhas: instr },
    { nome: "Clientes e fornecedores", colunas: COLS_PESSOAS.map((t) => ({ titulo: t, largura: t === "Razão social" ? 36 : undefined })), linhas: [] },
    { nome: "Lançamentos", colunas: COLS_LANC.map((t) => ({ titulo: t, largura: ["Cliente/Fornecedor", "Descrição"].includes(t) ? 32 : undefined })), linhas: [] },
    { nome: "Categorias", colunas: [{ titulo: "Código", largura: 12 }, { titulo: "Categoria", largura: 45 }, { titulo: "Usar em", largura: 12 }], linhas: ref.categorias.filter((c) => c.nivel === 3).map((c) => [c.codigo, c.nome, uso(c.codigo)]) },
    { nome: "Contas", colunas: [{ titulo: "Conta (use exatamente este nome)", largura: 40 }], linhas: ref.contas.map((c) => [c.nome]) },
    { nome: "Centros de custo", colunas: [{ titulo: "Código" }, { titulo: "Centro de custo", largura: 40 }], linhas: ref.centros.map((c) => [c.codigo, c.nome]) },
  ];
}
