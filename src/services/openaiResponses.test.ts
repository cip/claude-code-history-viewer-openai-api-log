import { describe, expect, it } from "vitest";
import {
  canOpenOpenAIResponsesInWebUI,
  formatOpenAIJson,
  getOpenAIItemLabel,
  getOpenAIOutputItems,
  getOpenAIResponseErrorKey,
  getOpenAIResponseErrorDiagnostic,
  getOpenAIResponseUsage,
  openAIItemMatchesQuery,
} from "./openaiResponses";

describe("OpenAI Responses mapping", () => {
  it("keeps system, developer, user, and assistant item roles distinct", () => {
    expect(getOpenAIItemLabel({ type: "message", role: "system" }, 0)).toBe("system message");
    expect(getOpenAIItemLabel({ type: "message", role: "developer" }, 1)).toBe("developer message");
    expect(getOpenAIItemLabel({ type: "message", role: "user" }, 2)).toBe("user message");
    expect(getOpenAIItemLabel({ type: "message", role: "assistant" }, 3)).toBe("assistant message");
  });

  it("labels tool calls and results and preserves structured JSON", () => {
    const call = { type: "function_call", name: "lookup", arguments: "{\"place\":\"Graz\"}" };
    const result = { type: "function_call_output", call_id: "call_123", output: "{\"ok\":true}" };
    expect(getOpenAIItemLabel(call, 0)).toBe("Tool call: lookup");
    expect(getOpenAIItemLabel(result, 1)).toBe("Tool result: call_123");
    expect(formatOpenAIJson({ ok: true })).toBe("{\n  \"ok\": true\n}");
    expect(openAIItemMatchesQuery(call, "Graz")).toBe(true);
    expect(openAIItemMatchesQuery(result, "not-present")).toBe(false);
  });

  it("maps output items and exposes only usage values actually returned", () => {
    const response = {
      output: [{ type: "message", role: "assistant" }, { type: "function_call", name: "search" }],
      usage: {
        input_tokens: 120,
        output_tokens: 18,
        total_tokens: 138,
        input_tokens_details: { cached_tokens: 48, cache_write_tokens: 12 },
        output_tokens_details: { reasoning_tokens: 7 },
      },
    };
    expect(getOpenAIOutputItems(response)).toHaveLength(2);
    expect(getOpenAIResponseUsage(response)).toEqual({
      inputTokens: 120,
      outputTokens: 18,
      totalTokens: 138,
      cachedTokens: 48,
      cacheWriteTokens: 12,
      reasoningTokens: 7,
    });
    expect(getOpenAIResponseUsage({ usage: null })).toEqual({});
  });

  it("maps backend failure codes to localized UI messages", () => {
    expect(getOpenAIResponseErrorKey(new Error("openai_response_invalid_id"))).toBe("openaiResponses.invalidId");
    expect(getOpenAIResponseErrorKey(new Error("openai_auth_failed"))).toBe("openaiResponses.authFailed");
    expect(getOpenAIResponseErrorKey(new Error("openai_response_unavailable"))).toBe("openaiResponses.notFound");
    expect(getOpenAIResponseErrorKey(new Error("other"))).toBe("openaiResponses.error");
  });

  it("exposes only safe diagnostic codes and HTTP status values", () => {
    expect(getOpenAIResponseErrorDiagnostic(new Error("openai_input_items_http_400"))).toBe("openai_input_items_http_400");
    expect(getOpenAIResponseErrorDiagnostic(new Error("openai_input_items_error"))).toBe("openai_input_items_error");
    expect(getOpenAIResponseErrorDiagnostic(new Error("sk-private-secret"))).toBeUndefined();
    expect(getOpenAIResponseErrorDiagnostic(new Error("arbitrary API body"))).toBeUndefined();
  });
});



describe("OpenAI Responses WebUI safety gate", () => {
  it("allows only loopback page and API hosts", () => {
    expect(canOpenOpenAIResponsesInWebUI("localhost", "http://127.0.0.1:3727/api")).toBe(true);
    expect(canOpenOpenAIResponsesInWebUI("example.com", "http://127.0.0.1:3727/api")).toBe(false);
    expect(canOpenOpenAIResponsesInWebUI("localhost", "https://api.example.com")).toBe(false);
  });
});
