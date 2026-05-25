# Agent Configuration

## Build/Lint/Test Commands

- `pnpm dev` - Start development server (vite-plus)
- `pnpm build` - Build for production (vite-plus)
- `pnpm check` - Format, lint, and type-check (vite-plus)
- `pnpm fmt` - Format all files (oxfmt via vite-plus)
- `pnpm lint` - Lint all files (oxlint via vite-plus)
- `pnpm typecheck` - Type-check all packages
- `pnpm test` - Run all tests
- `pnpm deploy` - Deploy to Cloudflare Workers via Alchemy
- `pnpm destroy` - Destroy Cloudflare Workers deployment
- `cd packages/www && vp dev` - Dev server for www package
- `cd packages/www && vp check` - Check www package
- `cd packages/www && vp test <file>` - Run specific test file
- `cd packages/www && vp build` - Build www package

## Code Style Guidelines

- Use TypeScript with strict typing
- Follow existing import patterns (absolute imports for components/routes)
- Use Tailwind CSS for styling
- Format with oxfmt via `vp fmt` (configured in root `vite.config.ts`)
- Lint with oxlint via `vp lint` (configured in root `vite.config.ts`)
- Name components with PascalCase, variables with camelCase
- Handle errors with try/catch and user-friendly messages
- Use Effect Schema for validation and SolidJS for reactivity
- Use drizzle-orm for database access

## Stack

- **TypeScript 7** (native Go port via `@typescript/native-preview`) - ~10x faster type checking
- **Vite-Plus** (vp) - Unified toolchain (dev, build, check, test, fmt, lint) from VoidZero
- **Oxlint / Oxfmt** - Rust-based linter and formatter (built into vite-plus)
- **Alchemy** - Infrastructure-as-code for Cloudflare deployments (using Effect)
- **Effect** (4.0.0-beta.70) - TypeScript effect system
- **Drizzle ORM** (1.0.0-rc.3) - Database ORM for Cloudflare D1
- **Hono** - Web framework for API routes
- **SolidJS** - Reactive UI framework
- **TanStack Router** - File-based routing

## Workspace Structure

- `packages/core` - Shared database schema, types, and migrations
- `packages/twitter-scraper` - Twitter media scraper (standalone)
- `packages/www` - Main web application (SolidJS + Cloudflare Worker)

## Configuration Files

- `vite.config.ts` (root) - Shared lint (oxlint) and fmt (oxfmt) configuration
- `packages/www/vite.config.ts` - www-specific build/plugin config
- `tsconfig.json` (root) - Shared TypeScript config
- `packages/www/alchemy.run.ts` - Alchemy infrastructure definition

## Deployment

- **Alchemy** manages all Cloudflare resources (Worker, D1, R2, DO)
- Infrastructure defined in `packages/www/alchemy.run.ts`
- Deploy: `pnpm deploy` or `cd packages/www && vp exec alchemy deploy alchemy.run.ts`
- CRA (Cloudflare) credentials configured via `alchemy login`
