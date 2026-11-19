import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
} from '@google/genai';
import type { PokemonSummary, ToolTraceItem } from '../types/pokemon.ts';
import {
  PokeApiError,
  computeTypeEffectivenessSummary,
  fetchAbilityDetail,
  fetchBerryDetail,
  fetchGenerationDetail,
  fetchItemDetail,
  fetchMoveDetail,
  fetchPokemonEncounters,
  fetchPokemonProfile,
  fetchRegionDetail,
  fetchTypeRelations,
  toSummary,
} from './pokeapi.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in the server environment. Please configure it in Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SYSTEM_INSTRUCTION = `You are PokéDex AI, a specialized Pokémon assistant powered by live PokéAPI data (https://pokeapi.co/api/v2/) and analytical battle expertise.

OPERATING RULES:
1. NEVER fabricate PokéAPI results (base stats, abilities, types, evolution levels, move power/accuracy, locations, item effects, or generation rosters). Always invoke the provided PokéAPI tools BEFORE answering factual questions about Pokémon, moves, abilities, types, items, berries, encounters, generations, or regions.
2. Batch tool calls in parallel on your FIRST turn whenever multiple Pokémon, moves, or items are needed (e.g., call get_pokemon_profile for both Pokémon in a comparison at once). Note that get_pokemon_profile ALREADY includes defensiveMatchups (weaknesses, resistances, immunities), abilities, evolutionChain, and notable moves, so you do NOT need separate get_type_matchup calls for a Pokémon's defenses.
3. Combine verified PokéAPI facts with established competitive & casual Pokémon mechanics knowledge (STAB, physical/special split, EVs/IVs, natures, weather/terrain, hazards, pivots).
4. If a tool returns an error or missing data (e.g., 404 or timeout), clearly state what could not be retrieved—never pretend a failed API request succeeded.
5. Briefly note when information comes from live PokéAPI vs cached session data when relevant, and keep responses crisp, scannable Markdown.
6. RESPONSE FORMAT FOR POKÉMON QUERIES (include only sections relevant to the user's question):
   - Pokémon name and National Pokédex number (e.g., **Garchomp (#0445)**)
   - Type(s)
   - Base Stats (compact Markdown table with BST)
   - Abilities (highlight Hidden Ability)
   - Evolution chain & triggers
   - Strengths and Weaknesses (defensive multipliers)
   - Recommended movesets / items / EVs when strategy or battle usage is relevant
   - Game-specific encounters, version flavor, or generation notes when relevant
7. NEVER expose API keys, secrets, or internal environment variables.`;

const pokeApiTools: FunctionDeclaration[] = [
  {
    name: 'get_pokemon_profile',
    description:
      'Retrieve verified Pokémon details from PokéAPI: National Dex ID, types, defensive type matchups (weaknesses/resistances/immunities), base stats (HP, Atk, Def, SpA, SpD, Spe, BST), abilities with effects, evolution chain, species genus/capture rate, flavor text, and learnable moves.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name_or_id: {
          type: Type.STRING,
          description: 'Pokémon name or National Dex ID (e.g. "garchomp", "charizard", "25", "mr-mime").',
        },
      },
      required: ['name_or_id'],
    },
  },
  {
    name: 'get_type_matchup',
    description:
      'Retrieve offensive and defensive damage relations (2x, 0.5x, 0x) for a single Pokémon type from PokéAPI.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type_name: {
          type: Type.STRING,
          description: 'Pokémon type name (e.g. "dragon", "steel", "fairy").',
        },
      },
      required: ['type_name'],
    },
  },
  {
    name: 'get_move_details',
    description:
      'Retrieve move power, accuracy, PP, priority, damage class, type, and effect text from PokéAPI.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        move_name: {
          type: Type.STRING,
          description: 'Move name (e.g. "earthquake", "draco-meteor", "u-turn").',
        },
      },
      required: ['move_name'],
    },
  },
  {
    name: 'get_ability_details',
    description:
      'Retrieve ability effect text, generation introduced, and sample Pokémon that learn it from PokéAPI.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ability_name: {
          type: Type.STRING,
          description: 'Ability name (e.g. "rough-skin", "intimidate", "levitate").',
        },
      },
      required: ['ability_name'],
    },
  },
  {
    name: 'get_pokemon_encounters',
    description:
      'Retrieve game locations, versions, encounter methods, and encounter rates where a Pokémon can be found.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name_or_id: {
          type: Type.STRING,
          description: 'Pokémon name or National Dex ID.',
        },
      },
      required: ['name_or_id'],
    },
  },
  {
    name: 'get_item_or_berry',
    description: 'Retrieve held item or berry stats and effect descriptions from PokéAPI.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name_or_id: {
          type: Type.STRING,
          description: 'Item or berry name (e.g. "leftovers", "choice-scarf", "sitrus", "lum-berry").',
        },
        kind: {
          type: Type.STRING,
          description: 'Either "item" or "berry".',
        },
      },
      required: ['name_or_id', 'kind'],
    },
  },
  {
    name: 'get_generation_or_region',
    description: 'Retrieve Pokémon generation or region metadata, Pokedexes, and version groups from PokéAPI.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name_or_id: {
          type: Type.STRING,
          description: 'Generation (e.g. "generation-iv", "4") or Region (e.g. "sinnoh", "paldea").',
        },
        kind: {
          type: Type.STRING,
          description: 'Either "generation" or "region".',
        },
      },
      required: ['name_or_id', 'kind'],
    },
  },
];

export type AssistantStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'trace'; trace: ToolTraceItem }
  | { type: 'pokemon'; pokemon: PokemonSummary }
  | { type: 'done'; output: ChatTurnOutput }
  | { type: 'error'; error: string };

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  traces: ToolTraceItem[],
  referencedMap: Map<string, PokemonSummary>,
  onEvent?: (event: AssistantStreamEvent) => void,
): Promise<Record<string, unknown>> {
  const pushTrace = (trace: ToolTraceItem) => {
    traces.push(trace);
    onEvent?.({ type: 'trace', trace });
  };

  try {
    switch (name) {
      case 'get_pokemon_profile': {
        const query = String(args.name_or_id ?? '').trim();
        const profile = await fetchPokemonProfile(query);
        const summary = toSummary(profile);
        referencedMap.set(profile.slug, summary);
        onEvent?.({ type: 'pokemon', pokemon: summary });

        let defensiveMatchups: Awaited<ReturnType<typeof computeTypeEffectivenessSummary>> | null = null;
        try {
          defensiveMatchups = await computeTypeEffectivenessSummary(profile.types);
        } catch {
          defensiveMatchups = null;
        }

        pushTrace({
          tool: 'Pokemon Profile',
          query: profile.name,
          status: profile.source,
          endpoint: profile.endpoint,
          detail: `#${String(profile.id).padStart(4, '0')} · ${profile.types.join('/')} · BST ${profile.stats.total}`,
          fetchedAt: profile.fetchedAt,
        });

        return {
          _source: profile.source,
          _fetchedAt: profile.fetchedAt,
          id: profile.id,
          name: profile.name,
          slug: profile.slug,
          genus: profile.genus,
          generation: profile.generation,
          types: profile.types,
          defensiveMatchups,
          heightMeters: profile.heightMeters,
          weightKilograms: profile.weightKilograms,
          captureRate: profile.captureRate,
          isLegendary: profile.isLegendary,
          isMythical: profile.isMythical,
          stats: profile.stats,
          abilities: profile.abilities.map((a) => ({
            name: a.name,
            isHidden: a.isHidden,
            shortEffect: a.shortEffect,
          })),
          evolutionChain: profile.evolutionChain,
          sampleFlavorTexts: profile.flavorTexts.slice(0, 3),
          levelUpMoves: profile.moves
            .filter((m) => m.learnMethod === 'Level Up')
            .slice(0, 22)
            .map((m) => `${m.name} (Lv.${m.levelLearnedAt})`),
          notableOtherMoves: profile.moves
            .filter((m) => m.learnMethod !== 'Level Up')
            .slice(0, 25)
            .map((m) => m.name),
          heldItems: profile.heldItems,
        };
      }

      case 'get_type_matchup': {
        const typeName = String(args.type_name ?? '').trim();
        const typeData = await fetchTypeRelations(typeName);
        pushTrace({
          tool: 'Type Matchup',
          query: typeData.name,
          status: typeData.source,
          endpoint: `https://pokeapi.co/api/v2/type/${typeData.name}`,
          detail: `${typeData.pokemonCount} Pokémon · ${typeData.moveCount} moves`,
          fetchedAt: typeData.fetchedAt,
        });
        return {
          _source: typeData.source,
          _fetchedAt: typeData.fetchedAt,
          type: typeData.name,
          damageRelations: typeData.damageRelations,
        };
      }

      case 'get_move_details': {
        const moveName = String(args.move_name ?? '').trim();
        const move = await fetchMoveDetail(moveName);
        pushTrace({
          tool: 'Move Details',
          query: move.name,
          status: move.source,
          endpoint: `https://pokeapi.co/api/v2/move/${move.slug}`,
          detail: `${move.type} · ${move.damageClass} · ${move.power ?? '—'} PWR`,
          fetchedAt: move.fetchedAt,
        });
        return {
          _source: move.source,
          _fetchedAt: move.fetchedAt,
          ...move,
        };
      }

      case 'get_ability_details': {
        const abilityName = String(args.ability_name ?? '').trim();
        const ability = await fetchAbilityDetail(abilityName);
        pushTrace({
          tool: 'Ability Details',
          query: ability.name,
          status: ability.source,
          endpoint: `https://pokeapi.co/api/v2/ability/${ability.slug}`,
          detail: `${ability.generation} · ${ability.pokemonCount} Pokémon`,
          fetchedAt: ability.fetchedAt,
        });
        return {
          _source: ability.source,
          _fetchedAt: ability.fetchedAt,
          ...ability,
        };
      }

      case 'get_pokemon_encounters': {
        const query = String(args.name_or_id ?? '').trim();
        const enc = await fetchPokemonEncounters(query);
        pushTrace({
          tool: 'Encounters',
          query,
          status: enc.source,
          endpoint: enc.endpoint,
          detail: `${enc.encounters.length} location areas`,
          fetchedAt: enc.fetchedAt,
        });
        return {
          _source: enc.source,
          _fetchedAt: enc.fetchedAt,
          totalLocations: enc.encounters.length,
          encounters: enc.encounters.slice(0, 25),
        };
      }

      case 'get_item_or_berry': {
        const query = String(args.name_or_id ?? '').trim();
        const kind = String(args.kind ?? 'item').toLowerCase();
        if (kind === 'berry') {
          const berry = await fetchBerryDetail(query);
          pushTrace({
            tool: 'Berry Details',
            query: berry.name,
            status: berry.source,
            endpoint: `https://pokeapi.co/api/v2/berry/${berry.slug}`,
            detail: `${berry.firmness} · Natural Gift ${berry.naturalGiftPower} (${berry.naturalGiftType})`,
            fetchedAt: berry.fetchedAt,
          });
          return { _source: berry.source, _fetchedAt: berry.fetchedAt, ...berry };
        }
        const item = await fetchItemDetail(query);
        pushTrace({
          tool: 'Item Details',
          query: item.name,
          status: item.source,
          endpoint: `https://pokeapi.co/api/v2/item/${item.slug}`,
          detail: `${item.category} · ${item.cost} Pokédollars`,
          fetchedAt: item.fetchedAt,
        });
        return { _source: item.source, _fetchedAt: item.fetchedAt, ...item };
      }

      case 'get_generation_or_region': {
        const query = String(args.name_or_id ?? '').trim();
        const kind = String(args.kind ?? 'generation').toLowerCase();
        if (kind === 'region') {
          const region = await fetchRegionDetail(query);
          pushTrace({
            tool: 'Region Info',
            query: region.name,
            status: region.source,
            endpoint: `https://pokeapi.co/api/v2/region/${region.slug}`,
            detail: `${region.mainGeneration} · ${region.locationsCount} locations`,
            fetchedAt: region.fetchedAt,
          });
          return { _source: region.source, _fetchedAt: region.fetchedAt, ...region };
        }
        const gen = await fetchGenerationDetail(query);
        pushTrace({
          tool: 'Generation Info',
          query: gen.name,
          status: gen.source,
          endpoint: `https://pokeapi.co/api/v2/generation/${gen.slug}`,
          detail: `${gen.mainRegion} · ${gen.pokemonCount} species`,
          fetchedAt: gen.fetchedAt,
        });
        return {
          _source: gen.source,
          _fetchedAt: gen.fetchedAt,
          id: gen.id,
          name: gen.name,
          mainRegion: gen.mainRegion,
          pokemonCount: gen.pokemonCount,
          moveCount: gen.moveCount,
          abilityCount: gen.abilityCount,
          typesIntroduced: gen.types,
          versionGroups: gen.versionGroups,
          pokemonSample: gen.pokemonSample.slice(0, 30),
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    const message =
      err instanceof PokeApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'PokéAPI lookup failed';
    pushTrace({
      tool: name,
      query: JSON.stringify(args),
      status: 'error',
      endpoint: err instanceof PokeApiError ? err.endpoint : 'https://pokeapi.co/api/v2/',
      detail: message,
    });
    return { error: message };
  }
}

export interface ChatTurnInput {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  teamSlugs?: string[];
}

export interface ChatTurnOutput {
  reply: string;
  toolTraces: ToolTraceItem[];
  referencedPokemon: PokemonSummary[];
}

export async function runPokedexAssistantTurn(
  input: ChatTurnInput,
  onEvent?: (event: AssistantStreamEvent) => void,
): Promise<ChatTurnOutput> {
  const ai = getGeminiClient();
  const traces: ToolTraceItem[] = [];
  const referencedMap = new Map<string, PokemonSummary>();

  const contents: Content[] = [];
  const recentHistory = input.history.slice(-8);
  for (const h of recentHistory) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    });
  }

  let userPrompt = input.message;
  if (input.teamSlugs && input.teamSlugs.length > 0) {
    userPrompt = `${input.message}\n\n[Active user team roster slugs: ${input.teamSlugs.join(', ')}]`;
  }
  contents.push({ role: 'user', parts: [{ text: userPrompt }] });

  const maxRounds = 4;
  let finalReply = '';

  async function callGeminiWithRetry(callContents: Content[], allowTools: boolean) {
    const candidates: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    ];

    let lastErr: unknown;
    for (const candidate of candidates) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await ai.models.generateContent({
            model: candidate.model,
            contents: callContents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
              ...(allowTools ? { tools: [{ functionDeclarations: pokeApiTools }] } : {}),
            },
          });
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const status = (err as { status?: number })?.status;
          const isTransient =
            status === 503 ||
            status === 429 ||
            msg.includes('503') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('RESOURCE_EXHAUSTED');
          if (isTransient && attempt < 2) {
            onEvent?.({ type: 'status', message: 'Model busy, retrying request...' });
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          // Try next fallback model on transient or 404 errors
          break;
        }
      }
    }
    throw lastErr;
  }

  onEvent?.({ type: 'status', message: 'Planning PokéAPI lookups...' });

  for (let round = 0; round < maxRounds; round++) {
    const allowTools = round < maxRounds - 1;
    const response = await callGeminiWithRetry(contents, allowTools);

    const candidateContent = response.candidates?.[0]?.content;
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0 && candidateContent && allowTools) {
      const targetNames = functionCalls
        .map((fc) => {
          const args = (fc.args ?? {}) as Record<string, unknown>;
          return String(args.name_or_id || args.move_name || args.ability_name || args.type_name || fc.name);
        })
        .join(', ');
      onEvent?.({ type: 'status', message: `Querying PokéAPI for ${targetNames}...` });

      contents.push(candidateContent);

      const functionResponses = await Promise.all(
        functionCalls.map(async (fc) => {
          const result = await executeToolCall(
            fc.name ?? '',
            (fc.args ?? {}) as Record<string, unknown>,
            traces,
            referencedMap,
            onEvent,
          );
          return {
            functionResponse: {
              id: fc.id,
              name: fc.name ?? '',
              response: result,
            },
          };
        }),
      );

      contents.push({
        role: 'user',
        parts: functionResponses,
      });
      onEvent?.({ type: 'status', message: 'Synthesizing PokéAPI findings...' });
      continue;
    }

    finalReply = response.text?.trim() ?? '';
    break;
  }

  if (!finalReply) {
    finalReply =
      'I retrieved the PokéAPI records but could not synthesize a final response. Please try rephrasing your question.';
  }

  const output: ChatTurnOutput = {
    reply: finalReply,
    toolTraces: traces,
    referencedPokemon: Array.from(referencedMap.values()),
  };
  onEvent?.({ type: 'done', output });
  return output;
}
