'use client';

import { SessionProvider } from 'next-auth/react';
import React, { ReactNode } from 'react';
import { ProfileProvider } from '@/components/ProfileProvider';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ProfileProvider>{children}</ProfileProvider>
    </SessionProvider>
  );
}
