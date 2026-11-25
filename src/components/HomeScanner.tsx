'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn, compressImage } from '@/lib/utils';
import { ScanError, foundAnything, foundBoth, readDashboard, type ScanReading } from '@/lib/scan-client';
import { CameraIcon, FlashIcon, ImageIcon } from '@/components/icons';
import { onCameraRequests, setCameraState, takeCameraStartRequest } from '@/lib/scan-events';

/** The camera turns itself off after this long without a photo, to save battery. */
const IDLE_MS = 60_000;
/** Remembered once the person has turned the camera on, so later app opens start live. */
const CAMERA_ON_KEY = 'paytrol_camera_on';

// The camera turns on by itself only once per app open. This lives in the page's
// memory, so it survives switching tabs inside the app but resets on a fresh open.
let autoStartedThisLaunch = false;

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
  | 'live' // preview running, waiting for the shutter
  | 'reading'
  | 'paused'
  | 'unavailable'; // no camera, permission denied, or scanning not set up

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

/** Longest side of a captured frame. Plenty for printed digits, and a much smaller upload. */
const CAPTURE_MAX_SIDE = 1280;

/**
 * The part of the video frame visible in the card (the video fills the card
 * like object-cover, so the camera sees more than the screen shows), scaled
 * down to CAPTURE_MAX_SIDE. A smaller photo uploads faster and Gemini reads
 * it faster, and the parts the user never saw can't confuse it.
 */
function frameCanvas(video: HTMLVideoElement): HTMLCanvasElement {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth || vw;
  const ch = video.clientHeight || vh;
  const cover = Math.max(cw / vw, ch / vh);
  const sw = Math.min(vw, cw / cover);
  const sh = Math.min(vh, ch / cover);
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d')?.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * The live camera card on Home. The centre button of the bottom bar is its
 * shutter: a tap takes the photo and sends it to be read. The camera turns
 * off after a minute without a photo.
 */
export default function HomeScanner({
  onResult,
  hold = false,
  scanRequest = 0,
}: {
  onResult: (outcome: ScanOutcome) => void;
  /** True while the review sheet is open: stay paused. */
  hold?: boolean;
  /** Bump to turn the camera back on, e.g. after the review sheet is dismissed to retake. */
  scanRequest?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const phaseRef = useRef<Phase>('checking');
  const holdRef = useRef(hold);
  const startScanRef = useRef<() => void>(() => {});
  const captureRef = useRef<() => void>(() => {});

  const [phase, setPhaseState] = useState<Phase>('checking');
  const [poster, setPoster] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
    setCameraState(next === 'live' || next === 'starting' || next === 'reading' ? next : 'off');
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
      setPhase('paused');
      setMessage(null);
      onResult(outcome);
    },
    [grabPoster, onResult, setPhase, stopCamera]
  );

  /** The shutter: take the frame as seen on screen and send it for reading. */
  const captureAndRead = useCallback(async () => {
    const video = videoRef.current;
    if (phaseRef.current !== 'live' || !video || video.readyState < 2 || !video.videoWidth) return;
    navigator.vibrate?.(20);
    setPhase('reading');
    setMessage(null);

    const canvas = frameCanvas(video);
    let blob: Blob;
    try {
      blob = await canvasToBlob(canvas, 0.85);
    } catch {
      setPhase('live');
      return;
    }
    const previewUrl = URL.createObjectURL(blob);
    setFrozen(previewUrl);

    const controller = new AbortController();
    abortRef.current = controller;
    let note = 'Couldn’t read that. Fit the meter in the box and try again.';
    try {
      const reading = await readDashboard(blob, controller.signal);
      if (controller.signal.aborted) return;
      if (foundAnything(reading)) {
        finish({
          reading,
          previewUrl,
          note: foundBoth(reading) ? undefined : 'Only one number could be read. Fill in the other.',
        });
        return;
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ScanError && !error.retryable) {
        URL.revokeObjectURL(previewUrl);
        stopCamera();
        setFrozen(null);
        setMessage(error.message);
        setPhase('unavailable');
        return;
      }
      if (error instanceof Error) note = error.message;
    }

    // Nothing read: back to the live preview for another try.
    URL.revokeObjectURL(previewUrl);
    setFrozen(null);
    if (streamRef.current && !holdRef.current) {
      setMessage(note);
      setPhase('live');
    } else {
      pause(note);
    }
  }, [finish, pause, setPhase, stopCamera]);

  /** Turn the camera off after a while without a photo. */
  useEffect(() => {
    if (phase !== 'live') return;
    const timer = window.setTimeout(() => pause(), IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, pause]);

  /** Turn the camera on. */
  const startScan = useCallback(async () => {
    if (holdRef.current) return;
    autoStartedThisLaunch = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('This browser can’t use the camera. Choose a photo or type the trip in.');
      setPhase('unavailable');
      return;
    }
    abortRef.current?.abort();
    setPhase('starting');
    setMessage(null);
    setFrozen(null);

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
      setPhase('live');
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
    captureRef.current = () => void captureAndRead();
  }, [startScan, captureAndRead]);

  /** On first show: start straight away if the camera was allowed before. */
  useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      if (holdRef.current) {
        setPhase('paused');
        return;
      }
      // Only the first Home of this app open turns the camera on by itself.
      // Coming back from another tab waits for a tap. The Scan button in the
      // bottom bar always turns it on.
      let granted = readFlag();
      if (!granted && navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
          granted = status.state === 'granted';
        } catch {
          // Safari doesn't know the "camera" permission name.
        }
      }
      // React's dev double-run (or a scan already started) must not undo a start.
      if (cancelled || phaseRef.current !== 'checking') return;
      const asked = takeCameraStartRequest();
      const skip = autoStartedThisLaunch && !asked;
      if (asked) startScanRef.current();
      else if (granted && skip) setPhase('paused');
      else if (granted) {
        autoStartedThisLaunch = true;
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
      if (phaseRef.current === 'live' || phaseRef.current === 'starting') pause();
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
          if (entry.intersectionRatio < 0.35 && phaseRef.current === 'live') pause();
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
    if (hold && (phaseRef.current === 'live' || phaseRef.current === 'starting')) pause();
  }, [hold, pause]);

  /** The centre button of the bottom bar, while Home is open. */
  useEffect(() => {
    const wake = () => {
      if (holdRef.current) return;
      const current = phaseRef.current;
      if (current === 'paused' || current === 'off') startScanRef.current();
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    return onCameraRequests({
      start: wake,
      capture: () => {
        if (phaseRef.current === 'live') captureRef.current();
        else wake();
      },
    });
  }, []);

  /** Start again when asked, e.g. the review sheet was dismissed to retake. */
  useEffect(() => {
    if (scanRequest > 0) startScanRef.current();
  }, [scanRequest]);

  /** Turn everything off when leaving Home. */
  useEffect(
    () => () => {
      abortRef.current?.abort();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setCameraState('off');
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

  const live = phase === 'live' || phase === 'starting';
  const tappable = phase === 'paused' || phase === 'off';

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
            'pointer-events-none absolute inset-x-[8%] top-[14%] bottom-[22%] rounded-xl border-[1.5px] border-dashed border-white/55'
          )}
        />
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

          {phase === 'live' ? (
            <span
              aria-live="polite"
              className="mx-2 min-w-0 rounded-2xl bg-black/55 px-3 py-1.5 text-center text-xs font-semibold leading-snug"
            >
              {message || 'Fit the trip meter in the box'}
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
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1b231f]">Turn on camera</span>
              <span className="text-xs text-white/80">{message || 'Then tap Capture to read the trip meter'}</span>
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
