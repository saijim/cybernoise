# CRUSH.md - CYBERNOISE Project Guide

## Build Commands
- Dev: `bun dev`
- Build: `bun build`
- Lint: `bun lint` (auto-fixes)
- Content Pipeline: `bun run update-feed-with-images`

## Testing
- No test framework - use `bun run dev` and manual verification
- Test content: `bun ./utils/fetch-papers.ts` (single step)

## Code Style
- **Imports**: ES modules only, no type imports needed
- **Types**: Strict TypeScript throughout
- **Naming**: camelCase vars, PascalCase components, kebab-case files
- **Error Handling**: Return null/false, never throw
- **Concurrency**: pLimit(1) for all AI operations
- **Formatting**: 2-space indent, no semicolons, single quotes

## Key Patterns
- **Providers**: See `utils/image-providers.ts` interface pattern
- **Content**: JSON schema validation in `utils/article.schema.json`
- **Environment**: All AI config via .env variables
- **Images**: Dynamic imports via `import.meta.glob()`