/** Small 7-day line, coloured by direction. Pure SVG, no chart library. */
export function Sparkline({ points, width = 120, height = 36 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="muted">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - 2 - ((p - min) / span) * (height - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
  const up = points[points.length - 1]! >= points[0]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`sparkline ${up ? "up" : "down"}`} aria-hidden>
      <path d={d} fill="none" strokeWidth="1.5" />
    </svg>
  );
}
