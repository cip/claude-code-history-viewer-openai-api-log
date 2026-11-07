import { useMemo, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, MessageSquarePlus, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/services/api";
import {
  canOpenOpenAIResponsesInWebUI,
  formatOpenAIJson,
  getOpenAIItemLabel,
  getOpenAIOutputItems,
  getOpenAIResponseErrorKey,
  getOpenAIResponseUsage,
  openAIItemMatchesQuery,
  type OpenAIResponseBundle,
} from "@/services/openaiResponses";
import { useAppStore } from "@/store/useAppStore";
import { getApiBase, isTauri } from "@/utils/platform";

interface OpenedConversation {
  bundle: OpenAIResponseBundle;
  requestedId: string;
}

function textField(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" || typeof field === "number" ? String(field) : undefined;
}

export function OpenAIResponsesSection() {
  const { t } = useTranslation("session");
  const serverAllowsOpenAIResponses = useAppStore((state) => state.isOpenAIResponsesAvailable);
  const localRequestOnly = isTauri() || (
    typeof window !== "undefined" &&
    canOpenOpenAIResponsesInWebUI(window.location.hostname, getApiBase())
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [responseId, setResponseId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandAll, setExpandAll] = useState(false);
  const [opened, setOpened] = useState<OpenedConversation[]>([]);
  const [active, setActive] = useState<OpenedConversation | null>(null);

  const outputItems = useMemo(
    () => (active ? getOpenAIOutputItems(active.bundle.response) : []),
    [active],
  );
  const filteredInputItems = useMemo(
    () => active ? active.bundle.inputItems.filter((item) => openAIItemMatchesQuery(item, search)) : [],
    [active, search],
  );
  const filteredOutputItems = useMemo(
    () => outputItems.filter((item) => openAIItemMatchesQuery(item, search)),
    [outputItems, search],
  );

  if (!serverAllowsOpenAIResponses || !localRequestOnly) return null;

  const openNew = () => {
    setActive(null);
    setResponseId("");
    setApiKey("");
    setSearch("");
    setErrorKey(null);
    setDialogOpen(true);
  };

  const openStored = (conversation: OpenedConversation) => {
    setActive(conversation);
    setResponseId(conversation.requestedId);
    setSearch("");
    setErrorKey(null);
    setExpandAll(false);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorKey(null);
    const requestedId = responseId.trim();
    const key = apiKey;
    try {
      const bundle = await api<OpenAIResponseBundle>("load_openai_response", {
        responseId: requestedId,
        apiKey: key,
      });
      const conversation = { bundle, requestedId };
      setOpened((current) => [
        conversation,
        ...current.filter((item) => item.requestedId !== requestedId),
      ].slice(0, 5));
      setActive(conversation);
      setSearch("");
      setExpandAll(false);
    } catch (error) {
      setErrorKey(getOpenAIResponseErrorKey(error));
    } finally {
      setApiKey("");
      setLoading(false);
    }
  };

  const renderItems = (items: unknown[], section: string) => (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{section} ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("openaiResponses.noItems")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <details
              key={textField(item, "id") || textField(item, "call_id") || section + "-" + String(index)}
              open={expandAll || undefined}
              className="rounded-md border border-border bg-background/60 px-3 py-2"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {getOpenAIItemLabel(item, index)}
              </summary>
              <pre className="mt-2 max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-xs">
                {formatOpenAIJson(item)}
              </pre>
            </details>
          ))}
        </div>
      )}
    </section>
  );

  const response = active?.bundle.response;
  const responseIdValue = response ? textField(response, "id") || active?.requestedId : undefined;
  const model = response ? textField(response, "model") : undefined;
  const status = response ? textField(response, "status") : undefined;
  const previousResponseId = response ? textField(response, "previous_response_id") : undefined;
  const usage = response ? getOpenAIResponseUsage(response) : {};
  const usageRows: Array<[string, number | undefined]> = [
    [t("openaiResponses.inputTokens"), usage.inputTokens],
    [t("openaiResponses.outputTokens"), usage.outputTokens],
    [t("openaiResponses.totalTokens"), usage.totalTokens],
    [t("openaiResponses.cachedTokens"), usage.cachedTokens],
    [t("openaiResponses.cacheWriteTokens"), usage.cacheWriteTokens],
    [t("openaiResponses.reasoningTokens"), usage.reasoningTokens],
  ].filter((row): row is [string, number] => row[1] !== undefined);

  return (
    <div className="border-b border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={openNew} className="min-w-0 flex-1 justify-start">
          <MessageSquarePlus className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{t("openaiResponses.action")}</span>
        </Button>
      </div>

      {opened.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">{t("openaiResponses.opened")}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { setOpened([]); setActive(null); }}
              aria-label={t("openaiResponses.clear")}
              title={t("openaiResponses.clear")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {opened.map((conversation) => (
            <button
              type="button"
              key={conversation.requestedId}
              onClick={() => openStored(conversation)}
              className="block w-full truncate rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              title={conversation.requestedId}
            >
              {conversation.requestedId}
              {textField(conversation.bundle.response, "model")
                ? " · " + textField(conversation.bundle.response, "model")
                : ""}
            </button>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("openaiResponses.title")}</DialogTitle>
            <DialogDescription>{t("openaiResponses.description")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <label htmlFor="openai-response-id" className="text-sm font-medium">{t("openaiResponses.responseId")}</label>
              <input
                id="openai-response-id"
                value={responseId}
                onChange={(event) => setResponseId(event.target.value)}
                autoComplete="off"
                required
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="resp_…"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="openai-api-key" className="text-sm font-medium">{t("openaiResponses.apiKey")}</label>
              <input
                id="openai-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="new-password"
                required
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <Button type="submit" disabled={loading || !responseId.trim() || !apiKey} className="sm:min-w-32">
              {loading ? t("openaiResponses.loading") : t("openaiResponses.open")}
            </Button>
          </form>

          {errorKey && <p role="alert" className="text-sm text-destructive">{t(errorKey)}</p>}

          {active && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-all text-base font-semibold">{responseIdValue}</h2>
                  <p className="text-sm text-muted-foreground">
                    {[model, status].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setExpandAll(true)}>
                    <ChevronDown className="mr-1 h-4 w-4" />{t("openaiResponses.expandAll")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setExpandAll(false)}>
                    <ChevronUp className="mr-1 h-4 w-4" />{t("openaiResponses.collapseAll")}
                  </Button>
                </div>
              </div>

              {Object.values(usage).some((value) => value !== undefined) && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {usageRows.map(([label, value]) => (
                    <div key={label} className="rounded-md bg-muted/50 px-3 py-2">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="font-mono text-sm">{value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}

              {previousResponseId && (
                <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                  {t("openaiResponses.previousResponseNote")} ({previousResponseId})
                </p>
              )}
              {!active.bundle.inputItemsComplete && (
                <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
                  {t("openaiResponses.partialItemsNote")}
                </p>
              )}

              <label className="flex h-9 items-center gap-2 rounded-md border border-input px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">{t("openaiResponses.search")}</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("openaiResponses.search")}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>

              <div className="grid gap-5 lg:grid-cols-2">
                {renderItems(filteredInputItems, t("openaiResponses.inputItems"))}
                {renderItems(filteredOutputItems, t("openaiResponses.outputItems"))}
              </div>

              <details open={expandAll || undefined} className="rounded-md border border-border px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">{t("openaiResponses.responseInfo")}</summary>
                <pre className="mt-2 max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-xs">
                  {formatOpenAIJson(active.bundle.response)}
                </pre>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
