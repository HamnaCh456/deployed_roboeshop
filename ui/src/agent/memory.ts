/**
 * Per-user conversation history for the assistant.
 *
 * This is the only file that knows where history lives — the same isolation
 * as data/reviewStore.ts. Today it is an in-memory Map, which is right for
 * `next dev` and the demo and wrong for a stateless host such as Vercel; the
 * move to Supabase rewrites this file and nothing else.
 *
 * Two rules keep the model's context small:
 *   - Text only. Tool calls and tool results are never stored, so a ten-turn
 *     chat replays ~600 tokens of prose rather than thousands of tokens of
 *     stale search results.
 *   - Twelve messages (six exchanges). Older ones are dropped, not summarised.
 */

import type { ModelMessage } from "ai";

const MAX_MESSAGES = 12;

const store = new Map<string, ModelMessage[]>();

export function history(userId: string): ModelMessage[] {
  return [...(store.get(userId) ?? [])];
}

export function remember(userId: string, userText: string, assistantText: string): void {
  const next: ModelMessage[] = [
    ...history(userId),
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  ];
  store.set(userId, next.slice(-MAX_MESSAGES));
}

export function forget(userId: string): void {
  store.delete(userId);
}
