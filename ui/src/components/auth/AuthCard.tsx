"use client";

/**
 * The shell every auth page renders into: a title, one line of lead, the
 * form, and a footer that holds the one link out (sign up ↔ sign in).
 */

import React from "react";

import "../../auth.css";

interface AuthCardProps {
  title: string;
  lead: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}

const AuthCard: React.FC<AuthCardProps> = ({ title, lead, children, foot }) => (
  <main className="auth">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-card__head">
        <h1 className="auth-card__title" id="auth-title">
          {title}
        </h1>
        <p className="auth-card__lead">{lead}</p>
      </div>
      {children}
      {foot && <p className="auth-foot">{foot}</p>}
    </section>
  </main>
);

export default AuthCard;
