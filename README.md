# CYBERNOISE - Cyberpunk Magazine Pipeline

CYBERNOISE is a## 🗃️ Data Flow

1. **RSS Sources**: arXiv CS.AI, bioRxiv Plant Biology, arXiv Economics
2. **Database**: All papers stored in `papers.sqlite` with full metadata
3. **Processing**: 
   - arXiv/economics papers: Full PDF download and text extraction
   - bioRxiv papers: Abstract-only processing (due to access restrictions)
4. **Static Build**: Astro pages directly query SQLite database during buildnk-themed magazine website that transforms academic papers into engaging, sensationalized articles with AI-generated imagery. The system uses a complete automated pipeline from RSS feeds to published articles.

## 🏗️ Architecture

The project is built with Astro and uses a database-first approach with SQLite as the primary data store. All content flows through a 3-stage pipeline:

1. **Fetch**: RSS feeds → SQLite database
2. **Transform**: Academic papers → AI-rewritten cyberpunk articles  
3. **Generate**: Article descriptions → AI-generated images

## 🚀 Project Structure

```
/
├── public/                    # Static assets and images
├── src/
│   ├── components/           # Astro components
│   ├── lib/
│   │   └── database.ts      # SQLite database access layer
│   ├── images/
│   │   └── articles/        # Generated article images
│   ├── layouts/             # Page layouts
│   └── pages/               # Astro pages
├── utils/                   # Core pipeline utilities
│   ├── fetch-papers.ts      # RSS feed fetching
│   ├── download-papers.ts   # PDF download & full-text extraction
│   ├── rewrite-papers.ts    # LLM article generation
│   ├── generate-images.ts   # AI image generation
│   └── storeArticlesInDB.ts # Database operations
├── papers.sqlite            # Primary data store
└── package.json
```

## 🔄 Content Pipeline

### Full Pipeline (Recommended)
```bash
bun run update-feed-with-images
```
Executes: `fetch-papers` → `download-papers` → `rewrite-papers` → `generate-images`

### Partial Pipeline (Without Images)
```bash
bun run update-feed
```
Executes: `fetch-papers` → `download-papers` → `rewrite-papers`

### Individual Steps

| Command                   | Action                                                     |
| :------------------------ | :--------------------------------------------------------- |
| `bun run fetch-papers`    | Fetch RSS feeds and store raw papers in database           |
| `bun run download-papers` | Download PDFs and extract full text (arXiv/economics only) |
| `bun run rewrite-papers`  | Transform papers into cyberpunk articles using LLM         |
| `bun run generate-images` | Generate AI images for articles                            |

## �️ Data Flow

1. **RSS Sources**: arXiv CS.AI, bioRxiv Plant Biology, arXiv Economics
2. **Database**: All papers stored in `papers.sqlite` with full metadata
3. **Processing**: 
   - arXiv/economics papers: Full PDF download and text extraction
   - bioRxiv papers: Abstract-only processing (due to access restrictions)
4. **Static Export**: Database content exported to `papers.json` for Astro builds

## 🧞 Development Commands

| Command       | Action                   |
| :------------ | :----------------------- |
| `bun install` | Install dependencies     |
| `bun dev`     | Start Astro dev server   |
| `bun build`   | Build production site    |
| `bun preview` | Preview production build |
| `bun test`    | Run test suite           |

## 🤖 LLM Integration

This project now uses only a local LMStudio server for rewriting papers.

Environment variables:

```sh
# LMStudio (local server)
LMSTUDIO_URL='http://127.0.0.1:1234'
LMSTUDIO_MODEL='qwen/qwen3-30b-a3b-2507'
```

## 🖼️ Image Generation

Images are generated via Runpod:

```sh
# Runpod (requires API key)
RUNPOD_API_KEY='your-runpod-api-key'
# Endpoint base (no trailing slash). Example: qwen-image-t2i
RUNPOD_ENDPOINT='https://api.runpod.ai/v2/qwen-image-t2i'
# Optional size (WxH as `width*height`), defaults to a 16:9 size
RUNPOD_SIZE='1344*768'
```

## 📊 Topic Categories

- **Artificial Intelligence** (`artificial-intelligence`)
- **Plant Biology** (`plant-biology`) 
- **Economics** (`economics`)

## 🔧 Technical Details

### Database Schema
Papers are stored with:
- Metadata (id, title, authors, abstract, link, published date)
- Full text content (for arXiv/economics papers)
- Rewritten content (title, summary, intro, text, keywords, image prompt)
- Topic classification

### Processing Logic
- **Concurrent Processing**: Papers processed in parallel batches (configurable concurrency)
- **Smart Filtering**: Only processes papers not already in database
- **Provider Abstraction**: Pluggable LLM and image generation providers
- **Error Handling**: Graceful degradation with comprehensive logging

### Static Generation
Astro pages directly query the SQLite database during static site generation, eliminating the need for intermediate JSON files. This provides:
- **Single Source of Truth**: SQLite database contains all content
- **Real-time Data**: Build always uses the latest database content
- **Simplified Architecture**: No intermediate export steps required
