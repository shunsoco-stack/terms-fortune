# Project rules

- All fortune clauses must be newly written, original parodies. Never copy real service terms.
- Keep both disclaimers visible: 「法的効力はありません」「法律相談ではありません」.
- Day boundaries use Asia/Tokyo. Preserve the v1 date mapping and keep sample results separate from actual daily history and analytics.
- Store only dates and display preferences locally. Never upload local history or share-card images.
- Keep runtime fortune generation independent of external APIs. Vercel Analytics is the only analytics integration.
- Run lint, typecheck, tests, secret-scan, and build before publishing. Never commit .env files, .vercel, caches, or credentials.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
