import { describe, expect, it } from "vitest";

describe("generate-images configuration", () => {
  it("uses default replicate model when unset", () => {
    const original = process.env.REPLICATE_MODEL;
    delete process.env.REPLICATE_MODEL;
    const model = process.env.REPLICATE_MODEL || "black-forest-labs/flux-schnell";
    expect(model).toBe("black-forest-labs/flux-schnell");
    if (original) process.env.REPLICATE_MODEL = original;
  });
});
