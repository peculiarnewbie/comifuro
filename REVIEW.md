# Comifuro Codebase Review & Action Plan

**Review Date:** 2026-04-21
**Scope:** Full-stack audit of the Comifuro art convention catalogue app (`packages/core`, `packages/www`, `packages/twitter-scraper`)
**Constraints:** UX is the #1 priority. Scraper speed is intentionally throttled to avoid Twitter rate limits. `buildPublicFeed` eager-loading the full dataset is acceptable for UX.

---

## Architecture Summary

- **Monorepo:** pnpm workspace with three packages: `core` (shared Drizzle ORM schema + DB ops), `www` (SolidJS SPA + Hono API in one Cloudflare Worker), `twitter-scraper` (Playwright/Stagehead + OpenCode LLM classification).
- **Database:** Cloudflare D1 (SQLite) via Drizzle ORM.
- **Storage:** Cloudflare R2 for images (WebP + thumbnails).
- **Frontend:** SolidJS + TanStack Router + Tailwind CSS v4 + Tinybase (local IndexedDB sync) + MiniSearch (client-side search).
- **Deployment:** Single Cloudflare Worker (`packages/www`) serving both the SPA (`ASSETS` binding) and API (`/api/*`).

**Data Flow:**
1. Scraper searches Twitter/X for event hashtags.
2. LLM classifies tweets (`isCatalogue`, `inferredFandoms`, `inferredBoothId`).
3. Images downloaded, converted to WebP, uploaded to R2 via API.
4. API stores tweets/media in D1.
5. SPA syncs incrementally to Tinybase/IndexedDB; MiniSearch indexes threads for instant filtering.
6. Users bookmark/ignore tweets (synced back to D1 via `/api/marks`).
7. Admin mode (`?admin=1`) allows curators to edit metadata, reroot threads, uncatalogue.

---

## 🔴 Critical Issues (Fix Immediately)

### Security

| # | Issue | Location | Details |
|---|---|---|---|
| 1 | **Custom timing-safe comparison leaks info** | `packages/www/src/api.ts:110-126` | `safeEqual` has an early return on empty strings and implements its own XOR loop instead of using the standard Web Crypto API (`crypto.subtle.timingSafeEqual`). Replace immediately. |
| 2 | **No rate limiting** | `packages/www/src/api.ts` | Anyone can hammer `/tweets/sync`, flood `/marks/sync`, or fill R2 via `/upload/:key`. Add per-IP limits. |
| 3 | **R2 upload accepts arbitrary keys** | `packages/www/src/api.ts:340-373` | With the scraper password, an attacker can overwrite any R2 object (including the public feed JSON). Must enforce path prefix validation (e.g. `^tweets/[a-zA-Z0-9]+/media/\d+\.webp$`). |
| 4 | **Migration 0017 silently demotes all admins** | `packages/core/migrations/0017_anonymous_accounts.sql:11-12` | Hardcodes `is_admin = 0` for all existing users during migration. **Only an issue if you had admins before this migration.** |
| 5 | **Migration 0017 not in journal** | `packages/core/migrations/meta/_journal.json` | Drizzle Kit may not recognize or apply `0017` correctly because it is not recorded in the journal. |

### Data Integrity

| # | Issue | Location | Details |
|---|---|---|---|
| 6 | **`rerootThread` has no transaction** | `packages/core/src/index.ts:507-571` | N+1 individual `UPDATE` statements inside a loop with no transaction wrapper. Partial failures corrupt thread ordering. Wrap in `db.transaction()` and batch updates (or use `UPDATE ... CASE`). |
| 7 | **`upsertScrapedTweet` not atomic** | `packages/core/src/index.ts:163-172` | Tweet inserted before media; if media upsert fails, you have orphaned tweets. Wrap both operations in a transaction. |
| 8 | **`userToTweet.tweetId` missing cascade delete** | `packages/core/src/schema.ts:128` | Deleting a tweet leaves orphaned mark rows in `user_to_tweet`. Add `.references(() => tweets.id, { onDelete: "cascade" })`. |

### Accessibility (UX Blocker)

| # | Issue | Location | Details |
|---|---|---|---|
| 9 | **All tweet images lack `alt` text** | `components/tweet.tsx:118,239` | Screen readers get zero context for catalogue images. **For an art catalogue, this is a fundamental failure.** See Alt Text Strategy below. |
| 10 | **Modal focus not trapped/restored** | `components/tweet.tsx:284-509` | Tab key escapes the lightbox into the background page. Closing the modal does not return focus to the trigger element. Use a focus trap utility. |
| 11 | **No `aria-live` regions** | `routes/index.tsx` | Sync failures, save confirmations, and search state changes are invisible to screen readers. Add `aria-live="polite"` and `aria-live="assertive"` regions. |

---

## 🟠 High-Priority Issues

### Maintainability

| # | Issue | Location | Details |
|---|---|---|---|
| 12 | **866-line API monolith** | `packages/www/src/api.ts` | All routes, schemas, auth, and business logic in one file. Split into `routes/sync.ts`, `routes/admin.ts`, `routes/scraper.ts`. |
| 13 | **1145-line and 1876-line route files** | `routes/index.tsx`, `routes/map.tsx` | Each file mixes data fetching, state management, business logic, and JSX for multiple UI modes. Split into focused components and utility modules. |
| 14 | **Duplicated helpers across packages** | `core/src/index.ts`, `www/src/api.ts`, `www/src/routes/index.tsx`, `www/src/components/tweet.tsx` | `maskToFallbackR2Keys`, `createImageUrl`, `formatTimestamp`, and `MEDIA_HOST` are copy-pasted. Extract shared helpers into `packages/core` or `packages/www/src/lib/`. |
| 15 | **Dead code shipped** | `components/main-market.tsx`, `components/Counter.tsx`, `.tokenami/` | `main-market.tsx` is never imported. `Counter.tsx` is scaffolding. Tokenami is fully configured but zero components use it — ships unused CSS. |
| 16 | **Inconsistent error handling** | `packages/www/src/api.ts` | Some routes wrap DB calls in `try/catch`; many admin routes don't. Standardize. |
| 17 | **Confidence columns missing from schema** | `packages/core/src/schema.ts` vs `migrations/0014_silent_bonuses.sql` | `inferred_fandoms_confidence` and `inferred_booth_id_confidence` exist in DB but not in Drizzle's schema. ORM will not know about them. |

### UX

| # | Issue | Location | Details |
|---|---|---|---|
| 18 | **Raw debug text exposed to users** | `routes/index.tsx:786-821` | "sync: idle (bootstrapping)" and cursor IDs shown verbatim. Replace with friendly status labels. |
| 19 | **Empty state is a dashed box** | `routes/index.tsx:856-864` | No skeleton screens, no branded empty state, no CTA. |
| 20 | **Search dropdown uses `onMouseDown` hack** | `routes/index.tsx:832-853` | `onBlur` fires before `onClick`, so suggestions use `onMouseDown` + `preventDefault()`. Breaks touch and keyboard navigation. Use proper focus management. |
| 21 | **No retry on sync failure** | `routes/index.tsx:816-820` | Sync errors display as red text with no action. Add a retry button. |
| 22 | **Map sidebar fixed at 360px** | `routes/map.tsx:1525` | Crushes the canvas on mobile. Add collapse behavior or responsive width. |
| 23 | **Scaffolding meta tags** | `index.html:10,14` | `<title>Create TanStack App - app-ts</title>` and generic description. |

### Performance (Non-Critical per Constraints)

| # | Issue | Location | Details |
|---|---|---|---|
| 24 | **No virtualization for tweet grid** | `routes/index.tsx:866-881` | `@tanstack/solid-virtual` is in `package.json` but unused. For very large catalogues, DOM node count grows linearly. |
| 25 | **Map floor plan built at module evaluation** | `routes/map.tsx:898` | `buildFloorPlan()` runs eagerly even if the user never visits `/map`. Move to route loader or lazy import. |
| 26 | **Search index blocks main thread** | `routes/index.tsx:463-523` | Rebuilds MiniSearch incrementally with `setTimeout` slices. A Web Worker is more appropriate for large indexes. |

---

## 🟡 Medium-Priority Issues

| # | Issue | Location | Details |
|---|---|---|---|
| 27 | **Three conflicting Tailwind palettes** | All routes | `gray`, `stone`, and `slate` used interchangeably. Visual inconsistency between pages. Standardize on one (recommend `slate`). |
| 28 | **CORS allows localhost in production** | `packages/www/src/api.ts:312-317` | `http://localhost:5173` and `3000` are in allowed origins with `credentials: true`. Remove in production builds. |
| 29 | **`resolveAccount` auto-creates users without validation** | `packages/www/src/api.ts:138-169` | Any `x-account-id` header instantly inserts into DB. No UUID validation or rate limiting. |
| 30 | **Unnecessary signal wrapping** | `routes/index.tsx:326,352,357` | `isAdminMode`, `accountId`, and `miniSearch` are wrapped in `createSignal` but never updated. Use constants or `createMemo`. |
| 31 | **Mutable module-level variables in component** | `routes/index.tsx:365-366` | `let tweetSession: TweetStoreSession | null` leaks between SolidJS lifecycles. Use a ref or properly encapsulate. |
| 32 | **No foreign keys on thread self-references** | `packages/core/src/schema.ts:56-58` | `rootTweetId` and `parentTweetId` are free-text with no referential integrity. |

---

## ✅ What's Working Well

Preserve these patterns:

- **Tinybase + Replicache-style sync** — Smart offline-first choice for spotty convention WiFi.
- **Client-side MiniSearch** — Right call for instant filtering without server round-trips.
- **SolidJS + TanStack Router** with `defaultPreload: 'intent'` — Solid foundation.
- **Sharp/WebP + R2 thumbnails** — Shows understanding of image delivery.
- **Drizzle ORM + D1** — Good stack for this scale and deployment target.

---

## Alt Text Strategy

Every image in an art catalogue is **content**, not decoration. `alt=""` is inappropriate.

**Recommended format:**

```
Art catalogue by @{user}: {truncatedTweetText} [Booth {boothId}] [{fandoms}]
```

**Examples:**

```tsx
// Root tweet image
alt={`Art catalogue by @${tweet.user}: ${truncate(tweet.text, 100)}${tweet.inferredBoothId ? ` — Booth ${tweet.inferredBoothId}` : ''}`}

// Follow-up in thread
alt={`Follow-up by @${tweet.user}: ${truncate(tweet.text, 100)}`}

// Modal/lightbox
alt={`Image ${index + 1} of ${total} by @${rootTweet.user}: ${truncate(rootTweet.text, 100)}`}
```

**Fallback for generic tweet text** (e.g. "CF21 catalogue thread 🧵"):
```tsx
alt={`CF21 catalogue image by @${tweet.user}${tweet.inferredBoothId ? `, booth ${tweet.inferredBoothId}` : ''}${tweet.inferredFandoms?.length ? ` — ${tweet.inferredFandoms.join(', ')}` : ''}`}
```

---

## Action Plan

### Phase 1: Critical Fixes (Security + A11y)

- [ ] **SEC-1:** Replace `safeEqual` with `crypto.subtle.timingSafeEqual` (`packages/www/src/api.ts:110-126`)
- [ ] **SEC-2:** Add basic rate limiting middleware to upload, sync, and marks endpoints (`packages/www/src/api.ts`)
- [ ] **SEC-3:** Enforce R2 key prefix validation in upload endpoint (`packages/www/src/api.ts:340-373`)
- [ ] **SEC-4:** Verify migration 0017 journal entry and admin demotion behavior (`packages/core/migrations/`)
- [ ] **DB-1:** Wrap `rerootThread` in `db.transaction()` and batch updates (`packages/core/src/index.ts:507-571`)
- [ ] **DB-2:** Wrap `upsertScrapedTweet` + `replaceTweetMedia` in a transaction (`packages/core/src/index.ts:163-172`)
- [ ] **DB-3:** Add `onDelete: "cascade"` to `userToTweet.tweetId` (`packages/core/src/schema.ts:128`)
- [ ] **A11Y-1:** Add descriptive `alt` text to all tweet images per Alt Text Strategy (`components/tweet.tsx:118,239,318`)
- [ ] **A11Y-2:** Implement focus trap + restoration in image modal (`components/tweet.tsx:284-509`)
- [ ] **A11Y-3:** Add `aria-live` regions for sync status and admin banners (`routes/index.tsx`)

### Phase 2: Structural Refactoring

- [ ] **MAINT-1:** Split `api.ts` into route modules (`routes/sync.ts`, `routes/admin.ts`, `routes/scraper.ts`)
- [ ] **MAINT-2:** Extract shared helpers (`createImageUrl`, `formatTimestamp`, `MEDIA_HOST`) into `packages/www/src/lib/`
- [ ] **MAINT-3:** Split `index.tsx` into `CataloguePage.tsx`, `AdminPanel.tsx`, `SearchBar.tsx`, `TweetGrid.tsx`
- [ ] **MAINT-4:** Split `map.tsx` into `lib/floor-plan.ts`, `lib/camera.ts`, `components/MapCanvas.tsx`
- [ ] **MAINT-5:** Remove dead code (`Counter.tsx`, `main-market.tsx`, unused Tokenami CSS)
- [ ] **MAINT-6:** Add confidence columns to Drizzle schema (`packages/core/src/schema.ts`)
- [ ] **MAINT-7:** Standardize error handling across all API routes

### Phase 3: UX Polish

- [ ] **UX-1:** Replace debug sync text with friendly status labels and add retry button
- [ ] **UX-2:** Add skeleton screens and proper empty/loading states
- [ ] **UX-3:** Fix search dropdown focus management (remove `onMouseDown` hack)
- [ ] **UX-4:** Make map sidebar collapsible on mobile
- [ ] **UX-5:** Fix `<title>` and meta description in `index.html`
- [ ] **UX-6:** Standardize Tailwind palette to `slate`

### Phase 4: Performance Hardening (Optional)

- [ ] **PERF-1:** Add hard `LIMIT` ceiling to `buildPublicFeed` as safety valve
- [ ] **PERF-2:** Implement virtualization for tweet grid (`@tanstack/solid-virtual`)
- [ ] **PERF-3:** Move `buildFloorPlan()` from module evaluation to route loader
- [ ] **PERF-4:** Offload MiniSearch rebuild to Web Worker

---

## Notes

- **Scraper performance is intentionally not optimized** to avoid Twitter/X rate limits. Sequential image processing is an acceptable throttle.
- **`buildPublicFeed` eager-loading is acceptable** for UX, as the full dataset is needed for the client-side search index. Consider a hard ceiling as a safety valve only.
- **Migration 0017** was created manually. Ensure Drizzle Kit picks it up by updating the journal, and confirm the admin demotion is intentional (safe if this is a fresh deploy or single-admin setup).
