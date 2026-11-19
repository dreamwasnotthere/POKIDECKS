import { useEffect, useState } from 'react';

interface PokemonImageProps {
  src?: string;
  alt: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses: Record<NonNullable<PokemonImageProps['size']>, string> = {
  sm: 'w-10 h-10',
  md: 'w-16 h-16',
  lg: 'w-28 h-28',
  xl: 'w-44 h-44',
};

export function PokemonImage({ src, alt, className = '', size = 'md' }: PokemonImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 border border-slate-200 rounded-lg text-slate-400 shrink-0 ${sizeClasses[size]} ${className}`}
        aria-label={alt}
      >
        <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h6.5m5 0H21" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-contain shrink-0 select-none ${sizeClasses[size]} ${className}`}
      loading="lazy"
    />
  );
}
