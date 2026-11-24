'use client';

import { useSession } from 'next-auth/react';
import type { Session } from 'next-auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserProfile } from '@/types';
import { clearAllCachedData, setCacheOwner } from '@/lib/data-cache';

type SessionUser = Session['user'];

interface SessionSnapshot {
  user: SessionUser;
  profile: UserProfile;
}

interface ProfileContextValue {
  profile: UserProfile | null;
  profileLoading: boolean;
  /** The last signed-in user on this device, used before the session check answers. */
  cachedUser: SessionUser | null;
  /** False until the cached snapshot has been read on the client. */
  snapshotReady: boolean;
  /**
   * True when next-auth reported "signed out" only because the session check
   * could not reach the server (offline, or the server is still waking up).
   * The remembered user is kept until the server can actually be asked.
   */
  sessionUnconfirmed: boolean;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
  clearLocalData: () => void;
}

const SNAPSHOT_KEY = 'paytrol:session:v1';

function readSnapshot(): SessionSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as SessionSnapshot;
    return snapshot?.user?.uid && snapshot.profile ? snapshot : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: SessionSnapshot | null) {
  try {
    if (snapshot) window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    else window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Storage unavailable: the app still works, it just can't start instantly.
  }
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Loads the signed-in user's profile once and shares it with every page.
 *
 * The profile and basic user details are also remembered on the device, so
 * the installed app can show its screens straight away on the next launch
 * instead of waiting for the session check and then the profile request,
 * one after the other. Both are still verified in the background, and the
 * user is sent back to sign-in if the session turns out to have expired.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update: refetchSession } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [cachedUser, setCachedUser] = useState<SessionUser | null>(null);
  const [snapshotReady, setSnapshotReady] = useState(false);

  const sessionUser = session?.user;
  const sessionUid = sessionUser?.uid;

  // Read the remembered snapshot once, after hydration.
  useEffect(() => {
    const snapshot = readSnapshot();
    if (snapshot) {
      setCacheOwner(snapshot.user.uid);
      setCachedUser(snapshot.user);
      setProfile(snapshot.profile);
    }
    setSnapshotReady(true);
  }, []);

  const saveProfile = useCallback(
    (next: UserProfile) => {
      setProfile(next);
      if (sessionUser?.uid) {
        writeSnapshot({ user: sessionUser, profile: next });
        setCachedUser(sessionUser);
      }
    },
    [sessionUser]
  );

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/user', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.data) {
        saveProfile(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [saveProfile]);

  const clearLocalData = useCallback(() => {
    writeSnapshot(null);
    clearAllCachedData();
    setCachedUser(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    if (!snapshotReady) return;
    if (status === 'authenticated' && sessionUid) {
      const remembered = readSnapshot();
      if (remembered && remembered.user.uid !== sessionUid) {
        // A different account signed in on this device.
        writeSnapshot(null);
        setCachedUser(null);
        setProfile(null);
        setProfileLoading(true);
      }
      setCacheOwner(sessionUid);
      fetchProfile();
    } else if (status === 'unauthenticated') {
      setProfileLoading(false);
      if (!readSnapshot()) {
        clearLocalData();
        return;
      }
      // next-auth also reports "unauthenticated" when the session request
      // fails. Ask the server directly before forgetting the user.
      let cancelled = false;
      const confirm = async () => {
        try {
          const res = await fetch('/api/auth/session', { cache: 'no-store' });
          const body = res.ok ? ((await res.json()) as Partial<Session> | null) : null;
          if (cancelled) return;
          if (res.ok && !body?.user) {
            // Really signed out (or the session expired).
            clearLocalData();
          } else if (body?.user) {
            // Still signed in: the earlier check just failed. Refresh it.
            refetchSession();
          }
          // Server error: keep the remembered user and try again later.
        } catch {
          // Offline: keep the remembered user; retry when back online.
        }
      };
      confirm();
      window.addEventListener('online', confirm);
      return () => {
        cancelled = true;
        window.removeEventListener('online', confirm);
      };
    }
    // Only re-run when the signed-in account changes, not on every session refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionUid, snapshotReady]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>): Promise<boolean> => {
    try {
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success && data.data) {
        saveProfile(data.data);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update profile:', err);
      return false;
    }
  }, [saveProfile]);

  // Until the server confirms a sign-out, keep trusting the remembered user.
  // clearLocalData() forgets that user once the sign-out is confirmed.
  const sessionUnconfirmed = status === 'unauthenticated' && Boolean(cachedUser);

  const value = useMemo(
    () => ({
      profile,
      profileLoading,
      cachedUser,
      snapshotReady,
      sessionUnconfirmed,
      fetchProfile,
      updateProfile,
      clearLocalData,
    }),
    [profile, profileLoading, cachedUser, snapshotReady, sessionUnconfirmed, fetchProfile, updateProfile, clearLocalData]
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
