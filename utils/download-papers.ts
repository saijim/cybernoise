import axios from "axios";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { parseStringPromise } from "xml2js";
import { getFullText, storeFullText, storeRawPapers } from "./storeArticlesInDB";

const execAsync = promisify(exec);

// RSS feed URLs
const rssUrls = [
  { name: "Artificial Intelligence", url: "https://rss.arxiv.org/atom/cs.AI" },
  { name: "Plant Biology", url: "https://connect.biorxiv.org/biorxiv_xml.php?subject=plant_biology" },
  { name: "Economics", url: "https://rss.arxiv.org/atom/econ" },
];

interface Paper {
  id: string;
  link: string;
  title: string;
  slug: string;
  abstract: string;
  creator: string;
}

// Create downloads directory if it doesn't exist
const DOWNLOADS_DIR = "./downloads";

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

/**
 * Clean and format string content
 */
const cleanString = (str: string) =>
  str
    .replace(/arXiv:(.*) Announce Type: new \n|<[^>]*>|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Generate URL slug from string
 */
const generateSlug = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Fetch RSS feed and return parsed papers
 */
const fetchRssFeed = async (url: string): Promise<Paper[]> => {
  try {
    console.log(`Fetching RSS feed: ${url}`);
    const { data } = await axios.get(url);
    const result = await parseStringPromise(data);
    const items = result["rdf:RDF"]?.item || result["feed"]?.entry;
    if (!items) return [];

    return items
      .map((item: any) => {
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
      })
      .slice(0, 15);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error fetching RSS feed:", error.message);
    } else {
      console.error("Unexpected error:", error);
    }
    return [];
  }
};

/**
 * Fetch all RSS feeds and return new papers not in database
 */
const fetchNewPapers = async (): Promise<Paper[]> => {
  console.log("### Fetching RSS feeds...");

  // Fetch all RSS feeds
  const rssFeeds = await Promise.all(
    rssUrls.map(async ({ name, url }) => ({
      name,
      feed: await fetchRssFeed(url),
    }))
  );

  // Store all papers in database first (for consistency)
  await storeRawPapers(rssFeeds);

  // Get all papers from RSS feeds
  const allPapers: Paper[] = rssFeeds.flatMap(({ feed }) => feed);
  const bioRxivPapers = allPapers.filter((paper) => paper.link.includes("biorxiv.org"));
  const nonBioRxivPapers = allPapers.filter((paper) => !paper.link.includes("biorxiv.org"));

  console.log(`Found ${allPapers.length} total papers from RSS feeds`);
  console.log(`  - ${nonBioRxivPapers.length} arXiv/economics papers (will download PDFs)`);
  console.log(`  - ${bioRxivPapers.length} bioRxiv papers (will use abstracts only)`);

  // Filter out papers that already exist in database with full text
  const newPapers: Paper[] = [];

  console.log("Checking non-bioRxiv papers for existing full text...");

  for (const paper of nonBioRxivPapers) {
    const hasFullText = await getFullText(paper.id);

    // Only add papers that don't have full text yet
    if (!hasFullText || hasFullText.trim().length === 0) {
      newPapers.push(paper);
    }
  }
  console.log(`Found ${newPapers.length} new arXiv/economics papers to download and process`);
  return newPapers;
};

/**
 * Get PDF URL based on the source
 */
const getPdfUrl = (abstractUrl: string): string => {
  if (abstractUrl.includes("arxiv.org")) {
    // https://arxiv.org/abs/<id> -> https://arxiv.org/pdf/<id>
    return abstractUrl.replace("/abs/", "/pdf/");
  } else if (abstractUrl.includes("biorxiv.org")) {
    // https://www.biorxiv.org/content/<id>[?query] -> .../<id>.full.pdf
    const withoutQuery = abstractUrl.replace(/\?.*$/, "");
    return `${withoutQuery}.full.pdf`;
  }
  // Keep error message concise for tests and callers
  throw new Error("Unsupported URL format");
};

/**
 * Get appropriate headers for different sites
 */
const getHeaders = (userAgent: string) => {
  const baseHeaders = {
    "User-Agent": userAgent,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  return {
    ...baseHeaders,
    Accept: "application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
};

/**
 * Download PDF from URL with retries and anti-bot measures
 */
const downloadPdf = async (url: string, filename: string): Promise<string> => {
  const downloadPath = path.join(DOWNLOADS_DIR, filename);

  // User agents to rotate through
  const userAgents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  ];

  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

      console.log(`Downloading ${filename} (attempt ${attempt}/${maxRetries})`);

      // Add realistic delay between attempts
      if (attempt > 1) {
        const delay = 2000 + Math.random() * 3000; // 2-5 seconds
        console.log(`Waiting ${Math.round(delay / 1000)}s before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await axios({
        method: "GET",
        url,
        responseType: "stream",
        timeout: 60000,
        headers: getHeaders(userAgent),
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });

      console.log(`Download response status: ${response.status}`);

      const writer = fs.createWriteStream(downloadPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", () => resolve());
        writer.on("error", reject);
      });

      // Verify the file was downloaded and has content
      const stats = fs.statSync(downloadPath);
      if (stats.size < 1000) {
        throw new Error(`Downloaded file is too small (${stats.size} bytes), likely an error page`);
      }

      console.log(`Successfully downloaded ${filename} (${Math.round(stats.size / 1024)}KB)`);
      return downloadPath;
    } catch (error: any) {
      console.error(`Download attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        throw new Error(`Failed to download after ${maxRetries} attempts: ${error.message}`);
      }

      // Clean up partial download
      try {
        if (fs.existsSync(downloadPath)) {
          fs.unlinkSync(downloadPath);
        }
      } catch {}
    }
  }

  throw new Error("Download failed");
};

/**
 * Convert PDF to markdown using pdftotext (without saving to disk)
 */
const convertPdfToMarkdown = async (pdfPath: string, paperId: string): Promise<string> => {
  try {
    console.log(`Converting PDF to text: ${paperId}`);

    // Check if pdftotext is installed
    try {
      await execAsync("which pdftotext");
    } catch {
      throw new Error("pdftotext is not installed. Please install it with: brew install poppler");
    }

    // Convert PDF to text using pdftotext and output to stdout
    const command = `pdftotext "${pdfPath}" -`;
    const { stdout } = await execAsync(command);

    // Convert text to basic markdown format
    const markdownContent = convertTextToMarkdown(stdout);

    console.log(`Successfully converted ${paperId} to markdown (${markdownContent.length} characters)`);

    return markdownContent;
  } catch (error) {
    console.error(`Failed to convert PDF to markdown for ${paperId}:`, error);
    throw error;
  }
};

/**
 * Convert plain text to basic markdown format
 */
const convertTextToMarkdown = (text: string): string => {
  // Basic text-to-markdown conversion
  let markdown = text
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, "\n\n")
    // Try to identify and format headers (lines that are all caps and short)
    .replace(/^([A-Z][A-Z\s]{2,50})$/gm, "## $1")
    // Format references (lines starting with numbers in brackets)
    .replace(/^\[(\d+)\]/gm, "\n**[$1]**")
    // Add some basic structure
    .replace(/^(Abstract|Introduction|Methods|Results|Discussion|Conclusion|References)$/gim, "\n## $1\n")
    .trim();

  return markdown;
};

/**
 * Clean and truncate markdown content for LLM processing
 */
const cleanMarkdownContent = (content: string): string => {
  // Remove excessive whitespace and normalize
  let cleaned = content
    .replace(/\n{3,}/g, "\n\n") // Replace multiple newlines with double
    .replace(/[ \t]+/g, " ") // Replace multiple spaces/tabs with single space
    .replace(/^\s+|\s+$/gm, "") // Trim lines
    .trim();

  // Truncate if too long (keep first ~50k characters to stay within token limits)
  if (cleaned.length > 50000) {
    cleaned = cleaned.substring(0, 50000) + "\n\n[Content truncated for processing...]";
  }

  return cleaned;
};

/**
 * Process a single paper: download PDF and convert to markdown
 */
const processPaper = async (paper: Paper): Promise<boolean> => {
  try {
    const pdfUrl = getPdfUrl(paper.link);
    const filename = `${paper.id}.pdf`;

    // Download PDF
    const pdfPath = await downloadPdf(pdfUrl, filename);

    // Convert to markdown
    const markdownContent = await convertPdfToMarkdown(pdfPath, paper.id);

    // Clean up PDF file after processing
    try {
      fs.unlinkSync(pdfPath);
      console.log(`Deleted PDF file: ${filename}`);
    } catch (error) {
      console.warn(`Failed to delete PDF file ${filename}:`, error);
    }

    // Clean and store the content directly in database
    const cleanedContent = cleanMarkdownContent(markdownContent);
    await storeFullText(paper.id, cleanedContent);

    console.log(`Successfully processed paper: ${paper.id}`);
    return true;
  } catch (error) {
    console.error(`Failed to process paper ${paper.id}:`, error);
    return false;
  }
};
/**
 * Process papers in parallel with controlled concurrency
 */
const processPapersInParallel = async (
  papers: Paper[],
  maxConcurrency: number = 10
): Promise<{ processed: number; failed: number }> => {
  let processed = 0;
  let failed = 0;

  // Process papers in batches to limit concurrent downloads
  for (let i = 0; i < papers.length; i += maxConcurrency) {
    const batch = papers.slice(i, i + maxConcurrency);

    console.log(
      `Processing batch ${Math.floor(i / maxConcurrency) + 1} of ${Math.ceil(papers.length / maxConcurrency)} (${
        batch.length
      } papers)`
    );

    // Process current batch in parallel
    const batchPromises = batch.map(async (paper, index) => {
      try {
        // Add small staggered delay to avoid hitting servers too hard
        await new Promise((resolve) => setTimeout(resolve, index * 500));

        const success = await processPaper(paper);
        if (success) {
          console.log(`✓ [${i + index + 1}/${papers.length}] Successfully processed: ${paper.id}`);
          return true;
        } else {
          console.log(`✗ [${i + index + 1}/${papers.length}] Failed to process: ${paper.id}`);
          return false;
        }
      } catch (error) {
        console.error(`✗ [${i + index + 1}/${papers.length}] Error processing ${paper.id}:`, error);
        return false;
      }
    });

    // Wait for current batch to complete
    const batchResults = await Promise.all(batchPromises);

    // Count results
    processed += batchResults.filter((result) => result).length;
    failed += batchResults.filter((result) => !result).length;

    // Add delay between batches to be respectful to servers
    if (i + maxConcurrency < papers.length) {
      console.log("Waiting between batches...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return { processed, failed };
};

/**
 * Main function to download and convert all papers
 */
const main = async () => {
  console.log("### Downloading and converting papers to markdown...");

  try {
    // Get new papers from RSS feeds, filtering out existing ones
    const papers = await fetchNewPapers();

    if (papers.length === 0) {
      console.log("No new papers to process");
      return;
    }

    console.log(`Found ${papers.length} papers to process`);

    // Process papers in parallel with controlled concurrency
    const maxConcurrency = 10; // Adjust based on server capacity and rate limits
    const { processed, failed } = await processPapersInParallel(papers, maxConcurrency);

    console.log(`### Download complete! Processed: ${processed}, Failed: ${failed}`);
  } catch (error) {
    console.error("Error in main execution:", error);
  }
};

// Export functions for use in other modules
export { cleanMarkdownContent, convertPdfToMarkdown, downloadPdf, getPdfUrl, processPaper };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
