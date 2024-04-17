import axios from "axios";
import { writeFileSync } from "fs";
import { parseString } from "xml2js";
import storeArticlesInDB from "./storeArticlesInDB";

const rssUrls = [
  {
    name: "Artificial Intelligence",
    url: "https://rss.arxiv.org/atom/cs.AI",
  },
  {
    name: "Plant Biology",
    url: "https://connect.biorxiv.org/biorxiv_xml.php?subject=plant_biology",
  },
  {
    name: "Economics",
    url: "https://rss.arxiv.org/atom/econ",
  },
];

function cleanString(str) {
  return str
    .replace(/arXiv:(.*) Announce Type: new \n/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\n/g, " ")
    .replace(/\s{2}$/g, "")
    .trim();
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getRssFeed(url) {
  const response = await axios.get(url);
  let papers = [];

  parseString(response.data, (err, result) => {
    if (err) {
      console.error(err);
    } else {
      const items = result["rdf:RDF"]?.item ?? result["feed"]?.entry;
      if (items !== undefined) {
        papers = items.map((item) => {
          const abstract = item["description"]?.[0]["_"] ?? item["description"]?.[0] ?? item["summary"]?.[0];
          const link = typeof item.link?.[0] === "string" ? item.link[0] : item.link?.[0]?.["$"].href;
          const id = cleanString(link.split("/").pop());

          return {
            id: item["dc:date"] ? id.replace("?rss=1", "") : id,
            slug: slug(item.title[0]),
            title: cleanString(item.title[0]),
            link: cleanString(link),
            abstract: cleanString(abstract),
            creator: cleanString(item["dc:creator"][0]),
          };
        });
      } else {
        console.error("No papers found");
      }
    }
  });
  return papers;
}

async function main() {
  console.log("### Fetching papers...");

  const rssFeeds = await Promise.all(
    rssUrls.map(async (rssUrl) => {
      console.log(`Fetching ${rssUrl.name}...`);
      const rssFeed = await getRssFeed(rssUrl.url);
      return {
        name: rssUrl.name,
        feed: rssFeed,
      };
    })
  );

  writeFileSync("./src/data/source-papers.json", JSON.stringify(rssFeeds));
  await storeArticlesInDB(rssFeeds);
}

await main();
