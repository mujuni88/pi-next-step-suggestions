import { describe, expect, it } from "vitest";
import {
  buildChipHint,
  buildChipLabels,
  createSuggestionStore,
  DEFAULT_CONFIG,
  filterSuggestions,
  isAbortError,
  normalizeConfig,
  normalizeSuggestions,
  parseSuggestions,
} from "../extensions/suggestions.js";

describe("parseSuggestions", () => {
  it("parses strict JSON suggestions", () => {
    const result = parseSuggestions(`{
      "suggestions": [
        {"title":"Continue", "prompt":"Continue with the implementation.", "description":"Proceed"},
        {"title":"Review", "prompt":"Review the plan first."}
      ]
    }`);

    expect(result).toEqual([
      { title: "Continue", prompt: "Continue with the implementation.", description: "Proceed" },
      { title: "Review", prompt: "Review the plan first.", description: undefined },
    ]);
  });

  it("falls back to bullet parsing", () => {
    const result = parseSuggestions(`- Continue with the implementation\n- Review edge cases\n3. Write tests`);

    expect(result.map((item) => item.prompt)).toEqual([
      "Continue with the implementation",
      "Review edge cases",
      "Write tests",
    ]);
  });

  it("extracts JSON from fenced code blocks", () => {
    const result = parseSuggestions("```json\n{\"suggestions\":[{\"prompt\":\"Write the tests first.\"}]}\n```");

    expect(result).toEqual([
      { title: "Write the tests first.", prompt: "Write the tests first.", description: undefined },
    ]);
  });
});

describe("normalizeConfig", () => {
  it("defaults public package config to 3 suggestions and current model only", () => {
    expect(DEFAULT_CONFIG.suggestionCount).toBe(3);
    expect(DEFAULT_CONFIG.modelPreference).toEqual(["current"]);
    expect(buildChipHint(DEFAULT_CONFIG)).toBe("Alt+1-3 insert • Ctrl+Shift+N more");
  });

  it("merges user config and clamps suggestion count", () => {
    const result = normalizeConfig({
      suggestionCount: 99,
      modelPreference: ["nflx-openai/gpt-5-nano", "current"],
      chips: { hint: "Alt+1-3" },
    });

    expect(result.suggestionCount).toBe(5);
    expect(result.modelPreference).toEqual(["nflx-openai/gpt-5-nano", "current"]);
    expect(buildChipHint(result)).toBe("Alt+1-3");
  });

  it("falls back to defaults for invalid config values", () => {
    const result = normalizeConfig({ suggestionCount: 0, modelPreference: [] });

    expect(result.suggestionCount).toBe(3);
    expect(result.modelPreference).toEqual(["current"]);
  });
});

describe("normalizeSuggestions", () => {
  it("deduplicates and trims suggestions", () => {
    const result = normalizeSuggestions([
      { prompt: " Continue with this. " },
      { prompt: "Continue with this." },
      { prompt: "" },
    ]);

    expect(result).toEqual([{ title: "Continue with this.", prompt: "Continue with this.", description: undefined }]);
  });

  it("limits suggestions", () => {
    const result = normalizeSuggestions(
      ["one", "two", "three"].map((prompt) => ({ prompt })),
      { maxSuggestions: 2 },
    );

    expect(result.map((item) => item.prompt)).toEqual(["one", "two"]);
  });

  it("keeps chip titles and descriptions succinct", () => {
    const result = normalizeSuggestions([
      {
        title: "Continue implementing the entire feature with every detail included",
        prompt: "Continue implementing the agreed chip UI.",
        description: "This is a very long explanation that should be shortened because picker descriptions need to stay compact.",
      },
    ]);

    expect(result[0]?.title.length).toBeLessThanOrEqual(28);
    expect(result[0]?.description?.length).toBeLessThanOrEqual(60);
  });
});

describe("filterSuggestions", () => {
  it("returns all suggestions for an empty query", () => {
    const suggestions = normalizeSuggestions([{ prompt: "Continue" }, { prompt: "Write tests" }]);

    expect(filterSuggestions(suggestions, "").map((item) => item.prompt)).toEqual(["Continue", "Write tests"]);
  });

  it("filters suggestions by query text", () => {
    const suggestions = normalizeSuggestions([{ prompt: "Continue implementation" }, { prompt: "Write tests" }]);

    expect(filterSuggestions(suggestions, "test").map((item) => item.prompt)).toEqual(["Write tests"]);
  });
});

describe("buildChipLabels", () => {
  it("formats numbered chip labels and keeps the compact hint", () => {
    const suggestions = normalizeSuggestions([
      { title: "Continue fix", prompt: "Continue fixing this." },
      { title: "Add tests", prompt: "Add tests." },
      { title: "Explain tradeoffs", prompt: "Explain tradeoffs." },
      { title: "Create PR", prompt: "Create a PR." },
    ]);

    expect(buildChipLabels(suggestions, 3)).toEqual(["1 Continue fix", "2 Add tests", "3 Explain tradeoffs"]);
    expect(buildChipHint(DEFAULT_CONFIG)).toBe("Alt+1-3 insert • Ctrl+Shift+N more");
  });
});

describe("isAbortError", () => {
  it("recognizes suggestion generation aborts", () => {
    expect(isAbortError(new Error("Suggestion generation aborted"))).toBe(true);
    expect(isAbortError(new DOMException("The operation was aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("provider failed"))).toBe(false);
  });
});

describe("createSuggestionStore", () => {
  it("does not cache a generation when the caller signal is aborted", async () => {
    const store = createSuggestionStore();
    const controller = new AbortController();
    controller.abort();
    let calls = 0;

    const abortedResult = await store.getOrGenerate("assistant-1", controller.signal, async () => {
      calls += 1;
      return [];
    });
    const retryResult = await store.getOrGenerate("assistant-1", undefined, async () => {
      calls += 1;
      return normalizeSuggestions([{ prompt: "Continue from here." }]);
    });

    expect(abortedResult).toEqual([]);
    expect(retryResult.map((item) => item.prompt)).toEqual(["Continue from here."]);
    expect(calls).toBe(2);
  });

  it("does not retain a rejected generation for later requests", async () => {
    const store = createSuggestionStore();
    let calls = 0;

    await expect(
      store.getOrGenerate("assistant-1", undefined, async () => {
        calls += 1;
        throw new Error("provider failed");
      }),
    ).rejects.toThrow("provider failed");

    const retryResult = await store.getOrGenerate("assistant-1", undefined, async () => {
      calls += 1;
      return normalizeSuggestions([{ prompt: "Try again." }]);
    });

    expect(retryResult.map((item) => item.prompt)).toEqual(["Try again."]);
    expect(calls).toBe(2);
  });
});
