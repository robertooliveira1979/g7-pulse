import Link from "next/link";
import { contexto } from "@/lib/empresa";
import NavLinks from "@/components/NavLinks";
import { Marca } from "@/components/Icone";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { sb, empresa, empresaId, vinculos, perfil, papel } = await contexto();
  const { data: atrasos } = await sb.from("v_titulos").select("tipo").eq("empresa_id", empresaId).eq("status", "Atrasado");
  const nR = (atrasos || []).filter((t) => t.tipo === "receber").length;
  const nP = (atrasos || []).filter((t) => t.tipo === "pagar").length;
  const { count: nOfx } = await sb.from("extrato_transacoes").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("status", "pendente");
  const grupos: [string, { href: string; rotulo: string; icone: string; badge?: number }[]][] = [
    ["Visão geral", [{ href: "/", rotulo: "Dashboard", icone: "home" }, { href: "/gerencial", rotulo: "Gerencial e DRE", icone: "chart" }]],
    ["Financeiro", [
      { href: "/receber", rotulo: "Contas a receber", icone: "in", badge: nR },
      { href: "/pagar", rotulo: "Contas a pagar", icone: "out", badge: nP },
      { href: "/conciliacao", rotulo: "Conciliação OFX", icone: "swap", badge: nOfx || 0 },
    ]],
    ["Cadastros", [
      { href: "/clientes", rotulo: "Clientes", icone: "users" },
      { href: "/fornecedores", rotulo: "Fornecedores", icone: "truck" },
      { href: "/contas", rotulo: "Contas e caixas", icone: "bank" },
    ]],
  ];
  return (
    <div className="shell">
      <nav className="nav">
        <div className="logo"><Marca />G7 <span>Pulse</span></div>
        <Link href="/empresas" className="company">
          <small>{vinculos.length > 1 ? "Empresa · trocar" : "Empresa"}</small>
          <strong>{empresa.nome_fantasia || empresa.razao_social}</strong>
        </Link>
        <NavLinks grupos={grupos} />
        <div className="user">
          <span><b style={{ color: "#C9D8DC", fontWeight: 500 }}>{perfil?.nome}</b><br /><small>{papel.replace("_", " ")}</small></span>
          <form action="/auth/sair" method="post"><button className="btn sm">Sair</button></form>
        </div>
      </nav>
      <div className="main">{children}</div>
    </div>
  );
}
