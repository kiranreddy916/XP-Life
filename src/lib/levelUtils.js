// Utility functions to compute levels and level thresholds from total XP
export const getLevelThreshold = (level) => {
  if (!level || level < 10) return 100;
  if (level < 30) return 150;
  if (level < 50) return 200;
  if (level < 70) return 250;
  return 300;
};

export const computeLevelAndXp = (totalXp = 0) => {
  let xpRemaining = Math.max(0, Number(totalXp) || 0);
  let level = 1;

  while (true) {
    const threshold = getLevelThreshold(level);
    if (xpRemaining >= threshold) {
      xpRemaining -= threshold;
      level++;
    } else {
      return { level, xp: xpRemaining, threshold };
    }
  }
};

export const getProfileLevelAndXp = (profile) => {
  if (!profile) return { level: 1, xp: 0, threshold: 100 };
  if (profile.total_xp !== undefined && profile.total_xp !== null && profile.total_xp > 0) {
    return computeLevelAndXp(profile.total_xp);
  }
  const level = profile.level || 1;
  const xp = profile.xp || 0;
  const threshold = getLevelThreshold(level);
  return { level, xp, threshold };
};
