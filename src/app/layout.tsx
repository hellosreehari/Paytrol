import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import InstallPrompt from '@/components/InstallPrompt';

const inter = Inter({ subsets: ['latin'] });

// iPhone screens in points (width, height, pixel ratio), with a matching
// image in public/splash. Newest first.
const SPLASH_SCREENS: [number, number, number][] = [
  [440, 956, 3], [402, 874, 3], [420, 912, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3],
  [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2], [414, 736, 3],
];

export const metadata: Metadata = {
  title: 'Paytrol — AI Trip Fuel Cost Splitter',
  description: 'Snap your dashboard, extract trip distance and mileage with AI, and split the bill with friends.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Paytrol',
    // Launch screens for the installed app on iPhone. Without them iOS shows
    // a blank black screen while the app starts.
    startupImage: SPLASH_SCREENS.map(([width, height, ratio]) => ({
      url: `/splash/iphone-${width * ratio}x${height * ratio}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#f4f6f1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body className={`${inter.className} bg-canvas text-ink antialiased selection:bg-primary-soft selection:text-ink`}>
        <Providers>
          <InstallPrompt />
          {children}
        </Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(err => {
                    console.log('SW registration note:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
