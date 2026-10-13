// SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Type definitions for the Shopping Assistant UI
 */

export interface MessageData {
  role: MessageRole;
  content: string | ImageContent | ImageRowContent | RobotRowContent;
  productName: string;
}

export type MessageRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'image'
  | 'image_row'
  | 'product_row'
  | 'user_image'
  | 'bom_row';

/** A seller offering a robot, for price comparison across vendors. */
export interface RobotSeller {
  name: string;
  price: number;
  verified: boolean;
}

/**
 * A robot as shown on a result card. Mirrors the `products` payload from the
 * chain server; see mock-server/robots.json for the full catalogue record.
 */
export interface RobotCard {
  id: string;
  name: string;
  brand: string;
  category: string;
  image: string;
  price: number;
  priceLabel: string;
  offerCount: number;
  verified: boolean;
  ageMin?: number;
  ageMax?: number;
  skill: string;
  platforms: string[];
  languages: string[];
  os: string[];
  ros: string | null;
  dof?: number;
  tutorials: number;
  sellers: RobotSeller[];
}

export type RobotRowContent = RobotCard[];

export interface ImageContent {
  productUrl: string;
  productName: string;
}

export type ImageRowContent = ImageContent[];

export interface SafeHTMLProps {
  html: string;
}

export interface ChatMessageProps {
  role: MessageRole;
  content: string | ImageContent | ImageRowContent | RobotRowContent;
  productName: string;
}

export interface ApiRequest {
  user_id: number;
  query: string;
  guardrails: boolean;
  image: string;
  image_bool: boolean;
  context?: string;
  cart?: CartData;
  retrieved?: Record<string, string>;
}

export interface ApiResponse {
  response: string;
  images: Record<string, string>;
  timings: Record<string, number>;
}

export interface CartData {
  contents: CartItem[];
}

export interface CartItem {
  item: string;
  amount: number;
}

export interface StreamingChunk {
  type: 'content' | 'images' | 'error';
  payload: string | Record<string, string>;
  timestamp: number;
}

export interface UserSession {
  userId: number;
  isActive: boolean;
  createdAt: Date;
}

export interface FileUploadResult {
  file: File;
  base64: string;
  previewUrl: string;
}

export interface ErrorState {
  hasError: boolean;
  message: string;
  code?: string;
}

/* TUTORIALS
   =========
   Served by `GET /tutorials`, built by scraper/run_tutorials.py from archived
   RobotShop Community pages. These shapes mirror
   scraper/robotshop/tutorials/models.py field for field — that file is the
   authority, and there is no mapping layer between it and this.

   The split that matters: title, summary, author and dates are *someone
   else's* facts and are shown with attribution and a link back. Category,
   level, platforms and the parts list are ours, inferred by rules over the
   text and priced against the scraped catalogue. */

export type TutorialFormat = 'video' | 'guide' | 'wiring' | 'course';

export type TutorialLevel = 'Beginner' | 'Intermediate' | 'Advanced';

/** One line of a tutorial's bill of materials, matched from the catalogue. */
export interface TutorialPart {
  /** The catalogue product this resolved to, under its seller's own title. */
  name: string;
  qty: number;
  /**
   * Unit price in PKR, or null where the seller publishes no price (brochure
   * sites quote "Enquiry / POA"). Rendered as a dash, never as zero.
   */
  price: number | null;
  /** Groups the same product across sellers — see `match_key` in the scraper. */
  matchKey?: string | null;
  sourceSite?: string | null;
  /** The seller's product page, so a reader can actually go and buy it. */
  productUrl?: string | null;
}

export interface Tutorial {
  id: string;
  title: string;
  summary: string;
  /**
   * The archived thumbnail. Empty for the handful the Internet Archive never
   * captured; the card renders a labelled tile rather than a broken image.
   */
  image: string;
  /** Where that image lives on the publisher's site. Attribution only. */
  imageSourceUrl?: string | null;

  /* -- attribution. Not optional: this is someone else's writing. */
  sourceUrl: string;
  sourceName: string;
  author: string | null;
  publishedAt: string | null;
  updatedAt?: string | null;
  /** The snapshot the text was read from, so a claim can be traced. */
  archivedUrl?: string | null;
  series?: string | null;
  wordCount?: number | null;

  /* -- inferred by rules over the tutorial text. */
  format: TutorialFormat;
  level: TutorialLevel;
  /** Mirrors the navbar taxonomy. */
  category: string;
  platforms: string[];
  /** Video runtime. Null throughout — the archived pages carry no duration. */
  runtimeSec: number | null;
  steps: number;
  /** Editorially built and checked against real hardware. False while scraped. */
  verifiedBuild: boolean;
  parts: TutorialPart[];
}

/* BOM (Bill of Materials)
   ========================
   Produced by the generate_bom agent tool (agent/tools/generateBom.ts).
   Re-exported here so UI components can consume the SSE bom event without
   importing directly from the agent layer. */

export type { BomLine, BomResult } from "../agent/tools/generateBom";
