import { brl, MESES } from "@/lib/format";

const k = (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "k" : String(Math.round(v)));

/** Rosca do saldo por conta */
export function Rosca({ partes, total }: { partes: { valor: number; cor: string }[]; total: number }) {
  const r = 70, c = 2 * Math.PI * r;
  const soma = partes.reduce((s, p) => s + Math.max(0, p.valor), 0);
  let off = 0;
  return (
    <svg viewBox="0 0 200 200" style={{ width: "100%", maxWidth: 220, margin: "0 auto", display: "block" }} role="img" aria-label={`Saldo total ${brl(total)}`}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="var(--line)" strokeWidth="22" />
      {soma > 0 && partes.map((p, i) => {
        const len = (Math.max(0, p.valor) / soma) * c;
        const el = <circle key={i} cx="100" cy="100" r={r} fill="none" stroke={p.cor} strokeWidth="22" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 100 100)" />;
        off += len;
        return el;
      })}
      <text x="100" y="94" textAnchor="middle" fontSize="12" fill="var(--muted)">Total</text>
      <text x="100" y="116" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--fg)" fontFamily="Sora, sans-serif">{brl(total)}</text>
    </svg>
  );
}

/** Velocímetro da saúde do caixa (0..1) */
export function Velocimetro({ v }: { v: number }) {
  const cx = 150, cy = 150, r = 110;
  const pt = (a: number, rr = r) => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)];
  const cores = ["#E5484D", "#EF7A43", "#F5B83D", "#B9D34A", "#35C487"];
  const an = Math.PI - Math.max(0, Math.min(1, v)) * Math.PI;
  const [nx, ny] = pt(an, r - 26);
  return (
    <svg viewBox="0 0 300 196" style={{ width: "100%", maxWidth: 320, display: "block", margin: "0 auto" }} role="img" aria-label={`Saúde do caixa ${Math.round(v * 100)}%`}>
      {cores.map((cor, i) => {
        const s = Math.PI - (i / 5) * Math.PI, e = Math.PI - ((i + 1) / 5) * Math.PI;
        const [x1, y1] = pt(s), [x2, y2] = pt(e);
        return <path key={i} d={`M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`} stroke={cor} strokeWidth="18" fill="none" />;
      })}
      {[0, 20, 40, 60, 80, 100].map((p) => { const [x, y] = pt(Math.PI - (p / 100) * Math.PI, r + 24); return <text key={p} x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="var(--muted)">{p}%</text>; })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--fg)" strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="8" fill="var(--fg)" />
      <text x={cx} y={cy + 38} textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--fg)" fontFamily="Sora, sans-serif">{(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</text>
    </svg>
  );
}

/** Área: projeção diária do saldo */
export function Area({ pontos, rotulos }: { pontos: number[]; rotulos: string[] }) {
  const W = 600, H = 150, pl = 44, pr = 8, pt = 10, pb = 22;
  const min = Math.min(0, ...pontos), max = Math.max(1, ...pontos);
  const x = (i: number) => pl + (i / Math.max(1, pontos.length - 1)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - (v - min) / (max - min || 1)) * (H - pt - pb);
  const linha = pontos.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const ticks = [min, (min + max) / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Projeção diária do saldo">
      {ticks.map((t, i) => <g key={i}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={pl - 6} y={y(t) + 4} textAnchor="end">{k(t)}</text></g>)}
      <path d={`${linha} L${x(pontos.length - 1)} ${y(min)} L${x(0)} ${y(min)} Z`} fill="color-mix(in srgb, var(--brand) 18%, transparent)" />
      <path d={linha} fill="none" stroke="var(--brand)" strokeWidth="2" />
      <circle cx={x(pontos.length - 1)} cy={y(pontos[pontos.length - 1])} r="3.5" fill="var(--brand)" />
      {rotulos.map((r, i) => (i % 5 === 0 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{r}</text> : null))}
    </svg>
  );
}

/** Barras agrupadas por mês + linha */
export function BarrasMes({ series, linha }: { series: { nome: string; cor: string; valores: number[] }[]; linha?: { nome: string; cor: string; valores: number[] } }) {
  const W = 900, H = 240, pl = 48, pr = 10, pt = 12, pb = 24;
  const todos = [...series.flatMap((s) => s.valores), ...(linha?.valores || [])];
  const max = Math.max(1, ...todos), min = Math.min(0, ...todos);
  const y = (v: number) => pt + (1 - (v - min) / (max - min || 1)) * (H - pt - pb);
  const bw = (W - pl - pr) / 12, gw = (bw * 0.7) / series.length;
  const ticks = [min, min + (max - min) / 2, max].filter((v, i, a) => a.indexOf(v) === i);
  const cx = (m: number) => pl + bw * m + bw / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Valores por mês">
      {ticks.map((t, i) => <g key={i}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={pl - 6} y={y(t) + 4} textAnchor="end">{k(t)}</text></g>)}
      {MESES.map((m, i) => (
        <g key={m}>
          {series.map((s, j) => {
            const v = s.valores[i] || 0, x0 = pl + bw * i + bw * 0.15 + gw * j;
            return <rect key={j} x={x0} y={Math.min(y(v), y(0))} width={gw - 2} height={Math.abs(y(v) - y(0))} rx="3" fill={s.cor}><title>{`${s.nome} ${m}: ${brl(v)}`}</title></rect>;
          })}
          <text x={cx(i)} y={H - 6} textAnchor="middle">{m}</text>
        </g>
      ))}
      {linha && <>
        <path d={linha.valores.map((v, i) => `${i ? "L" : "M"}${cx(i)} ${y(v)}`).join(" ")} fill="none" stroke={linha.cor} strokeWidth="2" />
        {linha.valores.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r="3" fill={linha.cor}><title>{`${linha.nome} ${MESES[i]}: ${brl(v)}`}</title></circle>)}
      </>}
    </svg>
  );
}

/** Barras horizontais (para onde vai o dinheiro) */
export function BarrasH({ itens, cor }: { itens: [string, number][]; cor: string }) {
  const max = Math.max(1, ...itens.map((i) => i[1]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {itens.map(([n, v]) => (
        <div key={n} style={{ display: "grid", gridTemplateColumns: "150px 1fr 110px", gap: 10, alignItems: "center", fontSize: 13 }}>
          <span className="muted">{n}</span>
          <span style={{ height: 14, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(v / max) * 100}%`, background: cor, borderRadius: 4 }} /></span>
          <span className="num" style={{ textAlign: "right" }}>{brl(v)}</span>
        </div>
      ))}
    </div>
  );
}
