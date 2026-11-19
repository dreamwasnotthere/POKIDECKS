import { ArrowRight, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface QuickLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInspectPokemon: (slug: string) => void;
  onAskAi: (question: string) => void;
}

const POPULAR_POKEMON = [
  'pikachu',
  'charizard',
  'garchomp',
  'lucario',
  'gengar',
  'eevee',
  'tyranitar',
  'rayquaza',
];

export function QuickLookupModal({
  isOpen,
  onClose,
  onInspectPokemon,
  onAskAi,
}: QuickLookupModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmed = query.trim();

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && trimmed) {
                onInspectPokemon(trimmed);
                onClose();
              }
            }}
            placeholder="Enter Pokémon name or #ID (e.g. Garchomp, 445, Mr-Mime)..."
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {trimmed && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  onInspectPokemon(trimmed);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50/40 text-xs font-medium text-slate-900 transition-colors"
              >
                <span>Open “{trimmed}” in Dex Explorer</span>
                <ArrowRight className="w-3.5 h-3.5 text-red-600" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onAskAi(`Tell me about ${trimmed}: stats, abilities, weaknesses, and recommended moveset.`);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
              >
                <span>Ask PokéDex AI about “{trimmed}”</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Popular Species</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_POKEMON.map((slug) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => {
                    onInspectPokemon(slug);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 text-xs font-medium text-slate-700 capitalize transition-colors"
                >
                  {slug}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
