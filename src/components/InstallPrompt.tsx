'use client';

import { useState, useEffect } from 'react';
import { CloseIcon, PhoneIcon } from '@/components/icons';

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
      className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm z-50 bg-surface border border-primary-line text-ink rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-slide-down"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary-line flex items-center justify-center shrink-0">
          <PhoneIcon size={24} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-ink">Add Paytrol to Home Screen</p>
          <p className="text-xs text-ink-soft mt-0.5">
            {isIOS
              ? 'Tap Share ⎋ below, then select "Add to Home Screen" for instant camera access.'
              : 'Install our web app for full screen, fast camera scans & offline access.'}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted hover:text-ink p-1 rounded-lg"
          aria-label="Dismiss"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={handleDismiss}
          className="text-xs px-3 py-1.5 rounded-lg text-muted hover:text-ink transition-colors"
        >
          Not now
        </button>
        {deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="text-xs px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-on-primary rounded-lg font-medium transition-colors"
          >
            Add to Homescreen
          </button>
        )}
      </div>
    </aside>
  );
}
