'use client';

import { useSession } from 'next-auth/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserProfile } from '@/types';

interface ProfileContextValue {
  profile: UserProfile | null;
  profileLoading: boolean;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Loads the signed-in user's profile once and shares it with every page,
 * instead of each page fetching /api/user on its own.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

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
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      setProfileLoading(true);
      fetchProfile();
    } else if (status === 'unauthenticated') {
      setProfile(null);
      setProfileLoading(false);
    }
  }, [status, fetchProfile]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>): Promise<boolean> => {
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
  }, []);

  const value = useMemo(
    () => ({ profile, profileLoading, fetchProfile, updateProfile }),
    [profile, profileLoading, fetchProfile, updateProfile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfileContext(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfileContext must be used inside <ProfileProvider>.');
  }
  return context;
}
