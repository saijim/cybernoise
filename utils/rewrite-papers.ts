import * as dotenv from "dotenv";
import { accessSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { groupBy } from "lodash";
import OpenAI from "openai";
import pLimit from "p-limit";
import path from "path";

dotenv.config();

const limit = pLimit(1),
  PAPERLIMIT = 15,
  papersPath = "./src/data/papers/";

const topics = JSON.parse(readFileSync("./src/data/source-papers.json", "utf8"));

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchPapers(topic) {
  const papers = topic.feed.slice(0, PAPERLIMIT).map((paper) => limit(() => fetchPaper(paper, slug(topic.name))));

  const newPapers = await Promise.all(papers);

  return {
    name: topic.name,
    slug: slug(topic.name),
    papers: newPapers.filter((paper) => !!paper && paper.title && paper.intro && paper.keywords && paper.prompt),
  };
}

async function fetchPaper(paper, topicSlug) {
  try {
    accessSync(`${papersPath}${paper.id}.json`);
    console.log(`File exists, skipping ${paper.title}`);
    return false;
  } catch (err) {}

  const openai = new OpenAI({
    baseURL: "http://127.0.0.1:1234/v1",
    apiKey: "#",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `For a futuristic cyberpunk magazine write a sensationalized and simplifed title, one sentence summary, click-bait intro, and a 1000 word text based on the title and abstract of a scientific paper. Everything should be written so that a layman can understand it. Tone should always be very optimistic and futuristic. User will provide you with a title and abstract. Provide up to five keywords. Provide a prompt for an image generating AI like Stable Diffusion or SDXL. Strictly respond with a JSON object using the following format:\n{\n  "title": \${title},\n  "summary": \${summary},\n  "intro": \${intro},\n  "text": \${text},\n  "keywords": \${keywords},\n  "prompt": \${prompt}\n}`,
    },
    { role: "user", content: `{"title": ${paper.title},\n"abstract": ${paper.abstract}}` },
  ];

  console.log(messages);

  const completion = await openai.chat.completions.create({
    messages: messages,
    model: "MaziyarPanahi/Meta-Llama-3-70B-Instruct-GGUF/Meta-Llama-3-70B-Instruct.Q6_K-00001-of-00002.gguf",
    temperature: 0.7,
  });

  const result = completion.choices[0].message.content
    ?.replaceAll(/\n\n\n/g, "\\n\\n\\n")
    .replaceAll(/\n\n/g, "\\n\\n")
    .replaceAll("\n", " ");
  if (result) {
    try {
      const newPaper = JSON.parse(result);
      console.log(newPaper);
      const data = {
        ...newPaper,
        prompt: newPaper.prompt?.text ?? newPaper.prompt,
        link: paper.link,
        id: paper.id,
        slug: slug(newPaper.title),
        creator: paper.creator,
        topic: topicSlug,
      };

      const filename = `${papersPath}${paper.id}.json`;
      writeFileSync(filename, JSON.stringify(data));

      return data;
    } catch (e) {
      console.log(e);
      console.log("Dropping non-JSON result");
    }
  } else {
    console.log("Dropping empty result");
  }

  return false;
}

function combinePapers() {
  const jsonFiles = readdirSync(papersPath).filter((file) => path.extname(file) === ".json");

  const papers = groupBy(
    jsonFiles.map((file) => {
      const filePath = path.join(papersPath, file);
      const fileData = readFileSync(filePath, "utf8");
      return JSON.parse(fileData);
    }),
    "topic"
  );

  const newtopics = [
    {
      name: "Artificial Intelligence",
      slug: "artificial-intelligence",
      papers: papers["artificial-intelligence"],
    },
    {
      name: "Plant Biology",
      slug: "plant-biology",
      papers: papers["plant-biology"],
    },
    {
      name: "Economics",
      slug: "economics",
      papers: papers["economics"],
    },
  ];

  writeFileSync("./src/data/papers.json", JSON.stringify(newtopics, null, 2));
}

async function main() {
  console.log("### Rewriting papers...");
  await Promise.all(topics.map((topic) => fetchPapers(topic)));
  combinePapers();
}

await main();
