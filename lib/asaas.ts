import type { supabaseServer } from "@/lib/supabase/server";
type SB = Awaited<ReturnType<typeof supabaseServer>>;

/** Empresa dona da conta Asaas que cobra as assinaturas do G7 Pulse */
export const EMPRESA_ASAAS = process.env.G7_EMPRESA_ASAAS || "824390b4-826d-42b6-b71f-a16607163e65";

const BASE = { sandbox: "https://api-sandbox.asaas.com/v3", producao: "https://api.asaas.com/v3" } as const;
export type AmbienteAsaas = keyof typeof BASE;

export type Asaas = { ambiente: AmbienteAsaas; req: <T = any>(metodo: string, caminho: string, corpo?: unknown) => Promise<T> };

export async function asaas(sb: SB): Promise<Asaas> {
  const { data, error } = await sb.rpc("obter_asaas_config", { p_empresa: EMPRESA_ASAAS, p_chave: process.env.NFSE_CHAVE_SERVICO || "" });
  if (error) throw new Error("Não consegui ler a configuração do Asaas: " + error.message);
  const cfg = data?.[0];
  if (!cfg?.api_key) throw new Error("Cadastre a chave da API do Asaas antes.");
  const ambiente: AmbienteAsaas = cfg.ambiente === "producao" ? "producao" : "sandbox";
  return {
    ambiente,
    async req(metodo, caminho, corpo) {
      const r = await fetch(BASE[ambiente] + caminho, {
        method: metodo,
        headers: { access_token: cfg.api_key, "Content-Type": "application/json", "User-Agent": "G7Pulse/1.0" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        cache: "no-store",
      });
      const texto = await r.text();
      let json: any = null;
      try { json = texto ? JSON.parse(texto) : null; } catch { /* não-JSON */ }
      if (!r.ok) {
        const msg = (json?.errors || []).map((e: any) => e.description).join(" · ") || texto.slice(0, 300) || `HTTP ${r.status}`;
        throw new Error(r.status === 401 ? "Chave da API do Asaas inválida para o ambiente escolhido." : "Asaas: " + msg);
      }
      return json;
    },
  };
}

export const FORMAS: Record<string, string> = { UNDEFINED: "Cliente escolhe (Pix, boleto ou cartão)", PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão de crédito" };
export const STATUS_COB: Record<string, string> = {
  PENDING: "Aguardando", RECEIVED: "Recebida", CONFIRMED: "Confirmada", OVERDUE: "Vencida", REFUNDED: "Estornada",
  RECEIVED_IN_CASH: "Recebida em dinheiro", REFUND_REQUESTED: "Estorno solicitado", CHARGEBACK_REQUESTED: "Chargeback", DELETED: "Removida",
};
