import { Buffer } from "buffer";

type RunpodStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED" | string;

interface RunpodRunResponse {
  id?: string;
  status?: RunpodStatus;
  output?: any;
  [key: string]: any;
}

export class ImageProvider {
  constructor(private apiKey: string, private endpointBase: string) {}

  async generate(prompt: string, paperId: string): Promise<Buffer | null> {
    this.log(`Using Runpod API for image generation (${paperId})`);
    try {
      // Kick off a run. Some models may return the image URL directly in output; others require polling.
      const runUrl = this.ensureNoTrailingSlash(this.endpointBase) + "/run";
      const body = {
        input: {
          prompt,
          negative_prompt: "",
          size: process.env.RUNPOD_SIZE || "1472*1140", // 16:9 by default
          seed: -1,
          enable_safety_checker: true,
        },
      };

      this.log(`POST ${runUrl}`);
      const runRes = await fetch(runUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000) as any,
      });

      if (!runRes.ok) {
        this.logError(`Runpod /run HTTP ${runRes.status}: ${runRes.statusText}`);
        return null;
      }

      const runData = (await runRes.json()) as RunpodRunResponse;

      // If output already contains a URL or base64 image, try to resolve immediately
      const immediateBuffer = await this.tryResolveBufferFromOutput(runData.output);
      if (immediateBuffer) return immediateBuffer;

      // Otherwise, poll for status if we have an id
      if (runData.id) {
        const buffer = await this.pollForResult(runData.id);
        if (buffer) return buffer;
      }

      this.logError("Runpod did not return a usable output");
      return null;
    } catch (err) {
      this.logError("Unexpected error:", err);
      return null;
    }
  }

  private async pollForResult(id: string): Promise<Buffer | null> {
    const statusUrl = this.ensureNoTrailingSlash(this.endpointBase) + `/status/${id}`;
    const started = Date.now();
    const timeoutMs = 3 * 60_000; // 3 minutes
    const intervalMs = 2500;

    while (Date.now() - started < timeoutMs) {
      this.log(`Polling Runpod status for ${id}...`);
      const res = await fetch(statusUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(30000) as any,
      });

      if (!res.ok) {
        this.logError(`Runpod /status HTTP ${res.status}: ${res.statusText}`);
        return null;
      }

      const data = (await res.json()) as RunpodRunResponse;
      const status = (data.status || "").toUpperCase();
      if (status === "COMPLETED") {
        const buffer = await this.tryResolveBufferFromOutput(data.output);
        if (!buffer) this.logError("COMPLETED but output could not be parsed");
        return buffer;
      }
      if (status === "FAILED") {
        this.logError("Runpod job failed", data);
        return null;
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    this.logError("Runpod polling timed out");
    return null;
  }

  private async tryResolveBufferFromOutput(output: any): Promise<Buffer | null> {
    if (!output) return null;

    // 1) If there's a URL, download it
    const url = await this.extractImageUrl(output);
    if (url) {
      this.log(`Downloading image from URL: ${url}`);
      return await this.fetchBuffer(url, { headers: { Accept: "image/*" } });
    }

    // 2) If there's a base64 image string, decode it
    const b64 = this.extractBase64Image(output);
    if (b64) {
      try {
        const cleaned = b64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
        const buf = Buffer.from(cleaned, "base64");
        if (buf.length < 1000) return null;
        return buf;
      } catch (e) {
        this.logError("Failed to decode base64 image", e);
        return null;
      }
    }

    return null;
  }

  private async fetchBuffer(url: string, options?: RequestInit): Promise<Buffer | null> {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) as any });
      if (!response.ok) {
        this.logError(`[Fetch] HTTP ${response.status}: ${response.statusText}`);
        return null;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1000) {
        this.logError(`[Fetch] Suspiciously small image data (${buffer.length} bytes)`);
        return null;
      }
      return buffer;
    } catch (error) {
      this.logError("[Fetch] Network error:", error);
      return null;
    }
  }

  private log(message: string): void {
    console.log(`[ImageProvider] ${message}`);
  }

  private logError(message: string, error?: any): void {
    console.error(`[ImageProvider] ${message}`, error || "");
  }

  private ensureNoTrailingSlash(u: string): string {
    return u.endsWith("/") ? u.slice(0, -1) : u;
  }

  private async extractImageUrl(output: any): Promise<string | null> {
    if (typeof output === "string") {
      const maybeUrl = output.trim();
      if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;
    }

    // Common patterns: arrays of URLs, objects with url fields, nested outputs
    if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      const fromFirst = await this.extractImageUrl(first);
      if (fromFirst) return fromFirst;
    }

    if (output && typeof output === "object") {
      if (typeof (output as any).url === "string") return (output as any).url;
      // Recursively inspect object values (shallow)
      for (const val of Object.values(output)) {
        const nested = await this.extractImageUrl(val);
        if (nested) return nested;
      }
    }

    // Fallback: regex scan (search any image URL)
    const urlMatch = JSON.stringify(output).match(/(https?:\/\/[^"\s]+\.(png|jpg|jpeg|webp))/i);
    return urlMatch?.[1] || null;
  }

  private extractBase64Image(output: any): string | null {
    const json = typeof output === "string" ? output : JSON.stringify(output);
    const m = json.match(/data:image\/(png|jpg|jpeg|webp);base64,[A-Za-z0-9+/=]+/i);
    if (m && m[0]) return m[0];
    const m2 = json.match(/\b([A-Za-z0-9+/]{200,}={0,2})\b/); // raw base64 heuristic
    return m2?.[1] || null;
  }
}
