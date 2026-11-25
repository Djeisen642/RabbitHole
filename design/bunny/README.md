# Bunny mascot

The r/abbitHole bunny: one continuous SVG line, eye included (the eye is a curl of the same line), posed by a few numbers and redrawn every frame.

- `bunny.js` builds the path and runs the moves: ear twitch (idle), foot thump (waiting or idle for 15 s), perk (close or right guess), droop (wrong guess), travel (moving across the stage) and dive (solved: a hop down the hole and back). No dependencies. Respects `prefers-reduced-motion`.
- `preview.html` and `preview.js` show every move with a button. ES modules need a server, so run `npx serve design/bunny` and open the URL it prints.
- `bunny.svg` is the rest pose as a static file, for listings and screenshots.

How it works: each anchor of the path is tagged as body, head, back ear, front ear or hind foot. A pose rotates the tagged points around their pivots (ear bases, neck, and the hind foot where it leaves the haunch) and the whole drawing is moved with one transform. Because only points move, the bunny stays a single unbroken stroke.

Moving around: to travel, the bunny does not hop, it unravels. `bunny.js` lays out one track made of the bunny's own outline, a wavy route across the stage and the outline of the bunny where it is going, then slides the line along it like a thread on rails. The line starts lying on the bunny, streams out along the route while its back end unpicks the drawing, and ends lying on the new bunny, its front end having drawn it in. The track is sampled from the curves once per move, so each frame is plain arithmetic and one `d` update. `travel(x)` sends it somewhere; it turns to face the hole.

The dive is a real hop instead, and the bunny keeps its shape: a quick crouch, a jump in a gravity arc toward the hole with a little stretch in the air, a tip head first as it comes down, and a fall straight in, body following, clipped by the hole so nothing shows below the ground. It shrinks a little on the way, as if hopping away from us, because the tall bunny is much wider than the hole. After a beat it pops back out nose first, hops home, lands and does a small hop to turn and face the hole again. `diveMotion()` gives the pose at any moment, so the page and rendered previews play the same motion.

When this moves into the game, port `bunny.js` to a typed module under `src/client/` and drive `play()` and `travel()` from game events.
