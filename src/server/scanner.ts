import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { CardScanCheck, CardScanResult, CardVerdict, PokemonSummary } from '../types/pokemon.ts';
import { fetchPokemonProfile, toSummary } from './pokeapi.ts';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

const SCANNER_SYSTEM_INSTRUCTION = `You are a forensic Pokémon Trading Card Game (TCG) authenticator.
Analyze the submitted card photograph(s) carefully for physical and typographical authenticity indicators.

INSPECTION CRITERIA (evaluate every criterion honestly based only on what is visible in the image(s)):
1. Typography & Fonts: Check HP font weight/alignment, move names, damage numbers, weakness/resistance/retreat bar, and flavor text font consistency. Counterfeits often use thin sans-serif/Times-like fonts, uneven kerning, or misaligned HP.
2. Spelling & Accent ("Pokémon"): Check whether "Pokémon" has the proper acute accent on "é" (not "Pokemon") and whether attack text has typos or awkward grammar.
3. Holo Pattern & Surface Texture: For Full Art / V / VMAX / VSTAR / GX / EX / ex / Illustration Rare / Gold cards, look for fingerprint-like etched/ridged texture vs smooth flat rainbow/vertical glossy sheen typical of fakes. For standard cards, check whether holofoil bleed or glare looks authentic. If lighting/angle hides texture, state that clearly instead of guessing.
4. Borders & Print Sharpness: Check border thickness symmetry (accounting for normal factory off-centering vs disproportionately thick/thin counterfeit borders), crisp ink edges vs blurry/pixelated low-DPI scans, and corner cut radius.
5. HP, Damage & Energy Icons: Check for impossible/inflated stats (e.g., 10,000 HP or 9990 damage on non-joke cards), distorted/oversized Energy symbols, or missing/wrong retreat icons.
6. Copyright & Set Number: Check bottom copyright line (e.g., "©YYYY Pokémon / Nintendo / Creatures / GAME FREAK"), card number format (e.g., 123/198), regulation mark, and rarity symbol.
7. Card Back Color & Detail: If a back photo is provided, check deep royal/navy blue contrast, sharp swirl shading, and Pokéball outline crispness (fakes often look washed-out, overly cyan/purple, or blurry). If no back photo is provided, mark this check as "not_visible".

HONESTY RULES:
- Never fabricate details you cannot clearly read due to blur, glare, or cropping.
- If the image is NOT a Pokémon TCG card, set isPokemonCard=false, verdict="inconclusive", and explain clearly.
- Set verdict="inconclusive" and confidence="low" if the image is too blurry or cropped to verify key markers.
- Keep observations concrete, citing exact visible text or visual cues from the photo.`;

const SCANNER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isPokemonCard: {
      type: Type.BOOLEAN,
      description: 'True if the image depicts a Pokémon Trading Card Game card.',
    },
    verdict: {
      type: Type.STRING,
      description:
        'Must be one of: "likely_authentic", "suspicious", "likely_counterfeit", or "inconclusive".',
    },
    confidence: {
      type: Type.STRING,
      description: 'Must be one of: "high", "medium", or "low".',
    },
    cardIdentity: {
      type: Type.OBJECT,
      properties: {
        pokemonName: {
          type: Type.STRING,
          description:
            'Base Pokémon species name if this is a Pokémon card (e.g. "Charizard", "Pikachu"), or empty string for Trainer/Energy/non-card.',
        },
        cardTitle: {
          type: Type.STRING,
          description: 'Full printed card title (e.g. "Charizard ex", "Umbreon VMAX", "Professor Research").',
        },
        hp: { type: Type.STRING, description: 'Printed HP value or "Unknown".' },
        setNumber: { type: Type.STRING, description: 'Printed card number (e.g. "199/165") or "Unknown".' },
        rarity: { type: Type.STRING, description: 'Observed rarity / card style or "Unknown".' },
        cardType: { type: Type.STRING, description: 'Printed Energy type or Trainer/Energy category.' },
      },
      required: ['pokemonName', 'cardTitle', 'hp', 'setNumber', 'rarity', 'cardType'],
    },
    summary: {
      type: Type.STRING,
      description: 'Concise 2-3 sentence summary of the legitimacy assessment.',
    },
    checks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          criterion: { type: Type.STRING },
          status: {
            type: Type.STRING,
            description: 'Must be one of: "pass", "warning", "fail", or "not_visible".',
          },
          observation: { type: Type.STRING },
        },
        required: ['criterion', 'status', 'observation'],
      },
    },
    redFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    recommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'isPokemonCard',
    'verdict',
    'confidence',
    'cardIdentity',
    'summary',
    'checks',
    'redFlags',
    'recommendations',
  ],
};

function cleanSpeciesNameForPokeApi(rawName: string): string {
  return rawName
    .replace(/\b(ex|EX|gx|GX|vmax|VMAX|vstar|VSTAR|v|V|break|BREAK|lv\.?\s*x|prime|legend)\b/g, '')
    .replace(/^(mega|m|radiant|shining|dark|light|detective|team\s+\w+'s)\s+/i, '')
    .trim();
}

export interface ScanCardInput {
  frontImageBase64: string;
  frontMimeType: string;
  backImageBase64?: string;
  backMimeType?: string;
  notes?: string;
}

export async function analyzePokemonCardLegitimacy(input: ScanCardInput): Promise<CardScanResult> {
  if (!input.frontImageBase64 || !ALLOWED_MIME_TYPES.has(input.frontMimeType)) {
    throw new Error('A valid front card image (JPEG, PNG, or WebP) is required.');
  }
  if (input.backImageBase64 && (!input.backMimeType || !ALLOWED_MIME_TYPES.has(input.backMimeType))) {
    throw new Error('The optional back/close-up image must be JPEG, PNG, or WebP.');
  }

  const ai = getGeminiClient();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      inlineData: {
        mimeType: input.frontMimeType,
        data: input.frontImageBase64,
      },
    },
  ];

  if (input.backImageBase64 && input.backMimeType) {
    parts.push({
      inlineData: {
        mimeType: input.backMimeType,
        data: input.backImageBase64,
      },
    });
  }

  const promptLines = [
    input.backImageBase64
      ? 'Image 1 is the FRONT of the Pokémon card. Image 2 is the BACK or close-up surface photo.'
      : 'Only the FRONT image of the card was provided (no card back photo).',
    'Inspect all 7 authenticity criteria and return the structured JSON report.',
  ];
  if (input.notes?.trim()) {
    promptLines.push(`User context note: ${input.notes.trim().slice(0, 300)}`);
  }
  parts.push({ text: promptLines.join(' ') });

  const candidates: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.LOW },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
  ];

  let rawText = '';
  let lastErr: unknown;

  for (const candidate of candidates) {
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: { parts },
        config: {
          systemInstruction: SCANNER_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: SCANNER_RESPONSE_SCHEMA,
        },
      });
      rawText = (response.text ?? '').trim();
      if (rawText) break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!rawText) {
    throw lastErr instanceof Error ? lastErr : new Error('Card analysis failed to produce a response.');
  }

  const parsed = JSON.parse(rawText) as Omit<CardScanResult, 'speciesMatch' | 'analyzedAt'>;

  const validVerdicts = new Set<CardVerdict>([
    'likely_authentic',
    'suspicious',
    'likely_counterfeit',
    'inconclusive',
  ]);
  const verdict: CardVerdict = validVerdicts.has(parsed.verdict) ? parsed.verdict : 'inconclusive';

  const validStatuses = new Set(['pass', 'warning', 'fail', 'not_visible']);
  const checks: CardScanCheck[] = Array.isArray(parsed.checks)
    ? parsed.checks.map((c) => ({
        criterion: String(c.criterion || 'Check'),
        status: validStatuses.has(c.status) ? c.status : 'not_visible',
        observation: String(c.observation || ''),
      }))
    : [];

  let speciesMatch: PokemonSummary | null = null;
  const rawPokemonName = parsed.cardIdentity?.pokemonName?.trim() || '';
  if (parsed.isPokemonCard && rawPokemonName) {
    const cleanedName = cleanSpeciesNameForPokeApi(rawPokemonName);
    if (cleanedName) {
      try {
        const profile = await fetchPokemonProfile(cleanedName);
        speciesMatch = toSummary(profile);
      } catch {
        speciesMatch = null;
      }
    }
  }

  return {
    isPokemonCard: Boolean(parsed.isPokemonCard),
    verdict,
    confidence:
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low',
    cardIdentity: {
      pokemonName: rawPokemonName,
      cardTitle: String(parsed.cardIdentity?.cardTitle || 'Unknown Card'),
      hp: String(parsed.cardIdentity?.hp || 'Unknown'),
      setNumber: String(parsed.cardIdentity?.setNumber || 'Unknown'),
      rarity: String(parsed.cardIdentity?.rarity || 'Unknown'),
      cardType: String(parsed.cardIdentity?.cardType || 'Unknown'),
    },
    summary: String(parsed.summary || ''),
    checks,
    redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.map(String) : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    speciesMatch,
    analyzedAt: new Date().toISOString(),
  };
}
