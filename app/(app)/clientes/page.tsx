import ListaPessoas from "@/components/ListaPessoas";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <ListaPessoas tipo="clientes" q={(await searchParams).q} />;
}
