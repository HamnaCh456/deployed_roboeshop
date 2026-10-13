"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useRef, useState } from "react";

import { createClient } from "../../lib/supabase/client";
import AuthCard from "./AuthCard";
import { describeAuthError } from "./errors";
import { AFTER_SIGN_IN, safeNext } from "./nextPath";
import PasswordInput from "./PasswordInput";

/* A new account lands on the dashboard, whatever page the sign-up link was
   on: its new-account view is the start list (catalogue, tutorials, first
   review). `?next=` is still carried to the sign-in link. */
const AFTER_SIGN_UP = AFTER_SIGN_IN;

/* Mirrors the check constraint on profiles.display_name and the project's
   password_min_length, so the server never rejects what the form accepted. */
const NAME_MIN = 2;
const NAME_MAX = 40;
const PASSWORD_MIN = 8;

interface Errors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

const SignUpForm: React.FC = () => {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/community");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // The password fields are uncontrolled (see PasswordInput) and read here.
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Only reached if email confirmation is turned back on in the project.
  const [awaitingEmail, setAwaitingEmail] = useState(false);

  const validate = (password: string, confirm: string): Errors => {
    const found: Errors = {};
    const trimmedName = name.trim();
    if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) {
      found.name = `Pick a name between ${NAME_MIN} and ${NAME_MAX} characters. It signs your reviews.`;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      found.email = "Enter an email address you can receive mail at.";
    }
    if (password.length < PASSWORD_MIN) {
      found.password = `Use at least ${PASSWORD_MIN} characters.`;
    }
    if (confirm !== password) {
      found.confirm = "The two passwords don't match. Type them again.";
    }
    return found;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const password = passwordRef.current?.value ?? "";
    const confirm = confirmRef.current?.value ?? "";
    const found = validate(password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsBusy(true);
    setFailure(null);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      // Copied into profiles.display_name by the handle_new_user trigger.
      options: { data: { display_name: name.trim() } },
    });
    setIsBusy(false);

    if (error) {
      setFailure(describeAuthError(error));
      return;
    }
    if (!data.session) {
      setAwaitingEmail(true);
      return;
    }
    router.push(AFTER_SIGN_UP);
    router.refresh();
  };

  const field = (key: keyof Errors) =>
    "auth-input" + (errors[key] ? " auth-input--invalid" : "");

  return (
    <AuthCard
      title="Create an account"
      lead="One name, used on everything you write here."
      foot={
        <>
          Already have one?{" "}
          <Link
            className="auth-link"
            href={`/auth/login?next=${encodeURIComponent(next)}`}
          >
            Sign in
          </Link>
        </>
      }
    >
      {awaitingEmail ? (
        <p className="auth-notice">
          Check your inbox: there is a confirmation link waiting. Once you have
          followed it, sign in.
        </p>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-name">
              Display name
            </label>
            <input
              id="auth-name"
              className={field("name")}
              type="text"
              autoComplete="nickname"
              maxLength={NAME_MAX}
              value={name}
              aria-invalid={Boolean(errors.name) || undefined}
              onChange={(event) => setName(event.target.value)}
              placeholder="A name or a handle"
            />
            {errors.name && <p className="auth-error">{errors.name}</p>}
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className={field("email")}
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={Boolean(errors.email) || undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {errors.email && <p className="auth-error">{errors.email}</p>}
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <PasswordInput
              id="auth-password"
              inputRef={passwordRef}
              autoComplete="new-password"
              invalid={Boolean(errors.password)}
            />
            {errors.password && (
              <p className="auth-error">{errors.password}</p>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-confirm">
              Password again
            </label>
            <PasswordInput
              id="auth-confirm"
              inputRef={confirmRef}
              autoComplete="new-password"
              invalid={Boolean(errors.confirm)}
            />
            {errors.confirm && <p className="auth-error">{errors.confirm}</p>}
          </div>

          {failure && (
            <p className="auth-error" role="alert">
              {failure}
            </p>
          )}

          <button type="submit" className="auth-button" disabled={isBusy}>
            {isBusy ? "Creating…" : "Create account"}
          </button>
        </form>
      )}
    </AuthCard>
  );
};

export default SignUpForm;
