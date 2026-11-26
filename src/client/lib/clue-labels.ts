import type { ClueKind } from '../../shared/game/rules';

/** How each clue is introduced, as a layer of the burrow. */
export const CLUE_LABELS: Record<ClueKind, string> = {
  topComment: 'The top comment',
  about: 'How it describes itself',
  jargon: 'Words the regulars use',
  stats: 'Members and birthday',
  icon: 'Its icon',
};
