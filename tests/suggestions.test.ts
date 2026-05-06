import { describe, expect, it } from "vitest";
import {
  createSuggestionStore,
  filterSuggestions,
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
