import { MessageSquare, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PokemonProfile, PokemonSummary, TypeRecord } from '../types/pokemon.ts';
import {
  ALL_TYPES,
  computeDefensiveMultipliers,
  formatTypeName,
} from '../utils/typeEffectiveness.ts';
import { PokemonImage } from './PokemonImage.tsx';
import { TypeLabel } from './TypeLabel.tsx';

interface TeamBuilderViewProps {
  team: PokemonSummary[];
  typeMatrix: TypeRecord[];
  onAddPokemon: (mon: PokemonSummary) => void;
  onRemovePokemon: (slug: string) => void;
  onClearTeam: () => void;
  onInspectPokemon: (slug: string) => void;
  onAnalyzeTeamWithAi: () => void;
}

const SUGGESTED_STAPLES = [
  'garchomp',
  'corviknight',
  'rotom-wash',
  'volcarona',
  'kingambit',
  'iron-valiant',
  'charizard',
  'gengar',
  'tyranitar',
  'ferrothorn',
];

export function TeamBuilderView({
  team,
  typeMatrix,
  onAddPokemon,
  onRemovePokemon,
  onClearTeam,
  onInspectPokemon,
  onAnalyzeTeamWithAi,
}: TeamBuilderViewProps) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAddByName = async (nameOrSlug: string) => {
    const clean = nameOrSlug.trim();
    if (!clean || team.length >= 6 || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/pokeapi/pokemon/${encodeURIComponent(clean)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Could not find "${clean}"`);
      const profile = json as PokemonProfile;
      if (team.some((t) => t.slug === profile.slug)) {
        setAddError(`${profile.name} is already on your team.`);
        return;
      }
      onAddPokemon({
        id: profile.id,
        name: profile.name,
        slug: profile.slug,
        types: profile.types,
        sprite: profile.sprites.frontDefault,
        artwork: profile.sprites.artworkDefault,
        stats: profile.stats,
        abilities: profile.abilities.map((a) => (a.isHidden ? `${a.name} (Hidden)` : a.name)),
        source: profile.source,
        fetchedAt: profile.fetchedAt,
      });
      setQuery('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add Pokémon');
    } finally {
      setAdding(false);
    }
  };

  const teamCoverage = useMemo(() => {
    if (team.length === 0 || typeMatrix.length === 0) return [];
    const perMon = team.map((mon) => ({
      mon,
      mults: computeDefensiveMultipliers(mon.types, typeMatrix),
    }));

    return ALL_TYPES.map((atkType) => {
      let weakCount = 0;
      let resistCount = 0;
      let immuneCount = 0;
      const details = perMon.map(({ mon, mults }) => {
        const m = mults[atkType] ?? 1;
        if (m > 1) weakCount += 1;
        else if (m === 0) immuneCount += 1;
        else if (m < 1) resistCount += 1;
        return { slug: mon.slug, mult: m };
      });
      return {
        type: atkType,
        weakCount,
        resistCount,
        immuneCount,
        details,
      };
    });
  }, [team, typeMatrix]);

  const teamStatsAvg = useMemo(() => {
    if (team.length === 0) return null;
    const sum = team.reduce(
      (acc, m) => ({
        hp: acc.hp + m.stats.hp,
        attack: acc.attack + m.stats.attack,
        defense: acc.defense + m.stats.defense,
        specialAttack: acc.specialAttack + m.stats.specialAttack,
        specialDefense: acc.specialDefense + m.stats.specialDefense,
        speed: acc.speed + m.stats.speed,
        total: acc.total + m.stats.total,
      }),
      { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, total: 0 },
    );
    const n = team.length;
    return {
      hp: Math.round(sum.hp / n),
      attack: Math.round(sum.attack / n),
      defense: Math.round(sum.defense / n),
      specialAttack: Math.round(sum.specialAttack / n),
      specialDefense: Math.round(sum.specialDefense / n),
      speed: Math.round(sum.speed / n),
      total: Math.round(sum.total / n),
    };
  }, [team]);

  return (
    <div className="space-y-6">
      {/* Header & Add Controls */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-slate-900">
              Team Builder & Defensive Coverage
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Assemble up to 6 Pokémon from PokéAPI to evaluate shared weaknesses, resistances, and
              AI battle synergy
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {team.length > 0 && (
              <button
                type="button"
                onClick={onClearTeam}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Roster</span>
              </button>
            )}
            <button
              type="button"
              disabled={team.length === 0}
              onClick={onAnalyzeTeamWithAi}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Analyze Team with AI</span>
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddByName(query);
          }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
        >
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={team.length >= 6}
              placeholder={
                team.length >= 6
                  ? 'Team roster full (6/6)'
                  : 'Add Pokémon by name or #ID (e.g. Garchomp, Rotom-Wash, 149)...'
              }
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || team.length >= 6 || adding}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{adding ? 'Fetching...' : 'Add Pokémon'}</span>
          </button>
        </form>

        {addError && <p className="text-xs text-red-700">{addError}</p>}

        {/* Quick add staples */}
        {team.length < 6 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Quick add:</span>
            {SUGGESTED_STAPLES.filter((s) => !team.some((t) => t.slug === s))
              .slice(0, 6)
              .map((slug) => (
                <button
                  key={slug}
                  type="button"
                  disabled={adding}
                  onClick={() => handleAddByName(slug)}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 text-slate-700 font-medium capitalize transition-colors"
                >
                  + {slug.replace(/-/g, ' ')}
                </button>
              ))}
          </div>
        )}
      </section>

      {/* 6-Slot Roster Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, slotIdx) => {
          const mon = team[slotIdx];
          if (!mon) {
            return (
              <div
                key={`empty-${slotIdx}`}
                className="border border-dashed border-slate-300 rounded-xl p-5 flex flex-col items-center justify-center text-center min-h-[164px] bg-slate-50/40"
              >
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  Slot {slotIdx + 1} / 6
                </span>
                <p className="text-xs text-slate-500 mt-1">Empty party slot</p>
              </div>
            );
          }

          return (
            <div
              key={mon.slug}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PokemonImage src={mon.artwork} alt={mon.name} size="md" className="w-16 h-16" />
                  <div className="min-w-0">
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      #{String(mon.id).padStart(4, '0')} · BST {mon.stats.total}
                    </span>
                    <h2 className="font-display text-base font-semibold text-slate-900 truncate">
                      {mon.name}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      {mon.types.map((t) => (
                        <TypeLabel key={t} type={t} compact />
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemovePokemon(mon.slug)}
                  aria-label={`Remove ${mon.name}`}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-6 gap-1 pt-2 border-t border-slate-100 text-center font-mono text-[11px] tabular-nums">
                <div>
                  <span className="block text-slate-400">HP</span>
                  <span className="font-semibold text-slate-800">{mon.stats.hp}</span>
                </div>
                <div>
                  <span className="block text-slate-400">ATK</span>
                  <span className="font-semibold text-slate-800">{mon.stats.attack}</span>
                </div>
                <div>
                  <span className="block text-slate-400">DEF</span>
                  <span className="font-semibold text-slate-800">{mon.stats.defense}</span>
                </div>
                <div>
                  <span className="block text-slate-400">SPA</span>
                  <span className="font-semibold text-slate-800">{mon.stats.specialAttack}</span>
                </div>
                <div>
                  <span className="block text-slate-400">SPD</span>
                  <span className="font-semibold text-slate-800">{mon.stats.specialDefense}</span>
                </div>
                <div>
                  <span className="block text-slate-400">SPE</span>
                  <span className="font-semibold text-slate-800">{mon.stats.speed}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500 truncate pr-2">
                  {mon.abilities.slice(0, 2).join(' / ')}
                </span>
                <button
                  type="button"
                  onClick={() => onInspectPokemon(mon.slug)}
                  className="font-medium text-red-600 hover:text-red-800 whitespace-nowrap shrink-0"
                >
                  Inspect Dex
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Defensive Coverage Table */}
      {team.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Team Defensive Matrix
              </h2>
              <p className="text-xs text-slate-500">
                Damage multipliers across all 18 attacking types calculated from live PokéAPI type
                relations
              </p>
            </div>
            {teamStatsAvg && (
              <div className="text-xs font-mono text-slate-600 tabular-nums">
                Avg BST <strong className="text-slate-900">{teamStatsAvg.total}</strong> · Avg Spe{' '}
                <strong className="text-slate-900">{teamStatsAvg.speed}</strong>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-semibold text-slate-700">Attacking Type</th>
                  {team.map((mon) => (
                    <th key={mon.slug} className="py-2.5 px-3 font-semibold text-slate-700 text-center">
                      {mon.name}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 font-semibold text-red-700 text-right">Weak</th>
                  <th className="py-2.5 px-3 font-semibold text-emerald-700 text-right">
                    Resist / Immune
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamCoverage.map((row) => (
                  <tr key={row.type} className="hover:bg-slate-50/70">
                    <td className="py-2 px-4">
                      <TypeLabel type={row.type} compact />
                    </td>
                    {row.details.map((d) => (
                      <td
                        key={`${row.type}-${d.slug}`}
                        className={`py-2 px-3 text-center font-mono tabular-nums ${
                          d.mult >= 4
                            ? 'bg-red-100 text-red-900 font-bold'
                            : d.mult === 2
                              ? 'bg-red-50 text-red-700 font-semibold'
                              : d.mult === 0
                                ? 'bg-slate-200/70 text-slate-800 font-semibold'
                                : d.mult <= 0.25
                                  ? 'bg-emerald-100 text-emerald-900 font-bold'
                                  : d.mult === 0.5
                                    ? 'bg-emerald-50 text-emerald-700 font-semibold'
                                    : 'text-slate-400'
                        }`}
                      >
                        {d.mult === 1 ? '1×' : `${d.mult}×`}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-red-700">
                      {row.weakCount}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {row.resistCount + row.immuneCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
