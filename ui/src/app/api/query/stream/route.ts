/**
 * POST /api/query/stream — the assistant.
 *
 * Same request body and the same SSE frames the mock server's regex assistant
 * used, so the Chatbox is unchanged. One streamText call with two tools and a
 * step cap of three (search → optional refinement → answer). Providers are
 * tried in LLM_PROVIDER order; a failure before the first token moves on, a
 * failure after it ends the turn with an apology. Text streams as `content`;
 * the cards from the last search follow as `products` and `filters`; then
 * `[DONE]`. Design: docs/superpowers/specs/2026-09-19-llm-assistant-design.md
 */

import { isStepCount, streamText, type ModelMessage } from "ai";
import { history, remember } from "../../../../agent/memory";
import { modelFor, parseProviderList, withFailover } from "../../../../agent/provider";
import { systemPrompt } from "../../../../agent/prompt";
import { DONE, FIXED_REPLIES, SSE_HEADERS, encodeEvent, fixedReply } from "../../../../agent/sse";
import { makeTools, type TurnState } from "../../../../agent/tools";
import { runLocalFallback } from "../../../../agent/localFallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STEPS = 3;

interface Body {
  user_id?: string | number;
  query?: string;
  guardrails?: boolean;
  image?: string;
  image_bool?: boolean;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Body;
  const userId = String(body.user_id ?? "anonymous");
  const query = String(body.query ?? "").trim();
  const guardrails = body.guardrails !== false;

  if (body.image_bool && body.image) return fixedReply(FIXED_REPLIES.image);
  if (!query) return fixedReply("Ask me about a part, a board or a budget and I'll search the catalogue.");

  const providers = parseProviderList(process.env.LLM_PROVIDER);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: string) => controller.enqueue(encoder.encode(frame));
      const startedAt = Date.now();
      const turn: TurnState = { lastSearch: null, lastBom: null };
      const messages: ModelMessage[] = [...history(userId), { role: "user", content: query }];
      let answer = "";
      let interrupted = false;

      const used = await withFailover(providers, async (name) => {
        answer = "";
        turn.lastSearch = null;
        const attemptStart = Date.now();

        const result = streamText({
          model: modelFor(name),
          instructions: systemPrompt(guardrails),
          messages,
          tools: makeTools(turn),
          stopWhen: isStepCount(MAX_STEPS),
        });

        try {
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              answer += part.text;
              send(encodeEvent({ type: "content", payload: part.text }));
            } else if (part.type === "error") {
              throw part.error;
            }
          }
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          console.warn(
            `[assistant] provider=${name} failed after ${answer.length} chars status=${status ?? "n/a"}: ${String(err)}`
          );
          if (answer.length === 0) return "failed-before-output";
          interrupted = true;
          send(encodeEvent({ type: "content", payload: FIXED_REPLIES.interrupted }));
          return "completed";
        }

        const [usage, steps] = await Promise.all([result.totalUsage, result.steps]);
        console.log(
          `[assistant] user=${userId} provider=${name} steps=${steps.length} ` +
            `in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"} ` +
            `ms=${Date.now() - attemptStart} total_ms=${Date.now() - startedAt} query=${JSON.stringify(query)}`
        );
        return "completed";
      });

      if (used === null) {
        // All LLM providers failed — run the local rule-based fallback so the
        // chat is never completely dead. Streams text + real product cards with
        // zero API calls.
        try {
          const CATALOG_API_URL = process.env.CATALOG_API_URL || "http://127.0.0.1:8009";
          const { text, cards, applied } = await runLocalFallback(query, {
            fetch,
            baseUrl: CATALOG_API_URL,
          });
          // Stream text word-by-word for a natural feel
          const words = text.split(" ");
          for (const word of words) {
            send(encodeEvent({ type: "content", payload: word + " " }));
            answer += word + " ";
          }
          if (cards.length > 0) {
            send(encodeEvent({ type: "products", payload: cards }));
            send(encodeEvent({ type: "filters", payload: applied as Record<string, unknown> }));
          }
          remember(userId, query, answer.trim());
        } catch {
          send(encodeEvent({ type: "content", payload: FIXED_REPLIES.unavailable }));
        }
      } else {
        if (turn.lastSearch && turn.lastSearch.cards.length > 0) {
          send(encodeEvent({ type: "products", payload: turn.lastSearch.cards }));
          send(encodeEvent({ type: "filters", payload: turn.lastSearch.applied }));
        }
        if (turn.lastBom) {
          send(encodeEvent({ type: "bom", payload: turn.lastBom }));
        }
        if (answer && !interrupted) remember(userId, query, answer);
      }

      send(DONE);
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
