import type {
  AbilityDetail,
  BerryDetail,
  DataSource,
  DirectoryEntry,
  EvolutionStage,
  GenerationDetail,
  ItemDetail,
  MoveDetail,
  PokemonAbilityInfo,
  PokemonEncounterEntry,
  PokemonMoveEntry,
  PokemonProfile,
  PokemonSummary,
  RegionDetail,
  StatBlock,
  TypeRecord,
} from '../types/pokemon.ts';

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const REQUEST_TIMEOUT_MS = 7000;
const DEFAULT_TTL_MS = 20 * 60 * 1000; // 20 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  fetchedAt: string;
}

const cache = new Map<string, CacheEntry<unknown>>();

export class PokeApiError extends Error {
  status: number;
  endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = 'PokeApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

const ROMAN_NUMERALS = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);

export function formatDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((part) => {
      if (!part) return part;
      if (ROMAN_NUMERALS.has(part.toLowerCase())) {
        return part.toUpperCase();
      }
      return part[0].toUpperCase() + part.slice(1);
    })
    .join(' ');
}

export function normalizeSlug(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/^#/, '').replace(/^0+(?=\d)/, '');
  const specialMap: Record<string, string> = {
    'nidoran♀': 'nidoran-f',
    'nidoran f': 'nidoran-f',
    'nidoran-f': 'nidoran-f',
    'nidoran♂': 'nidoran-m',
    'nidoran m': 'nidoran-m',
    'nidoran-m': 'nidoran-m',
    "farfetch'd": 'farfetchd',
    'farfetchd': 'farfetchd',
    "sirfetch'd": 'sirfetchd',
    'sirfetchd': 'sirfetchd',
    'mr. mime': 'mr-mime',
    'mr mime': 'mr-mime',
    'mr. rime': 'mr-rime',
    'mr rime': 'mr-rime',
    'mime jr.': 'mime-jr',
    'mime jr': 'mime-jr',
    'type: null': 'type-null',
    'type null': 'type-null',
    'jangmo-o': 'jangmo-o',
    'hakamo-o': 'hakamo-o',
    'kommo-o': 'kommo-o',
    'ho-oh': 'ho-oh',
    'porygon-z': 'porygon-z',
    'porygon2': 'porygon2',
    'flabébé': 'flabebe',
    'flabebe': 'flabebe',
  };
  if (specialMap[cleaned]) {
    return specialMap[cleaned];
  }
  return cleaned
    .replace(/['’.]/g, '')
    .replace(/[:\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractIdFromUrl(url: string): number {
  const match = url.match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : 0;
}

function officialArtworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

function defaultSpriteUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

async function fetchJsonWithCache<T>(
  pathOrUrl: string,
  ttlMs = DEFAULT_TTL_MS,
): Promise<{ data: T; source: DataSource; fetchedAt: string; endpoint: string }> {
  const endpoint = pathOrUrl.startsWith('http') ? pathOrUrl : `${POKEAPI_BASE}${pathOrUrl}`;
  const now = Date.now();
  const cached = cache.get(endpoint) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return {
      data: cached.data,
      source: 'cache',
      fetchedAt: cached.fetchedAt,
      endpoint,
    };
  }

  let lastError: unknown;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'PokeDexAI-ResearchConsole/1.0',
        },
      });
      clearTimeout(timer);

      if (response.status === 404) {
        throw new PokeApiError(`Resource not found on PokéAPI: ${endpoint}`, 404, endpoint);
      }

      if (response.status === 429 || response.status >= 500) {
        lastError = new PokeApiError(
          `PokéAPI returned HTTP ${response.status}`,
          response.status,
          endpoint,
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        throw new PokeApiError(
          `PokéAPI error HTTP ${response.status}`,
          response.status,
          endpoint,
        );
      }

      const data = (await response.json()) as T;
      const fetchedAt = new Date().toISOString();
      cache.set(endpoint, {
        data,
        expiresAt: Date.now() + ttlMs,
        fetchedAt,
      });

      return { data, source: 'live', fetchedAt, endpoint };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof PokeApiError && err.status === 404) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
        continue;
      }
    }
  }

  if (lastError instanceof PokeApiError) {
    throw lastError;
  }
  const message =
    lastError instanceof Error && lastError.name === 'AbortError'
      ? `PokéAPI request timed out after ${REQUEST_TIMEOUT_MS}ms`
      : lastError instanceof Error
        ? lastError.message
        : 'Unknown PokéAPI network failure';
  throw new PokeApiError(message, 503, endpoint);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseStats(rawStats: any[]): StatBlock {
  const byName: Record<string, number> = {};
  for (const entry of rawStats ?? []) {
    byName[entry.stat?.name] = Number(entry.base_stat ?? 0);
  }
  const hp = byName['hp'] ?? 0;
  const attack = byName['attack'] ?? 0;
  const defense = byName['defense'] ?? 0;
  const specialAttack = byName['special-attack'] ?? 0;
  const specialDefense = byName['special-defense'] ?? 0;
  const speed = byName['speed'] ?? 0;
  return {
    hp,
    attack,
    defense,
    specialAttack,
    specialDefense,
    speed,
    total: hp + attack + defense + specialAttack + specialDefense + speed,
  };
}

function formatEvolutionDetails(details: any[]): string[] {
  if (!Array.isArray(details) || details.length === 0) return [];
  const reasons: string[] = [];
  for (const d of details) {
    const parts: string[] = [];
    const trigger = d.trigger?.name;
    if (d.min_level) parts.push(`Lv. ${d.min_level}`);
    else if (trigger === 'trade') parts.push('Trade');
    else if (trigger === 'use-item' && d.item?.name) parts.push(`Use ${formatDisplayName(d.item.name)}`);
    else if (trigger === 'shed') parts.push('Empty party slot + Poké Ball');
    else if (trigger && trigger !== 'level-up') parts.push(formatDisplayName(trigger));

    if (d.min_happiness) parts.push(`Friendship ≥ ${d.min_happiness}`);
    if (d.min_affection) parts.push(`Affection ≥ ${d.min_affection}`);
    if (d.min_beauty) parts.push(`Beauty ≥ ${d.min_beauty}`);
    if (d.time_of_day) parts.push(`(${formatDisplayName(d.time_of_day)})`);
    if (d.held_item?.name) parts.push(`Holding ${formatDisplayName(d.held_item.name)}`);
    if (d.known_move?.name) parts.push(`Knowing ${formatDisplayName(d.known_move.name)}`);
    if (d.known_move_type?.name) parts.push(`Knowing ${formatDisplayName(d.known_move_type.name)} move`);
    if (d.location?.name) parts.push(`at ${formatDisplayName(d.location.name)}`);
    if (d.needs_overworld_rain) parts.push('in Rain');
    if (d.turn_upside_down) parts.push('Console upside-down');
    if (d.gender === 1) parts.push('(Female)');
    if (d.gender === 2) parts.push('(Male)');
    if (d.relative_physical_stats === 1) parts.push('(Atk > Def)');
    if (d.relative_physical_stats === -1) parts.push('(Def > Atk)');
    if (d.relative_physical_stats === 0) parts.push('(Atk = Def)');

    if (parts.length > 0) {
      reasons.push(parts.join(' '));
    } else if (trigger === 'level-up') {
      reasons.push('Level up');
    }
  }
  return Array.from(new Set(reasons));
}

function parseEvolutionNode(node: any): EvolutionStage {
  const slug = node.species?.name ?? 'unknown';
  const id = extractIdFromUrl(node.species?.url ?? '');
  return {
    id,
    name: formatDisplayName(slug),
    slug,
    sprite: id ? officialArtworkUrl(id) : '',
    triggerDetails: formatEvolutionDetails(node.evolution_details ?? []),
    evolvesTo: Array.isArray(node.evolves_to) ? node.evolves_to.map(parseEvolutionNode) : [],
  };
}

function cleanFlavorText(text: string): string {
  return text.replace(/[\f\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function fetchAbilityDetail(nameOrId: string): Promise<AbilityDetail> {
  const slug = normalizeSlug(nameOrId);
  const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/ability/${slug}`);
  const enEntry = (data.effect_entries ?? []).find((e: any) => e.language?.name === 'en');
  const enFlavor = (data.flavor_text_entries ?? []).find((e: any) => e.language?.name === 'en');
  const shortEffect = cleanFlavorText(enEntry?.short_effect || enFlavor?.flavor_text || 'No description available.');
  const effect = cleanFlavorText(enEntry?.effect || shortEffect);
  const pokemonSample = (data.pokemon ?? [])
    .slice(0, 18)
    .map((p: any) => formatDisplayName(p.pokemon?.name ?? ''));

  return {
    id: data.id,
    name: formatDisplayName(data.name),
    slug: data.name,
    generation: formatDisplayName(data.generation?.name ?? 'unknown'),
    shortEffect,
    effect,
    pokemonSample,
    pokemonCount: (data.pokemon ?? []).length,
    source,
    fetchedAt,
  };
}

async function fetchPokemonWithSpeciesFallback(slug: string) {
  try {
    return await fetchJsonWithCache<any>(`/pokemon/${slug}`);
  } catch (err) {
    if (err instanceof PokeApiError && err.status === 404) {
      const speciesRes = await fetchJsonWithCache<any>(`/pokemon-species/${slug}`);
      const varieties: any[] = speciesRes.data?.varieties ?? [];
      const defaultVar =
        varieties.find((v) => v.is_default)?.pokemon?.name ?? varieties[0]?.pokemon?.name;
      if (defaultVar && defaultVar !== slug) {
        return await fetchJsonWithCache<any>(`/pokemon/${defaultVar}`);
      }
    }
    throw err;
  }
}

export async function fetchPokemonProfile(nameOrId: string): Promise<PokemonProfile> {
  const slug = normalizeSlug(nameOrId);
  const { data: pokemon, source, fetchedAt, endpoint } = await fetchPokemonWithSpeciesFallback(slug);

  const speciesSlug = pokemon.species?.name || slug;
  let species: any = null;
  let evolutionChain: EvolutionStage | null = null;

  try {
    const speciesRes = await fetchJsonWithCache<any>(`/pokemon-species/${speciesSlug}`);
    species = speciesRes.data;
    if (species?.evolution_chain?.url) {
      const evoRes = await fetchJsonWithCache<any>(species.evolution_chain.url);
      if (evoRes.data?.chain) {
        evolutionChain = parseEvolutionNode(evoRes.data.chain);
      }
    }
  } catch {
    // Graceful fallback if species/evo chain is unavailable for an alternate form
  }

  const abilitiesRaw: any[] = pokemon.abilities ?? [];
  const abilities: PokemonAbilityInfo[] = await Promise.all(
    abilitiesRaw.map(async (entry) => {
      const abSlug = entry.ability?.name ?? 'unknown';
      try {
        const abDetail = await fetchAbilityDetail(abSlug);
        return {
          name: abDetail.name,
          slug: abSlug,
          isHidden: Boolean(entry.is_hidden),
          shortEffect: abDetail.shortEffect,
          effect: abDetail.effect,
          source: abDetail.source,
        };
      } catch {
        return {
          name: formatDisplayName(abSlug),
          slug: abSlug,
          isHidden: Boolean(entry.is_hidden),
          shortEffect: 'Ability description unavailable.',
          effect: 'Ability description unavailable.',
        };
      }
    }),
  );

  const genusEntry = (species?.genera ?? []).find((g: any) => g.language?.name === 'en');
  const seenVersions = new Set<string>();
  const flavorTexts: Array<{ version: string; text: string }> = [];
  for (const entry of species?.flavor_text_entries ?? []) {
    if (entry.language?.name === 'en' && entry.version?.name) {
      const version = formatDisplayName(entry.version.name);
      if (!seenVersions.has(version)) {
        seenVersions.add(version);
        flavorTexts.push({ version, text: cleanFlavorText(entry.flavor_text) });
      }
    }
  }

  const moves: PokemonMoveEntry[] = [];
  for (const m of pokemon.moves ?? []) {
    const details: any[] = [...(m.version_group_details ?? [])];
    if (details.length === 0) continue;
    details.sort((a, b) => {
      const vgDiff =
        extractIdFromUrl(b.version_group?.url ?? '') - extractIdFromUrl(a.version_group?.url ?? '');
      if (vgDiff !== 0) return vgDiff;
      const aLvl = a.move_learn_method?.name === 'level-up' ? 1 : 0;
      const bLvl = b.move_learn_method?.name === 'level-up' ? 1 : 0;
      return bLvl - aLvl;
    });
    const latest = details[0];
    if (latest) {
      moves.push({
        name: formatDisplayName(m.move?.name ?? ''),
        slug: m.move?.name ?? '',
        learnMethod: formatDisplayName(latest.move_learn_method?.name ?? 'other'),
        levelLearnedAt: Number(latest.level_learned_at ?? 0),
        versionGroup: formatDisplayName(latest.version_group?.name ?? ''),
      });
    }
  }
  moves.sort((a, b) => {
    if (a.learnMethod === 'Level Up' && b.learnMethod !== 'Level Up') return -1;
    if (a.learnMethod !== 'Level Up' && b.learnMethod === 'Level Up') return 1;
    if (a.learnMethod === 'Level Up' && b.learnMethod === 'Level Up') {
      return a.levelLearnedAt - b.levelLearnedAt;
    }
    return a.name.localeCompare(b.name);
  });

  const artworkDefault =
    pokemon.sprites?.other?.['official-artwork']?.front_default ||
    officialArtworkUrl(pokemon.id);
  const artworkShiny =
    pokemon.sprites?.other?.['official-artwork']?.front_shiny ||
    pokemon.sprites?.front_shiny ||
    artworkDefault;

  return {
    id: pokemon.id,
    name: formatDisplayName(pokemon.name),
    slug: pokemon.name,
    genus: genusEntry?.genus || 'Pokémon',
    generation: formatDisplayName(species?.generation?.name || 'unknown'),
    types: (pokemon.types ?? [])
      .sort((a: any, b: any) => a.slot - b.slot)
      .map((t: any) => t.type?.name),
    heightMeters: Number((pokemon.height / 10).toFixed(1)),
    weightKilograms: Number((pokemon.weight / 10).toFixed(1)),
    baseExperience: pokemon.base_experience ?? null,
    captureRate: species?.capture_rate ?? null,
    baseHappiness: species?.base_happiness ?? null,
    growthRate: formatDisplayName(species?.growth_rate?.name || 'unknown'),
    eggGroups: (species?.egg_groups ?? []).map((e: any) => formatDisplayName(e.name)),
    isLegendary: Boolean(species?.is_legendary),
    isMythical: Boolean(species?.is_mythical),
    stats: parseStats(pokemon.stats ?? []),
    abilities,
    sprites: {
      frontDefault: pokemon.sprites?.front_default || defaultSpriteUrl(pokemon.id),
      frontShiny: pokemon.sprites?.front_shiny || pokemon.sprites?.front_default || defaultSpriteUrl(pokemon.id),
      artworkDefault,
      artworkShiny,
    },
    evolutionChain,
    flavorTexts: flavorTexts.reverse(), // newest versions first
    moves,
    heldItems: (pokemon.held_items ?? []).map((h: any) => formatDisplayName(h.item?.name ?? '')),
    source,
    fetchedAt,
    endpoint,
  };
}

export function toSummary(profile: PokemonProfile): PokemonSummary {
  return {
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
  };
}

export async function fetchPokemonEncounters(
  nameOrId: string,
): Promise<{ encounters: PokemonEncounterEntry[]; source: DataSource; fetchedAt: string; endpoint: string }> {
  const slug = normalizeSlug(nameOrId);
  let res: { data: any[]; source: DataSource; fetchedAt: string; endpoint: string };
  try {
    res = await fetchJsonWithCache<any[]>(`/pokemon/${slug}/encounters`);
  } catch (err) {
    if (err instanceof PokeApiError && err.status === 404) {
      const resolved = await fetchPokemonWithSpeciesFallback(slug);
      res = await fetchJsonWithCache<any[]>(`/pokemon/${resolved.data.name}/encounters`);
    } else {
      throw err;
    }
  }
  const { data, source, fetchedAt, endpoint } = res;
  const encounters: PokemonEncounterEntry[] = (data ?? []).map((enc) => {
    const versions = new Set<string>();
    const methods = new Set<string>();
    let maxChance = 0;
    for (const vd of enc.version_details ?? []) {
      if (vd.version?.name) versions.add(formatDisplayName(vd.version.name));
      if (vd.max_chance > maxChance) maxChance = vd.max_chance;
      for (const ed of vd.encounter_details ?? []) {
        if (ed.method?.name) methods.add(formatDisplayName(ed.method.name));
      }
    }
    return {
      locationArea: formatDisplayName(enc.location_area?.name ?? 'unknown'),
      versions: Array.from(versions),
      maxChance,
      methods: Array.from(methods),
    };
  });
  return { encounters, source, fetchedAt, endpoint };
}

export async function fetchTypeRelations(typeName: string): Promise<TypeRecord> {
  const slug = normalizeSlug(typeName);
  const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/type/${slug}`);
  const dr = data.damage_relations ?? {};
  return {
    name: data.name,
    id: data.id,
    damageRelations: {
      doubleDamageFrom: (dr.double_damage_from ?? []).map((t: any) => t.name),
      halfDamageFrom: (dr.half_damage_from ?? []).map((t: any) => t.name),
      noDamageFrom: (dr.no_damage_from ?? []).map((t: any) => t.name),
      doubleDamageTo: (dr.double_damage_to ?? []).map((t: any) => t.name),
      halfDamageTo: (dr.half_damage_to ?? []).map((t: any) => t.name),
      noDamageTo: (dr.no_damage_to ?? []).map((t: any) => t.name),
    },
    pokemonCount: (data.pokemon ?? []).length,
    moveCount: (data.moves ?? []).length,
    source,
    fetchedAt,
  };
}

export const CORE_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const;

export async function fetchAllTypesMatrix(): Promise<TypeRecord[]> {
  return Promise.all(CORE_TYPES.map((t) => fetchTypeRelations(t)));
}

export async function computeTypeEffectivenessSummary(defenderTypes: string[]): Promise<{
  weaknesses: Record<string, number>;
  resistances: Record<string, number>;
  immunities: string[];
}> {
  const matrix = await fetchAllTypesMatrix();
  const byName = new Map(matrix.map((t) => [t.name.toLowerCase(), t]));
  const mults: Record<string, number> = {};
  for (const t of CORE_TYPES) {
    mults[t] = 1;
  }
  for (const def of defenderTypes) {
    const rec = byName.get(def.toLowerCase());
    if (!rec) continue;
    for (const atk of rec.damageRelations.doubleDamageFrom) mults[atk] = (mults[atk] ?? 1) * 2;
    for (const atk of rec.damageRelations.halfDamageFrom) mults[atk] = (mults[atk] ?? 1) * 0.5;
    for (const atk of rec.damageRelations.noDamageFrom) mults[atk] = 0;
  }
  const weaknesses: Record<string, number> = {};
  const resistances: Record<string, number> = {};
  const immunities: string[] = [];
  for (const [type, mult] of Object.entries(mults)) {
    if (mult === 0) immunities.push(type);
    else if (mult > 1) weaknesses[type] = mult;
    else if (mult < 1) resistances[type] = mult;
  }
  return { weaknesses, resistances, immunities };
}

export async function fetchMoveDetail(moveName: string): Promise<MoveDetail> {
  const slug = normalizeSlug(moveName);
  const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/move/${slug}`);
  const enEntry = (data.effect_entries ?? []).find((e: any) => e.language?.name === 'en');
  const enFlavor = (data.flavor_text_entries ?? []).find((e: any) => e.language?.name === 'en');
  const shortEffect = cleanFlavorText(
    (enEntry?.short_effect || enFlavor?.flavor_text || 'No description available.').replace(
      /\$effect_chance/g,
      String(data.effect_chance ?? ''),
    ),
  );
  const effect = cleanFlavorText(
    (enEntry?.effect || shortEffect).replace(/\$effect_chance/g, String(data.effect_chance ?? '')),
  );

  return {
    id: data.id,
    name: formatDisplayName(data.name),
    slug: data.name,
    type: data.type?.name ?? 'normal',
    damageClass: formatDisplayName(data.damage_class?.name ?? 'status'),
    power: data.power ?? null,
    accuracy: data.accuracy ?? null,
    pp: data.pp ?? null,
    priority: Number(data.priority ?? 0),
    effectChance: data.effect_chance ?? null,
    shortEffect,
    effect,
    target: formatDisplayName(data.target?.name ?? 'selected-pokemon'),
    generation: formatDisplayName(data.generation?.name ?? 'unknown'),
    source,
    fetchedAt,
  };
}

export async function fetchItemDetail(itemName: string): Promise<ItemDetail> {
  const slug = normalizeSlug(itemName);
  const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/item/${slug}`);
  const enEntry = (data.effect_entries ?? []).find((e: any) => e.language?.name === 'en');
  const enFlavor = (data.flavor_text_entries ?? []).find((e: any) => e.language?.name === 'en');
  const shortEffect = cleanFlavorText(enEntry?.short_effect || enFlavor?.text || 'No description available.');
  const effect = cleanFlavorText(enEntry?.effect || shortEffect);
  return {
    id: data.id,
    name: formatDisplayName(data.name),
    slug: data.name,
    category: formatDisplayName(data.category?.name ?? 'misc'),
    cost: Number(data.cost ?? 0),
    shortEffect,
    effect,
    sprite: data.sprites?.default || '',
    attributes: (data.attributes ?? []).map((a: any) => formatDisplayName(a.name)),
    source,
    fetchedAt,
  };
}

export async function fetchBerryDetail(berryName: string): Promise<BerryDetail> {
  const slug = normalizeSlug(berryName).replace(/-berry$/, '');
  const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/berry/${slug}`);
  let sprite = '';
  let effect = '';
  if (data.item?.name) {
    try {
      const item = await fetchItemDetail(data.item.name);
      sprite = item.sprite;
      effect = item.shortEffect;
    } catch {
      // ignore if item lookup fails
    }
  }
  return {
    id: data.id,
    name: `${formatDisplayName(data.name)} Berry`,
    slug: data.name,
    growthTime: Number(data.growth_time ?? 0),
    maxHarvest: Number(data.max_harvest ?? 0),
    naturalGiftPower: Number(data.natural_gift_power ?? 0),
    naturalGiftType: data.natural_gift_type?.name ?? 'normal',
    sizeMm: Number(data.size ?? 0),
    smoothness: Number(data.smoothness ?? 0),
    soilDryness: Number(data.soil_dryness ?? 0),
    firmness: formatDisplayName(data.firmness?.name ?? 'unknown'),
    flavors: (data.flavors ?? [])
      .filter((f: any) => f.potency > 0)
      .map((f: any) => ({ name: formatDisplayName(f.flavor?.name ?? ''), potency: f.potency })),
    sprite,
    effect,
    source,
    fetchedAt,
  };
}

export async function fetchGenerationDetail(genNameOrId: string): Promise<GenerationDetail> {
  const slug = normalizeSlug(genNameOrId);
  const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/generation/${slug}`);
  const pokemonSample = (data.pokemon_species ?? [])
    .map((p: any) => {
      const id = extractIdFromUrl(p.url ?? '');
      return { id, name: formatDisplayName(p.name), slug: p.name };
    })
    .sort((a: { id: number }, b: { id: number }) => a.id - b.id);

  return {
    id: data.id,
    name: formatDisplayName(data.name),
    slug: data.name,
    mainRegion: formatDisplayName(data.main_region?.name ?? 'unknown'),
    pokemonCount: (data.pokemon_species ?? []).length,
    moveCount: (data.moves ?? []).length,
    abilityCount: (data.abilities ?? []).length,
    types: (data.types ?? []).map((t: any) => t.name),
    versionGroups: (data.version_groups ?? []).map((v: any) => formatDisplayName(v.name)),
    pokemonSample,
    source,
    fetchedAt,
  };
}

export async function fetchRegionDetail(regionNameOrId: string): Promise<RegionDetail> {
  const slug = normalizeSlug(regionNameOrId);
  const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/region/${slug}`);
  return {
    id: data.id,
    name: formatDisplayName(data.name),
    slug: data.name,
    mainGeneration: formatDisplayName(data.main_generation?.name ?? 'unknown'),
    locationsCount: (data.locations ?? []).length,
    locationsSample: (data.locations ?? []).slice(0, 24).map((l: any) => formatDisplayName(l.name)),
    pokedexes: (data.pokedexes ?? []).map((p: any) => formatDisplayName(p.name)),
    versionGroups: (data.version_groups ?? []).map((v: any) => formatDisplayName(v.name)),
    source,
    fetchedAt,
  };
}

export async function fetchPokemonDirectory(options?: {
  generation?: string;
  type?: string;
}): Promise<{ entries: DirectoryEntry[]; source: DataSource; fetchedAt: string }> {
  const hasGen = Boolean(options?.generation && options.generation !== 'all');
  const hasType = Boolean(options?.type && options.type !== 'all');

  if (hasGen && hasType) {
    const [genRes, typeRes] = await Promise.all([
      fetchJsonWithCache<any>(`/generation/${normalizeSlug(options!.generation!)}`),
      fetchJsonWithCache<any>(`/type/${normalizeSlug(options!.type!)}`),
    ]);
    const genSpeciesIds = new Set<number>(
      (genRes.data.pokemon_species ?? []).map((p: any) => extractIdFromUrl(p.url ?? '')),
    );
    const seenIds = new Set<number>();
    const entries: DirectoryEntry[] = [];
    for (const entry of typeRes.data.pokemon ?? []) {
      const id = extractIdFromUrl(entry.pokemon?.url ?? '');
      const pSlug = entry.pokemon?.name ?? '';
      if (id > 0 && genSpeciesIds.has(id) && !seenIds.has(id)) {
        seenIds.add(id);
        entries.push({
          id,
          name: formatDisplayName(pSlug),
          slug: pSlug,
          sprite: defaultSpriteUrl(id),
        });
      }
    }
    entries.sort((a, b) => a.id - b.id);
    return {
      entries,
      source: genRes.source === 'live' || typeRes.source === 'live' ? 'live' : 'cache',
      fetchedAt: typeRes.fetchedAt,
    };
  }

  if (hasGen) {
    const slug = normalizeSlug(options!.generation!);
    const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/generation/${slug}`);
    const entries: DirectoryEntry[] = (data.pokemon_species ?? [])
      .map((p: any) => {
        const id = extractIdFromUrl(p.url ?? '');
        return {
          id,
          name: formatDisplayName(p.name),
          slug: p.name,
          sprite: defaultSpriteUrl(id),
        };
      })
      .sort((a: DirectoryEntry, b: DirectoryEntry) => a.id - b.id);
    return { entries, source, fetchedAt };
  }

  if (hasType) {
    const slug = normalizeSlug(options!.type!);
    const { data, source, fetchedAt } = await fetchJsonWithCache<any>(`/type/${slug}`);
    const entries: DirectoryEntry[] = (data.pokemon ?? [])
      .map((entry: any) => {
        const id = extractIdFromUrl(entry.pokemon?.url ?? '');
        const pSlug = entry.pokemon?.name ?? '';
        return {
          id,
          name: formatDisplayName(pSlug),
          slug: pSlug,
          sprite: defaultSpriteUrl(id),
        };
      })
      .filter((e: DirectoryEntry) => e.id > 0 && e.id <= 1025)
      .sort((a: DirectoryEntry, b: DirectoryEntry) => a.id - b.id);
    return { entries, source, fetchedAt };
  }

  const { data, source, fetchedAt } = await fetchJsonWithCache<any>('/pokemon-species?limit=1025&offset=0');
  const entries: DirectoryEntry[] = (data.results ?? []).map((r: any) => {
    const id = extractIdFromUrl(r.url ?? '');
    return {
      id,
      name: formatDisplayName(r.name),
      slug: r.name,
      sprite: defaultSpriteUrl(id),
    };
  });
  return { entries, source, fetchedAt };
}
