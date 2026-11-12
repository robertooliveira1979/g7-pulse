import ListaTitulos from "@/components/ListaTitulos";

export default async function Page({ searchParams }: { searchParams: Promise<{ st?: string; q?: string; mes?: string; cc?: string; erro?: string }> }) {
  return <ListaTitulos tipo="pagar" filtros={await searchParams} />;
}
