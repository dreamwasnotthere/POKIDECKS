import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  EyeOff,
  FileImage,
  MessageSquare,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CardScanResult, CardVerdict, CheckStatus } from '../types/pokemon.ts';
import { PokemonImage } from './PokemonImage.tsx';
import { TypeLabel } from './TypeLabel.tsx';

interface CardScannerViewProps {
  onInspectPokemon: (slug: string) => void;
  onAskAiAboutCard: (cardTitle: string, verdictSummary: string) => void;
}

interface ImageSlotData {
  dataUrl: string;
  base64: string;
  mimeType: string;
  label: string;
}

async function processImageFile(file: File): Promise<ImageSlotData> {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const imgUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file.'));
      el.src = imgUrl;
    });

    const maxDim = 1600;
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const targetMime = allowed.has(file.type) ? 'image/jpeg' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(targetMime, 0.88);
    const base64 = dataUrl.split(',')[1] ?? '';
    return {
      dataUrl,
      base64,
      mimeType: targetMime,
      label: file.name,
    };
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

function VerdictBanner({
  verdict,
  confidence,
  isPokemonCard,
}: {
  verdict: CardVerdict;
  confidence: 'high' | 'medium' | 'low';
  isPokemonCard: boolean;
}) {
  if (!isPokemonCard) {
    return (
      <div className="p-4 rounded-xl border border-slate-300 bg-slate-50 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold text-slate-900">
              No Pokémon Card Detected
            </h2>
            <span className="text-xs text-slate-500">· Confidence: {confidence}</span>
          </div>
          <p className="text-xs text-slate-600">
            Upload a clear photo of a Pokémon Trading Card to inspect its legitimacy.
          </p>
        </div>
      </div>
    );
  }

  const config: Record<
    CardVerdict,
    { title: string; boxClass: string; textClass: string; Icon: typeof ShieldCheck }
  > = {
    likely_authentic: {
      title: 'Likely Authentic',
      boxClass: 'border-emerald-200 bg-emerald-50/70',
      textClass: 'text-emerald-800',
      Icon: ShieldCheck,
    },
    suspicious: {
      title: 'Suspicious — Needs Physical Verification',
      boxClass: 'border-amber-200 bg-amber-50/80',
      textClass: 'text-amber-900',
      Icon: AlertTriangle,
    },
    likely_counterfeit: {
      title: 'Likely Counterfeit',
      boxClass: 'border-red-200 bg-red-50/80',
      textClass: 'text-red-900',
      Icon: ShieldAlert,
    },
    inconclusive: {
      title: 'Inconclusive — Retake Photo',
      boxClass: 'border-slate-300 bg-slate-50',
      textClass: 'text-slate-800',
      Icon: ScanLine,
    },
  };

  const current = config[verdict];
  const Icon = current.Icon;

  return (
    <div className={`p-4 rounded-xl border flex items-start gap-3 ${current.boxClass}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${current.textClass}`} />
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={`font-display text-base font-semibold ${current.textClass}`}>
            {current.title}
          </h2>
          <span className="text-xs text-slate-600 capitalize">
            · {confidence} visual confidence
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  switch (status) {
    case 'pass':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Pass</span>
        </span>
      );
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Warning</span>
        </span>
      );
    case 'fail':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5" />
          <span>Fail</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 whitespace-nowrap">
          <EyeOff className="w-3.5 h-3.5" />
          <span>Not Visible</span>
        </span>
      );
  }
}

export function CardScannerView({ onInspectPokemon, onAskAiAboutCard }: CardScannerViewProps) {
  const [frontSlot, setFrontSlot] = useState<ImageSlotData | null>(null);
  const [backSlot, setBackSlot] = useState<ImageSlotData | null>(null);
  const [notes, setNotes] = useState('');

  const [cameraTarget, setCameraTarget] = useState<'front' | 'back' | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<CardScanResult | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraTarget(null);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (cameraTarget && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraTarget]);

  const startCamera = async (target: 'front' | 'back') => {
    stopCamera();
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera capture is not supported in this browser. Please upload a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraTarget(target);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera unavailable (${err.message}). Upload an image file instead.`
          : 'Camera permission denied. Please upload a card photo instead.',
      );
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current || !cameraTarget) return;
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.split(',')[1] ?? '';
    const slotData: ImageSlotData = {
      dataUrl,
      base64,
      mimeType: 'image/jpeg',
      label: `Camera capture (${cameraTarget})`,
    };
    if (cameraTarget === 'front') setFrontSlot(slotData);
    else setBackSlot(slotData);
    stopCamera();
    setResult(null);
    setScanError(null);
  };

  const handleFileUpload = async (target: 'front' | 'back', file: File | undefined) => {
    if (!file) return;
    setScanError(null);
    try {
      const processed = await processImageFile(file);
      if (target === 'front') setFrontSlot(processed);
      else setBackSlot(processed);
      setResult(null);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to read image file.');
    }
  };

  const handleVerifyCard = async () => {
    if (!frontSlot || scanning) return;
    setScanning(true);
    setScanError(null);

    try {
      const res = await fetch('/api/scanner/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontImageBase64: frontSlot.base64,
          frontMimeType: frontSlot.mimeType,
          backImageBase64: backSlot?.base64,
          backMimeType: backSlot?.mimeType,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Verification failed (${res.status})`);
      }
      setResult(data as CardScanResult);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Card legitimacy check failed.');
    } finally {
      setScanning(false);
    }
  };

  const handleReset = () => {
    stopCamera();
    setFrontSlot(null);
    setBackSlot(null);
    setNotes('');
    setResult(null);
    setScanError(null);
    setCameraError(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)] gap-6 items-start">
      {/* Left Capture & Upload Column */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-900">
            Pokémon Card Legitimacy Scanner
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Scan or upload photos of a Pokémon TCG card to inspect typography, holofoil texture,
            borders, copyright marks, and card-back color balance.
          </p>
        </div>

        {/* Live Camera Viewfinder */}
        {cameraTarget && (
          <div className="rounded-xl border border-slate-300 bg-slate-950 overflow-hidden space-y-2 p-2">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-56 object-cover rounded-lg bg-slate-900"
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <span className="text-xs text-slate-300">
                Capturing {cameraTarget === 'front' ? 'Front' : 'Back / Texture'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-3 py-1.5 rounded-md border border-slate-700 text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={captureFromCamera}
                  className="px-3.5 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                >
                  Capture Photo
                </button>
              </div>
            </div>
          </div>
        )}

        {cameraError && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
            {cameraError}
          </div>
        )}

        {/* Front Image Slot */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900">1. Card Front (Required)</span>
            <button
              type="button"
              onClick={() => startCamera('front')}
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Use Camera</span>
            </button>
          </div>

          {frontSlot ? (
            <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
              <img
                src={frontSlot.dataUrl}
                alt="Uploaded Pokémon card front"
                className="w-20 h-28 object-cover rounded-lg border border-slate-200 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-medium text-slate-900 truncate">{frontSlot.label}</p>
                <p className="text-[11px] text-slate-500">Ready for forensic inspection</p>
                <button
                  type="button"
                  onClick={() => {
                    setFrontSlot(null);
                    setResult(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium pt-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ) : (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileUpload('front', e.dataTransfer.files?.[0]);
              }}
              className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-50 hover:border-slate-400 cursor-pointer transition-colors text-center"
            >
              <Upload className="w-5 h-5 text-slate-400" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-slate-800">
                  Drop front card image or click to browse
                </p>
                <p className="text-[11px] text-slate-500">
                  Flat lighting, all 4 borders visible (JPG, PNG, WebP)
                </p>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileUpload('front', e.target.files?.[0])}
                className="sr-only"
              />
            </label>
          )}
        </div>

        {/* Back / Texture Slot */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900">
              2. Card Back or Texture Angle (Optional)
            </span>
            <button
              type="button"
              onClick={() => startCamera('back')}
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Use Camera</span>
            </button>
          </div>

          {backSlot ? (
            <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
              <img
                src={backSlot.dataUrl}
                alt="Uploaded Pokémon card back or close-up"
                className="w-20 h-28 object-cover rounded-lg border border-slate-200 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-medium text-slate-900 truncate">{backSlot.label}</p>
                <p className="text-[11px] text-slate-500">Included in inspection</p>
                <button
                  type="button"
                  onClick={() => {
                    setBackSlot(null);
                    setResult(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium pt-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ) : (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileUpload('back', e.dataTransfer.files?.[0]);
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400 cursor-pointer transition-colors"
            >
              <FileImage className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="text-left">
                <p className="text-xs font-medium text-slate-700">
                  Add back photo or angled holo texture shot
                </p>
                <p className="text-[11px] text-slate-500">
                  Strongly improves counterfeit vs authentic accuracy
                </p>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileUpload('back', e.target.files?.[0])}
                className="sr-only"
              />
            </label>
          )}
        </div>

        {/* Optional Notes */}
        <div className="space-y-1.5">
          <label htmlFor="card-notes" className="block text-xs font-medium text-slate-700">
            Physical Observations (Optional)
          </label>
          <input
            id="card-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Card feels extra thin/glossy, bought from online listing..."
            className="w-full rounded-lg border border-slate-300 bg-slate-50 focus:bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
          />
        </div>

        {scanError && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
            {scanError}
          </div>
        )}

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={!frontSlot || scanning}
            onClick={handleVerifyCard}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {scanning ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Inspecting Card...</span>
              </>
            ) : (
              <>
                <ScanLine className="w-4 h-4" />
                <span>Scan & Verify Card</span>
              </>
            )}
          </button>
          {(frontSlot || backSlot || result) && (
            <button
              type="button"
              disabled={scanning}
              onClick={handleReset}
              className="px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>
      </section>

      {/* Right Inspection Report Column */}
      <section className="bg-white border border-slate-200 rounded-xl min-h-[540px]">
        {scanning ? (
          <div className="p-8 space-y-5">
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
              <RotateCcw className="w-4 h-4 animate-spin text-red-600" />
              <span>Examining card typography, holofoil texture, and PokéAPI species data...</span>
            </div>
            <div className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            <div className="h-44 bg-slate-100 rounded-xl animate-pulse" />
          </div>
        ) : !result ? (
          <div className="p-8 space-y-6">
            <div className="space-y-2 max-w-xl">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Forensic Authenticity Checklist
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Upload or capture a clear photo of your card on the left. The scanner evaluates
                seven visual counterfeiting signals and cross-checks the Pokémon species against
                PokéAPI.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {[
                {
                  title: 'Typography & Accent Checks',
                  desc: 'Verifies HP font weight, attack spacing, copyright year formatting, and the acute accent on "Pokémon".',
                },
                {
                  title: 'Surface Texture & Holo Pattern',
                  desc: 'Distinguishes authentic fingerprint-like etched foil texture from flat glossy rainbow counterfeit prints.',
                },
                {
                  title: 'Borders & Print DPI',
                  desc: 'Checks border proportions, crisp ink edges, and energy icon alignment for low-res scan reproductions.',
                },
                {
                  title: 'Card Back Color Contrast',
                  desc: 'Inspects royal-to-navy blue depth and Pokéball detail when a back photo is provided.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1"
                >
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Verdict Banner */}
            <VerdictBanner
              verdict={result.verdict}
              confidence={result.confidence}
              isPokemonCard={result.isPokemonCard}
            />

            <p className="text-sm text-slate-700 leading-relaxed">{result.summary}</p>

            {/* Card Identity & PokéAPI Match */}
            {result.isPokemonCard && (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start pt-2 border-t border-slate-200">
                <div className="space-y-2">
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Detected Card Details
                  </h3>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-slate-500">Card Title</dt>
                      <dd className="font-semibold text-slate-900">
                        {result.cardIdentity.cardTitle}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Printed HP</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                        {result.cardIdentity.hp}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Set Number</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                        {result.cardIdentity.setNumber}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Type / Category</dt>
                      <dd className="font-medium text-slate-900">{result.cardIdentity.cardType}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Style / Rarity</dt>
                      <dd className="font-medium text-slate-900">{result.cardIdentity.rarity}</dd>
                    </div>
                  </dl>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        onAskAiAboutCard(result.cardIdentity.cardTitle, result.summary)
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Discuss this card with PokéDex AI</span>
                    </button>
                  </div>
                </div>

                {result.speciesMatch && (
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <PokemonImage
                        src={result.speciesMatch.artwork}
                        alt={result.speciesMatch.name}
                        size="md"
                        className="w-12 h-12"
                      />
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                          PokéAPI #{String(result.speciesMatch.id).padStart(4, '0')} ·{' '}
                          {result.speciesMatch.source === 'live' ? 'Live' : 'Cached'}
                        </span>
                        <p className="font-display text-sm font-semibold text-slate-900 truncate">
                          {result.speciesMatch.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {result.speciesMatch.types.map((t) => (
                            <TypeLabel key={t} type={t} compact />
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onInspectPokemon(result.speciesMatch!.slug)}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors"
                    >
                      Open Species in Dex Explorer
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Forensic Checks Table */}
            {result.checks.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Authenticity Breakdown
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold text-slate-700 w-44">
                          Criterion
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-slate-700 w-28">Status</th>
                        <th className="py-2.5 px-3 font-semibold text-slate-700">Observation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.checks.map((chk, idx) => (
                        <tr key={`${chk.criterion}-${idx}`}>
                          <td className="py-2.5 px-3 font-medium text-slate-900 align-top">
                            {chk.criterion}
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            <StatusBadge status={chk.status} />
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 leading-relaxed">
                            {chk.observation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Red Flags & Next Steps */}
            {(result.redFlags.length > 0 || result.recommendations.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 text-xs">
                {result.redFlags.length > 0 && (
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 space-y-2">
                    <h3 className="font-semibold text-red-900">Detected Red Flags</h3>
                    <ul className="list-disc pl-4 space-y-1 text-red-800 leading-relaxed">
                      {result.redFlags.map((flag, idx) => (
                        <li key={idx}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.recommendations.length > 0 && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                    <h3 className="font-semibold text-slate-900">Recommended Next Checks</h3>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700 leading-relaxed">
                      {result.recommendations.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              Note: Visual inspection from photographs helps identify printing, font, texture, and
              color anomalies, but cannot replace physical inspection of card stock black-ink core
              layers or in-person grading.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
