import * as dotenv from "dotenv";
import { accessSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { env } from "node:process";
import OpenAI from "openai";
import pLimit from "p-limit";
import path from "path";
import { groupBy } from "lodash";
import Replicate from "replicate";

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const limit = pLimit(10),
  PAPERLIMIT = 15,
  papersPath = "./src/data/papers/";

const topics = JSON.parse(
  readFileSync("./src/data/source-papers.json", "utf8")
);

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchPapers(topic) {
  const papers = topic.feed
    .slice(0, PAPERLIMIT)
    .map((paper) => limit(() => fetchPaper(paper, slug(topic.name))));

  const newPapers = await Promise.all(papers);

  return {
    name: topic.name,
    slug: slug(topic.name),
    papers: newPapers.filter(
      (paper) =>
        !!paper && paper.title && paper.intro && paper.keywords && paper.prompt
    ),
  };
}

async function fetchPaper(paper, topicSlug) {
  try {
    accessSync(`${papersPath}${paper.id}.json`);
    console.log(`File exists, skipping ${paper.title}`);
    return false;
  } catch (err) {}

  const output = await replicate.run(
    "meta/llama-2-13b-chat:f4e2de70d66816a838a89eeeb621910adffb0dd0baba3976c96980970978018d",
    {
      input: {
        system_prompt: `For a futuristic cyberpunk magazine write a sensationalized and simplifed title, one sentence summary, click-bait intro, and a 1000 word text based on the title and abstract of a scientific paper. Everything should be written so that a layman can understand it. Tone should always be very optimistic and futuristic. User will provide you with a title and abstract. Provide up to five keywords. Provide a prompt (using only safe words) for an image generating AI like Stable Diffusion or SDXL. Strictly respond with a JSON object using the following format:\n{\n  "title": \${title},\n  "summary": \${summary},\n  "intro": \${intro},\n  "text": \${text},\n  "keywords": \${keywords},\n  "prompt": \${prompt}\n}`,
        prompt: `{"title": ${paper.title},\n"abstract": ${paper.abstract}}`,
        max_new_tokens: 2048,
      },
    }
  );

  const result = output
    .join("")
    .replace(/\n\n\n/g, "\\n\\n\\n")
    .replace(/\n\n/g, "\\n\\n");

  try {
    const newPaper = JSON.parse(result);
    const data = {
      ...newPaper,
      prompt: newPaper.prompt
        .replace(/^Generate /g, "")
        .replace(/^Create /g, "")
        .replace(/^An image of /g, "")
        .replace(/^An AI generated image of /g, ""),
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

  return false;
}

function combinePapers() {
  const jsonFiles = readdirSync(papersPath).filter(
    (file) => path.extname(file) === ".json"
  );

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
