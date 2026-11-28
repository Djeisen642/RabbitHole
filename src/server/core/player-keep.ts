/**
 * Days a player's round, learner record and the day's scores are kept.
 * Long enough for a later leaderboard over recent days; after that only the
 * streak remains.
 */
export const PLAYER_KEEP_DAYS = 30;
export const PLAYER_KEEP_SECONDS = PLAYER_KEEP_DAYS * 86_400;
