import * as dotenv from "dotenv";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import {
  checkPaperExists,
  getFullText,
  getRawPapers,
  listGeneratedArticleIds,
  pruneGeneratedArticles,
  storeRewrittenPaper,
} from "./storeArticlesInDB";

dotenv.config();

// LMStudio configuration (local-only provider)
const LMSTUDIO_URL = process.env.LMSTUDIO_URL || "http://127.0.0.1:1234";
const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL || "openai/gpt-oss-120b";

const limit = pLimit(1);
const PAPER_LIMIT = 15;
const IN_PROGRESS_PREFIX = "__IN_PROGRESS__:";

interface Paper {
  id: string;
  title?: string;
  name?: string;
  abstract: string;
  link: string;
  creator: string;
  topic?: string;
  full_text?: string | null;
}

interface RewrittenPaper extends Paper {
  title: string;
  summary: string;
  intro: string;
  text: string;
  keywords: string[] | string;
  prompt: string;
  slug: string;
  topic: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const SYSTEM_MESSAGE = `For a futuristic cyberpunk magazine, write a sensationalized and simplified title, one-sentence summary, click-bait intro, and a 1000-word text based on the provided academic paper. You will receive either the full paper text (when available) or just the title and abstract. Use the most comprehensive information available to create engaging content. 

IMPORTANT GUIDELINES:
- Write coherent, meaningful content - NO gibberish, placeholder text, or excessive dots/ellipses
- Each field must contain substantial, readable content
- The "text" field must be a full 1000-word article with proper sentences and paragraphs
- Use layman-friendly, optimistic, and futuristic tone
- Provide up to five relevant keywords
- Create a detailed image prompt for photorealistic image generation

CRITICAL: Respond ONLY with valid JSON, no additional text. Ensure all content is meaningful and substantial.

JSON format:
{
  "title": "sensationalized title (minimum 10 characters)",
  "summary": "one-sentence hook (minimum 20 characters)",
  "intro": "click-bait intro (minimum 50 characters)",
  "text": "1000-word futuristic article (minimum 200 words)",
  "keywords": ["up to 5 keywords"],
  "prompt": "detailed image generation prompt"
}`;

const createUserMessage = (paper: Paper) => {
  if (paper.full_text) {
    return `{"title": ${JSON.stringify(paper.title)},\n"full_text": ${JSON.stringify(
      paper.full_text.substring(0, 80000)
    )}}`;
  } else {
    return `{"title": ${JSON.stringify(paper.title)},\n"abstract": ${JSON.stringify(paper.abstract)}}`;
  }
};

const createMessages = (paper: Paper) => [
  { role: "system", content: SYSTEM_MESSAGE },
  { role: "user", content: createUserMessage(paper) },
];

const callLLMProvider = async (messages: any[]) => {
  // LMStudio-only implementation
  const requestBody = {
    model: LMSTUDIO_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 2000,
  };

  const apiResponse = await fetch(`${LMSTUDIO_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    throw new Error(`LMStudio API responded with status: ${apiResponse.status} - ${errorText}`);
  }

  const chatCompletion = await apiResponse.json();
  return {
    message: {
      content: chatCompletion.choices[0]?.message?.content || "",
    },
  };
};

// --- LLM-based verification helpers ---
const VERIFIER_SYSTEM_MESSAGE = `You are a strict content validator. Verify that a generated magazine article is coherent, non-gibberish, aligns with the provided paper (title + abstract or full text), and meets minimum length/quality. Identify placeholder artifacts (e.g., repeated '...', '—', '…', nonsense symbols), malformed markdown, or off-topic content.

Respond ONLY with compact JSON using this schema:
{
  "valid": boolean,            // true only if content is meaningful and aligned
  "score": number,             // 0.0–1.0 confidence the content is good
  "reasons": string[],         // short reasons for any issues or for acceptance
  "flags": {
    "gibberish": boolean,
    "off_topic": boolean,
    "too_short": boolean,
    "placeholder": boolean,   // uses '...', '…', filler blocks, etc.
    "json_malformed": boolean // set true only if the generated JSON looked malformed
  }
}`;

const VERIFICATION_MIN_SCORE = 0.6;

const truncate = (s: string | undefined | null, max = 20000) => (s ?? "").slice(0, max);

const createVerificationUserMessage = (paper: Paper, generated: any) => {
  const payload: any = {
    source: {
      title: paper.title ?? paper.name ?? "",
      abstract: paper.full_text ? undefined : truncate(paper.abstract, 8000),
      full_text: paper.full_text ? truncate(paper.full_text, 80000) : undefined,
    },
    generated: {
      title: truncate(generated?.title, 2000),
      summary: truncate(generated?.summary, 4000),
      intro: truncate(generated?.intro, 8000),
      text: truncate(generated?.text, 120000),
      keywords: generated?.keywords,
      prompt: truncate(generated?.prompt, 4000),
    },
  };
  return JSON.stringify(payload);
};

const createVerificationMessages = (paper: Paper, generated: any) => [
  { role: "system", content: VERIFIER_SYSTEM_MESSAGE },
  { role: "user", content: createVerificationUserMessage(paper, generated) },
];

const verifyGeneratedContentWithLLM = async (
  paper: Paper,
  generated: any
): Promise<{
  valid: boolean;
  score: number;
  reasons: string[];
  flags: {
    gibberish: boolean;
    off_topic: boolean;
    too_short: boolean;
    placeholder: boolean;
    json_malformed: boolean;
  };
} | null> => {
  try {
    const messages = createVerificationMessages(paper, generated);
    const response = await callLLMProvider(messages);
    const content = response?.message?.content ?? "";
    const verdict = JSON.parse(content);
    return verdict;
  } catch (e) {
    console.error("Verifier LLM failed or returned invalid JSON:", e);
    return null;
  }
};

const isGibberishContent = (content: string, minLength: number = 100): boolean => {
  // Check for very short content (different minimums for different fields)
  if (content.length < minLength) return true;

  // Check for excessive dots, ellipses, or repeated characters
  const excessiveDots = /\.{3,}/.test(content) || /…{3,}/.test(content);
  const excessiveSpaces = /\s{10,}/.test(content);
  const excessiveQuestionMarks = /\?{2,}/.test(content);
  const excessiveDashes = /-{5,}/.test(content);

  // Count ratio of meaningful characters vs. dots/ellipses/spaces
  const meaningfulChars = content.replace(/[.\s…?-]/g, "").length;
  const totalChars = content.length;
  const meaningfulRatio = meaningfulChars / totalChars;

  return excessiveDots || excessiveSpaces || excessiveQuestionMarks || excessiveDashes || meaningfulRatio < 0.5;
};

const validateGeneratedContent = (newPaper: any): boolean => {
  // Check required fields exist and have minimum content
  if (!newPaper.title || newPaper.title.length < 10) return false;
  if (!newPaper.summary || newPaper.summary.length < 20) return false;
  if (!newPaper.intro || newPaper.intro.length < 50) return false;
  if (!newPaper.text || newPaper.text.length < 200) return false;

  // Check for gibberish in key fields with appropriate length thresholds
  if (isGibberishContent(newPaper.title, 10)) return false; // Titles can be shorter
  if (isGibberishContent(newPaper.summary, 20)) return false; // Summaries can be shorter
  if (isGibberishContent(newPaper.intro, 50)) return false; // Intros need more content
  if (isGibberishContent(newPaper.text, 200)) return false; // Main text needs substantial content

  // Check that text field is substantial (should be ~1000 words)
  const wordCount = newPaper.text.split(/\s+/).filter((word: string) => word.length > 0).length;
  if (wordCount < 200) return false; // Much less than expected 1000 words

  return true;
};

const processPaperResponse = async (response: any, paper: Paper, topicSlug: string) => {
  try {
    // First, try to parse the JSON
    let newPaper: any;
    try {
      newPaper = JSON.parse(response.message.content);
    } catch (jsonError) {
      console.error(`Invalid JSON response for paper ${paper.id}:`, response.message.content.substring(0, 200));
      return null;
    }

    // Validate content quality before proceeding
    if (!validateGeneratedContent(newPaper)) {
      console.error(`Rejecting low-quality/gibberish response for paper ${paper.id}`);
      return null;
    }

    // Cross-check with LLM verifier for semantic sanity and alignment
    const verdict = await verifyGeneratedContentWithLLM(paper, newPaper);
    if (!verdict) {
      console.warn(`LLM verifier unavailable or failed for paper ${paper.id}; treating as invalid for safety`);
      return null;
    }
    if (!verdict.valid || verdict.score < VERIFICATION_MIN_SCORE) {
      console.warn(
        `Verifier rejected paper ${paper.id}: score=${verdict.score}, flags=${JSON.stringify(
          verdict.flags
        )}, reasons=${(verdict.reasons || []).join(" | ")}`
      );
      return null;
    }

    if (newPaper.title || newPaper.name || paper.title) {
      const data: RewrittenPaper = {
        ...paper,
        ...newPaper,
        title: newPaper.title || newPaper.name || paper.title || "",
        slug: slug(newPaper.title ?? newPaper.name ?? paper.title ?? ""),
        topic: topicSlug,
      };

      // Store in database instead of writing to file
      await storeRewrittenPaper(data);
      // After storing a rewritten paper, prune to keep only last 9 per topic
      await pruneGeneratedArticles(9);
      return data;
    }
  } catch (e) {
    console.error("Error processing paper response:", e);
  }
  return null;
};

const getTopicSlugByName = (topicName: string): string => {
  const topicMap: Record<string, string> = {
    "Artificial Intelligence": "artificial-intelligence",
    "Plant Biology": "plant-biology",
    Economics: "economics",
  };
  return topicMap[topicName] || slug(topicName);
};

const fetchPapersByTopic = async (topicName: string) => {
  const topicSlug = getTopicSlugByName(topicName);
  const rawPapers = await getRawPapers();

  // Filter papers by the stored topic field
  const topicPapers = rawPapers.filter((paper) => paper.topic === topicSlug);

  const newPapers = await Promise.all(
    topicPapers.slice(0, PAPER_LIMIT).map((paper) => limit(() => fetchPaper(paper, topicSlug)))
  );

  return {
    name: topicName,
    slug: topicSlug,
    papers: newPapers.filter((paper): paper is RewrittenPaper => !!paper),
  };
};

const fetchPaper = async (paper: Paper, topicSlug: string): Promise<RewrittenPaper | false> => {
  try {
    // Check if paper already has a summary in database
    const exists = await checkPaperExists(paper.id);
    if (exists) {
      console.log(`Skipping paper ${paper.id}: summary already exists`);
      return false;
    }
  } catch {}

  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try to get full text for this paper
      let fullText = await getFullText(paper.id);
      // If the downloader marked this as in-progress, treat as no full text
      if (typeof fullText === "string" && fullText.startsWith(IN_PROGRESS_PREFIX)) {
        fullText = null;
      }

      const enhancedPaper = { ...paper, full_text: fullText };

      const messages = createMessages(enhancedPaper);
      const response = await callLLMProvider(messages);
      console.log(`Attempt ${attempt} for paper ${paper.id}:`, response);

      const processed = await processPaperResponse(response, enhancedPaper, topicSlug);

      if (processed) {
        return processed;
      } else if (attempt < maxRetries) {
        console.log(`Attempt ${attempt} produced gibberish for paper ${paper.id}, retrying...`);
        // Add a small delay before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed for paper ${paper.id}:`, error);
      if (attempt === maxRetries) {
        return false;
      }
      // Add a small delay before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.error(`All attempts failed for paper ${paper.id}`);
  return false;
};

const main = async () => {
  console.log("### Rewriting papers...");

  const topics = ["Artificial Intelligence", "Plant Biology", "Economics"];
  await Promise.all(topics.map((topic) => fetchPapersByTopic(topic)));

  // After rewriting and pruning, remove orphaned images that have no matching article
  await cleanupOrphanImages();

  console.log("### Papers rewritten and stored in database");
};

await main();

async function cleanupOrphanImages() {
  try {
    const ids = new Set<string>(await listGeneratedArticleIds());
    const imagesDir = join(process.cwd(), "src", "images", "articles");
    const files = await readdir(imagesDir).catch(() => [] as string[]);
    const deletions: Promise<any>[] = [];
    for (const file of files) {
      if (!file.endsWith(".png")) continue;
      const base = file.slice(0, -4); // strip .png
      if (!ids.has(base)) {
        deletions.push(unlink(join(imagesDir, file)).catch(() => {}));
      }
    }
    if (deletions.length) {
      await Promise.all(deletions);
      console.log(`Removed ${deletions.length} orphan image(s).`);
    }
  } catch (e) {
    console.error("Error cleaning up orphan images:", e);
  }
}
