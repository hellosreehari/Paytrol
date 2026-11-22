'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already running as standalone PWA
    const iosNavigator = window.navigator as Navigator & { standalone?: boolean };
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      iosNavigator.standalone === true;
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) return;

    // Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // If on iOS and not dismissed in this session, show instructions after 3 seconds
    if (isIosDevice && !sessionStorage.getItem('paytrol_ios_dismissed')) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    if (isIOS) {
      sessionStorage.setItem('paytrol_ios_dismissed', 'true');
    }
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <aside
      aria-label="Add to Homescreen"
      className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm z-50 bg-slate-900/95 border border-indigo-500/40 text-white rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-slide-down"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18v-5.25m0 0a6.002 6.002 0 00-4-5.659V5a2 2 0 114 0v2.091a6.002 6.002 0 004 5.659M12 12.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white">Add Paytrol to Home Screen</p>
          <p className="text-xs text-slate-300 mt-0.5">
            {isIOS
              ? 'Tap Share ⎋ below, then select "Add to Home Screen" for instant camera access.'
              : 'Install our web app for full screen, fast camera scans & offline access.'}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-lg"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={handleDismiss}
          className="text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          Not now
        </button>
        {deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors shadow-sm shadow-indigo-500/50"
          >
            Add to Homescreen
          </button>
        )}
      </div>
    </aside>
  );
}
