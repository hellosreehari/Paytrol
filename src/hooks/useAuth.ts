'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useProfileContext } from '@/components/ProfileProvider';

export function useAuth() {
  const { data: session, status } = useSession();
  const {
    profile,
    profileLoading,
    cachedUser,
    snapshotReady,
    sessionUnconfirmed,
    fetchProfile,
    updateProfile,
    clearLocalData,
  } = useProfileContext();

  // While the session check is in flight, trust the user remembered on this
  // device so the app can render immediately. If the check fails, the
  // provider clears that memory and the layouts redirect to sign-in.
  const optimistic =
    (status === 'loading' || (status === 'unauthenticated' && sessionUnconfirmed)) && Boolean(cachedUser);
  const isAuthenticated = status === 'authenticated' || optimistic;
  const isLoading =
    !snapshotReady ||
    (status === 'loading' && !cachedUser) ||
    (status === 'unauthenticated' && sessionUnconfirmed && !cachedUser) ||
    (status === 'authenticated' && profileLoading && !profile);

  const handleSignInGoogle = () => {
    signIn('google', { callbackUrl: '/home' });
  };

  const handleSignOut = () => {
    clearLocalData();
    signOut({ callbackUrl: '/' });
  };

  return {
    session,
    user: session?.user ?? cachedUser ?? undefined,
    profile,
    isAuthenticated,
    isLoading,
    needsSetup: isAuthenticated && !isLoading && (!profile || !profile.lastFuelPrice),
    signInGoogle: handleSignInGoogle,
    signOut: handleSignOut,
    fetchProfile,
    updateProfile,
  };
}
