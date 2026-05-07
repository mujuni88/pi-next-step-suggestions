export type NextStepSuggestion = {
  title: string;
  prompt: string;
  description?: string;
};

export type ModelPreference = string;

export type NextStepSuggestionsConfig = {
  suggestionCount: number;
  modelPreference: ModelPreference[];
  timeoutMs: number;
  chips: {
    enabled: boolean;
    hint?: string;
  };
  autocomplete: {
    enabled: boolean;
  };
  picker: {
    enabled: boolean;
  };
  background: {
    enabled: boolean;
  };
  lifecycle: {
    clearOnSubmit: boolean;
  };
};

type RawSuggestion = Partial<NextStepSuggestion> & { text?: string; value?: string };

type RawConfig = Partial<NextStepSuggestionsConfig> & {
  chips?: Partial<NextStepSuggestionsConfig["chips"]>;
  autocomplete?: Partial<NextStepSuggestionsConfig["autocomplete"]>;
  picker?: Partial<NextStepSuggestionsConfig["picker"]>;
  background?: Partial<NextStepSuggestionsConfig["background"]>;
  lifecycle?: Partial<NextStepSuggestionsConfig["lifecycle"]>;
};

export const DEFAULT_MAX_SUGGESTIONS = 3;
export const MAX_CONFIGURED_SUGGESTIONS = 5;
export const MAX_SUGGESTION_LENGTH = 240;
export const MAX_TITLE_LENGTH = 28;
export const MAX_DESCRIPTION_LENGTH = 60;
export const DEFAULT_TIMEOUT_MS = 5_000;

export const DEFAULT_CONFIG: NextStepSuggestionsConfig = {
  suggestionCount: DEFAULT_MAX_SUGGESTIONS,
  modelPreference: ["current"],
  timeoutMs: DEFAULT_TIMEOUT_MS,
  chips: { enabled: true },
  autocomplete: { enabled: true },
  picker: { enabled: true },
  background: { enabled: true },
  lifecycle: { clearOnSubmit: true },
};

export const NEXT_STEP_SYSTEM_PROMPT = `You generate concise next-step options for a user in a Pi coding-agent conversation.

Rules:
- Suggest only possible next USER messages, never assistant actions.
- Do not suggest generic starter prompts.
- Base suggestions on the recent conversation.
- Include a natural continuation option when appropriate.
- Include alternatives only when they are meaningfully different.
- Keep each title to 2-4 words and under 28 characters.
- Keep descriptions under 8 words and under 60 characters.
- Return strict JSON with this shape: {"suggestions":[{"title":"short label","prompt":"message to insert","description":"brief reason"}]}.
- Return 3 concise suggestions unless the user config asks for fewer or more.`;

export function normalizeConfig(raw: unknown): NextStepSuggestionsConfig {
  if (!isRecord(raw)) return structuredCloneConfig(DEFAULT_CONFIG);
  const input = raw as RawConfig;
  const suggestionCount = normalizeSuggestionCount(input.suggestionCount);
  const modelPreference = normalizeModelPreference(input.modelPreference);

  return {
    suggestionCount,
    modelPreference,
    timeoutMs: normalizeTimeout(input.timeoutMs),
    chips: {
      enabled: typeof input.chips?.enabled === "boolean" ? input.chips.enabled : DEFAULT_CONFIG.chips.enabled,
      hint: typeof input.chips?.hint === "string" && input.chips.hint.trim() ? input.chips.hint.trim() : undefined,
    },
    autocomplete: {
      enabled:
        typeof input.autocomplete?.enabled === "boolean"
          ? input.autocomplete.enabled
          : DEFAULT_CONFIG.autocomplete.enabled,
    },
    picker: {
      enabled: typeof input.picker?.enabled === "boolean" ? input.picker.enabled : DEFAULT_CONFIG.picker.enabled,
    },
    background: {
      enabled:
        typeof input.background?.enabled === "boolean" ? input.background.enabled : DEFAULT_CONFIG.background.enabled,
    },
    lifecycle: {
      clearOnSubmit:
        typeof input.lifecycle?.clearOnSubmit === "boolean"
          ? input.lifecycle.clearOnSubmit
          : DEFAULT_CONFIG.lifecycle.clearOnSubmit,
    },
  };
}

export function buildChipHint(config: Pick<NextStepSuggestionsConfig, "suggestionCount" | "chips">): string {
  return config.chips.hint ?? "Alt+# insert • Ctrl+Shift+N more";
}

export function parseSuggestions(text: string): NextStepSuggestion[] {
  const jsonText = extractJson(text);
  if (jsonText) {
    const parsed = parseJsonSuggestions(jsonText);
    if (parsed.length > 0) return parsed;
    if (looksLikeJson(text)) return [];
  }
  if (looksLikeJson(text)) return [];
  return parseBulletSuggestions(text);
}

export function normalizeSuggestions(
  suggestions: Array<RawSuggestion | string>,
  options: { maxSuggestions?: number } = {},
): NextStepSuggestion[] {
  const maxSuggestions = options.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;
  const seen = new Set<string>();
  const normalized: NextStepSuggestion[] = [];

  for (const item of suggestions) {
    const raw = typeof item === "string" ? { prompt: item } : item;
    const prompt = cleanText(raw.prompt ?? raw.text ?? raw.value ?? "");
    if (!prompt) continue;

    const dedupeKey = prompt.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const title = cleanText(raw.title ?? prompt);
    const description = cleanText(raw.description ?? "") || undefined;
    normalized.push({
      title: truncate(title, MAX_TITLE_LENGTH),
      prompt: truncate(prompt, MAX_SUGGESTION_LENGTH),
      description: description ? truncate(description, MAX_DESCRIPTION_LENGTH) : undefined,
    });

    if (normalized.length >= maxSuggestions) break;
  }

  return normalized;
}

export function filterSuggestions(suggestions: NextStepSuggestion[], query: string): NextStepSuggestion[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return suggestions;
  return suggestions.filter((item) => {
    const haystack = `${item.title} ${item.prompt} ${item.description ?? ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function buildChipLabels(suggestions: NextStepSuggestion[], maxSuggestions = DEFAULT_MAX_SUGGESTIONS): string[] {
  return suggestions.slice(0, maxSuggestions).map((suggestion, index) => `${index + 1} ${suggestion.title}`);
}

export function buildSuggestionRequest(conversation: string): string {
  return `Generate next-step suggestions for this Pi conversation.\n\n${conversation}`;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /aborted|abort/i.test(error.message);
}

export function createSuggestionStore(): {
  getOrGenerate: (
    key: string,
    signal: AbortSignal | undefined,
    generate: () => Promise<NextStepSuggestion[]>,
  ) => Promise<NextStepSuggestion[]>;
  clear: () => void;
} {
  let cache: { key: string; suggestions: NextStepSuggestion[] } | undefined;

  return {
    async getOrGenerate(key, signal, generate): Promise<NextStepSuggestion[]> {
      if (cache?.key === key) return cache.suggestions;

      const suggestions = await generate();
      if (!signal?.aborted) {
        cache = { key, suggestions };
      }
      return suggestions;
    },
    clear() {
      cache = undefined;
    },
  };
}

function normalizeSuggestionCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return DEFAULT_CONFIG.suggestionCount;
  if (value < 1) return DEFAULT_CONFIG.suggestionCount;
  return Math.min(value, MAX_CONFIGURED_SUGGESTIONS);
}

function normalizeTimeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return DEFAULT_CONFIG.timeoutMs;
  if (value < 500) return DEFAULT_CONFIG.timeoutMs;
  return Math.min(value, 30_000);
}

function normalizeModelPreference(value: unknown): ModelPreference[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONFIG.modelPreference];
  const normalized = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return normalized.length > 0 ? normalized : [...DEFAULT_CONFIG.modelPreference];
}

function structuredCloneConfig(config: NextStepSuggestionsConfig): NextStepSuggestionsConfig {
  return {
    suggestionCount: config.suggestionCount,
    modelPreference: [...config.modelPreference],
    timeoutMs: config.timeoutMs,
    chips: { ...config.chips },
    autocomplete: { ...config.autocomplete },
    picker: { ...config.picker },
    background: { ...config.background },
    lifecycle: { ...config.lifecycle },
  };
}


function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[") || /^```json/i.test(trimmed);
}

function extractJson(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1);
  }

  return undefined;
}

function parseJsonSuggestions(text: string): NextStepSuggestion[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    const raw = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : [];
    return normalizeSuggestions(raw.filter(isRawSuggestion));
  } catch {
    return [];
  }
}

function parseBulletSuggestions(text: string): NextStepSuggestion[] {
  const raw = text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("```") && line !== "{");
  return normalizeSuggestions(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRawSuggestion(value: unknown): value is RawSuggestion | string {
  if (typeof value === "string") return true;
  if (!isRecord(value)) return false;
  return ["prompt", "title", "description", "text", "value"].some((key) => typeof value[key] === "string");
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
