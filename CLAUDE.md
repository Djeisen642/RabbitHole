# r/abbitHole: rules for working in this repo

A daily guess-the-subreddit puzzle built on Reddit's Developer Platform (Devvit Web) for the Reddit Game of the Day Hackathon. Deadline Tue Dec 8 2026, 6 PM PT. Read `README.md` for the game, `PLAN.md` for the build plan and `IDEAS.md` for the agreed ideas.

Do not read `BAD_IDEAS.md` unless someone asks about rejected ideas. It holds concepts and names we decided against, kept out of the way so they don't steer the work.

## Stack

- Client: React 19, Tailwind CSS 4, Vite. Runs in an iframe on reddit.com.
- Server: Hono on Devvit's serverless Node runtime. `reddit`, `redis`, `context` come from `@devvit/web/server`.
- Tests: Vitest. Lint: ESLint with typescript-eslint `strictTypeChecked`. Format: Prettier. Pre-commit: husky + lint-staged.

## Commands

- `npm run check` runs type check, lint, format check and tests. It must pass before every commit and push; CI runs the same plus a build.
- `npm test` / `npm run test:watch` for unit tests.
- `npm run format` to fix formatting.
- `npm run build` builds client and server.
- `npm run dev` playtests on Reddit (needs `npm run login` first).
- Never run `npm run deploy`, `npm run launch`, `devvit upload` or `devvit publish` unless the owner asks: they publish to Reddit.

## Layout

- `src/shared/game/` pure game rules: guessing, clue order, scoring, ranking, streaks. No Devvit, React or I/O imports.
- `src/shared/api.ts` request and response types shared by client and server.
- `src/server/routes/` thin Hono handlers: validate input, call core functions, return JSON.
- `src/server/core/` server logic that talks to `reddit` and `redis`. Keep Reddit/Redis calls here, not in routes.
- `src/client/` React views. `splash.html` is the inline feed view (keep it light), `game.html` the expanded game.
- `devvit.json` app config: permissions, entrypoints, menu items, scheduler tasks, triggers. Every new `/internal/...` endpoint must be registered here.

## Coding rules

- Game logic lives in small pure functions in `src/shared/game`, separate from UI and from Devvit API calls. Every rule change there comes with a test.
- Scoring, clue order, ranking, streaks and content filters must have unit tests.
- TypeScript is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`, no non-null `!`, no `@ts-ignore`, no disabling lint rules inline without a comment saying why.
- Use `type`, not `interface`. Named exports only. Use `import type` for types.
- Don't cast to dodge the type checker. The one allowed cast is parsing JSON responses through `src/client/lib/http.ts`.
- Handle every promise (`await` or `void`). Server handlers catch errors and return a clear status; never leak stack traces to the client.
- Client: use `navigateTo` from `@devvit/web/client`, not `window.location`. Use `showToast`/`showForm`, not `alert`. No inline `<script>` in HTML.
- Redis supports strings, hashes, sorted sets, numbers, bitfields and transactions, not plain sets or lists. Use a sorted set for the leaderboard. Namespace keys like `puzzle:2026-12-01`, `user:{id}:streak`.
- Keep the splash bundle small; heavy code goes in the game entry.

## Game rules (source of truth: `src/shared/game/rules.ts`)

One puzzle per day, the same for everyone. One guess on the post alone, then one after each clue: top comment, a rule, jargon cloud, member count and founding year, and the blurred icon only if the sub has a custom icon. That makes six guesses with an icon, five without. Guesses autocomplete against a hidden pool of answers; never show the pool as a list. Score is clues used; time never counts, ties share a rank, unsolved ranks last. Consecutive solved days build a streak.

## Design rules

- It must look handcrafted. One consistent theme on every screen.
- Mascot: a single continuous-line bunny drawn as one SVG path. Ears twitch now and then; it thumps its hind foot when the player idles or guesses wrong; ears perk on a right guess and droop on a wrong one; it dives into the hole on a solve.
- Everything shares the line-drawn style: hand-drawn clue cards, a squiggly tunnel for progress, each clue reads as digging one layer deeper.
- Palette: Reddit orange and a soil brown on a light paper background. One distinctive display font plus a plain body font.
- No AI-looking UI: no purple gradients, glassy cards, default Inter, emoji-as-icons or stock Tailwind component look. Respect `prefers-reduced-motion`.

## Reddit platform rules the app must follow

From the Devvit Rules (developers.reddit.com/docs/devvit_rules) and Reddit's Developer Terms:

- Remove deleted content. When a post or comment is deleted on Reddit, the app must drop it, including from Redis. Delete triggers only fire for the subreddit the app is installed in, so store post and comment IDs and re-fetch them before serving a puzzle; skip anything `removed` or deleted.
- Safe content only. Skip NSFW and quarantined subreddits and NSFW or spoiler posts. Label or age-gate anything mature (we just don't show it).
- Minimal data. Store only what the game needs (username, scores, streaks, atlas). Never profile, track or surveil users, never sell or share Reddit data, and never use it to train models.
- Copying existing posts and comments into the app for display is allowed, under the Developer Terms. Show them as Reddit content, with the subreddit revealed after the round.
- Content we create (clue text, share comments) must follow the Reddit Rules. Posts or comments made for a user must be attributed to that user (`userGeneratedContent`), and only after they choose to post.
- Be transparent: the app name and description must say what it does. App review requires a plain-language README for non-developers with an overview and setup steps; keep `README.md` current.
- Using HTTP fetch, payments or LLMs requires our own terms of service and privacy policy. Avoid them unless planned for.
- Respect API limits: batch Reddit calls in the nightly job, cache results in Redis, never call the Reddit API per player per render.
- Subscribing users is only possible for the installed subreddit. For other communities, `navigateTo` their page.
