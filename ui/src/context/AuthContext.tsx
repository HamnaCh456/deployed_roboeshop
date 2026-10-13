"use client";

/**
 * Who is signed in, for the whole app.
 *
 * This is the only file that knows how a session is observed. Everything else
 * — the navbar, the community page — asks `useAuth()` and gets three things:
 * a status, the Supabase user, and the profile row that holds the display
 * name. `status` starts as "loading" so a page can hold its write controls
 * disabled instead of flashing "Sign in" at someone who is signed in.
 *
 * The profile is fetched in its own effect keyed on the user, not inside the
 * `onAuthStateChange` callback: awaiting a Supabase call inside that callback
 * deadlocks the client (documented in supabase-js).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "../lib/supabase/client";

export interface Profile {
  id: string;
  displayName: string;
}

export type AuthStatus = "loading" | "signed-out" | "signed-in";

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  /** Null while loading, while signed out, and for the instant between
      sign-up and the trigger writing the row — `displayName` below falls
      back to the name the sign-up form sent in user metadata. */
  profile: Profile | null;
  /** The name to sign things with. "" when signed out. */
  displayName: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/* Decided once, at module load, so a missing env is a site with no accounts
   from the first render rather than a "loading" that never resolves. Read as
   literal expressions because Next inlines those (see lib/supabase/env). */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [status, setStatus] = useState<AuthStatus>(
    CONFIGURED ? "loading" : "signed-out"
  );
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!CONFIGURED) {
      console.error(
        "Supabase is not configured — copy ui/.env.example to ui/.env. Accounts are off."
      );
      return;
    }

    // `onAuthStateChange` fires INITIAL_SESSION on subscribe, so no separate
    // getSession() call is needed — one path, not two that can disagree.
    // The profile is cleared here too: a signed-out session has no name.
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session ? "signed-in" : "signed-out");
      if (!session) setProfile(null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    createClient()
      .from("profiles")
      .select("id, display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live || !data) return;
        setProfile({ id: data.id, displayName: data.display_name });
      });
    return () => {
      live = false;
    };
  }, [user]);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(() => {
    const fromMetadata =
      typeof user?.user_metadata?.display_name === "string"
        ? (user.user_metadata.display_name as string)
        : "";
    return {
      status,
      user,
      profile,
      displayName: profile?.displayName ?? fromMetadata,
      signOut,
    };
  }, [status, user, profile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth() must be used inside <AuthProvider>");
  }
  return value;
}
