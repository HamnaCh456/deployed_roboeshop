"use client";

import React, { Suspense } from "react";

import SignUpForm from "../../../components/auth/SignUpForm";

/** `/auth/sign-up`. The form reads `?next=`, hence the Suspense boundary. */
export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
