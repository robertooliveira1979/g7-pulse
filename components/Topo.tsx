import Tema from "./Tema";

export default function Topo({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return <header className="top"><h1>{titulo}</h1>{children}<Tema /></header>;
}
