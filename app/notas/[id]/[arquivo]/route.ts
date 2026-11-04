import { contexto } from "@/lib/empresa";
import { obterPdf, obterXml, type NotaArquivos } from "@/lib/notas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /notas/<id>/pdf ou /notas/<id>/xml — arquivos da nota, só para quem tem acesso à empresa */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const { id, arquivo } = await params;
  const { sb, empresaId } = await contexto();
  const { data: n } = await sb.from("notas_fiscais").select("id,empresa_id,chave_acesso,ambiente,pdf_path,xml_path,numero").eq("id", id).eq("empresa_id", empresaId).single();
  if (!n) return new Response("Nota não encontrada", { status: 404 });
  try {
    if (arquivo === "xml") {
      const xml = await obterXml(sb, n as NotaArquivos);
      if (!xml) return new Response("XML não disponível", { status: 404 });
      return new Response(new Uint8Array(xml), { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="NFS-e-${n.numero}.xml"` } });
    }
    const pdf = await obterPdf(sb, n as NotaArquivos);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="NFS-e-${n.numero}.pdf"` } });
  } catch (e) {
    return new Response((e as Error).message, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
