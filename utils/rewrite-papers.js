import crypto from "crypto";
import * as dotenv from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { env } from "node:process";
import { Configuration, OpenAIApi } from "openai";

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
  const papers = topic.feed.slice(0, 15).map(async (paper) => {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "For a futuristic cyberpunk magazine write an article with a sensationalized and simplifed title, 2 sentence summary, click-bait intro, and 1000 word text based on the title and abstract of a scientific paper. Everything should be written so that a layman can understand it. Tone should always be very optimistic and futuristic. User will provide you with a title and abstract. Provide up to five keywords. Provide a prompt (using only safe words) for an image generating AI like Dall-E. Do not use the word Revolutionizing. Strictly respond with a JSON object using the following format:\n" +
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

    console.log("Received", paper.title);

    if (!!completion.data.error) {
      return false;
    }

    const result = completion.data.choices[0].message.content
      .replace(/\n\n\n/g, "\\n\\n\\n")
      .replace(/\n\n/g, "\\n\\n");

    try {
      const newPaper = JSON.parse(result);
      return {
        ...newPaper,
        prompt: newPaper.prompt
          .replace(/^Generate /g, "")
          .replace(/^Create /g, "")
          .replace(/^An image of /g, "")
          .replace(/^An AI generated image of /g, ""),
        link: paper.link,
        id: crypto.createHash("md5").update(paper.link).digest("hex"),
        slug: slug(newPaper.title),
        imageSlug: slug(newPaper.prompt).slice(0, 200),
        creator: paper.creator,
      };
    } catch (e) {
      console.log("Dropping non-JSON result");
    }

    return false;
  });

  const newPapers = await Promise.all(papers);

  return {
    name: topic.name,
    slug: slug(topic.name),
    papers: newPapers.filter(
      (paper) =>
        !!paper &&
        paper.title &&
        paper.text &&
        paper.intro &&
        paper.keywords &&
        paper.prompt
    ),
  };
}

async function main() {
  console.log("### Rewriting papers...");
  const result = await Promise.all(topics.map((topic) => fetchPapers(topic)));
  writeFileSync(`./src/data/papers.json`, JSON.stringify(result));
}

await main();
