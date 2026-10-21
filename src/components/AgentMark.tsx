/** The Leve mark: a ring inside a rounded square. */
export function AgentMark({ size, radius, ring, stroke }: { size: number; radius: number; ring: number; stroke: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <div style={{ width: ring, height: ring, borderRadius: ring / 2, border: `${stroke}px solid var(--onPri)` }} />
    </div>
  );
}
