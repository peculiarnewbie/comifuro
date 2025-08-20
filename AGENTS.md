# Agent Configuration

## Build/Lint/Test Commands

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run test` - Run all tests
- `bun run test <file>` - Run specific test file

## Code Style Guidelines

- Use TypeScript with strict typing
- Follow existing import patterns (absolute imports for components/routes)
- Use Tailwind CSS for styling with Tokenami
- Format with Prettier (configured in VS Code settings)
- Name components with PascalCase, variables with camelCase
- Handle errors with try/catch and user-friendly messages
- Use Zod for validation and SolidJS for reactivity
- Use drizzle for orm

## Workspace Structure

- `packages/api` - Cloudflare Worker API
- `packages/twitter-scraper` - Twitter media scraper
- `packages/www` - Main web application

## Deployment

- API: Cloudflare Workers
- Web: Cloudflare Workers with static assets binding

