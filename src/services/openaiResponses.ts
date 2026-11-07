export interface OpenAIResponseBundle {
  response: Record<string, unknown>;
  inputItems: unknown[];
  inputItemsComplete: boolean;
}

export interface OpenAIResponseUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readNumber = (value: unknown, key: string): number | undefined => {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
};

export function getOpenAIResponseUsage(response: Record<string, unknown>): OpenAIResponseUsage {
  const usage = response.usage;
  const inputDetails = isRecord(usage) ? usage.input_tokens_details : undefined;
  const outputDetails = isRecord(usage) ? usage.output_tokens_details : undefined;
  return {
    inputTokens: readNumber(usage, "input_tokens"),
    outputTokens: readNumber(usage, "output_tokens"),
    totalTokens: readNumber(usage, "total_tokens"),
    cachedTokens: readNumber(inputDetails, "cached_tokens"),
    cacheWriteTokens: readNumber(inputDetails, "cache_write_tokens"),
    reasoningTokens: readNumber(outputDetails, "reasoning_tokens"),
  };
}

export function getOpenAIOutputItems(response: Record<string, unknown>): unknown[] {
  return Array.isArray(response.output) ? response.output : [];
}

export function getOpenAIItemLabel(item: unknown, index: number): string {
  if (!isRecord(item)) return "Item " + String(index + 1);

  const type = typeof item.type === "string" ? item.type : "";
  const role = typeof item.role === "string" ? item.role : "";
  const name = typeof item.name === "string" ? item.name : "";
  const callId = typeof item.call_id === "string" ? item.call_id : "";

  if (type === "message") return role ? role + " message" : "message";
  if (type === "function_call") return "Tool call: " + (name || "function");
  if (type === "function_call_output") return "Tool result" + (callId ? ": " + callId : "");
  if (type && name) return type + ": " + name;
  return type || "Item " + String(index + 1);
}

export function openAIItemMatchesQuery(item: unknown, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  let serialized: string;
  try {
    serialized = JSON.stringify(item) ?? String(item);
  } catch {
    serialized = String(item);
  }
  return serialized.toLocaleLowerCase().includes(normalized);
}

export function formatOpenAIJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

const OPENAI_RESPONSE_ERROR_KEYS = {
  openai_response_invalid_id: "openaiResponses.invalidId",
  openai_api_key_required: "openaiResponses.invalidApiKey",
  openai_auth_failed: "openaiResponses.authFailed",
  openai_response_unavailable: "openaiResponses.notFound",
  openai_rate_limited: "openaiResponses.rateLimited",
  openai_service_unavailable: "openaiResponses.apiUnavailable",
  openai_network_error: "openaiResponses.networkError",
} as const;
type OpenAIResponseErrorKey = (typeof OPENAI_RESPONSE_ERROR_KEYS)[keyof typeof OPENAI_RESPONSE_ERROR_KEYS] | "openaiResponses.error";

export function getOpenAIResponseErrorKey(error: unknown): OpenAIResponseErrorKey {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return OPENAI_RESPONSE_ERROR_KEYS[message] ?? "openaiResponses.error";
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

/** WebUI may send an API key only to an authenticated loopback server. */
export function canOpenOpenAIResponsesInWebUI(
  pageHostname: string,
  apiBase: string,
  hasAuth: boolean,
): boolean {
  if (!hasAuth || !isLoopbackHost(pageHostname)) return false;
  try {
    const apiUrl = new URL(apiBase, "http://" + pageHostname);
    return isLoopbackHost(apiUrl.hostname);
  } catch {
    return false;
  }
}
