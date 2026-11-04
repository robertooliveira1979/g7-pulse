import ListaPessoas from "@/components/ListaPessoas";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <ListaPessoas tipo="fornecedores" q={(await searchParams).q} />;
}
