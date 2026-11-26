# Ideas we're going with

Captured from the Nov 23 and 24 brainstorms. `PLAN.md` turns these into a schedule; this is the idea bank.

## The concept

Rabbit Hole, written r/abbit_hole. Each day, guess which subreddit a real post came from. The goal is to help people get acquainted with communities and make it easier to jump into one. It sits in the same family as LinkedIn's Pinpoint, but the content is real communities, which makes it its own thing.

## The round

- One real post per day with the subreddit hidden.
- Wrong guesses reveal escalating clues that show the community's personality rather than trivia:
  1. An insider-y top comment
  2. One of the sub's rules (the "no posting your own cat" kind)
  3. A word cloud of its jargon
  4. Member count and founding year
  5. Its icon, blurred, only when the sub has a custom icon (otherwise the round has four clues)
- One guess on the post alone, then one after each clue.
- Guesses autocomplete against a hidden pool of possible answers; the pool is never shown as a list.
- After solving: open the community to join it.
- After the round: a chart of the most common wrong guesses (for example "41% thought it was r/cats"). Autocomplete means every wrong guess is a real sub, so this needs no moderation.
- "Regulars say hi": after you solve, show something welcoming from the community, like a pinned welcome or a friendly top comment, so joining feels like being invited in.

## Progress and scoring

- Score is clues used. No time component, no tiebreak, shared ranks.
- Streaks for consecutive days.
- Atlas: a map of communities you've solved that lights up over time.
- Optional daily results comment players can post, spoiler-free.
- Leaderboard in a Redis sorted set keyed by username.
- Open question: a penalty for wrong guesses beyond the clue they reveal. Not decided.

## Content

- A nightly scheduled job picks a top post of the past week from a curated list of a few hundred subreddits.
- Filters: no NSFW, posts short enough to read fast, titles that don't give away the sub.
- Mod queue so moderators can preview and swap bad picks.
- Hand-seed the first month of puzzles.

## Look and feel

- Handcrafted, one consistent theme. References Jason likes: his HAKHWA site, his JSON personal website, the Otra app.
- Mascot: a single continuous-line animated SVG bunny. Ears twitch, it thumps its foot when impatient or after a wrong guess, ears perk or droop, it dives into the hole on a solve.
- Each clue is digging one layer deeper; progress is a squiggly tunnel.
- Reddit orange plus soil brown, one distinctive display font.
