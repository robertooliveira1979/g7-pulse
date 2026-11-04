"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icone from "./Icone";

type Item = { href: string; rotulo: string; icone: string; badge?: number };

export default function NavLinks({ grupos }: { grupos: [string, Item[]][] }) {
  const p = usePathname();
  const ativo = (h: string) => (h === "/" ? p === "/" : p.startsWith(h));
  return (
    <>
      {grupos.map(([g, itens]) => (
        <div key={g}>
          <div className="grp">{g}</div>
          {itens.map((i) => (
            <Link key={i.href} href={i.href} className={"item" + (ativo(i.href) ? " on" : "")}>
              <Icone n={i.icone} />
              <span>{i.rotulo}</span>
              {!!i.badge && <span className="badge">{i.badge}</span>}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
