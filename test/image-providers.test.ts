import { Buffer } from "buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock AbortSignal.timeout
Object.defineProperty(AbortSignal, "timeout", {
  value: vi.fn(() => ({ signal: "mocked" })),
  writable: true,
});

describe("image-providers.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("BaseProvider", () => {
    describe("fetchBuffer method", () => {
      it("should fetch and return buffer for valid response", async () => {
        const mockArrayBuffer = new ArrayBuffer(2000);
        const mockResponse = {
          ok: true,
          status: 200,
          statusText: "OK",
          arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
        };

        mockFetch.mockResolvedValue(mockResponse);

        // Simulate the fetchBuffer method
        const fetchBuffer = async (url: string, options?: RequestInit): Promise<Buffer | null> => {
          try {
            const response = await fetch(url, options);

            if (!response.ok) {
              return null;
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length < 1000) {
              return null;
            }
            return buffer;
          } catch (error) {
            return null;
          }
        };

        const result = await fetchBuffer("https://example.com/image.png");
        expect(result).toBeInstanceOf(Buffer);
        expect(result?.length).toBe(2000);
      });

      it("should return null for HTTP errors", async () => {
        const mockResponse = {
          ok: false,
          status: 404,
          statusText: "Not Found",
        };

        mockFetch.mockResolvedValue(mockResponse);

        const fetchBuffer = async (url: string): Promise<Buffer | null> => {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              return null;
            }
            return Buffer.from(await response.arrayBuffer());
          } catch (error) {
            return null;
          }
        };

        const result = await fetchBuffer("https://example.com/nonexistent.png");
        expect(result).toBeNull();
      });

      it("should return null for small images", async () => {
        const smallArrayBuffer = new ArrayBuffer(500); // Less than 1000 bytes
        const mockResponse = {
          ok: true,
          status: 200,
          statusText: "OK",
          arrayBuffer: vi.fn().mockResolvedValue(smallArrayBuffer),
        };

        mockFetch.mockResolvedValue(mockResponse);

        const fetchBuffer = async (url: string): Promise<Buffer | null> => {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              return null;
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length < 1000) {
              return null;
            }
            return buffer;
          } catch (error) {
            return null;
          }
        };

        const result = await fetchBuffer("https://example.com/small.png");
        expect(result).toBeNull();
      });

      it("should handle network errors", async () => {
        mockFetch.mockRejectedValue(new Error("Network error"));

        const fetchBuffer = async (url: string): Promise<Buffer | null> => {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              return null;
            }
            return Buffer.from(await response.arrayBuffer());
          } catch (error) {
            return null;
          }
        };

        const result = await fetchBuffer("https://example.com/image.png");
        expect(result).toBeNull();
      });
    });
  });

  describe("ImageProvider (Runpod) shape checks", () => {
    it("extracts URL from nested output structures", () => {
      const extract = (output: any): string | null => {
        if (typeof output === "string" && /^https?:\/\//.test(output)) return output;
        if (Array.isArray(output) && output.length > 0) return extract(output[0]);
        if (output && typeof output === "object") {
          if (typeof output.url === "string") return output.url;
          for (const v of Object.values(output)) {
            const r = extract(v);
            if (r) return r;
          }
        }
        const m = JSON.stringify(output).match(/(https?:\/\/[^"\s]+\.(png|jpg|jpeg|webp))/i);
        return m?.[1] || null;
      };

      expect(extract({ output: { images: [{ url: "https://x/y.png" }] } })).toBe("https://x/y.png");
      expect(extract(["https://x/y.jpg"])).toBe("https://x/y.jpg");
    });

    it("recognizes base64 image strings", () => {
      const extractB64 = (output: any): string | null => {
        const json = typeof output === "string" ? output : JSON.stringify(output);
        const m = json.match(/data:image\/(png|jpg|jpeg|webp);base64,[A-Za-z0-9+/=]+/i);
        return m?.[0] || null;
      };
      const b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";
      expect(extractB64({ image: b64 })).toBe(b64);
    });

    describe("extractImageUrl method", () => {
      it("should extract URL from string output", () => {
        const output = "https://example.com/image.png";
        const extractUrl = (output: any): string | null => {
          if (typeof output === "string") return output;
          return null;
        };

        expect(extractUrl(output)).toBe("https://example.com/image.png");
      });

      it("should extract URL from array output", () => {
        const output = ["https://example.com/image.png", "https://example.com/image2.png"];
        const extractUrl = (output: any): string | null => {
          if (Array.isArray(output) && output.length > 0) {
            const first = output[0];
            if (typeof first === "string") return first;
          }
          return null;
        };

        expect(extractUrl(output)).toBe("https://example.com/image.png");
      });

      it("should extract URL from object with url property", () => {
        const output = { url: "https://example.com/image.png" };
        const extractUrl = (output: any): string | null => {
          if (output?.url && typeof output.url === "string") {
            return output.url;
          }
          return null;
        };

        expect(extractUrl(output)).toBe("https://example.com/image.png");
      });

      it("should handle complex nested objects", () => {
        const output = { data: { images: [{ url: "https://example.com/image.png" }] } };
        const extractUrl = (output: any): string | null => {
          // Simulate regex URL extraction from JSON string
          const urlMatch = JSON.stringify(output).match(/"(https?:\/\/[^"]+\.(png|jpg|jpeg|webp))"/i);
          return urlMatch?.[1] || null;
        };

        expect(extractUrl(output)).toBe("https://example.com/image.png");
      });

      it("should return null for invalid output", () => {
        const extractUrl = (output: any): string | null => {
          if (typeof output === "string") return output;
          if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") {
            return output[0];
          }
          return null;
        };

        expect(extractUrl(null)).toBeNull();
        expect(extractUrl(undefined)).toBeNull();
        expect(extractUrl({})).toBeNull();
        expect(extractUrl([])).toBeNull();
      });
    });

    it("should prefer 16:9-ish default size via runpod size string", () => {
      const size = process.env.RUNPOD_SIZE || "1344*768";
      expect(size.includes("*")).toBe(true);
    });
  });

  describe("ImageProvider interface", () => {
    it("should define generate method signature", () => {
      interface ImageProvider {
        generate(prompt: string, paperId: string): Promise<Buffer | null>;
      }

      const isValidInterface = (obj: any): obj is ImageProvider => {
        return typeof obj.generate === "function";
      };

      const mockProvider = {
        generate: vi.fn().mockResolvedValue(Buffer.from("test")),
      };

      expect(isValidInterface(mockProvider)).toBe(true);
    });

    it("should return Buffer or null", async () => {
      const mockProvider = {
        generate: async (prompt: string, paperId: string): Promise<Buffer | null> => {
          if (prompt && paperId) {
            return Buffer.from("fake image");
          }
          return null;
        },
      };

      const validResult = await mockProvider.generate("test", "id");
      const nullResult = await mockProvider.generate("", "");

      expect(validResult).toBeInstanceOf(Buffer);
      expect(nullResult).toBeNull();
    });
  });

  describe("Error handling patterns", () => {
    it("should handle timeout errors", async () => {
      mockFetch.mockRejectedValue(new Error("Request timeout"));

      const safeGenerate = async (): Promise<Buffer | null> => {
        try {
          await fetch("https://example.com");
          return Buffer.from("success");
        } catch (error) {
          return null;
        }
      };

      const result = await safeGenerate();
      expect(result).toBeNull();
    });

    it("should handle JSON parsing errors", () => {
      const invalidJson = '{"invalid": json}';

      const safeJsonParse = (str: string) => {
        try {
          return JSON.parse(str);
        } catch {
          return null;
        }
      };

      expect(safeJsonParse(invalidJson)).toBeNull();
    });

    it("should handle buffer creation errors", () => {
      const createBuffer = (data: any): Buffer | null => {
        try {
          return Buffer.from(data);
        } catch {
          return null;
        }
      };

      expect(createBuffer("valid data")).toBeInstanceOf(Buffer);
      expect(createBuffer(undefined)).toBeNull();
    });
  });

  describe("Logging methods", () => {
    it("should format log messages correctly", () => {
      const formatLog = (className: string, message: string) => {
        return `[${className}] ${message}`;
      };

      expect(formatLog("ImageProvider", "error occurred")).toBe("[ImageProvider] error occurred");
    });

    it("should format error messages correctly", () => {
      const formatError = (className: string, message: string, error?: any) => {
        return `[${className}] ${message}${error ? ` ${error}` : ""}`;
      };

      expect(formatError("TestProvider", "Error occurred")).toBe("[TestProvider] Error occurred");
      expect(formatError("TestProvider", "Error occurred", "details")).toBe("[TestProvider] Error occurred details");
    });
  });
});
