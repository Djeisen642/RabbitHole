/**
 * The two places a player shows up as themselves: the user flair their
 * streak earns in the game's community, and their snoovatar on the result.
 * Both are best effort; a failure never costs the player their round.
 *
 * Redis: `avatar:{userId}` string, the snoovatar's link ('' for none),
 * kept a day so a reload doesn't ask Reddit again.
 */
import { streakFlair } from '../../shared/game/rules';
import type { Streak } from '../../shared/game/rules';
import type { Deps, User } from './deps';

const AVATAR_SECONDS = 86_400;
const avatarKey = (userId: string): string => `avatar:${userId}`;

/** Set the player's flair to their streak after a round of today's puzzle. */
export async function giveStreakFlair(
  deps: Deps,
  user: User,
  streak: Streak
): Promise<void> {
  const text = streakFlair(streak);
  if (text === null) return;
  try {
    await deps.setFlair(user.username, text);
  } catch (error) {
    deps.log(`flair for u/${user.username} failed: ${String(error)}`);
  }
}

/** The player's snoovatar, or null when they have none or it can't be read. */
export async function playerAvatar(
  deps: Deps,
  user: User
): Promise<string | null> {
  const key = avatarKey(user.id);
  const saved = await deps.store.get(key);
  if (saved !== undefined) return saved === '' ? null : saved;
  try {
    const url = await deps.avatarUrl(user.username);
    const safe = url?.startsWith('https://') ? url : null;
    await deps.store.set(key, safe ?? '', {
      expiration: new Date(deps.now().getTime() + AVATAR_SECONDS * 1000),
    });
    return safe;
  } catch (error) {
    deps.log(`avatar for u/${user.username} failed: ${String(error)}`);
    return null;
  }
}
