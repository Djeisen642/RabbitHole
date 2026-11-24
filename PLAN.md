# Build plan (Nov 24 to Dec 8, 2026)

Hackathon deadline: Tue Dec 8, 6:00 PM PT (9:00 PM ET). Target submission: Mon Dec 7 evening, with Dec 8 as buffer.

Judging is 25% each: delightful UX, polish, Reddit-native feel, fresh daily content. Pre-existing code only counts if significantly updated after Nov 11; this repo starts fresh.

## What the platform gives us (verified Nov 24 against devvit-docs and @devvit/reddit 0.15.6)

- Cross-subreddit reads work. `reddit.getTopPosts({ subredditName, timeframe })`, `reddit.getHotPosts(...)`, `reddit.getComments({ postId })`, `reddit.getRules(subredditName)` and `reddit.getSubredditInfoByName(name)` (subscribersCount, createdAt, isNsfw, isQuarantined) all take any public subreddit. Icon comes from `reddit.getSubredditStyles(subredditId)`. Docs: capabilities/server/reddit-api.mdx ("Omitting `subredditName` searches `all`, even when your code runs in an installed-subreddit context").
- Scheduler: cron tasks in `devvit.json` hit `/internal/...` endpoints. Already wired: `daily-pick` at 05:00 UTC.
- Redis: strings, hashes, sorted sets, numbers, bitfields, transactions (no plain sets or lists). 100 MB per install until published, 5 GB after.
- Joining: the API can only subscribe a user to the subreddit the app is installed in (`subscribeToCurrentSubreddit`). For the solved community we use `navigateTo` its page, where the player taps Join. We can offer a real one-tap "follow r/abbitHole" for the daily habit.

## Scoring

Leaderboard ranks by how few clues (wrong guesses) a player needed: solving on the post alone beats solving after one clue, and so on, with unsolved last. Time is not part of the score and there is no tiebreak, so players with the same count share a rank.

## Compliance points to design in

- Devvit Rules require removing Reddit content that was deleted. Delete triggers only fire for the installed subreddit, so store post IDs and derived clues only, re-fetch the post when serving a puzzle, and drop it if `removed` or deleted.
- Filter NSFW and quarantined communities and NSFW posts. Keep the curated list to communities that are broadly welcoming.
- No user data beyond what's needed: username for streaks and Atlas, nothing else.

## Design direction

It should look handcrafted, not AI-made, with one consistent theme across every screen.

- Mascot: a fluid single-line-drawing bunny, drawn as one SVG path and animated. Ears twitch every so often. It thumps its hind foot impatiently when the player idles or guesses wrong, ears perk on a right guess and droop on a wrong one, and it dives into the hole on a solve.
- The whole UI shares that line-drawn style: hand-drawn clue cards, a squiggly tunnel as the progress bar, and each clue revealed as digging one layer deeper.
- Tight palette: Reddit orange plus a soil brown on a light paper background. One distinctive display font paired with a plain body font.
- Avoid the usual AI tells: purple gradients, glassy cards, default Inter, stock Tailwind components.

## Milestones

**1. Spike and setup (Nov 24 to 26).** Log in, playtest in a test subreddit, add a throwaway `/api/spike` endpoint that pulls a top post, a top comment, one rule, member count and icon from three outside subreddits. This proves the reads on the live runtime before anything else is built.

**2. Puzzle engine (Nov 26 to 29).** Curated list of about 150 communities in `src/shared/pool.ts` with display name and aliases. Nightly `daily-pick`: choose a community not used in 60 days, pick a top post from the past month that passes filters (SFW, not removed, title doesn't contain the sub name or obvious aliases, readable length, has a good top comment), build the clues (four, plus the blurred icon when the sub has a custom icon), store as `puzzle:YYYY-MM-DD` hash. Jargon cloud: frequent distinctive words from recent titles and comments versus a common-word list. Unit tests for filters and clue order.

**3. Game UI (Nov 29 to Dec 3).** Splash (inline feed view) showing today's post teaser and streak. Game view: the post card styled like a real Reddit post with the subreddit masked, guess box that autocompletes against the hidden answer pool (never shown as a list), clue reveal animation, win and loss screens, "Visit r/X" button, spoiler-free share text players can paste as a comment. Streak and Atlas stored per user in redis. Design pass for a distinct look (not default Tailwind components).

**4. Mod tools and content (Dec 3 to 5).** Moderator menu items: preview next 7 days, swap a day's pick, rerun the picker. Hand-seed and review 30 days of puzzles so launch content is known-good. Nightly post creation so each day has its own post.

**5. Polish and ship (Dec 5 to 7).** Playtest with friends and family, fix rough edges, accessibility and mobile checks, app listing copy and screenshots, `npm run deploy`, demo post live in the r/abbitHole subreddit, short demo video, Devpost write-up.

**Dec 8.** Buffer only. Submit by noon ET.

## Things only Jason can do

- Register for the hackathon on Devpost.
- `npm run login` with his Reddit account (developers.reddit.com).
- Run `npx devvit upload` once; Devvit creates a private playtest subreddit automatically (playtest subs must stay under 200 members). Later, create the public r/abbitHole community if the name is free.
- Upload and publish the app, and submit on Devpost.
