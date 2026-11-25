import { useEffect, useRef } from 'react';
import { createBunny } from '../bunny/bunny';
import type { BunnyControls } from '../bunny/bunny';

const WIDTH = 300;
// The stage is drawn 300 wide, but the header only shows the part around the
// bunny and its hole, so it stays big enough to see in a small strip.
const VIEW_BOX = '28 -32 236 218';

/**
 * The burrow scene with the live bunny, as a button: a tap pets it. `onReady`
 * gets its controls once it is drawn, and null when it goes away; pass a
 * stable callback. Nothing is drawn until `ready`, so a round that was
 * already solved can start with the bunny down the hole (`inHole`) instead of
 * drawing it and then whisking it away.
 */
export function BunnyStage({
  onReady,
  ready,
  inHole,
}: {
  onReady: (controls: BunnyControls | null) => void;
  ready: boolean;
  inHole: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const controls = useRef<BunnyControls | null>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el || !ready) return;
    const bunny = createBunny(el, {
      width: WIDTH,
      holeX: 206,
      homeX: 92,
      awayX: WIDTH - 40,
      inHole,
    });
    controls.current = bunny;
    onReady(bunny);
    void bunny.drawOn();
    return () => {
      bunny.destroy();
      controls.current = null;
      onReady(null);
    };
  }, [onReady, ready, inHole]);

  return (
    <button
      type="button"
      className="rh-stage"
      aria-label="Pet the bunny"
      onClick={() => {
        void controls.current?.pet();
      }}
    >
      <svg ref={svg} viewBox={VIEW_BOX} aria-hidden="true" focusable="false" />
    </button>
  );
}
