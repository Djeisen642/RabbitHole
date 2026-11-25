import { useEffect, useRef } from 'react';
import { createBunny } from '../bunny/bunny';
import type { BunnyControls } from '../bunny/bunny';

const WIDTH = 300;

/**
 * The burrow scene with the live bunny. `onReady` gets its controls once it
 * is drawn, and null when it goes away. Pass a stable callback.
 */
export function BunnyStage({
  onReady,
}: {
  onReady: (controls: BunnyControls | null) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const bunny = createBunny(el, {
      width: WIDTH,
      holeX: 206,
      homeX: 92,
      awayX: WIDTH - 40,
    });
    onReady(bunny);
    void bunny.drawOn();
    return () => {
      bunny.destroy();
      onReady(null);
    };
  }, [onReady]);

  return (
    <div className="rh-stage" aria-hidden="true">
      <svg ref={svg} viewBox={`0 -36 ${WIDTH} 222`} />
    </div>
  );
}
