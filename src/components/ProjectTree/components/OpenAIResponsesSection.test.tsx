import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OpenAIResponsesSection } from "./OpenAIResponsesSection";
import { api } from "@/services/api";
import type { OpenAIResponseBundle } from "@/services/openaiResponses";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/utils/platform", () => ({
  isTauri: () => true,
  getApiBase: () => "http://localhost:3727",
  getAuthToken: () => null,
  getCsrfToken: () => null,
}));
vi.mock("@/services/api", () => ({ api: vi.fn() }));

afterEach(cleanup);

const fixture: OpenAIResponseBundle = {
  response: {
    id: "resp_fixture",
    model: "gpt-fixture",
    status: "completed",
    output: [
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "{\"ok\":true}" }] },
      { type: "function_call", name: "lookup", arguments: "{\"place\":\"Graz\"}" },
    ],
    usage: {
      input_tokens: 40,
      output_tokens: 12,
      total_tokens: 52,
      input_tokens_details: { cached_tokens: 10, cache_write_tokens: 2 },
      output_tokens_details: { reasoning_tokens: 3 },
    },
  },
  inputItems: [
    { type: "message", role: "developer", content: [{ type: "input_text", text: "Use tools when needed." }] },
    { type: "function_call_output", call_id: "call_fixture", output: "{\"ok\":true}" },
  ],
  inputItemsComplete: true,
};

describe("OpenAIResponsesSection", () => {
  it("loads a response on explicit submit, shows it as opened, and keeps the key out of the opened-session list", async () => {
    vi.mocked(api).mockResolvedValue(fixture as never);
    render(<OpenAIResponsesSection />);

    fireEvent.click(screen.getByRole("button", { name: "openaiResponses.action" }));
    fireEvent.change(screen.getByLabelText("openaiResponses.responseId"), { target: { value: "resp_fixture" } });
    fireEvent.change(screen.getByLabelText("openaiResponses.apiKey"), { target: { value: "sk-test-synthetic" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "openaiResponses.open" }));
    });

    await waitFor(() => expect(api).toHaveBeenCalledWith("load_openai_response", {
      responseId: "resp_fixture",
      apiKey: "sk-test-synthetic",
    }));
    expect((screen.getByLabelText("openaiResponses.apiKey") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: /resp_fixture/ })).toBeTruthy();
    expect(await screen.findByText("openaiResponses.inputItems (2)")).toBeTruthy();
    expect(screen.getByText("developer message")).toBeTruthy();
    expect(screen.getByText("Tool call: lookup")).toBeTruthy();
    expect(screen.queryByText("138")).toBeNull();
    expect(screen.getByText("52")).toBeTruthy();
  });
});
