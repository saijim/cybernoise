import crypto from "crypto";
import * as dotenv from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { env } from "node:process";
import { Configuration, OpenAIApi } from "openai";
import pLimit from "p-limit";

const limit = pLimit(10);

dotenv.config();

const topics = JSON.parse(
  readFileSync("./src/data/source-papers.json", "utf8")
);

const config = new Configuration({
  apiKey: env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchPapers(topic) {
  const papers = topic.feed
    .slice(0, 15)
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
  console.log("Fetching", paper.title);
  let completion = null;
  try {
    completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "For a futuristic cyberpunk magazine write a sensationalized and simplifed title, one sentence summary, click-bait intro, and a 1000 word text based on the title and abstract of a scientific paper. Everything should be written so that a layman can understand it. Tone should always be very optimistic and futuristic. User will provide you with a title and abstract. Provide up to five keywords. Provide a prompt (using only safe words) for an image generating AI like Dall-E. Strictly respond with a JSON object using the following format:\n" +
            "{\n" +
            '  "title": ${title},\n' +
            '  "summary": ${summary},\n' +
            '  "intro": ${intro},\n' +
            '  "text": ${text},\n' +
            '  "keywords": ${keywords},\n' +
            '  "prompt": ${prompt}\n' +
            "}",
        },
        {
          role: "user",
          content: `{"title": ${paper.title},\n"abstract": ${paper.abstract}}`,
        },
      ],
    });
  } catch (e) {
    console.log("Error", e);
    return false;
  }

  console.log("Received", paper.title);

  if (completion === null || !!completion.data.error) {
    console.log("completion.data.error", completion.data.error);
    return false;
  }

  const result = completion.data.choices[0].message.content
    .replace(/\n\n\n/g, "\\n\\n\\n")
    .replace(/\n\n/g, "\\n\\n");

  try {
    const newPaper = JSON.parse(result),
      data = {
        ...newPaper,
        prompt: newPaper.prompt
          .replace(/^Generate /g, "")
          .replace(/^Create /g, "")
          .replace(/^An image of /g, "")
          .replace(/^An AI generated image of /g, ""),
        link: paper.link,
        id: crypto.createHash("md5").update(paper.link).digest("hex"),
        slug: slug(newPaper.title),
        creator: paper.creator,
        topic: topicSlug,
      };
    writeFileSync(`./src/data/papers/${data.slug}.json`, JSON.stringify(data));
    return data;
  } catch (e) {
    console.log("Dropping non-JSON result");
  }

  return false;
}

async function main() {
  console.log("### Rewriting papers...");
  const result = await Promise.all(topics.map((topic) => fetchPapers(topic)));
  writeFileSync(`./src/data/papers.json`, JSON.stringify(result));
}

await main();
