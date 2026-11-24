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
   5. The community icon, blurred (only when the community has a custom icon)
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

A scheduled job runs nightly and picks the next day's post from a curated list of public, safe-for-work communities. It skips NSFW and quarantined communities, posts whose title gives the answer away, and posts that are too long to read quickly. Moderators of the r/abbitHole community can preview upcoming puzzles and swap out a bad pick. Posts that are deleted or removed on Reddit are dropped from the game.

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

### Run it on Reddit

1. `npm run login` logs the Devvit CLI into your Reddit account (opens a browser).
2. `npm run deploy` runs `npm run check`, then uploads the app. The first upload creates a private playtest subreddit for you. Playtest subreddits must stay under 200 members.
3. `npm run dev` starts a playtest: it prints the playtest subreddit link and pushes code changes to it live as you save.
4. `npm run launch` uploads and submits the app for Reddit's review. Only do this when it's ready to go public.

### Workflow

- Every change goes on its own branch and lands through a pull request against `main`. Nothing is pushed straight to `main`.
- GitHub Actions (`.github/workflows/ci.yaml`) runs type check, lint, format check, tests and build on every pull request and every push to `main`.
- Dependabot (`.github/dependabot.yml`) opens pull requests for npm updates on Monday and Tuesday evenings and for GitHub Actions weekly. Actions are pinned to commit SHAs with the version in a comment.

### Layout

`src/client` is the React web view (`splash.html` inline in the feed, `game.html` expanded). `src/server` is the Hono server, with `reddit`, `redis` and `context` from `@devvit/web/server`. `src/shared` holds code used by both, including the game rules in `src/shared/game`. App config lives in `devvit.json`. See `PLAN.md` for the build plan and `CLAUDE.md` for coding rules.

## Credits

Scaffolded from Reddit's [Devvit React starter](https://github.com/reddit/devvit-template-react) (BSD-3-Clause).
