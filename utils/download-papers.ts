import axios from "axios";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { getFullText, getPaperById, getRawPapers, storeFullText } from "./storeArticlesInDB";

const execAsync = promisify(exec);

interface Paper {
  id: string;
  link: string;
  title: string;
}

// Create downloads directory if it doesn't exist
const DOWNLOADS_DIR = "./downloads";

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

/**
 * Convert arxiv abstract URL to PDF URL
 * Example: https://arxiv.org/abs/2505.01441 -> https://arxiv.org/pdf/2505.01441
 */
const convertArxivUrl = (abstractUrl: string): string => {
  return abstractUrl.replace("/abs/", "/pdf/");
};

/**
 * Convert bioRxiv abstract URL to PDF URL
 * Example: https://www.biorxiv.org/content/10.1101/2025.07.24.666528v1?rss=1
 * -> https://www.biorxiv.org/content/10.1101/2025.07.24.666528v1.full.pdf
 */
const convertBiorxivUrl = (abstractUrl: string): string => {
  // Remove ?rss=1 and add .full.pdf
  return abstractUrl.replace("?rss=1", ".full.pdf");
};

/**
 * Get PDF URL based on the source
 */
const getPdfUrl = (abstractUrl: string): string => {
  if (abstractUrl.includes("arxiv.org")) {
    return convertArxivUrl(abstractUrl);
  } else if (abstractUrl.includes("biorxiv.org")) {
    return convertBiorxivUrl(abstractUrl);
  }
  throw new Error(`Unsupported URL format: ${abstractUrl}`);
};

/**
 * Get appropriate headers for different sites
 */
const getHeaders = (url: string, userAgent: string) => {
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

  if (url.includes("biorxiv.org")) {
    // bioRxiv-specific headers
    return {
      ...baseHeaders,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      Referer: "https://www.biorxiv.org/",
      Origin: "https://www.biorxiv.org",
      "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
    };
  } else {
    // arXiv and other sites
    return {
      ...baseHeaders,
      Accept: "application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
  }
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
        headers: getHeaders(url, userAgent),
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
 * Visit the abstract page first to establish session (for bioRxiv)
 */
const visitAbstractPage = async (abstractUrl: string, userAgent: string): Promise<void> => {
  if (!abstractUrl.includes("biorxiv.org")) {
    return; // Only needed for bioRxiv
  }

  try {
    console.log("Visiting abstract page to establish session...");
    await axios({
      method: "GET",
      url: abstractUrl,
      timeout: 30000,
      headers: getHeaders(abstractUrl, userAgent),
      validateStatus: () => true, // Accept any status
    });

    // Small delay after visiting the page
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));
  } catch (error) {
    console.log("Failed to visit abstract page, continuing anyway...");
  }
};

/**
 * Process a single paper: download PDF and convert to markdown
 */
const processPaper = async (paper: Paper): Promise<boolean> => {
  try {
    // Check if paper already exists in database with full text
    const existingPaper = await getPaperById(paper.id);
    if (existingPaper) {
      const fullText = await getFullText(paper.id);
      if (fullText && fullText.trim().length > 0) {
        console.log(`Paper ${paper.id} already exists with full text, skipping download`);
        return true;
      }
    }

    // Skip bioRxiv papers for now due to Cloudflare blocking
    if (paper.link.includes("biorxiv.org")) {
      console.log(`Skipping bioRxiv paper ${paper.id} due to access restrictions`);
      return false;
    }

    const pdfUrl = getPdfUrl(paper.link);
    const filename = `${paper.id}.pdf`;

    // For bioRxiv, visit the abstract page first
    const userAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    await visitAbstractPage(paper.link, userAgent);

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
 * Main function to download and convert all papers
 */
const main = async () => {
  console.log("### Downloading and converting papers to markdown...");

  try {
    const papers = await getRawPapers();
    console.log(`Found ${papers.length} papers to process`);

    let processed = 0;
    let failed = 0;

    // Process papers sequentially to avoid overwhelming servers
    for (const paper of papers) {
      try {
        const success = await processPaper(paper);
        if (success) {
          processed++;
        } else {
          failed++;
        }

        // Add delay between downloads to be respectful to servers
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error processing paper ${paper.id}:`, error);
        failed++;
      }
    }

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
