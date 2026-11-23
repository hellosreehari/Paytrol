'use client';

import { useEffect, useRef, useState } from 'react';

interface CameraCaptureProps {
  /** Called when the user confirms the photo they picked. */
  onCapture: (file: File) => void;
  onManualEntry?: () => void;
  /** True while the confirmed photo is being analysed. */
  processing?: boolean;
  statusMessage?: string;
}

/**
 * One button that opens the phone's own picker (which already offers
 * "Take photo" and "Photo library"), then a preview to confirm or retake.
 */
export default function CameraCapture({
  onCapture,
  onManualEntry,
  processing = false,
  statusMessage,
}: CameraCaptureProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const openPicker = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setFile(picked);
    // HEIC can't be previewed in most browsers; it is converted before upload.
    const previewable = !/image\/hei[cf]/i.test(picked.type) && !/\.(heic|heif)$/i.test(picked.name);
    setPreviewUrl(previewable ? URL.createObjectURL(picked) : null);
  };

  const retake = () => {
    setFile(null);
    setPreviewUrl(null);
    openPicker();
  };

  return (
    <div className="space-y-4">
      {file ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-black">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Selected dashboard photo"
                className={`w-full max-h-[55vh] object-contain transition-opacity ${processing ? 'opacity-40' : ''}`}
              />
            ) : (
              <div className="flex h-56 items-center justify-center px-6 text-center text-sm text-[#cfd8d2]">
                {file.name}
              </div>
            )}

            {processing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="h-10 w-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
                <p className="text-sm font-semibold text-[#ffffff]">Reading your dashboard…</p>
                {statusMessage && <p className="text-xs text-[#e6ece8]">{statusMessage}</p>}
              </div>
            )}
          </div>

          {!processing && (
            <>
              <p className="text-center text-xs text-[var(--muted)]">
                Make sure the trip distance and average mileage are sharp and readable.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={retake}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-3.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-soft)]"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={() => onCapture(file)}
                  className="rounded-2xl bg-[var(--primary)] py-3.5 text-sm font-semibold text-[#ffffff] hover:bg-[var(--primary-hover)]"
                >
                  Use photo
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={openPicker}
            className="flex w-full flex-col items-center gap-3 rounded-3xl border border-dashed border-[var(--primary)]/40 bg-[var(--surface)] px-6 py-10 text-center hover:bg-[var(--primary-soft)] transition-colors"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-[#ffffff]">
              <svg width="28" height="28" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </span>
            <span className="text-base font-bold text-[var(--foreground)]">Scan dashboard</span>
            <span className="text-xs text-[var(--muted)]">Take a photo or choose one from your gallery</span>
          </button>

          {onManualEntry && (
            <button
              type="button"
              onClick={onManualEntry}
              className="w-full py-2 text-center text-sm font-medium text-[var(--primary)] hover:underline"
            >
              Enter trip details manually
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
