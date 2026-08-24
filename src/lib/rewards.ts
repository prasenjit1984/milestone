/**
 * Pure reward-math helpers, ported verbatim from the prototype's
 * src/lib/rewards.ts. No I/O here on purpose — safe to unit-test and safe to
 * import from either server or client code.
 */

export interface RewardSettingsLike {
  minutesPerPoint: number;
  pointsPerDollar: number;
  enabled: boolean;
}

export function pointsToDollars(points: number, settings: RewardSettingsLike): number {
  return points / settings.pointsPerDollar;
}

export function formatDollars(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Converts a chunk of newly-practiced minutes into points, given how many
 * "leftover" minutes the kid already had banked toward their next point.
 * Matches the prototype's behavior exactly, including while rewards are
 * disabled: leftover minutes keep accumulating (pointsEarned stays 0) rather
 * than being discarded, so nothing is lost if a parent re-enables rewards
 * later.
 */
export function minutesToPoints(
  leftoverMinutes: number,
  newMinutes: number,
  settings: RewardSettingsLike
): { pointsEarned: number; leftoverMinutes: number } {
  const total = leftoverMinutes + newMinutes;
  if (!settings.enabled) return { pointsEarned: 0, leftoverMinutes: total };
  const pointsEarned = Math.floor(total / settings.minutesPerPoint);
  const leftover = total - pointsEarned * settings.minutesPerPoint;
  return { pointsEarned, leftoverMinutes: leftover };
}
