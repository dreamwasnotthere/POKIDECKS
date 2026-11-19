import { ArrowUpRight, Database, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, PokemonSummary, ToolTraceItem } from '../types/pokemon.ts';
import { PokemonImage } from './PokemonImage.tsx';
import { TypeLabel } from './TypeLabel.tsx';

interface AssistantViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  loadingStatus?: string;
  liveTraces?: ToolTraceItem[];
  team: PokemonSummary[];
  onSendMessage: (text: string, includeTeam: boolean) => void;
  onClearChat: () => void;
  onInspectPokemon: (slug: string) => void;
  onAddToTeam: (pokemon: PokemonSummary) => void;
}

const STARTER_PROMPTS = [
  {
    title: 'Competitive Dossier',
    prompt: 'Analyze Garchomp: base stats, abilities, defensive weaknesses, and a Gen 9 OU moveset.',
  },
  {
    title: 'Head-to-Head Comparison',
    prompt: 'Compare Charizard vs Blastoise across base stats, typings, abilities, and battle roles.',
  },
  {
    title: 'Team Synergy & Strategy',
    prompt: 'Build a balanced 6-Pokémon Rain team around Pelipper with roles and movesets.',
  },
  {
    title: 'Mechanics & Encounters',
    prompt: 'Explain how Levitate interacts with Ground moves and list where Rotom can be encountered.',
  },
];

function TraceStatusLabel({ status }: { status: ToolTraceItem['status'] }) {
  if (status === 'live') {
    return <span className="text-xs font-medium text-emerald-700">Live PokéAPI</span>;
  }
  if (status === 'cache') {
    return <span className="text-xs font-medium text-slate-600">Cached</span>;
  }
  return <span className="text-xs font-medium text-red-700">Error</span>;
}

export function AssistantView({
  messages,
  isLoading,
  loadingStatus,
  liveTraces = [],
  team,
  onSendMessage,
  onClearChat,
  onInspectPokemon,
  onAddToTeam,
}: AssistantViewProps) {
  const [input, setInput] = useState('');
  const [includeTeam, setIncludeTeam] = useState(true);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedTurnId(null);
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  const assistantTurns = messages.filter((m) => m.role === 'assistant');
  const activeTurn =
    assistantTurns.find((m) => m.id === selectedTurnId) ??
    assistantTurns[assistantTurns.length - 1] ??
    null;

  const teamSlugs = new Set(team.map((t) => t.slug));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    onSendMessage(trimmed, includeTeam && team.length > 0);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
      {/* Main Conversation Column */}
      <section className="bg-white border border-slate-200 rounded-xl flex flex-col min-h-[640px] max-h-[calc(100vh-140px)]">
        {/* Conversation Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200">
          <div>
            <h1 className="font-display text-base font-semibold text-slate-900">
              Pokémon Research Assistant
            </h1>
            <p className="text-xs text-slate-500">
              Verified against live PokéAPI endpoints before synthesizing strategy or stats
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearChat}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Thread</span>
            </button>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto dex-scroll px-5 py-5 space-y-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-8 space-y-6">
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-semibold text-slate-900 text-balance">
                  Ask about any Pokémon, moveset, matchup, or team strategy
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Every factual query invokes live PokéAPI tools for stats, abilities, learnsets,
                  evolutions, items, and encounter locations before generating battle analysis.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => onSendMessage(item.prompt, includeTeam && team.length > 0)}
                    className="text-left p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-slate-300 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-900">{item.title}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600 transition-colors" />
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {item.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[82%] bg-slate-900 text-white px-4 py-3 rounded-xl text-sm leading-relaxed">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                );
              }

              const liveCount = msg.toolTraces?.filter((t) => t.status === 'live').length ?? 0;
              const cacheCount = msg.toolTraces?.filter((t) => t.status === 'cache').length ?? 0;
              const errorCount = msg.toolTraces?.filter((t) => t.status === 'error').length ?? 0;

              return (
                <div
                  key={msg.id}
                  onClick={() => setSelectedTurnId(msg.id)}
                  className={`space-y-3 rounded-xl p-4 border transition-colors ${
                    activeTurn?.id === msg.id
                      ? 'border-slate-300 bg-slate-50/50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">PokéDex AI</span>
                      {msg.toolTraces && msg.toolTraces.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {liveCount} live / {cacheCount} cached PokéAPI{' '}
                            {msg.toolTraces.length === 1 ? 'lookup' : 'lookups'}
                            {errorCount > 0 ? ` (${errorCount} failed)` : ''}
                          </span>
                        </>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {msg.error ? (
                    <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800 space-y-2">
                      <p className="font-medium">Unable to complete AI request</p>
                      <p className="text-xs text-red-700">{msg.error}</p>
                    </div>
                  ) : (
                    <div className="dex-prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}

                  {msg.referencedPokemon && msg.referencedPokemon.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/80 flex flex-wrap gap-2">
                      {msg.referencedPokemon.map((mon) => (
                        <button
                          key={mon.slug}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectPokemon(mon.slug);
                          }}
                          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 text-xs text-slate-700 transition-colors"
                        >
                          <PokemonImage src={mon.sprite} alt={mon.name} size="sm" className="w-6 h-6" />
                          <span className="font-mono text-slate-400 tabular-nums">
                            #{String(mon.id).padStart(4, '0')}
                          </span>
                          <span className="font-medium text-slate-900">{mon.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-800">
                <RotateCcw className="w-3.5 h-3.5 animate-spin text-red-600" />
                <span>{loadingStatus || 'Querying PokéAPI endpoints and synthesizing analysis...'}</span>
              </div>
              {liveTraces.length > 0 && (
                <div className="space-y-1 pt-1">
                  {liveTraces.map((trace, i) => (
                    <div key={`${trace.endpoint}-${i}`} className="flex items-center justify-between text-xs text-slate-600">
                      <span>
                        {trace.tool}: <strong className="text-slate-900">{trace.query}</strong> ({trace.detail})
                      </span>
                      <TraceStatusLabel status={trace.status} />
                    </div>
                  ))}
                </div>
              )}
              <div className="h-3 w-2/3 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-slate-200 rounded animate-pulse" />
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-slate-50/60 rounded-b-xl space-y-2.5">
          {team.length > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTeam}
                  onChange={(e) => setIncludeTeam(e.target.checked)}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-600"
                />
                <span>
                  Include active Team Builder roster ({team.length}/6:{' '}
                  {team.map((t) => t.name).join(', ')})
                </span>
              </label>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              rows={2}
              placeholder="Ask about a Pokémon, move, ability, evolution, encounter location, or strategy..."
              className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 h-[42px] rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Ask</span>
            </button>
          </div>
        </form>
      </section>

      {/* Right Provenance & Referenced Species Sidebar */}
      <aside className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-500" />
            <h2 className="font-display text-sm font-semibold text-slate-900">
              PokéAPI Data Provenance
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Live vs cached lookups for the selected response
          </p>
        </div>

        <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto dex-scroll">
          {!activeTurn || !activeTurn.toolTraces || activeTurn.toolTraces.length === 0 ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              Ask a question to view verified PokéAPI endpoints queried by the assistant.
            </p>
          ) : (
            activeTurn.toolTraces.map((trace, idx) => (
              <div
                key={`${trace.endpoint}-${idx}`}
                className="pb-3 border-b border-slate-100 last:border-b-0 last:pb-0 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {trace.tool}: {trace.query}
                  </span>
                  <TraceStatusLabel status={trace.status} />
                </div>
                <p className="text-xs text-slate-600">{trace.detail}</p>
                <p className="text-[11px] font-mono text-slate-400 truncate" title={trace.endpoint}>
                  {trace.endpoint.replace('https://pokeapi.co/api/v2', '')}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3.5">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Referenced Species
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect full stats or add directly to your team
          </p>
        </div>

        <div className="p-4 space-y-3">
          {!activeTurn || !activeTurn.referencedPokemon || activeTurn.referencedPokemon.length === 0 ? (
            <p className="text-xs text-slate-500">
              Pokémon retrieved during conversation will appear here for quick inspection.
            </p>
          ) : (
            activeTurn.referencedPokemon.map((mon) => {
              const inTeam = teamSlugs.has(mon.slug);
              return (
                <div
                  key={mon.slug}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5"
                >
                  <div className="flex items-center gap-3">
                    <PokemonImage src={mon.artwork} alt={mon.name} size="md" className="w-12 h-12" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                        <span>#{String(mon.id).padStart(4, '0')}</span>
                        <span aria-hidden="true">·</span>
                        <span>BST {mon.stats.total}</span>
                      </div>
                      <p className="font-display text-sm font-semibold text-slate-900 truncate">
                        {mon.name}
                      </p>
                      <div className="flex items-center gap-2.5 mt-0.5">
                        {mon.types.map((t) => (
                          <TypeLabel key={t} type={t} compact />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onInspectPokemon(mon.slug)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      Inspect Dex
                    </button>
                    <button
                      type="button"
                      disabled={inTeam || team.length >= 6}
                      onClick={() => onAddToTeam(mon)}
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{inTeam ? 'In Team' : 'Add'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
