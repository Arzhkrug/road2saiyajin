export const padTwo = (value: number): string => String(value).padStart(2, "0");

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${padTwo(minutes)}:${padTwo(seconds)}`;
}
