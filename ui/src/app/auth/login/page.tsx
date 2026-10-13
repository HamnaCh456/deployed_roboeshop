"use client";

import React, { Suspense } from "react";

import LoginForm from "../../../components/auth/LoginForm";

/** `/auth/login`. The form reads `?next=`, hence the Suspense boundary. */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
