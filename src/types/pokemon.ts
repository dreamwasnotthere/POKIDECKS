export type DataSource = 'live' | 'cache';

export interface StatBlock {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  total: number;
}

export interface PokemonAbilityInfo {
  name: string;
  slug: string;
  isHidden: boolean;
  shortEffect: string;
  effect: string;
  source?: DataSource;
}

export interface EvolutionStage {
  id: number;
  name: string;
  slug: string;
  sprite: string;
  triggerDetails: string[];
  evolvesTo: EvolutionStage[];
}

export interface FlavorTextEntry {
  version: string;
  text: string;
}

export interface PokemonMoveEntry {
  name: string;
  slug: string;
  learnMethod: string;
  levelLearnedAt: number;
  versionGroup: string;
}

export interface PokemonEncounterEntry {
  locationArea: string;
  versions: string[];
  maxChance: number;
  methods: string[];
}

export interface PokemonSummary {
  id: number;
  name: string;
  slug: string;
  types: string[];
  sprite: string;
  artwork: string;
  stats: StatBlock;
  abilities: string[];
  source: DataSource;
  fetchedAt: string;
}

export interface PokemonProfile {
  id: number;
  name: string;
  slug: string;
  genus: string;
  generation: string;
  types: string[];
  heightMeters: number;
  weightKilograms: number;
  baseExperience: number | null;
  captureRate: number | null;
  baseHappiness: number | null;
  growthRate: string;
  eggGroups: string[];
  isLegendary: boolean;
  isMythical: boolean;
  stats: StatBlock;
  abilities: PokemonAbilityInfo[];
  sprites: {
    frontDefault: string;
    frontShiny: string;
    artworkDefault: string;
    artworkShiny: string;
  };
  evolutionChain: EvolutionStage | null;
  flavorTexts: FlavorTextEntry[];
  moves: PokemonMoveEntry[];
  heldItems: string[];
  source: DataSource;
  fetchedAt: string;
  endpoint: string;
}

export interface TypeEffectivenessMap {
  doubleDamageFrom: string[];
  halfDamageFrom: string[];
  noDamageFrom: string[];
  doubleDamageTo: string[];
  halfDamageTo: string[];
  noDamageTo: string[];
}

export interface TypeRecord {
  name: string;
  id: number;
  damageRelations: TypeEffectivenessMap;
  pokemonCount: number;
  moveCount: number;
  source: DataSource;
  fetchedAt: string;
}

export interface MoveDetail {
  id: number;
  name: string;
  slug: string;
  type: string;
  damageClass: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  effectChance: number | null;
  shortEffect: string;
  effect: string;
  target: string;
  generation: string;
  source: DataSource;
  fetchedAt: string;
}

export interface AbilityDetail {
  id: number;
  name: string;
  slug: string;
  generation: string;
  shortEffect: string;
  effect: string;
  pokemonSample: string[];
  pokemonCount: number;
  source: DataSource;
  fetchedAt: string;
}

export interface ItemDetail {
  id: number;
  name: string;
  slug: string;
  category: string;
  cost: number;
  shortEffect: string;
  effect: string;
  sprite: string;
  attributes: string[];
  source: DataSource;
  fetchedAt: string;
}

export interface BerryDetail {
  id: number;
  name: string;
  slug: string;
  growthTime: number;
  maxHarvest: number;
  naturalGiftPower: number;
  naturalGiftType: string;
  sizeMm: number;
  smoothness: number;
  soilDryness: number;
  firmness: string;
  flavors: Array<{ name: string; potency: number }>;
  sprite: string;
  effect: string;
  source: DataSource;
  fetchedAt: string;
}

export interface GenerationDetail {
  id: number;
  name: string;
  slug: string;
  mainRegion: string;
  pokemonCount: number;
  moveCount: number;
  abilityCount: number;
  types: string[];
  versionGroups: string[];
  pokemonSample: Array<{ id: number; name: string; slug: string }>;
  source: DataSource;
  fetchedAt: string;
}

export interface RegionDetail {
  id: number;
  name: string;
  slug: string;
  mainGeneration: string;
  locationsCount: number;
  locationsSample: string[];
  pokedexes: string[];
  versionGroups: string[];
  source: DataSource;
  fetchedAt: string;
}

export interface DirectoryEntry {
  id: number;
  name: string;
  slug: string;
  sprite: string;
}

export interface ToolTraceItem {
  tool: string;
  query: string;
  status: DataSource | 'error';
  endpoint: string;
  detail: string;
  fetchedAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolTraces?: ToolTraceItem[];
  referencedPokemon?: PokemonSummary[];
  error?: string;
}

export type CardVerdict =
  | 'likely_authentic'
  | 'suspicious'
  | 'likely_counterfeit'
  | 'inconclusive';

export type CheckStatus = 'pass' | 'warning' | 'fail' | 'not_visible';

export interface CardScanCheck {
  criterion: string;
  status: CheckStatus;
  observation: string;
}

export interface CardScanResult {
  isPokemonCard: boolean;
  verdict: CardVerdict;
  confidence: 'high' | 'medium' | 'low';
  cardIdentity: {
    pokemonName: string;
    cardTitle: string;
    hp: string;
    setNumber: string;
    rarity: string;
    cardType: string;
  };
  summary: string;
  checks: CardScanCheck[];
  redFlags: string[];
  recommendations: string[];
  speciesMatch: PokemonSummary | null;
  analyzedAt: string;
}

