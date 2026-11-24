'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn, compressImage } from '@/lib/utils';
import {
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
  SteadyTracker,
  frameDifference,
  lighting,
  sharpness,
  toGray,
} from '@/lib/frame-quality';
import { ScanError, foundAnything, foundBoth, readDashboard, type ScanReading } from '@/lib/scan-client';
import { CameraIcon, FlashIcon, ImageIcon } from '@/components/icons';

/** How long one scan looks for the trip meter before pausing. Time spent reading doesn't count. */
const SCAN_WINDOW_MS = 10_000;
/** At most this many photos are sent per scan. */
const MAX_READS = 3;
/** Check frames this often. */
const SAMPLE_EVERY_MS = 100;
/** Remembered once the person has turned the camera on, so later app opens start live. */
const CAMERA_ON_KEY = 'paytrol_camera_on';

// Auto-scan only once per app open. This lives in the page's memory, so it
// survives switching tabs inside the app but resets when the app is opened again.
let autoScannedThisLaunch = false;

export interface ScanOutcome {
  /** The best reading, or null when nothing could be read. */
  reading: ScanReading | null;
  /** Local preview of the photo that was read. */
  previewUrl: string | null;
  /** Why the numbers are missing, when they are. */
  note?: string;
}

type Phase =
  | 'checking' // deciding whether to start the camera
  | 'off' // camera never turned on: show "Turn on camera"
  | 'starting'
  | 'scanning'
  | 'reading'
  | 'paused'
  | 'unavailable'; // no camera, permission denied, or scanning not set up

type Problem = 'moving' | 'blurry' | 'dark' | 'glare' | null;

const HINTS: Record<Exclude<Problem, null>, string> = {
  moving: 'Hold still',
  blurry: 'Focusing…',
  dark: 'Too dark',
  glare: 'Too much glare',
};

function readFlag(): boolean {
  try {
    return localStorage.getItem(CAMERA_ON_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(CAMERA_ON_KEY, '1');
    else localStorage.removeItem(CAMERA_ON_KEY);
  } catch {
    // Private mode: the card will just ask again next time.
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not capture the frame.'))), 'image/jpeg', quality);
  });
}

/**
 * The live camera card on Home. It starts scanning on its own, takes a photo
 * once the picture has been still, sharp and well lit for about a second,
 * and pauses after 10 seconds if it finds nothing.
 */
export default function HomeScanner({
  onResult,
  hold = false,
  scanRequest = 0,
}: {
  onResult: (outcome: ScanOutcome) => void;
  /** True while the review sheet is open: stay paused. */
  hold?: boolean;
  /** Bump to start a new scan, e.g. after the review sheet is dismissed to retake. */
  scanRequest?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevGrayRef = useRef<Float32Array | null>(null);
  const trackerRef = useRef(new SteadyTracker());
  const scanElapsedRef = useRef(0);
  const lastTickRef = useRef(0);
  const readsRef = useRef(0);
  const bestPartialRef = useRef<{ reading: ScanReading; previewUrl: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const phaseRef = useRef<Phase>('checking');
  const holdRef = useRef(hold);
  const startScanRef = useRef<() => void>(() => {});

  const [phase, setPhaseState] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<Problem>(null);
  const [secondsLeft, setSecondsLeft] = useState(SCAN_WINDOW_MS / 1000);
  const [poster, setPoster] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  /** Keep a small blurred still of the last frame to show while paused. */
  const grabPoster = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = Math.round((240 * video.videoHeight) / video.videoWidth);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      setPoster(canvas.toDataURL('image/jpeg', 0.6));
    } catch {
      // Ignore: the paused card falls back to a plain background.
    }
  }, []);

  const pause = useCallback(
    (note?: string) => {
      abortRef.current?.abort();
      if (streamRef.current) grabPoster();
      stopCamera();
      setProgress(0);
      setProblem(null);
      setMessage(note ?? null);
      setPhase('paused');
    },
    [grabPoster, setPhase, stopCamera]
  );

  const finish = useCallback(
    (outcome: ScanOutcome) => {
      navigator.vibrate?.(40);
      if (streamRef.current) grabPoster();
      setFrozen(null);
      stopCamera();
      setProgress(0);
      setPhase('paused');
      setMessage(null);
      onResult(outcome);
    },
    [grabPoster, onResult, setPhase, stopCamera]
  );

  /** Take a full-resolution frame and send it for reading. */
  const captureAndRead = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setPhase('reading');
    setProgress(0);
    readsRef.current += 1;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    let blob: Blob;
    try {
      blob = await canvasToBlob(canvas);
    } catch {
      setPhase('scanning');
      return;
    }
    const previewUrl = URL.createObjectURL(blob);
    setFrozen(previewUrl);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reading = await readDashboard(blob, controller.signal);
      if (controller.signal.aborted) return;
      if (foundBoth(reading)) {
        finish({ reading, previewUrl });
        return;
      }
      if (foundAnything(reading) && !bestPartialRef.current) {
        bestPartialRef.current = { reading, previewUrl };
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ScanError && !error.retryable) {
        stopCamera();
        setFrozen(null);
        setMessage(error.message);
        setPhase('unavailable');
        return;
      }
      setMessage(error instanceof Error ? error.message : null);
    }

    // Not found yet. Try again with a fresh frame, unless this scan is used up.
    setFrozen(null);
    if (bestPartialRef.current?.previewUrl !== previewUrl) URL.revokeObjectURL(previewUrl);
    const timeLeft = scanElapsedRef.current < SCAN_WINDOW_MS;
    if (readsRef.current < MAX_READS && timeLeft && !holdRef.current && streamRef.current) {
      trackerRef.current.reset();
      lastTickRef.current = performance.now();
      setPhase('scanning');
      return;
    }
    const partial = bestPartialRef.current;
    if (partial) {
      finish({ reading: partial.reading, previewUrl: partial.previewUrl, note: 'Only one number could be read. Fill in the other.' });
    } else {
      pause("Couldn't find the trip meter. Tap to try again.");
    }
  }, [finish, pause, setPhase, stopCamera]);

  /** Score frames while scanning. */
  useEffect(() => {
    if (phase !== 'scanning') return;
    let raf = 0;
    let lastSample = 0;
    let lastShownProgress = -1;
    let lastShownSeconds = -1;
    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (phaseRef.current !== 'scanning') return;
      scanElapsedRef.current += now - lastTickRef.current;
      lastTickRef.current = now;

      const seconds = Math.max(0, Math.ceil((SCAN_WINDOW_MS - scanElapsedRef.current) / 1000));
      if (seconds !== lastShownSeconds) {
        lastShownSeconds = seconds;
        setSecondsLeft(seconds);
      }
      if (scanElapsedRef.current >= SCAN_WINDOW_MS) {
        const partial = bestPartialRef.current;
        if (partial) {
          finish({ reading: partial.reading, previewUrl: partial.previewUrl, note: 'Only one number could be read. Fill in the other.' });
        } else {
          pause();
        }
        return;
      }
      if (now - lastSample < SAMPLE_EVERY_MS) return;
      lastSample = now;

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const canvas = (sampleCanvasRef.current ??= document.createElement('canvas'));
      canvas.width = SAMPLE_WIDTH;
      canvas.height = SAMPLE_HEIGHT;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      // The card crops the video (object-cover): score only the part you can see,
      // so the guide box lines up with what the checks look at.
      const card = cardRef.current;
      const cardAspect = card && card.clientHeight ? card.clientWidth / card.clientHeight : SAMPLE_WIDTH / SAMPLE_HEIGHT;
      const videoAspect = video.videoWidth / video.videoHeight;
      let sw = video.videoWidth;
      let sh = video.videoHeight;
      if (videoAspect > cardAspect) sw = sh * cardAspect;
      else sh = sw / cardAspect;
      ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const gray = toGray(ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const prev = prevGrayRef.current;
      prevGrayRef.current = gray;
      if (!prev) return;

      const state = trackerRef.current.update({
        time: now,
        difference: frameDifference(prev, gray),
        sharpness: sharpness(gray, SAMPLE_WIDTH, SAMPLE_HEIGHT),
        lighting: lighting(gray),
      });
      setProblem(state.problem);
      const shown = Math.round(state.progress * 20) / 20;
      if (shown !== lastShownProgress) {
        lastShownProgress = shown;
        setProgress(shown);
      }
      if (state.capture) void captureAndRead();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, captureAndRead, finish, pause]);

  /** Turn the camera on and start a fresh 10-second scan. */
  const startScan = useCallback(async () => {
    if (holdRef.current) return;
    autoScannedThisLaunch = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('This browser can’t use the camera. Choose a photo or type the trip in.');
      setPhase('unavailable');
      return;
    }
    abortRef.current?.abort();
    setPhase('starting');
    setMessage(null);
    setFrozen(null);
    scanElapsedRef.current = 0;
    readsRef.current = 0;
    bestPartialRef.current = null;
    prevGrayRef.current = null;
    trackerRef.current = new SteadyTracker();
    setSecondsLeft(SCAN_WINDOW_MS / 1000);

    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      }
      const video = videoRef.current;
      if (!video || holdRef.current || phaseRef.current !== 'starting') {
        stopCamera();
        return;
      }
      video.srcObject = streamRef.current;
      await video.play().catch(() => undefined);
      writeFlag(true);

      const [track] = streamRef.current.getVideoTracks();
      const capabilities = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorchAvailable(Boolean(capabilities.torch));
      setPhase('scanning');
    } catch (error) {
      stopCamera();
      const name = (error as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        writeFlag(false);
        setMessage('Camera access is off for Paytrol. Allow it in your browser settings, or choose a photo instead.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setMessage('No camera found. Choose a photo or type the trip in.');
      } else {
        setMessage('The camera couldn’t start. Tap to try again, or choose a photo.');
        setPhase('paused');
        return;
      }
      setPhase('unavailable');
    }
  }, [setPhase, stopCamera]);
  useEffect(() => {
    startScanRef.current = () => void startScan();
  }, [startScan]);

  /** On first show: start straight away if the camera was allowed before. */
  useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      if (holdRef.current) {
        setPhase('paused');
        return;
      }
      // Only the first Home of this app open scans by itself. Coming back
      // from another tab (or after saving a trip) waits for a tap.
      const skip = autoScannedThisLaunch;
      let granted = readFlag();
      if (!granted && navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
          granted = status.state === 'granted';
        } catch {
          // Safari doesn't know the "camera" permission name.
        }
      }
      if (cancelled) return;
      if (granted && skip) setPhase('paused');
      else if (granted) {
        autoScannedThisLaunch = true;
        startScanRef.current();
      } else setPhase('off');
    };
    void decide();
    return () => {
      cancelled = true;
    };
  }, [setPhase]);

  /** Pause when the app is hidden or the card scrolls away. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (phaseRef.current === 'scanning' || phaseRef.current === 'starting') pause();
      // Mid-read: let the read finish, but don't leave the camera running in the background.
      else if (phaseRef.current === 'reading' && streamRef.current) {
        grabPoster();
        stopCamera();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    let observer: IntersectionObserver | null = null;
    if (cardRef.current && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.intersectionRatio < 0.35 && phaseRef.current === 'scanning') pause();
        },
        { threshold: [0, 0.35, 1] }
      );
      observer.observe(cardRef.current);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, [grabPoster, pause, stopCamera]);

  /** Opening the review sheet pauses the camera. */
  useEffect(() => {
    if (hold && (phaseRef.current === 'scanning' || phaseRef.current === 'starting')) pause();
  }, [hold, pause]);

  /** Start again when asked, e.g. the review sheet was dismissed to retake. */
  useEffect(() => {
    if (scanRequest > 0) startScanRef.current();
  }, [scanRequest]);

  /** Turn everything off when leaving Home. */
  useEffect(
    () => () => {
      abortRef.current?.abort();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const toggleTorch = async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {
      setTorchAvailable(false);
    }
  };

  const handlePickedPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    abortRef.current?.abort();
    if (streamRef.current) grabPoster();
    stopCamera();
    setMessage(null);
    setPhase('reading');
    const previewable = !/image\/hei[cf]/i.test(file.type) && !/\.(heic|heif)$/i.test(file.name);
    const previewUrl = previewable ? URL.createObjectURL(file) : null;
    setFrozen(previewUrl);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const compressed = await compressImage(file, 1024 * 1024);
      const reading = await readDashboard(compressed, controller.signal);
      if (controller.signal.aborted) return;
      setFrozen(null);
      finish({
        reading: foundAnything(reading) ? reading : null,
        previewUrl,
        note: foundBoth(reading)
          ? undefined
          : foundAnything(reading)
            ? 'Only one number could be read. Fill in the other.'
            : 'Couldn’t read that photo. Type the numbers in.',
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setFrozen(null);
      finish({ reading: null, previewUrl, note: error instanceof Error ? error.message : 'Couldn’t read that photo.' });
    }
  };

  const live = phase === 'scanning' || phase === 'starting';
  const tappable = phase === 'paused' || phase === 'off';
  const ringDegrees = Math.round(progress * 360);

  return (
    <div
      ref={cardRef}
      className="relative aspect-[4/3.4] w-full overflow-hidden rounded-3xl bg-[#0b110e] text-white select-none"
    >
      {/* Live preview */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className={cn('absolute inset-0 h-full w-full object-cover transition-opacity', live ? 'opacity-100' : 'opacity-0')}
      />

      {/* Paused: last frame, blurred */}
      {!live && poster && !frozen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md brightness-50" />
      )}

      {/* The photo being read */}
      {frozen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frozen} alt="Dashboard photo being read" className="absolute inset-0 h-full w-full object-cover" />
      )}

      {/* Guide box */}
      {(live || phase === 'reading') && (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-[8%] top-[14%] bottom-[22%] rounded-xl border-[1.5px] border-dashed transition-colors',
            progress > 0 ? 'border-[#7fe0b2]' : 'border-white/55'
          )}
        />
      )}

      {phase === 'scanning' && (
        <>
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff5a4e]" />
            Scanning
          </span>
        </>
      )}

      {phase === 'reading' && (
        <div className="absolute inset-0 flex items-end justify-center bg-black/25 pb-5">
          <span className="motion-safe:animate-pulse rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-semibold" aria-live="polite">
            Reading trip and average…
          </span>
        </div>
      )}

      {/* Bottom controls */}
      {(live || phase === 'paused') && (
        <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-between px-3.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Choose a photo from your gallery"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/70 bg-black/40 backdrop-blur"
          >
            <ImageIcon size={20} />
          </button>

          {phase === 'scanning' ? (
            <span className="flex items-center gap-2 rounded-full bg-black/50 py-1.5 pl-1.5 pr-3 text-xs font-semibold">
              <span
                aria-hidden="true"
                className="h-6 w-6 rounded-full"
                style={{
                  background: `conic-gradient(#7fe0b2 0 ${ringDegrees}deg, rgba(255,255,255,.25) ${ringDegrees}deg 360deg)`,
                  WebkitMask: 'radial-gradient(circle, transparent 7px, #000 7.5px)',
                  mask: 'radial-gradient(circle, transparent 7px, #000 7.5px)',
                }}
              />
              <span aria-live="polite">{problem ? HINTS[problem] : progress > 0 ? 'Hold steady' : 'Point at the trip meter'}</span>
              <span className="text-white/70">· {secondsLeft}s</span>
            </span>
          ) : (
            <span />
          )}

          {torchAvailable && live ? (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torchOn}
              aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full backdrop-blur',
                torchOn ? 'bg-white text-ink' : 'bg-black/40 text-white'
              )}
            >
              <FlashIcon size={18} />
            </button>
          ) : (
            <span className="w-11" />
          )}
        </div>
      )}

      {/* Paused / first run / unavailable: the whole card is the button */}
      {(tappable || phase === 'checking') && (
        <button
          type="button"
          onClick={() => void startScan()}
          disabled={phase === 'checking'}
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center',
            phase === 'off' && 'pb-8'
          )}
        >
          {phase === 'off' ? (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12">
                <CameraIcon size={28} />
              </span>
              <span className="text-base font-bold">Scan your dashboard</span>
              <span className="text-xs text-white/75">Point the camera at the trip meter. Paytrol reads the distance and average for you.</span>
              <span className="mt-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1b231f]">Turn on camera</span>
            </>
          ) : phase === 'paused' ? (
            <>
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1b231f]">Tap to scan</span>
              <span className="text-xs text-white/80">{message || 'Point the camera at your trip meter'}</span>
            </>
          ) : null}
        </button>
      )}

      {phase === 'off' && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-xs font-semibold text-white/80 underline underline-offset-2"
        >
          or choose a photo
        </button>
      )}

      {phase === 'unavailable' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 pb-12 text-center">
          <CameraIcon size={28} className="text-white/70" />
          <p className="text-sm text-white/90">{message || 'Scanning isn’t available right now.'}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1b231f]"
          >
            Choose a photo
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={handlePickedPhoto}
        className="hidden"
      />
    </div>
  );
}
