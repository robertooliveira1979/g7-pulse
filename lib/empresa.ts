import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export const COOKIE_EMPRESA = "g7_empresa";
export type Papel = "administrador" | "financeiro" | "operador_bpo" | "gestor" | "contador";
export type Vinculo = { empresa_id: string; papel: Papel; empresas: { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null } };

/** Usuário logado, suas empresas e a empresa ativa (cookie). Redireciona se faltar algo. */
export async function contexto() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: perfil }, { data: vinc }] = await Promise.all([
    sb.from("perfis").select("id,nome,email,tipo").eq("id", user.id).single(),
    sb.from("vinculos").select("empresa_id,papel,empresas(id,razao_social,nome_fantasia,cnpj)").eq("usuario_id", user.id),
  ]);
  const vinculos = (vinc || []) as unknown as Vinculo[];
  if (!vinculos.length) redirect("/empresas");
  const ck = (await cookies()).get(COOKIE_EMPRESA)?.value;
  const ativo = vinculos.find((v) => v.empresa_id === ck) || (vinculos.length === 1 ? vinculos[0] : null);
  if (!ativo) redirect("/empresas");
  const podeEditar = ["administrador", "financeiro", "operador_bpo"].includes(ativo.papel);
  return { sb, user, perfil, vinculos, empresa: ativo.empresas, empresaId: ativo.empresa_id, papel: ativo.papel, podeEditar };
}
