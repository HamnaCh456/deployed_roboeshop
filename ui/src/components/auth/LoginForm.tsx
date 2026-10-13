"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useRef, useState } from "react";

import { createClient } from "../../lib/supabase/client";
import AuthCard from "./AuthCard";
import { describeAuthError } from "./errors";
import { AFTER_SIGN_IN, safeNext } from "./nextPath";
import PasswordInput from "./PasswordInput";

const LoginForm: React.FC = () => {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  // Uncontrolled (see PasswordInput) so a saved password the browser fills in
  // is never reset by a render.
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const password = passwordRef.current?.value ?? "";
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setIsBusy(true);
    setError(null);
    const { error: failure } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsBusy(false);

    if (failure) {
      setError(describeAuthError(failure));
      return;
    }
    // Every sign-in lands on the dashboard. `next` still rides along to the
    // sign-up link below.
    router.push(AFTER_SIGN_IN);
    router.refresh();
  };

  return (
    <AuthCard
      title="Sign in"
      lead="Reviews and replies are signed with your account name."
      foot={
        <>
          No account yet?{" "}
          <Link
            className="auth-link"
            href={`/auth/sign-up?next=${encodeURIComponent(next)}`}
          >
            Sign up
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="auth-field">
          <div className="auth-field__row">
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <Link className="auth-link" href="/auth/forgot-password">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="auth-password"
            inputRef={passwordRef}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-button" disabled={isBusy}>
          {isBusy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
};

export default LoginForm;
