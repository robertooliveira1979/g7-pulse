import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { escolherEmpresa, criarEmpresa } from "@/app/acoes";

export const dynamic = "force-dynamic";

export default async function Empresas({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: vinc } = await sb.from("vinculos").select("papel, empresas(id, razao_social, nome_fantasia, cnpj)").eq("usuario_id", user.id);
  const lista = (vinc || []) as unknown as { papel: string; empresas: { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null } }[];
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="logo" style={{ color: "var(--fg)" }}><img src="/icon.svg" width={34} height={34} alt="" />G7 <span>Pulse</span></div>
      <h1 style={{ fontSize: 22 }}>{lista.length ? "Escolha a empresa" : "Cadastre sua primeira empresa"}</h1>
      {lista.map((v) => (
        <form key={v.empresas.id} action={escolherEmpresa}>
          <input type="hidden" name="empresa_id" value={v.empresas.id} />
          <div className="picker"><button>
            <span className="ini">{(v.empresas.nome_fantasia || v.empresas.razao_social)[0]}</span>
            <span className="t"><b>{v.empresas.nome_fantasia || v.empresas.razao_social}</b><small>{v.empresas.cnpj} · {v.papel.replace("_", " ")}</small></span>
            <span className="pill pend">Entrar</span>
          </button></div>
        </form>
      ))}
      <form action={criarEmpresa} className="card">
        <h2>Nova empresa</h2>
        <div className="field"><label htmlFor="rs">Razão social</label><input id="rs" name="razao_social" className="input" required /></div>
        <div className="field"><label htmlFor="nf">Nome fantasia</label><input id="nf" name="nome_fantasia" className="input" /></div>
        <div className="field"><label htmlFor="cnpj">CNPJ</label><input id="cnpj" name="cnpj" className="input" placeholder="00.000.000/0000-00" /></div>
        {erro && <div className="err">{erro}</div>}
        <button className="btn p">Criar empresa</button>
      </form>
      <form action="/auth/sair" method="post"><button className="btn">Sair</button></form>
    </div>
  );
}
