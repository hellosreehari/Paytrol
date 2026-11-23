'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import type { UserProfile } from '@/types';

export function useAuth() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading';

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/user');
      const data = await res.json();
      if (data.success && data.data) {
        setProfile(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
    } else if (!isLoading) {
      setLoading(false);
    }
  }, [isAuthenticated, isLoading, fetchProfile]);

  const updateProfile = async (updates: Partial<UserProfile>): Promise<boolean> => {
    try {
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setProfile(data.data);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update profile:', err);
      return false;
    }
  };

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
    isLoading: isLoading || loading,
    needsSetup: isAuthenticated && (!profile || !profile.lastFuelPrice),
    signInGoogle: handleSignInGoogle,
    signOut: handleSignOut,
    fetchProfile,
    updateProfile,
  };
}
