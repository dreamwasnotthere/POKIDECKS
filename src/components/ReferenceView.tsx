import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  AbilityDetail,
  BerryDetail,
  GenerationDetail,
  ItemDetail,
  MoveDetail,
  RegionDetail,
  TypeRecord,
} from '../types/pokemon.ts';
import { ALL_TYPES, formatTypeName, getTypeColor } from '../utils/typeEffectiveness.ts';
import { PokemonImage } from './PokemonImage.tsx';
import { TypeLabel } from './TypeLabel.tsx';

interface ReferenceViewProps {
  typeMatrix: TypeRecord[];
  onInspectPokemon: (slug: string) => void;
}

type LookupCategory = 'move' | 'ability' | 'item' | 'berry' | 'generation' | 'region';

const SAMPLE_QUERIES: Record<LookupCategory, string[]> = {
  move: ['earthquake', 'draco-meteor', 'u-turn', 'stealth-rock', 'spore'],
  ability: ['intimidate', 'levitate', 'rough-skin', 'magic-guard', 'prankster'],
  item: ['leftovers', 'choice-scarf', 'heavy-duty-boots', 'focus-sash', 'life-orb'],
  berry: ['sitrus', 'lum', 'yache', 'salac', 'aguav'],
  generation: ['1', '3', '4', '5', '9'],
  region: ['kanto', 'hoenn', 'sinnoh', 'unova', 'paldea'],
};

export function ReferenceView({ typeMatrix, onInspectPokemon }: ReferenceViewProps) {
  const [subView, setSubView] = useState<'matrix' | 'lookup'>('matrix');
  const [selectedAtk, setSelectedAtk] = useState<string | null>(null);

  const [category, setCategory] = useState<LookupCategory>('move');
  const [query, setQuery] = useState('earthquake');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const matrixLookup = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const atk of ALL_TYPES) {
      map.set(atk, new Map());
    }
    for (const defType of typeMatrix) {
      const def = defType.name.toLowerCase();
      for (const atk of defType.damageRelations.doubleDamageFrom) {
        map.get(atk)?.set(def, 2);
      }
      for (const atk of defType.damageRelations.halfDamageFrom) {
        map.get(atk)?.set(def, 0.5);
      }
      for (const atk of defType.damageRelations.noDamageFrom) {
        map.get(atk)?.set(def, 0);
      }
    }
    return map;
  }, [typeMatrix]);

  const runLookup = async (cat: LookupCategory, q: string) => {
    const clean = q.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/pokeapi/${cat}/${encodeURIComponent(clean)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Could not find ${cat} "${clean}"`);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Segmented Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            PokéAPI Reference & Type Matrix
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live 18×18 type chart and encyclopedia lookup for moves, abilities, items, berries, and
            regions
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSubView('matrix')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subView === 'matrix'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            18×18 Type Matrix
          </button>
          <button
            type="button"
            onClick={() => {
              setSubView('lookup');
              if (!result && !loading) runLookup(category, query);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subView === 'lookup'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Moves · Items · Regions
          </button>
        </div>
      </div>

      {subView === 'matrix' ? (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span>Rows = Attacking Type · Columns = Defending Type (click a row to highlight)</span>
            <div className="flex items-center gap-4 font-mono tabular-nums">
              <span className="text-emerald-700 font-semibold">2× Super Effective</span>
              <span className="text-amber-700 font-semibold">½× Not Very Effective</span>
              <span className="text-slate-700 font-semibold">0× No Effect</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px] font-mono tabular-nums">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2 px-3 text-left font-sans font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    ATK \ DEF
                  </th>
                  {ALL_TYPES.map((def) => {
                    const color = getTypeColor(def);
                    return (
                      <th
                        key={def}
                        className="py-2 px-1.5 text-center font-sans font-semibold text-slate-800 min-w-[44px]"
                        title={`Defending: ${formatTypeName(def)}`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className="w-2.5 h-2.5 rounded-[2px] border border-black/10"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span className="text-[10px] uppercase tracking-tight">
                            {def.slice(0, 3)}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ALL_TYPES.map((atk) => {
                  const isSelected = selectedAtk === atk;
                  return (
                    <tr
                      key={atk}
                      onClick={() => setSelectedAtk(isSelected ? null : atk)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-red-50/40' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 font-sans">
                        <TypeLabel type={atk} compact />
                      </td>
                      {ALL_TYPES.map((def) => {
                        const mult = matrixLookup.get(atk)?.get(def) ?? 1;
                        return (
                          <td
                            key={`${atk}-${def}`}
                            className={`py-2 px-1.5 text-center ${
                              mult === 2
                                ? 'bg-emerald-50 text-emerald-800 font-bold'
                                : mult === 0.5
                                  ? 'bg-amber-50 text-amber-800 font-semibold'
                                  : mult === 0
                                    ? 'bg-slate-200 text-slate-800 font-bold'
                                    : 'text-slate-300'
                            }`}
                          >
                            {mult === 2 ? '2×' : mult === 0.5 ? '½' : mult === 0 ? '0' : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {/* Category Segmented Controls */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            {(
              [
                { id: 'move', label: 'Moves' },
                { id: 'ability', label: 'Abilities' },
                { id: 'item', label: 'Items' },
                { id: 'berry', label: 'Berries' },
                { id: 'generation', label: 'Generations' },
                { id: 'region', label: 'Regions' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategory(cat.id);
                  const firstSample = SAMPLE_QUERIES[cat.id][0];
                  setQuery(firstSample);
                  runLookup(cat.id, firstSample);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  category === cat.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search Form */}
          <div className="space-y-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runLookup(category, query);
              }}
              className="flex flex-col sm:flex-row gap-2.5 max-w-xl"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${category} by name or ID...`}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {loading ? 'Querying...' : 'Fetch PokéAPI'}
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Examples:</span>
              {SAMPLE_QUERIES[category].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setQuery(sample);
                    runLookup(category, sample);
                  }}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white text-slate-700 capitalize transition-colors"
                >
                  {sample.replace(/-/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Result Card */}
          {error && (
            <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && result != null && (
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
              {category === 'move' && (() => {
                const m = result as MoveDetail;
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <h2 className="font-display text-lg font-semibold text-slate-900">{m.name}</h2>
                        <TypeLabel type={m.type} />
                      </div>
                      <span className="text-xs text-slate-500">
                        {m.generation} · {m.source === 'live' ? 'Live PokéAPI' : 'Cached'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-6 text-xs text-slate-700 tabular-nums">
                      <span>
                        Category: <strong className="text-slate-900">{m.damageClass}</strong>
                      </span>
                      <span>
                        Power: <strong className="font-mono text-slate-900">{m.power ?? '—'}</strong>
                      </span>
                      <span>
                        Accuracy:{' '}
                        <strong className="font-mono text-slate-900">
                          {m.accuracy !== null ? `${m.accuracy}%` : '—'}
                        </strong>
                      </span>
                      <span>
                        PP: <strong className="font-mono text-slate-900">{m.pp ?? '—'}</strong>
                      </span>
                      <span>
                        Priority: <strong className="font-mono text-slate-900">{m.priority}</strong>
                      </span>
                      <span>
                        Target: <strong className="text-slate-900">{m.target}</strong>
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{m.effect}</p>
                  </div>
                );
              })()}

              {category === 'ability' && (() => {
                const ab = result as AbilityDetail;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-display text-lg font-semibold text-slate-900">{ab.name}</h2>
                      <span className="text-xs text-slate-500">
                        {ab.generation} · {ab.pokemonCount} Pokémon ·{' '}
                        {ab.source === 'live' ? 'Live PokéAPI' : 'Cached'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{ab.effect}</p>
                    {ab.pokemonSample.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <p className="text-xs font-medium text-slate-600">
                          Sample Pokémon with {ab.name}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {ab.pokemonSample.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => onInspectPokemon(p)}
                              className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-red-300 text-xs text-slate-800 transition-colors"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {category === 'item' && (() => {
                const it = result as ItemDetail;
                return (
                  <div className="flex items-start gap-4">
                    <PokemonImage src={it.sprite} alt={it.name} size="md" className="w-14 h-14" />
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-display text-lg font-semibold text-slate-900">{it.name}</h2>
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          {it.category} · {it.cost} ₽ · {it.source === 'live' ? 'Live' : 'Cached'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{it.effect}</p>
                      {it.attributes.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Attributes: {it.attributes.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {category === 'berry' && (() => {
                const b = result as BerryDetail;
                return (
                  <div className="flex items-start gap-4">
                    <PokemonImage src={b.sprite} alt={b.name} size="md" className="w-14 h-14" />
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-display text-lg font-semibold text-slate-900">{b.name}</h2>
                        <span className="text-xs text-slate-500">
                          {b.firmness} · {b.source === 'live' ? 'Live' : 'Cached'}
                        </span>
                      </div>
                      {b.effect && <p className="text-sm text-slate-700">{b.effect}</p>}
                      <div className="flex flex-wrap gap-5 text-xs text-slate-600 tabular-nums">
                        <span>
                          Growth: <strong className="font-mono text-slate-900">{b.growthTime}h</strong>
                        </span>
                        <span>
                          Max Harvest: <strong className="font-mono text-slate-900">{b.maxHarvest}</strong>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          Natural Gift:
                          <TypeLabel type={b.naturalGiftType} compact />
                          <strong className="font-mono text-slate-900">{b.naturalGiftPower}</strong>
                        </span>
                        <span>
                          Size: <strong className="font-mono text-slate-900">{b.sizeMm} mm</strong>
                        </span>
                      </div>
                      {b.flavors.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Flavors: {b.flavors.map((f) => `${f.name} (${f.potency})`).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {category === 'generation' && (() => {
                const g = result as GenerationDetail;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-display text-lg font-semibold text-slate-900">
                        {g.name} ({g.mainRegion})
                      </h2>
                      <span className="text-xs text-slate-500">
                        {g.source === 'live' ? 'Live PokéAPI' : 'Cached'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-6 text-xs text-slate-700 tabular-nums">
                      <span>
                        Species: <strong className="font-mono text-slate-900">{g.pokemonCount}</strong>
                      </span>
                      <span>
                        Moves: <strong className="font-mono text-slate-900">{g.moveCount}</strong>
                      </span>
                      <span>
                        Abilities: <strong className="font-mono text-slate-900">{g.abilityCount}</strong>
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Games: {g.versionGroups.join(' · ')}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {g.pokemonSample.slice(0, 24).map((p) => (
                        <button
                          key={p.slug}
                          type="button"
                          onClick={() => onInspectPokemon(p.slug)}
                          className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-red-300 text-xs text-slate-800 transition-colors"
                        >
                          <span className="font-mono text-slate-400 mr-1">#{p.id}</span>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {category === 'region' && (() => {
                const r = result as RegionDetail;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-display text-lg font-semibold text-slate-900">
                        {r.name} Region
                      </h2>
                      <span className="text-xs text-slate-500">
                        {r.mainGeneration} · {r.source === 'live' ? 'Live PokéAPI' : 'Cached'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Pokédexes: {r.pokedexes.join(' · ') || 'None'}
                    </p>
                    <p className="text-xs text-slate-600">
                      Version Groups: {r.versionGroups.join(' · ') || 'None'}
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-700">
                        Notable Locations ({r.locationsCount} total)
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {r.locationsSample.join(' · ')}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
