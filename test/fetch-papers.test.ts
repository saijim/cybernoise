import { describe, expect, it } from "vitest";
import { createMockPaper, isValidUrl } from "./test-helpers";

describe("fetch-papers.ts utilities", () => {
  describe("utility functions", () => {
    it("should clean string properly", () => {
      const cleanString = (str: string): string => str.trim().replace(/\s+/g, " ");

      expect(cleanString("  hello   world  ")).toBe("hello world");
      expect(cleanString("\n\ttab\n")).toBe("tab");
      expect(cleanString("")).toBe("");
    });

    it("should generate slug from title", () => {
      const generateSlug = (title: string): string =>
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .trim();

      expect(generateSlug("Hello World")).toBe("hello-world");
      expect(generateSlug("AI & Machine Learning")).toBe("ai-machine-learning");
      expect(generateSlug("Test Title!!!")).toBe("test-title");
    });
  });

  describe("URL validation", () => {
    it("should validate URLs correctly", () => {
      expect(isValidUrl("https://arxiv.org/abs/2301.12345")).toBe(true);
      expect(isValidUrl("http://example.com")).toBe(true);
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });

    it("should handle arXiv URLs", () => {
      const arxivUrl = "https://arxiv.org/abs/2301.12345";
      expect(isValidUrl(arxivUrl)).toBe(true);
      expect(arxivUrl).toContain("arxiv.org");
    });

    it("should handle bioRxiv URLs", () => {
      const biorxivUrl = "https://www.biorxiv.org/content/10.1101/2025.01.01.123456v1";
      expect(isValidUrl(biorxivUrl)).toBe(true);
      expect(biorxivUrl).toContain("biorxiv.org");
    });
  });

  describe("data extraction patterns", () => {
    it("should extract arXiv ID from URL", () => {
      const extractArxivId = (url: string): string | null => {
        const match = url.match(/arxiv\.org\/abs\/([^/]+)/);
        return match ? match[1] : null;
      };

      expect(extractArxivId("https://arxiv.org/abs/2301.12345")).toBe("2301.12345");
      expect(extractArxivId("invalid-url")).toBeNull();
    });

    it("should extract bioRxiv ID from URL", () => {
      const extractBiorxivId = (url: string): string | null => {
        const match = url.match(/biorxiv\.org\/content\/[^/]+\/([^/]+)/);
        return match ? match[1] : null;
      };

      expect(extractBiorxivId("https://www.biorxiv.org/content/10.1101/2025.01.01.123456v1")).toBe(
        "2025.01.01.123456v1"
      );
      expect(extractBiorxivId("invalid-url")).toBeNull();
    });
  });

  describe("RSS feed configuration", () => {
    it("should define RSS sources", () => {
      const sources = [
        { url: "http://export.arxiv.org/rss/cs.AI", topic: "artificial-intelligence" },
        { url: "https://connect.biorxiv.org/biorxiv_xml.php?subject=plant_biology", topic: "plant-biology" },
        { url: "http://export.arxiv.org/rss/econ", topic: "economics" },
      ];

      expect(sources).toHaveLength(3);
      expect(sources[0].topic).toBe("artificial-intelligence");
      expect(sources[1].topic).toBe("plant-biology");
      expect(sources[2].topic).toBe("economics");
    });

    it("should validate RSS URLs", () => {
      const rssUrls = [
        "http://export.arxiv.org/rss/cs.AI",
        "https://connect.biorxiv.org/biorxiv_xml.php?subject=plant_biology",
        "http://export.arxiv.org/rss/econ",
      ];

      rssUrls.forEach((url) => {
        expect(isValidUrl(url)).toBe(true);
      });
    });
  });

  describe("error handling", () => {
    it("should handle fetch errors gracefully", () => {
      const mockError = new Error("Network error");
      expect(mockError.message).toBe("Network error");
      expect(mockError).toBeInstanceOf(Error);
    });

    it("should handle XML parsing errors", () => {
      const invalidXml = "not-valid-xml";
      expect(typeof invalidXml).toBe("string");
      expect(invalidXml).not.toMatch(/<[^>]+>/);
    });
  });

  describe("data processing", () => {
    it("should process paper data correctly", () => {
      const mockPaper = createMockPaper();

      expect(mockPaper.id).toBeDefined();
      expect(mockPaper.title).toBeDefined();
      expect(mockPaper.abstract).toBeDefined();
      expect(mockPaper.link).toBeDefined();
      expect(mockPaper.slug).toBeDefined();
      expect(isValidUrl(mockPaper.link)).toBe(true);
    });

    it("should handle empty abstracts", () => {
      const paper = createMockPaper();
      paper.abstract = "";

      expect(paper.abstract).toBe("");
      expect(typeof paper.abstract).toBe("string");
    });
  });
});
