import { Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AssistantView } from './components/AssistantView.tsx';
import { CardScannerView } from './components/CardScannerView.tsx';
import { DexExplorerView } from './components/DexExplorerView.tsx';
import { QuickLookupModal } from './components/QuickLookupModal.tsx';
import { ReferenceView } from './components/ReferenceView.tsx';
import { TeamBuilderView } from './components/TeamBuilderView.tsx';
import type {
  ChatMessage,
  PokemonProfile,
  PokemonSummary,
  ToolTraceItem,
  TypeRecord,
} from './types/pokemon.ts';

type ActiveTab = 'assistant' | 'dex' | 'team' | 'scanner' | 'reference';

const TEAM_STORAGE_KEY = 'pokedex_ai_team_v1';

function loadSavedTeam(): PokemonSummary[] {
  try {
    const raw = localStorage.getItem(TEAM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('assistant');
  const [selectedPokemonSlug, setSelectedPokemonSlug] = useState<string>('garchomp');
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);

  const [typeMatrix, setTypeMatrix] = useState<TypeRecord[]>([]);
  const [team, setTeam] = useState<PokemonSummary[]>(loadSavedTeam);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStatus, setChatStatus] = useState<string>('');
  const [liveTraces, setLiveTraces] = useState<ToolTraceItem[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(team));
    } catch {
      // ignore storage quota errors
    }
  }, [team]);

  useEffect(() => {
    fetch('/api/pokeapi/types')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load types'))))
      .then((data) => {
        if (Array.isArray(data.types)) {
          setTypeMatrix(data.types);
        }
      })
      .catch(() => {
        // Non-blocking: views display graceful fallback text if matrix unavailable
      });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSendMessage = useCallback(
    async (text: string, includeTeam: boolean) => {
      if (chatLoading) return;
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };

      const historySnapshot = messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg]);
      setChatLoading(true);
      setChatStatus('Connecting to PokéDex AI...');
      setLiveTraces([]);

      try {
        const res = await fetch('/api/assistant/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: historySnapshot,
            teamSlugs: includeTeam ? team.map((t) => t.slug) : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server error (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Streaming response body unavailable.');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let completed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const line = rawEvent
              .split('\n')
              .find((l) => l.startsWith('data: '));
            if (!line) continue;

            const payload = JSON.parse(line.slice(6)) as
              | { type: 'status'; message: string }
              | { type: 'trace'; trace: ToolTraceItem }
              | { type: 'pokemon'; pokemon: PokemonSummary }
              | {
                  type: 'done';
                  output: {
                    reply: string;
                    toolTraces: ToolTraceItem[];
                    referencedPokemon: PokemonSummary[];
                  };
                }
              | { type: 'error'; error: string };

            if (payload.type === 'status') {
              setChatStatus(payload.message);
            } else if (payload.type === 'trace') {
              setLiveTraces((prev) => [...prev, payload.trace]);
            } else if (payload.type === 'error') {
              throw new Error(payload.error);
            } else if (payload.type === 'done') {
              completed = true;
              const assistantMsg: ChatMessage = {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: payload.output.reply ?? '',
                timestamp: new Date().toISOString(),
                toolTraces: payload.output.toolTraces ?? [],
                referencedPokemon: payload.output.referencedPokemon ?? [],
              };
              setMessages((prev) => [...prev, assistantMsg]);
            }
          }
        }

        if (!completed) {
          throw new Error('Stream closed before receiving the final assistant response.');
        }
      } catch (err) {
        const errMsg: ChatMessage = {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Unable to reach PokéDex AI backend.',
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setChatLoading(false);
        setChatStatus('');
        setLiveTraces([]);
      }
    },
    [chatLoading, messages, team],
  );

  const handleInspectPokemon = useCallback((slug: string) => {
    setSelectedPokemonSlug(slug);
    setActiveTab('dex');
  }, []);

  const handleAddToTeam = useCallback((mon: PokemonSummary) => {
    setTeam((prev) => {
      if (prev.length >= 6 || prev.some((p) => p.slug === mon.slug)) return prev;
      return [...prev, mon];
    });
  }, []);

  const handleRemoveFromTeam = useCallback((slug: string) => {
    setTeam((prev) => prev.filter((p) => p.slug !== slug));
  }, []);

  const handleAskAiAboutPokemon = useCallback(
    (profile: PokemonProfile) => {
      setActiveTab('assistant');
      handleSendMessage(
        `Provide a comprehensive PokéDex breakdown and battle strategy for ${profile.name} (#${profile.id}), including base stats, abilities, defensive strengths/weaknesses, evolution context, and recommended movesets.`,
        false,
      );
    },
    [handleSendMessage],
  );

  const handleAnalyzeTeamWithAi = useCallback(() => {
    if (team.length === 0) return;
    setActiveTab('assistant');
    const rosterNames = team.map((t) => t.name).join(', ');
    handleSendMessage(
      `Evaluate my active ${team.length}-Pokémon team (${rosterNames}): analyze shared defensive weaknesses, offensive coverage gaps, speed tiers, and suggest optimal abilities, held items, and movesets for each member.`,
      true,
    );
  }, [team, handleSendMessage]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Three-Zone Single-Row Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#assistant"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('assistant');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            PokéDex AI
          </a>

          {/* Zone 2: Primary Navigation Links */}
          <nav className="flex items-center gap-6 overflow-x-auto no-scrollbar" aria-label="Primary">
            {(
              [
                { id: 'assistant', label: 'Assistant' },
                { id: 'dex', label: 'Dex Explorer' },
                { id: 'team', label: team.length > 0 ? `Team Builder (${team.length})` : 'Team Builder' },
                { id: 'scanner', label: 'Card Scanner' },
                { id: 'reference', label: 'Reference' },
              ] as const
            ).map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-4 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    isActive
                      ? 'border-red-600 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setQuickSearchOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search Dex</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'assistant' && (
          <AssistantView
            messages={messages}
            isLoading={chatLoading}
            loadingStatus={chatStatus}
            liveTraces={liveTraces}
            team={team}
            onSendMessage={handleSendMessage}
            onClearChat={() => setMessages([])}
            onInspectPokemon={handleInspectPokemon}
            onAddToTeam={handleAddToTeam}
          />
        )}

        {activeTab === 'dex' && (
          <DexExplorerView
            selectedSlug={selectedPokemonSlug}
            onSelectSlug={setSelectedPokemonSlug}
            typeMatrix={typeMatrix}
            team={team}
            onAddToTeam={handleAddToTeam}
            onAskAiAboutPokemon={handleAskAiAboutPokemon}
          />
        )}

        {activeTab === 'team' && (
          <TeamBuilderView
            team={team}
            typeMatrix={typeMatrix}
            onAddPokemon={handleAddToTeam}
            onRemovePokemon={handleRemoveFromTeam}
            onClearTeam={() => setTeam([])}
            onInspectPokemon={handleInspectPokemon}
            onAnalyzeTeamWithAi={handleAnalyzeTeamWithAi}
          />
        )}

        {activeTab === 'scanner' && (
          <CardScannerView
            onInspectPokemon={handleInspectPokemon}
            onAskAiAboutCard={(cardTitle, verdictSummary) => {
              setActiveTab('assistant');
              handleSendMessage(
                `I scanned a Pokémon TCG card identified as "${cardTitle}". Summary: ${verdictSummary} What else should I check to verify its authenticity, and what are this Pokémon's PokéAPI stats and typing?`,
                false,
              );
            }}
          />
        )}

        {activeTab === 'reference' && (
          <ReferenceView typeMatrix={typeMatrix} onInspectPokemon={handleInspectPokemon} />
        )}
      </main>

      <QuickLookupModal
        isOpen={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
        onInspectPokemon={handleInspectPokemon}
        onAskAi={(question) => {
          setActiveTab('assistant');
          handleSendMessage(question, false);
        }}
      />
    </div>
  );
}
