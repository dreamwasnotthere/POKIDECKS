import { formatTypeName, getTypeColor } from '../utils/typeEffectiveness.ts';

interface TypeLabelProps {
  type: string;
  compact?: boolean;
}

export function TypeLabel({ type, compact = false }: TypeLabelProps) {
  const color = getTypeColor(type);
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium whitespace-nowrap shrink-0 ${
        compact ? 'text-xs' : 'text-xs'
      }`}
      style={{ color: color.text }}
    >
      <span
        className="w-2.5 h-2.5 rounded-[2px] shrink-0 border border-black/10"
        style={{ backgroundColor: color.hex }}
        aria-hidden="true"
      />
      <span>{formatTypeName(type)}</span>
    </span>
  );
}
