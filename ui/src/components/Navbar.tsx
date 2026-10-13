/*
 * SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use client";

/**
 * Navigation bar component
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { config } from "../config/config";
import { useAuth } from "../context/AuthContext";
import Mark from "./Mark";

/** "MOTORS & ACTUATORS" -> "motors-and-actuators", which Catalog reverses. */
export const categorySlug = (category: string): string =>
  category.toLowerCase().replace(/&/g, "and").trim().replace(/\s+/g, "-");

/** "MOTORS & ACTUATORS" -> "Motors & actuators". Config keeps the taxonomy
 *  uppercase because the scraper does; the bar sets it in sentence case
 *  (DESIGN.md section 8) at 14px, where all-caps would read as shouting. */
const sentenceCase = (label: string): string =>
  label.charAt(0) + label.slice(1).toLowerCase();

/**
 * One 64px bar, Vercel-style: wordmark, then the category links, then the
 * editorial pages pushed to the far end. Separation from the page is a
 * hairline, not a grey strip. See
 * docs/superpowers/specs/2026-09-19-vercel-style-catalogue-preview-design.md.
 */
const Navbar: React.FC = () => {
  const { brand, categories } = config.ui;
  const pathname = usePathname();
  const { status, displayName, signOut } = useAuth();

  // Where sign-in should come back to. Never an auth page itself, or a
  // successful sign-in would land on the form it just left.
  const returnTo = pathname.startsWith("/auth/") ? "/" : pathname;

  // The category links used to be dead `#`s. They now filter the catalogue,
  // which is what the query string in /catalog/[category] carries.
  // `whitespace-nowrap` matters: the bar is a fixed height, so a label that
  // wraps to two lines breaks the bar rather than growing it.
  const linkClass = (isActive: boolean) =>
    "shrink-0 whitespace-nowrap text-[14px] font-normal no-underline " +
    (isActive ? "text-[#171717]" : "text-[#666666] hover:text-[#171717]");

  // react-router's NavLink did this for us; next/link has no active state.
  const isActive = (href: string) => pathname === href;

  return (
    <header className="nav-bar shrink-0 h-[64px] bg-[#fafafa] border-b border-[#ebebeb] px-4 lg:px-6 flex items-center gap-6 overflow-x-auto">
      {/* Home is the dashboard once signed in; the landing page otherwise. */}
      <Link
        href={status === "signed-in" ? "/dashboard" : "/"}
        className="shrink-0 flex items-center gap-2 mr-4 text-[14px] font-medium text-[#171717] no-underline"
      >
        {/* The Servo mark: the wordmark's glyph, and the one element allowed
            to be pure #000. */}
        <Mark width={20} className="text-[#000000]" />
        {brand}
      </Link>

      <nav className="flex items-center gap-6 min-w-0" aria-label="Categories">
        {categories.map((category) => {
          const href = `/catalog/${categorySlug(category)}`;
          return (
            <Link key={category} href={href} className={linkClass(isActive(href))}>
              {sentenceCase(category)}
            </Link>
          );
        })}
      </nav>

      {/* Pushed to the far end: tutorials and community reviews are a
          different kind of thing from a product category, and the gap says
          so. They sit together because both are the editorial layer the
          source sites do not carry. */}
      <nav className="ml-auto flex items-center gap-6" aria-label="Editorial">
        <Link href="/tutorials" className={linkClass(isActive("/tutorials"))}>
          Tutorials
        </Link>
        <Link href="/community" className={linkClass(isActive("/community"))}>
          Community
        </Link>
        {/* The assistant is the product's argument, so it gets the bar's one
            filled control: the Vercel pill, ink on paper, 9999px in the tight
            header context where a 6px rectangle would read as a form field. */}
        <Link
          href="/assistant"
          className="shrink-0 whitespace-nowrap rounded-full bg-[#171717] px-[14px] py-[6px] text-[14px] font-normal leading-none text-white no-underline hover:bg-black"
        >
          Ask {brand}
        </Link>
      </nav>

      {/* Who is signed in. Renders nothing while the session is still being
          read, so a signed-in visitor never sees "Sign in" flash for a frame.
          The sign-in link carries the current path so it comes back here. A
          hairline on the left separates the account from the editorial pages
          the way the bar's bottom rule separates it from the page. */}
      <div className="shrink-0 flex items-center gap-4 pl-6 border-l border-[#ebebeb] text-[14px] whitespace-nowrap">
        {status === "signed-in" && (
          <>
            {/* The name is the way to the account's own page. */}
            <Link
              href="/dashboard"
              className="text-[#171717] no-underline hover:underline"
            >
              {displayName || "Dashboard"}
            </Link>
            <button
              type="button"
              className="text-[#666666] hover:text-[#171717]"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </>
        )}
        {status === "signed-out" && (
          <Link
            href={`/auth/login?next=${encodeURIComponent(returnTo)}`}
            className={linkClass(pathname.startsWith("/auth/"))}
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
};

export default Navbar;
