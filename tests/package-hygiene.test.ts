import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;

describe("package hygiene", () => {
  it("does not reference the pre-rename legacy config filename", () => {
    const files = [
      "README.md",
      "extensions/next-step-suggestions.ts",
      "extensions/suggestions.ts",
    ];

    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, file).not.toContain("next-step-suggestions.json");
    }
  });
});
