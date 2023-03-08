import axios from "axios";
import { writeFileSync } from "fs";
import { parseString } from "xml2js";

const rssUrls = [
  {
    name: "Artificial Intelligence",
    url: "https://export.arxiv.org/rss/cs.AI/new",
  },
  {
    name: "Plant Biology",
    url: "https://connect.biorxiv.org/biorxiv_xml.php?subject=plant_biology",
  },
  {
    name: "Economics",
    url: "https://export.arxiv.org/rss/econ/new",
  },
];

function cleanString(str) {
  return str
    .replace(/\(arXiv.*/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\n/g, " ")
    .replace(/\s{2}$/g, "")
    .trim();
}

async function getRssFeed(url) {
  const response = await axios.get(url);
  let papers = [];

  parseString(response.data, (err, result) => {
    if (err) {
      console.error(err);
    } else {
      if (result["rdf:RDF"]?.item !== undefined) {
        papers = result["rdf:RDF"].item.map((item) => {
          const abstract =
            item["description"][0]["_"] ?? item["description"][0];
          return {
            title: cleanString(item.title[0]),
            link: cleanString(item.link[0]),
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
      const rssFeed = await getRssFeed(rssUrl.url);
      return {
        name: rssUrl.name,
        feed: rssFeed,
      };
    })
  );

  writeFileSync("./src/data/source-papers.json", JSON.stringify(rssFeeds));
}

await main();
