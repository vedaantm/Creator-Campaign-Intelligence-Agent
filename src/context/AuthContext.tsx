import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase.ts';
import { setAuthTokenProvider } from '../lib/api.ts';

interface AuthContextType {
  user: FirebaseUser | null;
  demoUser: { uid: string; email: string; displayName: string } | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsDemo: (role?: 'owner' | 'member') => void;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [demoUser, setDemoUser] = useState<{ uid: string; email: string; displayName: string } | null>(() => {
    const saved = localStorage.getItem('ccia_demo_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Clear demo user if real user logs in
        setDemoUser(null);
        localStorage.removeItem('ccia_demo_user');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (user) {
      return await user.getIdToken();
    }
    if (demoUser) {
      return `demo_user_${demoUser.uid}`;
    }
    return null;
  }, [user, demoUser]);

  useEffect(() => {
    setAuthTokenProvider(getIdToken);
  }, [getIdToken]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google Sign-in error:', err);
      throw err;
    }
  }, []);

  const signInAsDemo = useCallback((role: 'owner' | 'member' = 'owner') => {
    const dummy = {
      uid: role === 'owner' ? 'demo_marketer' : 'colleague_user',
      email: role === 'owner' ? 'marketer@ccia.internal' : 'reviewer@ccia.internal',
      displayName: role === 'owner' ? 'Lead Brand Marketer (Demo)' : 'Colleague Reviewer (Demo)',
    };
    setDemoUser((prev) => {
      if (prev && prev.uid === dummy.uid) return prev;
      return dummy;
    });
    localStorage.setItem('ccia_demo_user', JSON.stringify(dummy));
  }, []);

  const signOut = useCallback(async () => {
    if (demoUser) {
      setDemoUser(null);
      localStorage.removeItem('ccia_demo_user');
    }
    if (user) {
      await fbSignOut(auth);
    }
  }, [demoUser, user]);

  const value = useMemo(
    () => ({
      user,
      demoUser,
      loading,
      signInWithGoogle,
      signInAsDemo,
      signOut,
      getIdToken,
    }),
    [user, demoUser, loading, signInWithGoogle, signInAsDemo, signOut, getIdToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
