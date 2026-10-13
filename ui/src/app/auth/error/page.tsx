"use client";

import Link from "next/link";
import React from "react";

import AuthCard from "../../../components/auth/AuthCard";

/** `/auth/error` — the confirm route sends a bad or expired link here. */
export default function AuthErrorPage() {
  return (
    <AuthCard
      title="That link didn't work"
      lead="It has expired or was already used. Links are good for one visit."
    >
      <p className="auth-card__lead">
        <Link className="auth-link" href="/auth/forgot-password">
          Request a new reset link
        </Link>
        {" or "}
        <Link className="auth-link" href="/auth/login">
          go back to sign in
        </Link>
        .
      </p>
    </AuthCard>
  );
}
