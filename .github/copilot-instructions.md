# CYBERNOISE - AI Coding Agent Instructions

## Project Overview

CYBERNOISE is a cyberpunk-themed magazine website that transforms academic papers into engaging, sensationalized articles with AI-generated imagery. Built with Astro, it features a complete content pipeline from RSS feeds to published articles.

## Architecture & Data Flow

### Core Pipeline (3-stage process)

1. **Fetch**: `bun ./utils/fetch-papers.ts` - Scrapes RSS feeds from arXiv/bioRxiv
2. **Transform**: `bun ./utils/rewrite-papers.ts` - LLM rewrites papers into cyberpunk articles
3. **Generate**: `bun ./utils/generate-images.ts` - Creates article images from AI prompts

**Key Command**: `bun run update-feed-with-images` executes the full pipeline.

### Data Structure

- All data: `papers.sqlite` (SQLite database with articles table)
- Astro pages: Direct database queries during static site generation

## Configuration Patterns

### Multi-Provider Architecture

The project uses configurable providers for AI services:

**LLM Providers** (`utils/rewrite-papers.ts`):

- `LLM_PROVIDER=ollama` (default) - Local Ollama instance
- `LLM_PROVIDER=groq` - Cloud Groq API (requires `GROQ_API_KEY`)

**Image Providers** (`utils/generate-images.ts`):

- `IMAGE_PROVIDER=local` (default) - Local Stable Diffusion API at `http://127.0.0.1:7860`
- `IMAGE_PROVIDER=replicate` - Replicate API (requires `REPLICATE_API_TOKEN`)
- Fallback system: Set `FALLBACK_TO_LOCAL=true` to auto-retry with local provider

### Provider Implementation Pattern

See `utils/image-providers.ts` for the interface pattern - all providers implement `generate(prompt: string, paperId: string): Promise<Buffer | null>` with consistent error handling.

## Content Processing Conventions

### Paper Transformation Schema

LLM rewriting follows a strict JSON schema:

```json
{
  "title": "sensationalized title",
  "summary": "one-sentence hook",
  "intro": "click-bait intro",
  "text": "1000-word futuristic article",
  "keywords": ["up to 5 keywords"],
  "prompt": "image generation prompt with artist references"
}
```

### Topic Structure

Fixed topics in `combinePapers()` function:

- Artificial Intelligence (`artificial-intelligence`)
- Plant Biology (`plant-biology`)
- Economics (`economics`)

## Development Workflow

### Local Development

- `bun dev` - Astro development server
- Content updates are manual via utility scripts
- Images stored in `src/images/articles/[id].png`

### Content Management

- Papers limited to 15 per topic (`PAPER_LIMIT`)
- Concurrent processing limited to 3 (`pLimit(3)`)
- Existing papers skipped automatically (checks for existing database entries)

## Astro-Specific Patterns

### Component Structure

- `Feed.astro` - Main article grid component with dynamic image loading
- Uses `import.meta.glob()` for dynamic image imports
- Image components use Astro optimization with responsive sizing

### Database Integration

- Astro pages directly query SQLite database using `src/lib/database.ts`
- Static site generation pulls fresh data from database at build time
- No intermediate JSON files required

### Styling Conventions

- Global cyberpunk aesthetic with teal accents and glitch effects
- CSS-in-Astro with scoped styles
- Responsive grid layouts (3→2→1 columns)
- Neon glow hover effects throughout

## Integration Points

- **RSS Sources**: arXiv CS.AI, bioRxiv Plant Biology, arXiv Economics
- **External APIs**: Ollama, Groq, Replicate, Local Stable Diffusion
- **Static Generation**: All content pre-generated at build time
- **Deployment**: Netlify static site with redirects configuration

## Critical Files

- `utils/rewrite-papers.ts` - Core content transformation logic
- `src/lib/database.ts` - Database access layer for Astro pages
- `src/components/Feed.astro` - Main content display component
- `utils/image-providers.ts` - Provider abstraction pattern
- `.env` variables control all AI service configurations

## Development Notes

- Uses Bun as package manager and script runner
- TypeScript throughout with strict interfaces
- Error handling focuses on graceful degradation (returns `false`/`null` vs throwing)
- All AI operations are rate-limited and include timeout handling
