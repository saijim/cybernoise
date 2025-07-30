import { expect, vi } from "vitest";

/**
 * Test utilities and helpers for the cybernoise project
 */

// Mock data generators
export const createMockPaper = (overrides: Partial<any> = {}) => ({
  id: "test-id",
  slug: "test-slug",
  title: "Test Paper Title",
  link: "https://example.com/paper",
  abstract: "This is a test abstract for the paper.",
  creator: "Test Author",
  ...overrides,
});

export const createMockRewrittenPaper = (overrides: Partial<any> = {}) => ({
  ...createMockPaper(),
  summary: "Test summary hook",
  intro: "Test clickbait intro",
  text: "Test article text content...",
  keywords: ["test", "paper", "research"],
  prompt: "Test image generation prompt",
  topic: "artificial-intelligence",
  ...overrides,
});

export const createMockFeed = (name: string, papers: any[] = []) => ({
  name,
  feed: papers.length > 0 ? papers : [createMockPaper()],
});

// Mock fetch utilities
export const mockFetchSuccess = (data: any) => {
  const mockResponse = {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue(data),
    arrayBuffer: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(data)).buffer),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
  return mockResponse;
};

export const mockFetchError = (status: number = 500, statusText: string = "Internal Server Error") => {
  const mockResponse = {
    ok: false,
    status,
    statusText,
    json: vi.fn().mockRejectedValue(new Error("Failed to parse JSON")),
    arrayBuffer: vi.fn().mockRejectedValue(new Error("Failed to get arrayBuffer")),
    text: vi.fn().mockResolvedValue(""),
  };
  return mockResponse;
};

// Environment helpers
export const mockEnvVar = (key: string, value: string) => {
  const originalValue = process.env[key];
  process.env[key] = value;
  return () => {
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  };
};

// File system helpers
export const createMockFileSystem = () => {
  const files = new Map<string, string>();

  return {
    files,
    readFileSync: vi.fn((path: string) => files.get(path) || "{}"),
    writeFileSync: vi.fn((path: string, data: string) => files.set(path, data)),
    existsSync: vi.fn((path: string) => files.has(path)),
    readdirSync: vi.fn((path: string) => Array.from(files.keys()).filter((key) => key.startsWith(path))),
    addFile: (path: string, content: string) => files.set(path, content),
    removeFile: (path: string) => files.delete(path),
    clear: () => files.clear(),
  };
};

// Buffer helpers
export const createMockImageBuffer = (size: number = 2000) => {
  return Buffer.from("x".repeat(size));
};

// Async test helpers
export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const expectEventually = async (
  assertion: () => void | Promise<void>,
  timeout: number = 1000,
  interval: number = 50
) => {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      await assertion();
      return;
    } catch (error) {
      await waitFor(interval);
    }
  }

  // Final attempt that will throw if it fails
  await assertion();
};

// Validation helpers
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const isValidSlug = (slug: string): boolean => {
  return /^[a-z0-9-]+$/.test(slug) && !slug.startsWith("-") && !slug.endsWith("-");
};

export const isValidJson = (str: string): boolean => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

// Mock providers
export const createMockImageProvider = (shouldSucceed: boolean = true) => ({
  generate: vi.fn().mockImplementation(async (prompt: string, paperId: string) => {
    if (shouldSucceed) {
      return createMockImageBuffer();
    }
    return null;
  }),
});

export const createMockLLMProvider = (response: any = {}) => ({
  chat: vi.fn().mockResolvedValue({
    message: {
      content: JSON.stringify(response),
    },
  }),
});

// Test data validation
export const validatePaperStructure = (paper: any) => {
  const requiredFields = ["id", "title", "abstract", "link", "creator"];
  const missingFields = requiredFields.filter((field) => !(field in paper));

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }

  return true;
};

export const validateRewrittenPaperStructure = (paper: any) => {
  validatePaperStructure(paper);

  const additionalFields = ["summary", "intro", "text", "keywords", "prompt", "slug", "topic"];
  const missingFields = additionalFields.filter((field) => !(field in paper));

  if (missingFields.length > 0) {
    throw new Error(`Missing required rewritten paper fields: ${missingFields.join(", ")}`);
  }

  if (!Array.isArray(paper.keywords)) {
    throw new Error("Keywords must be an array");
  }

  if (paper.keywords.length === 0 || paper.keywords.length > 5) {
    throw new Error("Keywords array must have 1-5 items");
  }

  return true;
};

// Common test patterns
export const testAsyncFunction = async (fn: () => Promise<any>, expectedResult?: any, shouldThrow?: boolean) => {
  if (shouldThrow) {
    await expect(fn()).rejects.toThrow();
  } else {
    const result = await fn();
    if (expectedResult !== undefined) {
      expect(result).toEqual(expectedResult);
    }
    return result;
  }
};

export const testErrorHandling = async (fn: () => Promise<any>, mockError: Error, expectedFallback?: any) => {
  const result = await fn();
  if (expectedFallback !== undefined) {
    expect(result).toEqual(expectedFallback);
  } else {
    expect(result).toBeNull();
  }
};
