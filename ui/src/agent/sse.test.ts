import { describe, expect, it } from "vitest";
import { DONE, encodeEvent, fixedReply } from "./sse";

describe("encodeEvent", () => {
  it("emits one SSE data line with a blank line after it", () => {
    expect(encodeEvent({ type: "content", payload: "hi" })).toBe(
      'data: {"type":"content","payload":"hi"}\n\n'
    );
  });

  it("keeps newlines inside the payload escaped so the frame stays one line", () => {
    const frame = encodeEvent({ type: "content", payload: "a\nb" });
    expect(frame.split("\n")).toHaveLength(3); // data line, blank, trailing empty
  });
});

describe("DONE", () => {
  it("is the sentinel the Chatbox stops on", () => {
    expect(DONE).toBe("data: [DONE]\n\n");
  });
});

describe("fixedReply", () => {
  it("streams the text as one content event followed by [DONE]", async () => {
    const response = fixedReply("nope");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const body = await new Response(response.body).text();
    expect(body).toBe(
      'data: {"type":"content","payload":"nope"}\n\n' + "data: [DONE]\n\n"
    );
  });
});
