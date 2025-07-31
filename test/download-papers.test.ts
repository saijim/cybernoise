import { describe, expect, test } from "vitest";

// Import the functions we want to test
import { getPdfUrl } from "../utils/download-papers";

describe("PDF URL conversion", () => {
  test("converts arXiv abstract URL to PDF URL", () => {
    const abstractUrl = "https://arxiv.org/abs/2505.01441";
    const expected = "https://arxiv.org/pdf/2505.01441";
    const result = getPdfUrl(abstractUrl);
    expect(result).toBe(expected);
  });

  test("converts bioRxiv abstract URL to PDF URL", () => {
    const abstractUrl = "https://www.biorxiv.org/content/10.1101/2025.07.24.666528v1?rss=1";
    const expected = "https://www.biorxiv.org/content/10.1101/2025.07.24.666528v1.full.pdf";
    const result = getPdfUrl(abstractUrl);
    expect(result).toBe(expected);
  });

  test("throws error for unsupported URL format", () => {
    const unsupportedUrl = "https://example.com/paper/123";
    expect(() => getPdfUrl(unsupportedUrl)).toThrow("Unsupported URL format");
  });
});
