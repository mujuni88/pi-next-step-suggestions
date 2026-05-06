import { describe, expect, it } from "vitest";
import { filterSuggestions, normalizeSuggestions, parseSuggestions } from "../extensions/suggestions.js";

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
