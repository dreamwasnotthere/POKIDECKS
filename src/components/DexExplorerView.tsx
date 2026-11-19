import {
  ChevronRight,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  DirectoryEntry,
  EvolutionStage,
  MoveDetail,
  PokemonEncounterEntry,
  PokemonProfile,
  PokemonSummary,
  TypeRecord,
} from '../types/pokemon.ts';
import {
  ALL_TYPES,
  computeDefensiveMultipliers,
  formatTypeName,
  getStatBarColor,
} from '../utils/typeEffectiveness.ts';
import { PokemonImage } from './PokemonImage.tsx';
import { TypeLabel } from './TypeLabel.tsx';

interface DexExplorerViewProps {
  selectedSlug: string;
  onSelectSlug: (slug: string) => void;
  typeMatrix: TypeRecord[];
  team: PokemonSummary[];
  onAddToTeam: (pokemon: PokemonSummary) => void;
  onAskAiAboutPokemon: (profile: PokemonProfile) => void;
}

const GENERATIONS = [
  { label: 'All Generations', value: 'all' },
  { label: 'Gen I · Kanto', value: '1' },
  { label: 'Gen II · Johto', value: '2' },
  { label: 'Gen III · Hoenn', value: '3' },
  { label: 'Gen IV · Sinnoh', value: '4' },
  { label: 'Gen V · Unova', value: '5' },
  { label: 'Gen VI · Kalos', value: '6' },
  { label: 'Gen VII · Alola', value: '7' },
  { label: 'Gen VIII · Galar', value: '8' },
  { label: 'Gen IX · Paldea', value: '9' },
];

function flattenEvolutionPaths(node: EvolutionStage): EvolutionStage[][] {
  if (!node.evolvesTo || node.evolvesTo.length === 0) {
    return [[node]];
  }
  const paths: EvolutionStage[][] = [];
  for (const child of node.evolvesTo) {
    for (const subPath of flattenEvolutionPaths(child)) {
      paths.push([node, ...subPath]);
    }
  }
  return paths;
}

export function DexExplorerView({
  selectedSlug,
  onSelectSlug,
  typeMatrix,
  team,
  onAddToTeam,
  onAskAiAboutPokemon,
}: DexExplorerViewProps) {
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [dirSource, setDirSource] = useState<'live' | 'cache'>('live');
  const [dirLoading, setDirLoading] = useState(true);
  const [dirError, setDirError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [genFilter, setGenFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [profile, setProfile] = useState<PokemonProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [shiny, setShiny] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'moves' | 'encounters'>('overview');
  const [selectedFlavorIdx, setSelectedFlavorIdx] = useState(0);

  const [moveFilter, setMoveFilter] = useState('all');
  const [moveQuery, setMoveQuery] = useState('');
  const [selectedMove, setSelectedMove] = useState<MoveDetail | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [encounters, setEncounters] = useState<PokemonEncounterEntry[] | null>(null);
  const [encountersSource, setEncountersSource] = useState<'live' | 'cache'>('live');
  const [encountersLoading, setEncountersLoading] = useState(false);
  const [encountersError, setEncountersError] = useState<string | null>(null);

  // Load directory
  useEffect(() => {
    let cancelled = false;
    setDirLoading(true);
    setDirError(null);
    const params = new URLSearchParams();
    if (genFilter !== 'all') params.set('generation', genFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);

    fetch(`/api/pokeapi/directory?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load directory');
        return json;
      })
      .then((data) => {
        if (!cancelled) {
          setDirectory(data.entries ?? []);
          setDirSource(data.source ?? 'live');
        }
      })
      .catch((err) => {
        if (!cancelled) setDirError(err instanceof Error ? err.message : 'Directory error');
      })
      .finally(() => {
        if (!cancelled) setDirLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [genFilter, typeFilter]);

  // Load selected Pokémon profile
  useEffect(() => {
    if (!selectedSlug) return;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    setSelectedFlavorIdx(0);
    setEncounters(null);
    setSelectedMove(null);
    setMoveError(null);

    fetch(`/api/pokeapi/pokemon/${encodeURIComponent(selectedSlug)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Could not find "${selectedSlug}"`);
        return json as PokemonProfile;
      })
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProfileError(err instanceof Error ? err.message : 'Failed to load Pokémon');
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  // Lazy-load encounters when switching to encounters tab
  useEffect(() => {
    if (activeSubTab !== 'encounters' || !profile || encounters !== null) return;
    let cancelled = false;
    setEncountersLoading(true);
    setEncountersError(null);

    fetch(`/api/pokeapi/pokemon/${encodeURIComponent(profile.slug)}/encounters`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to fetch encounters');
        return json;
      })
      .then((data) => {
        if (!cancelled) {
          setEncounters(data.encounters ?? []);
          setEncountersSource(data.source ?? 'live');
        }
      })
      .catch((err) => {
        if (!cancelled) setEncountersError(err instanceof Error ? err.message : 'Error loading encounters');
      })
      .finally(() => {
        if (!cancelled) setEncountersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSubTab, profile, encounters]);

  const filteredDirectory = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return directory.slice(0, 180);
    return directory
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.slug.toLowerCase().includes(q) ||
          String(d.id) === q.replace(/^#|^0+/g, ''),
      )
      .slice(0, 180);
  }, [directory, searchTerm]);

  const defensiveMatchups = useMemo(() => {
    if (!profile || typeMatrix.length === 0) return null;
    const mults = computeDefensiveMultipliers(profile.types, typeMatrix);
    const weaknesses: Array<{ type: string; mult: number }> = [];
    const resistances: Array<{ type: string; mult: number }> = [];
    const immunities: string[] = [];

    for (const [type, mult] of Object.entries(mults)) {
      if (mult === 0) immunities.push(type);
      else if (mult > 1) weaknesses.push({ type, mult });
      else if (mult < 1) resistances.push({ type, mult });
    }
    weaknesses.sort((a, b) => b.mult - a.mult);
    resistances.sort((a, b) => a.mult - b.mult);
    return { weaknesses, resistances, immunities };
  }, [profile, typeMatrix]);

  const filteredMoves = useMemo(() => {
    if (!profile) return [];
    const q = moveQuery.trim().toLowerCase();
    return profile.moves.filter((m) => {
      if (moveFilter !== 'all' && m.learnMethod.toLowerCase() !== moveFilter) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [profile, moveFilter, moveQuery]);

  const inspectMove = async (slug: string) => {
    setMoveLoading(true);
    setMoveError(null);
    try {
      const res = await fetch(`/api/pokeapi/move/${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load move');
      setSelectedMove(json as MoveDetail);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Move lookup failed');
    } finally {
      setMoveLoading(false);
    }
  };

  const handleDirectSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;
    if (filteredDirectory.length === 1) {
      onSelectSlug(filteredDirectory[0].slug);
    } else {
      onSelectSlug(q);
    }
  };

  const inTeam = profile ? team.some((t) => t.slug === profile.slug) : false;

  const evoPaths = useMemo(() => {
    if (!profile?.evolutionChain) return [];
    return flattenEvolutionPaths(profile.evolutionChain);
  }, [profile]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-6 items-start">
      {/* Left Directory Sidebar */}
      <aside className="bg-white border border-slate-200 rounded-xl flex flex-col max-h-[calc(100vh-140px)] lg:sticky lg:top-20">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-900">Pokédex Index</h2>
            <span className="text-[11px] text-slate-500 font-mono tabular-nums">
              {directory.length} · {dirSource === 'live' ? 'Live' : 'Cached'}
            </span>
          </div>

          <form onSubmit={handleDirectSearchSubmit} className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Name or #ID (Enter to load)"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
          </form>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={genFilter}
              onChange={(e) => setGenFilter(e.target.value)}
              aria-label="Filter by generation"
              className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-red-600"
            >
              {GENERATIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by type"
              className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-red-600"
            >
              <option value="all">All Types</option>
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {formatTypeName(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto dex-scroll divide-y divide-slate-100">
          {dirLoading ? (
            <div className="p-4 space-y-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : dirError ? (
            <div className="p-4 text-xs text-red-700">{dirError}</div>
          ) : filteredDirectory.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">
              No matches in list. Press Enter to query PokéAPI directly for “{searchTerm}”.
            </div>
          ) : (
            filteredDirectory.map((entry) => {
              const active =
                profile?.slug === entry.slug ||
                profile?.id === entry.id ||
                selectedSlug.toLowerCase() === entry.slug;
              return (
                <button
                  key={`${entry.id}-${entry.slug}`}
                  type="button"
                  onClick={() => onSelectSlug(entry.slug)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                    active ? 'bg-red-50/70 text-slate-900' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <PokemonImage src={entry.sprite} alt={entry.name} size="sm" className="w-7 h-7" />
                  <span className="font-mono text-xs text-slate-400 tabular-nums w-11 shrink-0">
                    #{String(entry.id).padStart(4, '0')}
                  </span>
                  <span className={`text-xs truncate flex-1 ${active ? 'font-semibold' : 'font-medium'}`}>
                    {entry.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Dossier Viewport */}
      <section className="bg-white border border-slate-200 rounded-xl min-h-[600px]">
        {profileLoading ? (
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-6">
              <div className="w-36 h-36 bg-slate-100 rounded-xl animate-pulse" />
              <div className="space-y-3 flex-1">
                <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
                <div className="h-8 w-56 bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-44 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
            <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
          </div>
        ) : profileError || !profile ? (
          <div className="p-8 max-w-lg space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Pokémon Lookup Failed
            </h2>
            <p className="text-sm text-red-700">
              {profileError || 'Could not retrieve this Pokémon from PokéAPI.'}
            </p>
            <p className="text-xs text-slate-500">
              Check spelling (e.g., “mr-mime”, “ho-oh”, “great-tusk”) or select a species from the
              directory.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {/* Hero Dossier Header */}
            <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="relative flex items-center justify-center w-40 h-40 rounded-xl bg-slate-50 border border-slate-200 shrink-0">
                  <PokemonImage
                    src={shiny ? profile.sprites.artworkShiny : profile.sprites.artworkDefault}
                    alt={`${profile.name} official artwork`}
                    size="xl"
                    className="w-36 h-36"
                  />
                  <button
                    type="button"
                    onClick={() => setShiny((s) => !s)}
                    title="Toggle shiny coloration"
                    className={`absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                      shiny
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{shiny ? 'Shiny' : 'Normal'}</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-700 tabular-nums">
                      #{String(profile.id).padStart(4, '0')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{profile.genus}</span>
                    <span aria-hidden="true">·</span>
                    <span>{profile.generation}</span>
                    {(profile.isLegendary || profile.isMythical) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-amber-700">
                          {profile.isMythical ? 'Mythical' : 'Legendary'}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className={profile.source === 'live' ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
                      {profile.source === 'live' ? 'Live PokéAPI' : 'Cached PokéAPI'}
                    </span>
                  </div>

                  <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                    {profile.name}
                  </h1>

                  <div className="flex items-center gap-4 pt-0.5">
                    {profile.types.map((t) => (
                      <TypeLabel key={t} type={t} />
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 pt-1 tabular-nums">
                    <span>
                      Height <strong className="font-mono text-slate-900">{profile.heightMeters} m</strong>
                    </span>
                    <span>
                      Weight <strong className="font-mono text-slate-900">{profile.weightKilograms} kg</strong>
                    </span>
                    {profile.captureRate !== null && (
                      <span>
                        Catch Rate <strong className="font-mono text-slate-900">{profile.captureRate}</strong>
                      </span>
                    )}
                    <span>
                      BST <strong className="font-mono text-slate-900">{profile.stats.total}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap md:flex-col gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onAskAiAboutPokemon(profile)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Ask AI Strategy</span>
                </button>
                <button
                  type="button"
                  disabled={inTeam || team.length >= 6}
                  onClick={() =>
                    onAddToTeam({
                      id: profile.id,
                      name: profile.name,
                      slug: profile.slug,
                      types: profile.types,
                      sprite: profile.sprites.frontDefault,
                      artwork: profile.sprites.artworkDefault,
                      stats: profile.stats,
                      abilities: profile.abilities.map((a) =>
                        a.isHidden ? `${a.name} (Hidden)` : a.name,
                      ),
                      source: profile.source,
                      fetchedAt: profile.fetchedAt,
                    })
                  }
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{inTeam ? 'In Active Team' : team.length >= 6 ? 'Team Full (6/6)' : 'Add to Team'}</span>
                </button>
              </div>
            </div>

            {/* Sub-Navigation Bar */}
            <div className="px-6 py-2.5 bg-slate-50/70 flex items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-200/60 rounded-lg">
                {(
                  [
                    { id: 'overview', label: 'Overview & Stats' },
                    { id: 'moves', label: `Learnset (${profile.moves.length})` },
                    { id: 'encounters', label: 'Locations & Encounters' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSubTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      activeSubTab === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab 1: Overview */}
            {activeSubTab === 'overview' && (
              <div className="p-6 space-y-8">
                {/* Base Stats & Defensive Matchups */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="flex items-baseline justify-between">
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Base Stats
                      </h2>
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        Total {profile.stats.total}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {(
                        [
                          { label: 'HP', value: profile.stats.hp },
                          { label: 'Attack', value: profile.stats.attack },
                          { label: 'Defense', value: profile.stats.defense },
                          { label: 'Sp. Atk', value: profile.stats.specialAttack },
                          { label: 'Sp. Def', value: profile.stats.specialDefense },
                          { label: 'Speed', value: profile.stats.speed },
                        ] as const
                      ).map((stat) => {
                        const pct = Math.min(100, Math.round((stat.value / 200) * 100));
                        return (
                          <div key={stat.label} className="grid grid-cols-[72px_44px_1fr] items-center gap-3">
                            <span className="text-xs font-medium text-slate-600">{stat.label}</span>
                            <span className="text-xs font-mono font-semibold text-slate-900 text-right tabular-nums">
                              {stat.value}
                            </span>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${getStatBarColor(stat.value)}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Defensive Weaknesses & Resistances */}
                  <div className="space-y-4">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Defensive Type Matchups
                    </h2>
                    {!defensiveMatchups ? (
                      <p className="text-xs text-slate-500">Loading type effectiveness matrix...</p>
                    ) : (
                      <div className="space-y-4 text-xs">
                        <div>
                          <p className="font-medium text-slate-700 mb-1.5">Weaknesses (2× / 4×)</p>
                          {defensiveMatchups.weaknesses.length === 0 ? (
                            <p className="text-slate-500">None</p>
                          ) : (
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              {defensiveMatchups.weaknesses.map((w) => (
                                <span key={w.type} className="inline-flex items-center gap-1.5">
                                  <TypeLabel type={w.type} compact />
                                  <span className="font-mono font-semibold text-red-700 tabular-nums">
                                    {w.mult}×
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="font-medium text-slate-700 mb-1.5">Resistances (0.5× / 0.25×)</p>
                          {defensiveMatchups.resistances.length === 0 ? (
                            <p className="text-slate-500">None</p>
                          ) : (
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              {defensiveMatchups.resistances.map((r) => (
                                <span key={r.type} className="inline-flex items-center gap-1.5">
                                  <TypeLabel type={r.type} compact />
                                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                                    {r.mult}×
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="font-medium text-slate-700 mb-1.5">Immunities (0×)</p>
                          {defensiveMatchups.immunities.length === 0 ? (
                            <p className="text-slate-500">None</p>
                          ) : (
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              {defensiveMatchups.immunities.map((imm) => (
                                <span key={imm} className="inline-flex items-center gap-1.5">
                                  <TypeLabel type={imm} compact />
                                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                                    0×
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Abilities */}
                <div className="pt-6 border-t border-slate-200 space-y-3">
                  <h2 className="font-display text-base font-semibold text-slate-900">Abilities</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profile.abilities.map((ab) => (
                      <div
                        key={ab.slug}
                        className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">{ab.name}</span>
                          <span className="text-xs text-slate-500">
                            {ab.isHidden ? 'Hidden Ability' : 'Standard Ability'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{ab.shortEffect}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Evolution Chain */}
                {evoPaths.length > 0 && (
                  <div className="pt-6 border-t border-slate-200 space-y-3">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Evolution Chain
                    </h2>
                    <div className="space-y-3">
                      {evoPaths.map((path, pathIdx) => (
                        <div
                          key={pathIdx}
                          className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/40"
                        >
                          {path.map((stage, idx) => (
                            <div key={`${stage.slug}-${idx}`} className="flex items-center gap-2">
                              {idx > 0 && (
                                <div className="flex flex-col items-center px-1 text-center">
                                  <ChevronRight className="w-4 h-4 text-slate-400" />
                                  {stage.triggerDetails.length > 0 && (
                                    <span className="text-[11px] text-slate-500 max-w-[130px] leading-tight">
                                      {stage.triggerDetails[0]}
                                    </span>
                                  )}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => onSelectSlug(stage.slug)}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                                  stage.slug === profile.slug ||
                                  profile.slug.startsWith(`${stage.slug}-`) ||
                                  stage.id === profile.id
                                    ? 'border-red-600 bg-red-50/60 text-slate-900'
                                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                                }`}
                              >
                                <PokemonImage src={stage.sprite} alt={stage.name} size="sm" className="w-9 h-9" />
                                <div className="text-left">
                                  <span className="block text-[11px] font-mono text-slate-400 tabular-nums">
                                    #{String(stage.id).padStart(4, '0')}
                                  </span>
                                  <span className="block text-xs font-semibold text-slate-900">
                                    {stage.name}
                                  </span>
                                </div>
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pokédex Flavor Text & Training Details */}
                <div className="pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Pokédex Entry
                      </h2>
                      {profile.flavorTexts.length > 0 && (
                        <select
                          value={selectedFlavorIdx}
                          onChange={(e) => setSelectedFlavorIdx(Number(e.target.value))}
                          aria-label="Select game version"
                          className="text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700"
                        >
                          {profile.flavorTexts.map((f, idx) => (
                            <option key={f.version} value={idx}>
                              {f.version}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {profile.flavorTexts[selectedFlavorIdx]?.text ??
                        'No Pokédex flavor text available for this entry.'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Species & Breeding Metadata
                    </h2>
                    <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                      <dt className="text-slate-500">Growth Rate</dt>
                      <dd className="text-slate-900 font-medium">{profile.growthRate}</dd>
                      <dt className="text-slate-500">Egg Groups</dt>
                      <dd className="text-slate-900 font-medium">
                        {profile.eggGroups.length > 0 ? profile.eggGroups.join(', ') : 'Unknown'}
                      </dd>
                      <dt className="text-slate-500">Base Happiness</dt>
                      <dd className="text-slate-900 font-mono tabular-nums">
                        {profile.baseHappiness ?? '—'}
                      </dd>
                      <dt className="text-slate-500">Wild Held Items</dt>
                      <dd className="text-slate-900 font-medium">
                        {profile.heldItems.length > 0 ? profile.heldItems.join(', ') : 'None'}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Moveset */}
            {activeSubTab === 'moves' && (
              <div className="p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'level up', label: 'Level Up' },
                      { id: 'machine', label: 'TM / HM' },
                      { id: 'egg', label: 'Egg' },
                      { id: 'tutor', label: 'Tutor' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMoveFilter(opt.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          moveFilter === opt.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={moveQuery}
                      onChange={(e) => setMoveQuery(e.target.value)}
                      placeholder="Filter moves..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>

                {(selectedMove || moveLoading || moveError) && (
                  <div className="p-4 rounded-xl border border-slate-300 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Swords className="w-4 h-4 text-red-600" />
                        <span className="font-display text-sm font-semibold text-slate-900">
                          {moveLoading
                            ? 'Loading Move Details...'
                            : selectedMove
                              ? selectedMove.name
                              : 'Move Lookup Error'}
                        </span>
                        {selectedMove && (
                          <span className="text-xs text-slate-500">
                            · {selectedMove.source === 'live' ? 'Live' : 'Cached'}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMove(null);
                          setMoveError(null);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700"
                        aria-label="Close move details"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {moveError && <p className="text-xs text-red-700">{moveError}</p>}
                    {selectedMove && !moveLoading && (
                      <div className="space-y-2 text-xs">
                        <div className="flex flex-wrap items-center gap-4 text-slate-700 tabular-nums">
                          <TypeLabel type={selectedMove.type} compact />
                          <span>Category: {selectedMove.damageClass}</span>
                          <span>
                            Power: <strong className="font-mono">{selectedMove.power ?? '—'}</strong>
                          </span>
                          <span>
                            Accuracy:{' '}
                            <strong className="font-mono">
                              {selectedMove.accuracy !== null ? `${selectedMove.accuracy}%` : '—'}
                            </strong>
                          </span>
                          <span>
                            PP: <strong className="font-mono">{selectedMove.pp ?? '—'}</strong>
                          </span>
                          <span>
                            Priority: <strong className="font-mono">{selectedMove.priority}</strong>
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{selectedMove.effect}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="max-h-[420px] overflow-y-auto dex-scroll">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold text-slate-700">Move</th>
                          <th className="py-2.5 px-3 font-semibold text-slate-700">Method</th>
                          <th className="py-2.5 px-3 font-semibold text-slate-700 text-right">Level</th>
                          <th className="py-2.5 px-3 font-semibold text-slate-700">Version Group</th>
                          <th className="py-2.5 px-3 font-semibold text-slate-700 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMoves.slice(0, 120).map((m, i) => (
                          <tr key={`${m.slug}-${i}`} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-medium text-slate-900">{m.name}</td>
                            <td className="py-2 px-3 text-slate-600">{m.learnMethod}</td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                              {m.levelLearnedAt > 0 ? `Lv.${m.levelLearnedAt}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-500">{m.versionGroup}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => inspectMove(m.slug)}
                                className="text-xs font-medium text-red-600 hover:text-red-800"
                              >
                                Inspect
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Encounters */}
            {activeSubTab === 'encounters' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-500" />
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Wild Encounter Locations
                    </h2>
                  </div>
                  {encounters !== null && (
                    <span className="text-xs text-slate-500">
                      {encountersSource === 'live' ? 'Live PokéAPI' : 'Cached'} · {encounters.length}{' '}
                      {encounters.length === 1 ? 'area' : 'areas'}
                    </span>
                  )}
                </div>

                {encountersLoading ? (
                  <div className="space-y-2">
                    <div className="h-10 bg-slate-100 rounded animate-pulse" />
                    <div className="h-10 bg-slate-100 rounded animate-pulse" />
                    <div className="h-10 bg-slate-100 rounded animate-pulse" />
                  </div>
                ) : encountersError ? (
                  <p className="text-xs text-red-700">{encountersError}</p>
                ) : !encounters || encounters.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No wild encounter locations recorded on PokéAPI for {profile.name} (typically
                    obtained via evolution, starter selection, trade, or special event).
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold text-slate-700">Location Area</th>
                          <th className="py-2.5 px-3 font-semibold text-slate-700">Versions</th>
                          <th className="py-2.5 px-3 font-semibold text-slate-700">Methods</th>
                          <th className="py-2.5 px-3 font-semibold text-slate-700 text-right">
                            Max Chance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {encounters.map((enc, idx) => (
                          <tr key={`${enc.locationArea}-${idx}`} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-medium text-slate-900">
                              {enc.locationArea}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{enc.versions.join(', ')}</td>
                            <td className="py-2.5 px-3 text-slate-600">{enc.methods.join(', ')}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                              {enc.maxChance}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
