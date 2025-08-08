# CYBERNOISE – AI Coding Agent Guide

This Astro site turns academic papers into cyberpunk articles with AI-written text and AI-generated images. Content flows database-first; Astro reads from SQLite at build time.

## Architecture & flow

- Data store: `papers.sqlite` (single source of truth)
- Stages: 1) fetch RSS → DB, 2) rewrite with LLM, 3) generate images
- Full pipeline: `bun run update-feed-with-images` (runs `utils/fetch-papers.ts` → `download-papers.ts` → `rewrite-papers.ts` → `generate-images.ts`)
- Output images: `src/images/articles/[paperId].png`; pages link as `/articles/{id}--{slug}`

## Key scripts & dev

- Dev server: `bun dev`; Build: `bun build`; Tests: `bun test` (Vitest in `test/`)
- Update content without images: `bun run update-feed`
- Non-obvious: both rewrite and image steps are rate-limited with `p-limit(1)`; per-topic cap `PAPER_LIMIT = 15`.

## Providers & env

- Rewriting: local LMStudio only (`utils/rewrite-papers.ts`) using `POST {LMSTUDIO_URL}/v1/chat/completions`
  - Env: `LMSTUDIO_URL` (default `http://127.0.0.1:1234`), `LMSTUDIO_MODEL` (default `qwen/qwen3-30b-a3b-2507`)
- Images: Replicate only (`utils/generate-images.ts`) via `ImageProvider`
  - Env: `REPLICATE_API_TOKEN` (required), `REPLICATE_MODEL` (default `black-forest-labs/flux-schnell`)

## Data & topics

- Raw papers are stored, then joined with generated articles at read time. Astro queries with helpers in `src/lib/database.ts`:
  - `getAllTopics()`, `getTopicBySlug(slug)`, `getPaperById(id)`, `getAllPapers()` (read-only sqlite3)
- Fixed topics used across scripts: Artificial Intelligence → `artificial-intelligence`; Plant Biology → `plant-biology`; Economics → `economics` (`getTopicSlugByName` in `utils/rewrite-papers.ts`)

## Content generation conventions

- LLM must return strict JSON. See schema examples in `response.schema.json` and `utils/article.schema.json` (fields: title, summary, intro, text, keywords, prompt)
- Keywords may arrive as string or array; parsing is handled in `src/lib/database.ts::parseKeywords`
- Existing content is skipped: summaries via `checkPaperExists(id)` and images via file existence check

## Frontend patterns

- `src/components/Feed.astro` dynamically loads images with `import.meta.glob()` and matches by `paper.id`
- Astro pages read fresh data from SQLite during SSG (no intermediate JSON files)

## Useful file map

- Pipeline: `utils/{fetch-papers,download-papers,rewrite-papers,generate-images,storeArticlesInDB}.ts`
- Providers: `utils/image-providers.ts` (class `ImageProvider.generate(prompt, paperId): Promise<Buffer|null>`)
- DB layer: `src/lib/database.ts`
- Assets: `src/images/articles/`

Notes for agents: prefer returning `false`/`null` on provider failures with clear logs; keep rate limits; do not introduce new data stores without wiring them into the SQLite read path.
