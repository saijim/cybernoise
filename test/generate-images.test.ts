import { describe, expect, it } from "vitest";

describe("generate-images configuration", () => {
  it("uses default runpod endpoint when unset", () => {
    const original = process.env.RUNPOD_ENDPOINT;
    delete process.env.RUNPOD_ENDPOINT;
    const endpoint = (process.env.RUNPOD_ENDPOINT || "https://api.runpod.ai/v2/qwen-image-t2i").replace(/\/$/, "");
    expect(endpoint).toBe("https://api.runpod.ai/v2/qwen-image-t2i");
    if (original) process.env.RUNPOD_ENDPOINT = original;
  });
});
