import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
  Container,
  Key,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SelectItem,
  SelectList,
  Text,
} from "@mariozechner/pi-tui";
import {
  buildSuggestionRequest,
  createSuggestionStore,
  filterSuggestions,
  NEXT_STEP_SYSTEM_PROMPT,
  type NextStepSuggestion,
  parseSuggestions,
} from "./suggestions.js";

const GENERATION_TIMEOUT_MS = 15_000;
const RECENT_MESSAGE_LIMIT = 8;
const MAX_CONVERSATION_CHARS = 12_000;

type Eligibility =
  | { ok: true; key: string; conversation: string }
  | { ok: false; reason: "no-model" | "no-conversation" | "assistant-incomplete" };

type SuggestionGetter = (
  ctx: ExtensionContext,
  eligibility: Extract<Eligibility, { ok: true }>,
  signal: AbortSignal | undefined,
) => Promise<NextStepSuggestion[]>;

export default function nextStepSuggestions(pi: ExtensionAPI): void {
  const suggestionStore = createSuggestionStore();

  async function getSuggestions(
    ctx: ExtensionContext,
    eligibility: Extract<Eligibility, { ok: true }>,
    signal: AbortSignal | undefined,
  ): Promise<NextStepSuggestion[]> {
    return suggestionStore.getOrGenerate(eligibility.key, signal, () =>
      generateSuggestions(ctx, eligibility.conversation, signal),
    );
  }

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.addAutocompleteProvider((current) => createAutocompleteProvider(current, ctx, getSuggestions));
  });

  pi.registerShortcut(Key.ctrlShift("n"), {
    description: "Show LLM-generated next-step suggestions",
    handler: async (ctx) => {
      if (!ctx.hasUI) return;
      await showSuggestionPicker(ctx, getSuggestions);
    },
  });
}

function createAutocompleteProvider(
  current: AutocompleteProvider,
  ctx: ExtensionContext,
  getSuggestions: SuggestionGetter,
): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const eligibility = getEligibility(ctx);
      if (!eligibility.ok || !isCursorAtEnd(lines, cursorLine, cursorCol)) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const editorText = lines.join("\n");
      const isEditorEmpty = editorText.trim().length === 0;
      const query = editorText.trim();

      if (!isEditorEmpty) {
        const existing = await current.getSuggestions(lines, cursorLine, cursorCol, options);
        if (existing?.items.length) return existing;
      }

      try {
        const suggestions = filterSuggestions(await getSuggestions(ctx, eligibility, options.signal), query);
        if (options.signal.aborted || suggestions.length === 0) {
          return current.getSuggestions(lines, cursorLine, cursorCol, options);
        }

        return {
          prefix: isEditorEmpty ? "" : lines[cursorLine]?.slice(0, cursorCol) ?? "",
          items: suggestions.map(suggestionToAutocompleteItem),
        };
      } catch {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

async function showSuggestionPicker(ctx: ExtensionContext, getSuggestions: SuggestionGetter): Promise<void> {
  const eligibility = getEligibility(ctx);
  if (!eligibility.ok) {
    ctx.ui.notify(reasonToMessage(eligibility.reason), eligibility.reason === "no-conversation" ? "info" : "warning");
    return;
  }

  let generationError: unknown;
  const suggestions = await ctx.ui.custom<NextStepSuggestion[] | null>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(tui, theme, `Generating next-step suggestions...`);
    loader.onAbort = () => done(null);

    getSuggestions(ctx, eligibility, loader.signal)
      .then(done)
      .catch((error: unknown) => {
        if (!loader.signal.aborted) generationError = error;
        done(null);
      });

    return loader;
  });

  if (suggestions === null) {
    if (generationError) {
      ctx.ui.notify(`Failed to generate next-step suggestions: ${formatError(generationError)}`, "error");
    } else {
      ctx.ui.notify("Cancelled", "info");
    }
    return;
  }

  if (suggestions.length === 0) {
    ctx.ui.notify("No next-step suggestions available", "info");
    return;
  }

  const selectedIndex = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((str: string) => theme.fg("accent", str)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Next Step Suggestions")), 1, 0));

    const items: SelectItem[] = suggestions.map((suggestion, index) => ({
      value: String(index),
      label: suggestion.title,
      description: suggestion.description ?? suggestion.prompt,
    }));

    const selectList = new SelectList(items, Math.min(items.length, 8), {
      selectedPrefix: (text: string) => theme.fg("accent", text),
      selectedText: (text: string) => theme.fg("accent", text),
      description: (text: string) => theme.fg("muted", text),
      scrollInfo: (text: string) => theme.fg("dim", text),
      noMatch: (text: string) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter insert • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((str: string) => theme.fg("accent", str)));

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });

  if (selectedIndex === null) return;

  const selected = suggestions[Number(selectedIndex)];
  if (!selected) return;
  ctx.ui.setEditorText(selected.prompt);
  ctx.ui.notify("Suggestion inserted. Edit and submit when ready.", "info");
}

function getEligibility(ctx: ExtensionContext): Eligibility {
  if (!ctx.model) return { ok: false, reason: "no-model" };

  const branch = ctx.sessionManager.getBranch();
  let latestAssistantIndex = -1;
  let latestAssistantEntry: SessionEntry | undefined;

  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (!hasRole(message) || message.role !== "assistant") continue;
    latestAssistantIndex = index;
    latestAssistantEntry = entry;
    break;
  }

  if (latestAssistantIndex < 0 || !latestAssistantEntry) {
    return { ok: false, reason: "no-conversation" };
  }

  const latestAssistantMessage = latestAssistantEntry.type === "message" ? latestAssistantEntry.message : undefined;
  if (!latestAssistantMessage || !hasStopReason(latestAssistantMessage) || latestAssistantMessage.stopReason !== "stop") {
    return { ok: false, reason: "assistant-incomplete" };
  }

  const hasPriorUserMessage = branch.slice(0, latestAssistantIndex).some((entry) => {
    if (entry.type !== "message") return false;
    const message = entry.message;
    return hasRole(message) && message.role === "user" && extractText(message.content).length > 0;
  });

  if (!hasPriorUserMessage) return { ok: false, reason: "no-conversation" };

  const conversation = serializeRecentConversation(branch, latestAssistantIndex);
  if (!conversation.trim()) return { ok: false, reason: "no-conversation" };

  return { ok: true, key: latestAssistantEntry.id, conversation };
}

async function generateSuggestions(
  ctx: ExtensionContext,
  conversation: string,
  signal: AbortSignal | undefined,
): Promise<NextStepSuggestion[]> {
  if (!ctx.model) return [];

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) {
    throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);
  }

  const timeout = createTimeoutSignal(signal, GENERATION_TIMEOUT_MS);
  try {
    const userMessage: UserMessage = {
      role: "user",
      content: [{ type: "text", text: buildSuggestionRequest(conversation) }],
      timestamp: Date.now(),
    };

    const response = await complete(
      ctx.model,
      { systemPrompt: NEXT_STEP_SYSTEM_PROMPT, messages: [userMessage] },
      { apiKey: auth.apiKey, headers: auth.headers, signal: timeout.signal },
    );

    if (response.stopReason === "aborted") {
      throw new Error("Suggestion generation aborted");
    }

    const text = response.content
      .filter((content): content is { type: "text"; text: string } => content.type === "text")
      .map((content) => content.text)
      .join("\n");

    return parseSuggestions(text);
  } finally {
    timeout.dispose();
  }
}

function serializeRecentConversation(branch: SessionEntry[], latestAssistantIndex: number): string {
  const messageEntries = branch
    .slice(0, latestAssistantIndex + 1)
    .filter((entry) => entry.type === "message")
    .filter((entry) => hasRole(entry.message) && (entry.message.role === "user" || entry.message.role === "assistant"))
    .slice(-RECENT_MESSAGE_LIMIT);

  const serialized = messageEntries
    .map((entry) => {
      if (entry.type !== "message" || !hasRole(entry.message)) return "";
      const role = entry.message.role === "user" ? "User" : "Assistant";
      const text = extractText(entry.message.content);
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  if (serialized.length <= MAX_CONVERSATION_CHARS) return serialized;
  return serialized.slice(serialized.length - MAX_CONVERSATION_CHARS);
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => {
      return typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part;
    })
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function suggestionToAutocompleteItem(suggestion: NextStepSuggestion): AutocompleteItem {
  return {
    value: suggestion.prompt,
    label: suggestion.title,
    description: suggestion.description ?? suggestion.prompt,
  };
}

function isCursorAtEnd(lines: string[], cursorLine: number, cursorCol: number): boolean {
  const lastLineIndex = Math.max(0, lines.length - 1);
  const currentLine = lines[cursorLine] ?? "";
  return cursorLine === lastLineIndex && cursorCol === currentLine.length;
}

function reasonToMessage(reason: Exclude<Eligibility, { ok: true }>["reason"]): string {
  switch (reason) {
    case "no-model":
      return "Select a model before generating next-step suggestions.";
    case "assistant-incomplete":
      return "Wait for the assistant response to finish before generating next-step suggestions.";
    case "no-conversation":
      return "Next-step suggestions are available after you send a prompt and receive a response.";
  }
}

function createTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, { once: true });

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abort);
    },
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasRole(message: unknown): message is { role: string; content: unknown } {
  return typeof message === "object" && message !== null && "role" in message && "content" in message;
}

function hasStopReason(message: unknown): message is { stopReason: string } {
  return typeof message === "object" && message !== null && "stopReason" in message;
}
