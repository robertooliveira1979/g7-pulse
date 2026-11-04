import Link from "next/link";
import { contexto } from "@/lib/empresa";

export const dynamic = "force-dynamic";

const MENU: [string, [string, string][]][] = [
  ["Visão geral", [["/", "Dashboard"], ["/gerencial", "Gerencial e DRE"]]],
  ["Financeiro", [["/receber", "Contas a receber"], ["/pagar", "Contas a pagar"]]],
  ["Cadastros", [["/clientes", "Clientes"], ["/fornecedores", "Fornecedores"], ["/contas", "Contas e caixas"]]],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { empresa, vinculos, perfil, papel } = await contexto();
  return (
    <div className="shell">
      <nav className="nav">
        <div className="logo"><img src="/icon.svg" width={34} height={34} alt="" />G7 <span>Pulse</span></div>
        <Link href="/empresas" className="company">
          <small>{vinculos.length > 1 ? "Empresa · trocar" : "Empresa"}</small>
          {empresa.nome_fantasia || empresa.razao_social}
        </Link>
        {MENU.map(([g, itens]) => (
          <div key={g}>
            <div className="grp">{g}</div>
            {itens.map(([href, rotulo]) => <Link key={href} href={href} className="item">{rotulo}</Link>)}
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: "12px 10px", fontSize: 12, color: "#7F98A1" }}>
          {perfil?.nome}<br />{papel.replace("_", " ")}
          <form action="/auth/sair" method="post" style={{ marginTop: 8 }}><button className="btn sm">Sair</button></form>
        </div>
      </nav>
      <div className="main">{children}</div>
    </div>
  );
}
