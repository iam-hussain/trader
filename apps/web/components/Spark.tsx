interface SparkProps {
  data: number[];
  width?: number;
  height?: number;
  fill?: boolean;
  color?: "auto" | "pos" | "neg" | "primary";
}

/** Inline SVG sparkline. Color "auto" uses success/danger based on first vs last. */
export function Spark({ data, width = 80, height = 24, fill = true, color = "auto" }: SparkProps) {
  if (data.length < 2) return <svg className="spark" width={width} height={height} />;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const isPos = data[data.length - 1] >= data[0];
  const stroke =
    color === "primary" ? "var(--primary)"
    : color === "pos" ? "var(--success)"
    : color === "neg" ? "var(--danger)"
    : isPos ? "var(--success)" : "var(--danger)";

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath =
    linePath +
    ` L${pts[pts.length - 1]![0].toFixed(1)},${height} L${pts[0]![0].toFixed(1)},${height} Z`;

  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && <path d={areaPath} fill={stroke} opacity={0.15} />}
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

/** Deterministic pseudo-random walk for placeholder data. */
export function walk(seed: number, n: number, drift = 0): number[] {
  let v = 100;
  let s = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280 - 0.5;
    v += r * 4 + drift;
    out.push(v);
  }
  return out;
}
