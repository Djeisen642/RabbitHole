# r/abbitHole

A daily puzzle for Reddit: read one real post, guess which community it came from.

Built on Reddit's Developer Platform (Devvit Web) for the Reddit Game of the Day Hackathon.

## How to play

1. Open today's r/abbitHole post. You see one real Reddit post (title, text or image) with the subreddit hidden.
2. Type a guess. Matching communities are suggested as you type, but the full list of possible answers stays hidden. `r/`, capitals and spaces don't matter.
3. Every wrong guess reveals a clue, each one more obvious than the last:
   1. A top comment from the original thread
   2. One of the community's rules
   3. A cloud of the community's in-jokes and jargon
   4. Member count and the year it was founded
   5. The community icon (only when the community has a custom icon)
4. You get one guess on the post alone, then one after each clue: six guesses, or five when there's no icon clue. Solve it and you can jump straight to the community to join it.

### Scoring

- Your score is the number of clues you needed. Solving on the post alone scores 0, the best possible.
- Time doesn't count, and there is no tiebreak: players with the same score share a rank. Unsolved rounds rank last.
- Solving on consecutive days builds your streak. Missing a day or failing a round resets it.
- Every community you solve is added to your Atlas.

Everyone gets the same puzzle each day, a round takes under two minutes, and a new one drops at midnight Eastern.

## Why

Reddit has hundreds of thousands of communities and most people only know a handful. r/abbitHole turns discovering a new one into a daily habit: you learn what a place is like from its own posts, comments and rules, then decide whether to join.

## How content is picked

A scheduled job runs nightly and picks the day's post from a curated list of public, safe-for-work communities. Before using a community it checks that it still exists, isn't NSFW or quarantined, has at least 50,000 members and has enough text posts; a community that fails is skipped for the night. Only text posts are used (no images, links or videos, which could give the answer away in ways a filter can't see), and posts are skipped if they are NSFW, too short or too long to read quickly, or name the community in the title or text. For country communities, posts that read like news or politics are skipped too. The jargon cloud never draws on NSFW, spoiler or removed posts. A community isn't used again for 60 days. The order communities are tried in is shuffled with a secret made when the app is installed, so the list of possible answers alone doesn't tell anyone tomorrow's. Moderators of the r/abbitHole community can pick today's puzzle on demand and check the whole list from the subreddit menu; one pool check runs at a time, and the check's sample posts leave out today's and tomorrow's answers.

Posts and top comments that are deleted or removed on Reddit are dropped from the game and from its database, and the day falls back to another post from the same community. If that community has nothing usable left, a new one is picked for the rest of the day. A round you already finished keeps its result, and a round still in play starts over on the new puzzle.

### What is kept

Each player's round and the day's scores are kept for 30 days, then deleted. Streaks are kept, since they run across days. Puzzles and pool check results are deleted a few days after their date.

## Setup

### Prerequisites

- Node 24 (the exact version is in `.nvmrc`; with nvm, run `nvm use`) and npm.
- A Reddit account, for the Devvit CLI.

### Install

```
git clone https://github.com/Djeisen642/RabbitHole.git
cd RabbitHole
npm install
```

`npm install` also turns on the pre-commit hook (husky). On every commit it lints the staged TypeScript files and formats staged files with Prettier, and blocks the commit if lint fails.

### Everyday commands

- `npm run check` runs everything CI runs except the build: type check, lint, format check and unit tests. Run it before opening a pull request.
- `npm run test:types` type checks.
- `npm run lint` lints with zero warnings allowed.
- `npm run format` fixes formatting; `npm run format:check` only reports it.
- `npm test` runs the unit tests once; `npm run test:watch` reruns them on save.
- `npm run build` builds the client and server into `dist/`.
- `npm run dev:mock` plays the game locally on made-up data (see below).

### Play it locally (mock mode)

You can play the whole daily loop without Reddit or a Devvit login:

```
npm run dev:mock
```

This builds the client, then starts a small local server at http://127.0.0.1:5174 (set `PORT` to change it). It only listens on your own machine, not the network. Open `/splash.html` for the feed card or `/game.html` for the game. The server mounts the same API handlers the app uses on Reddit, but with made-up posts and communities from `src/server/core/mock/fixtures.ts`, an in-memory database and a fake player called `mock_player`. Nothing is saved between runs. Re-run the command after changing code.

Handy extras while it runs:

- `curl -X POST 127.0.0.1:5174/mock/reset` clears your round and picks the puzzles again.
- `curl -X POST "127.0.0.1:5174/mock/user?name=alice"` switches to another fake player, so the wrong-guess chart has more than one person in it.
- `curl -X POST 127.0.0.1:5174/mock/check-pool`, then `curl 127.0.0.1:5174/api/pool-check`, runs the moderator pool check over the mock communities.

On Reddit the app reads real posts. Setting the environment variable `RABBITHOLE_SOURCE=mock` on the server swaps in the same made-up posts there too; everything else (Redis, the signed-in user) stays real.

### Run it on Reddit

1. `npm run login` logs the Devvit CLI into your Reddit account (opens a browser).
2. `npm run deploy` runs `npm run check`, then uploads the app. The first upload creates a private playtest subreddit for you. Playtest subreddits must stay under 200 members.
3. `npm run dev` starts a playtest: it prints the playtest subreddit link and pushes code changes to it live as you save.
4. `npm run launch` uploads and submits the app for Reddit's review. Only do this when it's ready to go public.

### Workflow

- Every change goes on its own branch and lands through a pull request against `main`. Nothing is pushed straight to `main`.
- GitHub Actions (`.github/workflows/ci.yaml`) runs type check, lint, format check, tests and build on every pull request and every push to `main`.
- Dependabot (`.github/dependabot.yml`) opens pull requests for npm updates on Monday and Tuesday evenings, once a release is a week old (Devvit packages excepted), and for GitHub Actions weekly. Actions are pinned to commit SHAs with the version in a comment.

### Layout

`src/client` is the React web view (`splash.html` inline in the feed, `game.html` expanded), with the bunny mascot in `src/client/bunny`. `src/server` is the Hono server: `routes/` holds thin handlers and `core/` the puzzle picker, content filters and per-player state. Handlers get Reddit and Redis through a small `Deps` object (`core/deps.ts`), so the same code runs on Devvit (`core/devvit-deps.ts`) and locally (`core/mock/`). `src/shared` holds code used by both: the game rules in `src/shared/game`, the API types in `src/shared/api.ts` and the hidden answer pool (`pool.ts` for the type and lookups, `pool-data.ts` for the list). App config lives in `devvit.json`. See `PLAN.md` for the build plan and `CLAUDE.md` for coding rules.

## Credits

Scaffolded from Reddit's [Devvit React starter](https://github.com/reddit/devvit-template-react) (BSD-3-Clause).
