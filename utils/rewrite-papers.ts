import * as dotenv from "dotenv";
import { accessSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { groupBy } from "lodash";
import ollama from "ollama";
import pLimit from "p-limit";
import path from "path";

dotenv.config();

const limit = pLimit(1);
const PAPER_LIMIT = 1;
const papersPath = "./src/data/papers/";
const topics: Topic[] = JSON.parse(readFileSync("./src/data/source-papers.json", "utf8"));

interface Topic {
  name: string;
  feed: Paper[];
}
interface Paper {
  id: string;
  title?: string;
  name?: string;
  abstract: string;
  link: string;
  creator: string;
}
interface RewrittenPaper extends Paper {
  summary: string;
  intro: string;
  text: string;
  keywords: string[];
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

const fetchPapers = async (topic: Topic) => {
  const newPapers = await Promise.all(
    topic.feed.slice(0, PAPER_LIMIT).map((paper) => limit(() => fetchPaper(paper, slug(topic.name))))
  );

  return {
    name: topic.name,
    slug: slug(topic.name),
    papers: newPapers.filter((paper): paper is RewrittenPaper => !!paper),
  };
};

const fetchPaper = async (paper: Paper, topicSlug: string): Promise<RewrittenPaper | false> => {
  try {
    accessSync(`${papersPath}${paper.id}.json`);
    return false;
  } catch {}

  const systemMessage = `For a futuristic cyberpunk magazine, write a sensationalized and simplified title, one-sentence summary, click-bait intro, and a 1000-word text based on the title and abstract.  Layman-friendly, optimistic, and futuristic tone. Provide up to five keywords and an image prompt for Stable Diffusion/SDXL. Respond with JSON: \n{\n  "title": \${title},\n  "summary": \${summary},\n  "intro": \${intro},\n  "text": \${text},\n  "keywords": \${keywords},\n  "prompt": \${prompt}\n}`;

  const response = await ollama.chat({
    stream: false,
    format: "json",
    messages: [
      { role: "system", content: systemMessage },
      {
        role: "user",
        content: `{"title": ${JSON.stringify(paper.title)},\n"abstract": ${JSON.stringify(paper.abstract)}}`,
      },
    ],
    model: "qwen2.5:72b-instruct-q8_0",
  });

  console.log(response);

  if (response) {
    try {
      const newPaper: RewrittenPaper = JSON.parse(response.message.content);
      if (newPaper.title || newPaper.name) {
        const data: RewrittenPaper = {
          ...newPaper,
          ...paper,
          slug: slug(newPaper.title ?? newPaper.name ?? ""),
          topic: topicSlug,
        };
        writeFileSync(`${papersPath}${paper.id}.json`, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return false;
};

const combinePapers = () => {
  const papers = groupBy(
    readdirSync(papersPath)
      .filter((file) => path.extname(file) === ".json")
      .map((file) => JSON.parse(readFileSync(path.join(papersPath, file), "utf8"))),
    "topic"
  );
  const newtopics = [
    { name: "Artificial Intelligence", slug: "artificial-intelligence", papers: papers["artificial-intelligence"] },
    { name: "Plant Biology", slug: "plant-biology", papers: papers["plant-biology"] },
    { name: "Economics", slug: "economics", papers: papers["economics"] },
  ];
  writeFileSync("./src/data/papers.json", JSON.stringify(newtopics, null, 2));
};

const main = async () => {
  console.log("### Rewriting papers...");
  await Promise.all(topics.map((topic) => fetchPapers(topic)));
  combinePapers();
};

await main();
