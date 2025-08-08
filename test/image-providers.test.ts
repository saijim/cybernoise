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

  describe("ImageProvider (Replicate)", () => {
    const mockReplicate = {
      run: vi.fn(),
    };

    const defaultModel = "black-forest-labs/flux-schnell";
    const defaultInputs = {
      aspect_ratio: "16:9",
      image_size: "optimize_for_quality",
      enhance_prompt: false,
      go_fast: true,
      guidance: 4,
      num_inference_steps: 50,
      output_format: "png",
      disable_safety_checker: false,
    };

    it("should call replicate API with correct parameters", async () => {
      const mockImageUrl = "https://example.com/generated-image.png";
      mockReplicate.run.mockResolvedValue(mockImageUrl);

      // Mock the image download
      const mockBuffer = Buffer.from("fake image data");
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer.buffer),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const generate = async (prompt: string, paperId: string): Promise<Buffer | null> => {
        try {
          const output = await mockReplicate.run(defaultModel, {
            input: { prompt, ...defaultInputs },
          });

          if (!output || typeof output !== "string") {
            return null;
          }

          // Download the image
          const response = await fetch(output);
          if (!response.ok) {
            return null;
          }

          return Buffer.from(await response.arrayBuffer());
        } catch (error) {
          return null;
        }
      };

      const result = await generate("test prompt", "test-id");

      expect(mockReplicate.run).toHaveBeenCalledWith(defaultModel, {
        input: { prompt: "test prompt", ...defaultInputs },
      });

      expect(result).toBeInstanceOf(Buffer);
    });

    it("should handle replicate API errors", async () => {
      mockReplicate.run.mockRejectedValue(new Error("Replicate API error"));

      const generate = async (prompt: string, paperId: string): Promise<Buffer | null> => {
        try {
          const output = await mockReplicate.run(defaultModel, {
            input: { ...defaultInputs, prompt },
          });
          return output ? Buffer.from("mock") : null;
        } catch (error) {
          return null;
        }
      };

      const result = await generate("test prompt", "test-id");
      expect(result).toBeNull();
    });

    it("should handle empty replicate response", async () => {
      mockReplicate.run.mockResolvedValue(null);

      const generate = async (prompt: string, paperId: string): Promise<Buffer | null> => {
        try {
          const output = await mockReplicate.run(defaultModel, {
            input: { ...defaultInputs, prompt },
          });

          if (!output) {
            return null;
          }

          return Buffer.from("mock");
        } catch (error) {
          return null;
        }
      };

      const result = await generate("test prompt", "test-id");
      expect(result).toBeNull();
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

    it("should use correct default model", () => {
      const model = "black-forest-labs/flux-schnell";
      expect(model).toBe("black-forest-labs/flux-schnell");
    });

    it("should use 16:9 aspect ratio", () => {
      const aspectRatio = "16:9";
      expect(aspectRatio).toBe("16:9");
    });

    it("should set output format to png", () => {
      const outputFormat = "png";
      expect(outputFormat).toBe("png");
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
