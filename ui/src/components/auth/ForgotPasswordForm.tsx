"use client";

import Link from "next/link";
import React, { useState } from "react";

import { createClient } from "../../lib/supabase/client";
import AuthCard from "./AuthCard";
import { describeAuthError } from "./errors";

const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter the email you signed up with.");
      return;
    }

    setIsBusy(true);
    setError(null);
    const { error: failure } = await createClient().auth.resetPasswordForEmail(
      email.trim(),
      {
        // The email's link bounces through Supabase and lands on /auth/confirm
        // with a code; `next` is where that route sends the browser after.
        redirectTo: `${window.location.origin}/auth/confirm?next=/auth/update-password`,
      }
    );
    setIsBusy(false);

    // A rate-limit or network failure is worth showing; "no such user" is
    // not, and Supabase does not return it anyway. Either way the page must
    // not reveal which addresses have accounts.
    if (failure && !failure.message.toLowerCase().includes("user")) {
      setError(describeAuthError(failure));
      return;
    }
    setSent(true);
  };

  return (
    <AuthCard
      title="Reset your password"
      lead="We'll email you a link that lets you choose a new one."
      foot={
        <Link className="auth-link" href="/auth/login">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="auth-notice">
          If that address has an account, a reset link is on its way. It can
          take a minute to arrive.
        </p>
      ) : (
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

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-button" disabled={isBusy}>
            {isBusy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
};

export default ForgotPasswordForm;
