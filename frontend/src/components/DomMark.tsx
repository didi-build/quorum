export function DomMark({ size = 48 }: { size?: number }) {
  const dot = Math.max(6, Math.round(size * 0.17));
  const gap = Math.max(4, Math.round(size * 0.1));
  const barWidth = Math.max(18, Math.round(size * 0.54));
  const barHeight = Math.max(4, Math.round(size * 0.1));

  return (
    <div
      className="quorum-mark"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.25) }}
      aria-hidden="true"
    >
      <div className="quorum-mark__dots" style={{ gap }}>
        <span style={{ width: dot, height: dot, marginTop: dot * 0.35 }} />
        <span style={{ width: dot, height: dot }} />
        <span style={{ width: dot, height: dot, marginTop: dot * 0.35 }} />
      </div>
      <span
        style={{ width: barWidth, height: barHeight, borderRadius: barHeight / 2 }}
      />
    </div>
  );
}
