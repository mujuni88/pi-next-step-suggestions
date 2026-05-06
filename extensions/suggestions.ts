export type NextStepSuggestion = {
  title: string;
  prompt: string;
  description?: string;
};

type RawSuggestion = Partial<NextStepSuggestion> & { text?: string; value?: string };

export const DEFAULT_MAX_SUGGESTIONS = 5;
export const MAX_SUGGESTION_LENGTH = 240;

export const NEXT_STEP_SYSTEM_PROMPT = `You generate concise next-step options for a user in a Pi coding-agent conversation.

Rules:
- Suggest only possible next USER messages, never assistant actions.
- Do not suggest generic starter prompts.
- Base suggestions on the recent conversation.
- Include a natural continuation option when appropriate.
- Include alternatives only when they are meaningfully different.
- Return strict JSON with this shape: {"suggestions":[{"title":"short label","prompt":"message to insert","description":"brief reason"}]}.
- Return 3 to 5 suggestions.`;

export function parseSuggestions(text: string): NextStepSuggestion[] {
  const jsonText = extractJson(text);
  if (jsonText) {
    const parsed = parseJsonSuggestions(jsonText);
    if (parsed.length > 0) return parsed;
  }
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
      title: truncate(title, 80),
      prompt: truncate(prompt, MAX_SUGGESTION_LENGTH),
      description: description ? truncate(description, 120) : undefined,
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

export function buildSuggestionRequest(conversation: string): string {
  return `Generate next-step suggestions for this Pi conversation.\n\n${conversation}`;
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
