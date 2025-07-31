import * as dotenv from "dotenv";
import Groq from "groq-sdk";
import ollama from "ollama";
import pLimit from "p-limit";
import { checkPaperExists, getFullText, getRawPapers, storeRewrittenPaper } from "./storeArticlesInDB";

dotenv.config();

// Configure LLM provider (set to 'ollama', 'groq', or 'lmstudio')
const LLM_PROVIDER = process.env.LLM_PROVIDER || "ollama";
// Initialize Groq client if needed
const groq = LLM_PROVIDER === "groq" ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
// LMStudio configuration
const LMSTUDIO_URL = process.env.LMSTUDIO_URL || "http://127.0.0.1:1234";
const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL || "qwen/qwen3-30b-a3b-2507";

const limit = pLimit(1);
const PAPER_LIMIT = 15;

interface Paper {
  id: string;
  title?: string;
  name?: string;
  abstract: string;
  link: string;
  creator: string;
  topic?: string;
  full_text?: string;
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

const SYSTEM_MESSAGE = `For a futuristic cyberpunk magazine, write a sensationalized and simplified title, one-sentence summary, click-bait intro, and a 1000-word text based on the provided academic paper. You will receive either the full paper text (when available) or just the title and abstract. Use the most comprehensive information available to create engaging content. Layman-friendly, optimistic, and futuristic tone. Provide up to five keywords. Provide an image prompt for a generative image creator, using references to artists and styles matching the description. Use Wikipedia MCP, if possible, to look for relevant infos regarding the topic. Respond with JSON: \n{\n  "title": "sensationalized title",\n  "summary": "one-sentence hook",\n  "intro": "click-bait intro",\n  "text": "1000-word futuristic article",\n  "keywords": ["up to 5 keywords"],\n  "prompt": "image generation prompt with artist references"\n}`;

const createUserMessage = (paper: Paper) => {
  if (paper.full_text) {
    return `{"title": ${JSON.stringify(paper.title)},\n"full_text": ${JSON.stringify(
      paper.full_text.substring(0, 40000)
    )}}`;
  } else {
    return `{"title": ${JSON.stringify(paper.title)},\n"abstract": ${JSON.stringify(paper.abstract)}}`;
  }
};

const createMessages = (paper: Paper) => {
  const messages = [
    { role: "system", content: SYSTEM_MESSAGE },
    { role: "user", content: createUserMessage(paper) },
  ];

  if (LLM_PROVIDER === "lmstudio") {
    messages[0].content += "\n\nIMPORTANT: Respond ONLY with valid JSON, no additional text.";
  }

  return messages;
};

const callLLMProvider = async (messages: any[]) => {
  switch (LLM_PROVIDER) {
    case "ollama":
      return await ollama.chat({
        stream: false,
        format: "json",
        messages,
        model: "qwen/qwen3-30b-a3b-2507",
      });

    case "groq":
      const groqCompletion = await groq!.chat.completions.create({
        messages,
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
        response_format: { type: "json_object" },
      });
      return {
        message: {
          content: groqCompletion.choices[0]?.message?.content || "",
        },
      };

    case "lmstudio":
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

    default:
      throw new Error(`Unknown LLM provider: ${LLM_PROVIDER}`);
  }
};

const processPaperResponse = async (response: any, paper: Paper, topicSlug: string) => {
  try {
    const newPaper: any = JSON.parse(response.message.content);
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

  // Filter papers by topic based on the RSS feed source
  const topicPapers = rawPapers.filter((paper) => {
    // Since we don't have explicit topic assignment from RSS, we'll use URL patterns
    if (topicName === "Artificial Intelligence" && paper.link?.includes("cs.AI")) return true;
    if (topicName === "Plant Biology" && paper.link?.includes("biorxiv")) return true;
    if (topicName === "Economics" && paper.link?.includes("econ")) return true;
    return false;
  });

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
    // Check if paper already exists in database
    const exists = await checkPaperExists(paper.id);
    if (exists) {
      return false;
    }
  } catch {}

  try {
    // Try to get full text for this paper
    const fullText = await getFullText(paper.id);
    const enhancedPaper = { ...paper, full_text: fullText || undefined };

    const messages = createMessages(enhancedPaper);
    const response = await callLLMProvider(messages);
    console.log(response);

    const processed = await processPaperResponse(response, enhancedPaper, topicSlug);
    return processed || false;
  } catch (error) {
    console.error(`Failed to process paper ${paper.id}:`, error);
    return false;
  }
};

const main = async () => {
  console.log("### Rewriting papers...");

  const topics = ["Artificial Intelligence", "Plant Biology", "Economics"];
  await Promise.all(topics.map((topic) => fetchPapersByTopic(topic)));

  console.log("### Papers rewritten and stored in database");
};

await main();
