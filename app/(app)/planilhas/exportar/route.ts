import { contexto } from "@/lib/empresa";
import { gerarXlsx, type Aba } from "@/lib/planilha";
import { COLS_PESSOAS, COLS_LANC } from "@/lib/importacao";
import { todos } from "@/lib/dados";
import { hojeSP } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const D = (v: string | null | undefined) => ({ data: v || null });
const M = (v: number | string | null | undefined) => ({ moeda: v === null || v === undefined ? null : Number(v) });
const tipoP = (c: boolean, f: boolean) => (c && f ? "Ambos" : f ? "Fornecedor" : "Cliente");

/** Exporta a base completa da empresa ativa. As abas Clientes e fornecedores e Lançamentos podem ser reimportadas. */
export async function GET() {
  const { sb, empresaId, empresa } = await contexto();
  const q = <T,>(f: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => todos<T>(f, 500000);
  const [pessoas, titulos, baixas, categorias, contas, saldos, centros, transf] = await Promise.all([
    q((de, ate) => sb.from("pessoas").select("*").eq("empresa_id", empresaId).order("razao_social").range(de, ate)),
    q((de, ate) => sb.from("v_titulos").select("*").eq("empresa_id", empresaId).order("vencimento").order("id").range(de, ate)),
    q((de, ate) => sb.from("baixas").select("id,titulo_id,data,valor,conta_id,origem").eq("empresa_id", empresaId).order("data").order("id").range(de, ate)),
    q((de, ate) => sb.from("categorias").select("codigo,nome,nivel,grupo,subgrupo,ativa").eq("empresa_id", empresaId).order("codigo").range(de, ate)),
    q((de, ate) => sb.from("contas_bancarias").select("*").eq("empresa_id", empresaId).order("nome").range(de, ate)),
    q((de, ate) => sb.from("v_saldo_contas").select("id,saldo").eq("empresa_id", empresaId).range(de, ate)),
    q((de, ate) => sb.from("centros_custo").select("*").eq("empresa_id", empresaId).order("nome").range(de, ate)),
    q((de, ate) => sb.from("transferencias").select("*").eq("empresa_id", empresaId).order("data").range(de, ate)),
  ]);
  const P = new Map(pessoas.map((p: any) => [p.id, p]));
  const conta = new Map(contas.map((c: any) => [c.id, c.nome]));
  const saldo = new Map(saldos.map((s: any) => [s.id, Number(s.saldo)]));
  const tit = new Map(titulos.map((t: any) => [t.id, t]));
  const ultimaConta = new Map<string, string>(); const nBx = new Map<string, number>();
  for (const b of baixas as any[]) { ultimaConta.set(b.titulo_id, b.conta_id); nBx.set(b.titulo_id, (nBx.get(b.titulo_id) || 0) + 1); }

  const abas: Aba[] = [
    { nome: "Clientes e fornecedores", colunas: COLS_PESSOAS.map((t) => ({ titulo: t, largura: t === "Razão social" ? 36 : undefined })).concat([{ titulo: "Ativo", largura: 8 }]),
      linhas: pessoas.map((p: any) => [tipoP(p.e_cliente, p.e_fornecedor), p.cnpj_cpf, p.razao_social, p.nome_fantasia, p.email, p.ddd, p.telefone, p.cep, p.logradouro, p.numero, p.complemento, p.bairro, p.cidade, p.uf, p.inscricao_municipal, p.chave_pix, p.ativo ? "Sim" : "Não"]) },
    { nome: "Lançamentos", colunas: [...COLS_LANC.map((t) => ({ titulo: t, largura: ["Cliente/Fornecedor", "Descrição"].includes(t) ? 32 : undefined })), { titulo: "Situação" }, { titulo: "Saldo em aberto" }, { titulo: "Nº de baixas" }],
      linhas: titulos.map((t: any) => {
        const p: any = t.pessoa_id ? P.get(t.pessoa_id) : null; const pago = Number(t.valor_baixado) > 0;
        return [t.tipo === "receber" ? "Receber" : "Pagar", p?.cnpj_cpf, p?.razao_social, t.descricao, t.documento, t.categoria_codigo, t.centro_custo_nome,
          conta.get(ultimaConta.get(t.id) || t.conta_id) || null, D(t.data_emissao), D(t.vencimento), M(t.valor_original), M(Number(t.desconto) || null), M(Number(t.acrescimo) || null),
          t.forma_cobranca, pago ? D(t.data_quitacao) : null, pago ? M(t.valor_baixado) : null, t.observacoes,
          t.status === "Quitado" ? (t.tipo === "receber" ? "Recebido" : "Pago") : t.status, M(t.saldo), nBx.get(t.id) || 0];
      }) },
    { nome: "Baixas", colunas: [{ titulo: "Data" }, { titulo: "Tipo" }, { titulo: "Cliente/Fornecedor", largura: 32 }, { titulo: "Descrição", largura: 32 }, { titulo: "Documento" }, { titulo: "Categoria" }, { titulo: "Conta", largura: 18 }, { titulo: "Valor" }, { titulo: "Origem" }],
      linhas: (baixas as any[]).map((b) => { const t: any = tit.get(b.titulo_id) || {}; return [D(b.data), t.tipo === "receber" ? "Recebimento" : "Pagamento", t.razao_social, t.descricao, t.documento, t.categoria_codigo, conta.get(b.conta_id), M(b.valor), b.origem]; }) },
    { nome: "Transferências", colunas: [{ titulo: "Data" }, { titulo: "Sai da conta", largura: 20 }, { titulo: "Entra na conta", largura: 20 }, { titulo: "Valor" }, { titulo: "Descrição", largura: 36 }],
      linhas: (transf as any[]).map((x) => [D(x.data), conta.get(x.conta_origem_id), conta.get(x.conta_destino_id), M(x.valor), x.descricao]) },
    { nome: "Contas", colunas: [{ titulo: "Conta", largura: 24 }, { titulo: "Tipo" }, { titulo: "Banco" }, { titulo: "Agência" }, { titulo: "Número" }, { titulo: "Saldo inicial" }, { titulo: "Data saldo inicial" }, { titulo: "Saldo atual" }, { titulo: "Ativa" }],
      linhas: contas.map((c: any) => [c.nome, c.tipo, c.banco, c.agencia, [c.numero, c.dv].filter(Boolean).join("-") || null, M(c.saldo_inicial), D(c.data_saldo_inicial), M(saldo.get(c.id) ?? null), c.ativa ? "Sim" : "Não"]) },
    { nome: "Categorias", colunas: [{ titulo: "Código" }, { titulo: "Categoria", largura: 40 }, { titulo: "Nível" }, { titulo: "Grupo", largura: 28 }, { titulo: "Subgrupo", largura: 28 }, { titulo: "Ativa" }],
      linhas: categorias.map((c: any) => [c.codigo, c.nome, c.nivel, c.grupo, c.subgrupo, c.ativa ? "Sim" : "Não"]) },
    { nome: "Centros de custo", colunas: [{ titulo: "Código" }, { titulo: "Centro de custo", largura: 36 }, { titulo: "Ativo" }],
      linhas: centros.map((c: any) => [c.codigo, c.nome, c.ativo ? "Sim" : "Não"]) },
  ];

  const nome = String((empresa as any)?.nome_fantasia || (empresa as any)?.razao_social || "empresa").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(new Uint8Array(gerarXlsx(abas)), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="G7Pulse-${nome}-${hojeSP()}.xlsx"`, "Cache-Control": "no-store",
  } });
}
