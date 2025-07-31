import axios from "axios";
import { parseStringPromise } from "xml2js";
import { storeRawPapers } from "./storeArticlesInDB";

const rssUrls = [
  { name: "Artificial Intelligence", url: "https://rss.arxiv.org/atom/cs.AI" },
  { name: "Plant Biology", url: "https://connect.biorxiv.org/biorxiv_xml.php?subject=plant_biology" },
  { name: "Economics", url: "https://rss.arxiv.org/atom/econ" },
];

const cleanString = (str: string) =>
  str
    .replace(/arXiv:(.*) Announce Type: new \n|<[^>]*>|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const generateSlug = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const fetchRssFeed = async (url: string) => {
  try {
    const { data } = await axios.get(url);
    const result = await parseStringPromise(data);
    const items = result["rdf:RDF"]?.item || result["feed"]?.entry;
    if (!items) return [];

    return items.map((item: any) => {
      const description = item["description"]?.[0] || item["summary"]?.[0];
      const link = typeof item.link?.[0] === "string" ? item.link[0] : item.link?.[0]?.["$"].href;
      const id = cleanString(link.split("/").pop() || "");

      return {
        id: item["dc:date"] ? id.replace("?rss=1", "") : id,
        slug: generateSlug(item.title[0]),
        title: cleanString(item.title[0]),
        link: cleanString(link),
        abstract: cleanString(description["_"] || description),
        creator: cleanString(item["dc:creator"][0]),
      };
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error fetching RSS feed:", error.message);
    } else {
      console.error("Unexpected error:", error);
    }
    return [];
  }
};

const main = async () => {
  console.log("### Fetching papers...");
  try {
    const rssFeeds = await Promise.all(rssUrls.map(async ({ name, url }) => ({ name, feed: await fetchRssFeed(url) })));
    await storeRawPapers(rssFeeds);
  } catch (error) {
    console.error("Error in main execution:", error instanceof Error ? error.message : error);
  }
};

main().catch(console.error);
