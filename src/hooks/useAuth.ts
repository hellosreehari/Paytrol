'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useProfileContext } from '@/components/ProfileProvider';

export function useAuth() {
  const { data: session, status } = useSession();
  const { profile, profileLoading, fetchProfile, updateProfile } = useProfileContext();

  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading' || (isAuthenticated && profileLoading);

  const handleSignInGoogle = () => {
    signIn('google', { callbackUrl: '/home' });
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  return {
    session,
    user: session?.user,
    profile,
    isAuthenticated,
    isLoading,
    needsSetup: isAuthenticated && !profileLoading && (!profile || !profile.lastFuelPrice),
    signInGoogle: handleSignInGoogle,
    signOut: handleSignOut,
    fetchProfile,
    updateProfile,
  };
}
