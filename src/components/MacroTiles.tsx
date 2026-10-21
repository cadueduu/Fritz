import type { Macros } from '../types';
import { fmt } from '../lib/format';

const TILES = [['p', 'Proteína', 'var(--mP)'], ['c', 'Carbo', 'var(--mC)'], ['g', 'Gordura', 'var(--mG)'], ['f', 'Fibra', 'var(--mF)']] as const;

export function MacroTiles({ m, small }: { m: Macros; small?: boolean }) {
  return (
    <div className="macro-tiles">
      {TILES.map(([k, label, color]) => (
        <div key={k} className={'macro-tile' + (small ? ' sm' : '')}>
          <span><span className="mdot" style={{ background: color }} />{label}</span>
          <span className="num">{fmt(m[k])} g</span>
        </div>
      ))}
    </div>
  );
}

export function MacroPills({ m }: { m: Macros }) {
  return (
    <div className="macro-pills">
      {(['p', 'c', 'g', 'f'] as const).map((k, i) => (
        <span key={k}><span className="mdot" style={{ background: ['var(--mP)', 'var(--mC)', 'var(--mG)', 'var(--mF)'][i] }} />{k.toUpperCase()} {fmt(m[k])} g</span>
      ))}
    </div>
  );
}
