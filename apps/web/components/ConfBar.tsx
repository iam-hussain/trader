/** Confidence bar 0..100 with a yellow→green gradient fill. */
export function ConfBar({ value, width = 60 }: { value: number; width?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="conf-bar" style={{ width }}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}
