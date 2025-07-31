# Full Paper Download and Processing

## Overview

The system now supports downloading full papers (PDFs) and converting them to markdown for enhanced article generation. Instead of using only abstracts, the LLM can now work with complete paper content.

## Requirements

1. **Poppler Utils** - Required for PDF text extraction
   ```bash
   brew install poppler
   ```

## New Workflow

### Enhanced Pipeline Commands

1. **Full Pipeline with PDF Download:**
   ```bash
   bun run update-feed-with-full-papers
   ```
   This runs: fetch → download PDFs → convert to markdown → rewrite → export

2. **Download Papers Only:**
   ```bash
   bun run download-papers
   ```

3. **Original Pipeline (abstracts only):**
   ```bash
   bun run update-feed
   ```

### URL Conversion

The system automatically converts abstract URLs to PDF URLs:

**ArXiv:**
- Abstract: `https://arxiv.org/abs/2505.01441`
- PDF: `https://arxiv.org/pdf/2505.01441`

**BioRxiv:**
- Abstract: `https://www.biorxiv.org/content/10.1101/2025.07.24.666528v1?rss=1`
- PDF: `https://www.biorxiv.org/content/10.1101/2025.07.24.666528v1.full.pdf`

## Features

### PDF Processing
- Downloads PDFs to `./downloads/` directory
- Converts to text using `pdftotext` (from poppler)
- Applies basic markdown formatting
- Stores markdown in `./markdown/` directory
- Cleans and truncates content for LLM processing (max 50k chars)
- Skips already processed files

### Database Updates
- New `full_text` column stores markdown content
- Enhanced article generation uses full text when available
- Falls back to abstract if full text is unavailable

### Error Handling
- Respects server rate limits (2-second delays)
- Graceful failure for individual papers
- Continues processing if some downloads fail
- User-agent headers to avoid blocking
- Handles 403 errors from bioRxiv (anti-bot measures)

## Technical Details

### File Structure
```
downloads/           # PDF files
markdown/           # Converted markdown files
papers.sqlite       # Database with full_text column
```

### Processing Logic
1. Check if PDF already exists locally
2. Download PDF with proper headers and timeout
3. Extract text using `pdftotext`
4. Apply basic markdown formatting (headers, references)
5. Store in database
6. Use full text for article generation

### LLM Enhancement
- System message updated to handle both abstracts and full papers
- User message includes full text when available (truncated to 40k chars)
- Falls back to abstract for papers without full text

### Markdown Conversion
- Extracts text using `pdftotext` from poppler
- Identifies and formats section headers (Abstract, Introduction, etc.)
- Formats references with bold numbers
- Cleans excessive whitespace
- Basic structure recognition

## Usage Example

```bash
# Download papers and generate articles with full content
bun run update-feed-with-full-papers

# Or run steps individually
bun ./utils/fetch-papers.ts        # Fetch RSS feeds
bun run download-papers            # Download and convert PDFs  
bun run rewrite-papers            # Generate articles
bun run export-papers-json       # Export to JSON
```

## Limitations

- BioRxiv may block automated downloads (returns 403 errors)
- ArXiv generally allows downloads but respect rate limits
- PDF quality varies - some may have poor text extraction
- Complex formatting (tables, equations) may not convert well
- Large papers are truncated to fit LLM token limits

This enhancement significantly improves article quality by providing the LLM with complete paper content instead of just abstracts.
