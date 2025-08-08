import * as dotenv from "dotenv";
import pLimit from "p-limit";
import {
  checkPaperExists,
  getFullText,
  getRawPapers,
  pruneGeneratedArticles,
  storeRewrittenPaper,
} from "./storeArticlesInDB";

dotenv.config();

// LMStudio configuration (local-only provider)
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

const SYSTEM_MESSAGE = `For a futuristic cyberpunk magazine, write a sensationalized and simplified title, one-sentence summary, click-bait intro, and a 1000-word text based on the provided academic paper. You will receive either the full paper text (when available) or just the title and abstract. Use the most comprehensive information available to create engaging content. Layman-friendly, optimistic, and futuristic tone. Provide up to five keywords. Provide an image prompt for a generative image creator, using references to artists and styles matching the description. Use Wikipedia MCP, if possible, to look for relevant infos regarding the topic. IMPORTANT: Respond ONLY with valid JSON, no additional text. Respond with JSON: \n{\n  "title": "sensationalized title",\n  "summary": "one-sentence hook",\n  "intro": "click-bait intro",\n  "text": "1000-word futuristic article",\n  "keywords": ["up to 5 keywords"],\n  "prompt": "image generation prompt with artist references"\n}`;

const createUserMessage = (paper: Paper) => {
  if (paper.full_text) {
    return `{"title": ${JSON.stringify(paper.title)},\n"full_text": ${JSON.stringify(
      paper.full_text.substring(0, 40000)
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

  try {
    // Try to get full text for this paper
    const fullText = await getFullText(paper.id);

    const enhancedPaper = { ...paper, full_text: fullText };

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
