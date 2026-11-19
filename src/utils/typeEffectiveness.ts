import type { TypeRecord } from '../types/pokemon.ts';

export const TYPE_COLORS: Record<string, { hex: string; text: string }> = {
  normal: { hex: '#A8A77A', text: '#444432' },
  fire: { hex: '#EE8130', text: '#9A3412' },
  water: { hex: '#6390F0', text: '#1E40AF' },
  electric: { hex: '#F7D02C', text: '#854D0E' },
  grass: { hex: '#7AC74C', text: '#166534' },
  ice: { hex: '#96D9D6', text: '#115E59' },
  fighting: { hex: '#C22E28', text: '#991B1B' },
  poison: { hex: '#A33EA1', text: '#6B21A8' },
  ground: { hex: '#E2BF65', text: '#854D0E' },
  flying: { hex: '#A98FF3', text: '#5B21B6' },
  psychic: { hex: '#F95587', text: '#9D174D' },
  bug: { hex: '#A6B91A', text: '#3F6212' },
  rock: { hex: '#B6A136', text: '#713F12' },
  ghost: { hex: '#735797', text: '#4C1D95' },
  dragon: { hex: '#6F35FC', text: '#4338CA' },
  dark: { hex: '#705746', text: '#3F2E21' },
  steel: { hex: '#B7B7CE', text: '#334155' },
  fairy: { hex: '#D685AD', text: '#831843' },
};

export const ALL_TYPES = Object.keys(TYPE_COLORS);

export function getTypeColor(typeName: string): { hex: string; text: string } {
  return TYPE_COLORS[typeName.toLowerCase()] ?? { hex: '#94A3B8', text: '#334155' };
}

export function formatTypeName(typeName: string): string {
  if (!typeName) return '';
  return typeName[0].toUpperCase() + typeName.slice(1).toLowerCase();
}

export function computeDefensiveMultipliers(
  defenderTypes: string[],
  typeMatrix: TypeRecord[],
): Record<string, number> {
  const byName = new Map<string, TypeRecord>();
  for (const t of typeMatrix) {
    byName.set(t.name.toLowerCase(), t);
  }

  const multipliers: Record<string, number> = {};
  for (const attackingType of ALL_TYPES) {
    multipliers[attackingType] = 1;
  }

  for (const defType of defenderTypes) {
    const rec = byName.get(defType.toLowerCase());
    if (!rec) continue;
    for (const atk of rec.damageRelations.doubleDamageFrom) {
      if (atk in multipliers) multipliers[atk] *= 2;
    }
    for (const atk of rec.damageRelations.halfDamageFrom) {
      if (atk in multipliers) multipliers[atk] *= 0.5;
    }
    for (const atk of rec.damageRelations.noDamageFrom) {
      if (atk in multipliers) multipliers[atk] *= 0;
    }
  }

  return multipliers;
}

export function getStatBarColor(value: number): string {
  if (value >= 130) return 'bg-emerald-600';
  if (value >= 100) return 'bg-teal-600';
  if (value >= 75) return 'bg-slate-700';
  if (value >= 50) return 'bg-amber-600';
  return 'bg-red-600';
}
