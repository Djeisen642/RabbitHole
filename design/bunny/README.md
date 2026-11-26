# Bunny mascot

The r/abbit_hole bunny: one continuous SVG line, eye included (the eye is a curl of the same line), posed by a few numbers and redrawn every frame.

- `bunny.js` builds the path and runs the moves: ear twitch (idle), ear scratch (idle, now and then), foot thump (waiting or idle for 15 s), perk (close or right guess, or a tap), droop (wrong guess), travel (moving across the stage), dive (solved; it stays down the hole) and climb (back out). No dependencies. Respects `prefers-reduced-motion`.
- `preview.html` and `preview.js` show every move with a button. ES modules need a server, so run `npx serve design/bunny` and open the URL it prints.
- `bunny.svg` is the rest pose as a static file, for listings and screenshots.

How it works: each anchor of the path is tagged as body, head, back ear, front ear or hind foot. A pose rotates the tagged points around their pivots (ear bases, neck, and the hind foot where it leaves the haunch) and the whole drawing is moved with one transform. Because only points move, the bunny stays a single unbroken stroke.

Moving around: the bunny never hops, it unravels. `bunny.js` lays out one track made of the bunny's own outline, a wavy route across the stage and the outline of the bunny where it is going, then slides the line along it like a thread on rails. The line starts lying on the bunny, streams out along the route while its back end unpicks the drawing, and ends lying on the new bunny, its front end having drawn it in. The dive uses the same idea, quickly: the line pours over into the hole in under a second. After a beat the bunny's head rises slowly out of the hole (the same line, posed with its neck stretched and clipped by the hole so only the head and ears show): ear tips first, then the eyes, a wary pause, then the rest of the head. It flicks an ear, looks one way and back, and ducks, and it stays down the hole: idle moves stop there. `climb` sends the line back out quickly to wind into the bunny at home. The dive takes about 2.9 s. The track is sampled from the curves once per move, so each frame is plain arithmetic and one `d` update. `travel(x)` sends it somewhere; it turns to face the hole.

Ear scratch: the hind foot swings up from its hinge to the base of the back ear, flipping over on the way so the line runs up the front of the raised leg and down behind it without crossing itself. It rakes four times while the ear bobs, puts the foot down and flicks the ear. It plays on about one idle beat in six.

Petting: `pet()` is a tap. Out of the hole it perks up; down the hole the head peeks out slowly, flicks an ear and ducks back. A tap mid-move does nothing, and after each pet there is a 4 s cooldown (`PET_COOLDOWN_MS`) so repeated taps can't spam it. With reduced motion a pet fades to the pose and back. `createBunny(svg, { inHole: true })` starts it already down the hole, for a round solved earlier, and `hide()` puts it there at once with no dive.

When this moves into the game, port `bunny.js` to a typed module under `src/client/` and drive `play()` and `travel()` from game events.
