# r/abbitHole

A daily puzzle for Reddit: read one real post, guess which community it came from.

Built on Reddit's Developer Platform (Devvit Web) for the Reddit Game of the Day Hackathon.

## How to play

1. Open today's r/abbitHole post. You see one real Reddit post (title, text or image) with the subreddit hidden.
2. Type a guess. The box autocompletes from the communities in today's pool.
3. Every wrong guess reveals a clue, each one more obvious than the last:
   1. A top comment from the original thread
   2. One of the community's rules
   3. A cloud of the community's in-jokes and jargon
   4. Member count and the year it was founded
   5. The community icon, blurred
4. You get five guesses. Solve it and you can jump straight to the community to join it.
5. Every solve adds that community to your Atlas, and solving on consecutive days builds your streak.

A game takes under two minutes, everyone gets the same puzzle each day, and a new one drops at midnight Eastern.

## Why

Reddit has hundreds of thousands of communities and most people only know a handful. r/abbitHole turns discovering a new one into a daily habit: you learn what a place is like from its own posts, comments and rules, then decide whether to join.

## How content is picked

A scheduled job runs nightly and picks the next day's post from a curated list of public, safe-for-work communities. It skips NSFW and quarantined communities, posts whose title gives the answer away, and posts that are too long to read quickly. Moderators of the r/abbitHole community can preview upcoming puzzles and swap out a bad pick. Posts that are deleted or removed on Reddit are dropped from the game.

## Development

Requires Node 22 or newer (CI uses Node 24).

```
npm install
npm run login      # log the Devvit CLI into your Reddit account
npm run dev        # playtest live in your test subreddit
```

Other commands:

- `npm run build` builds the client and server
- `npm run test:types` type checks
- `npm run lint` lints
- `npm run deploy` uploads a new version of the app
- `npm run launch` publishes the app for review

Layout: `src/client` is the React web view (`splash.html` inline in the feed, `game.html` expanded), `src/server` is the Hono server with access to `reddit`, `redis` and `context` from `@devvit/web/server`, and `src/shared` holds types shared by both. App config lives in `devvit.json`. See `PLAN.md` for the build plan.

## Credits

Scaffolded from Reddit's [Devvit React starter](https://github.com/reddit/devvit-template-react) (BSD-3-Clause).
