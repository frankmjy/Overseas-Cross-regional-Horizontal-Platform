export function nextPollDelay({ hasData, refreshing = false, pending = false, initialAttempts = 0, failures = 0 }) {
  if (failures >= 3) return null;
  if (refreshing || pending || !hasData && initialAttempts < 15) return 2000;
  return null;
}
