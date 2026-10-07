import { padTwo } from "./formatTime";

export function formatDate(ms: number): string {
  const date = new Date(ms);
  return `${padTwo(date.getDate())}/${padTwo(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatShortDate(ms: number): string {
  const date = new Date(ms);
  return `${padTwo(date.getDate())}/${padTwo(date.getMonth() + 1)}`;
}

export function formatDateTime(ms: number): string {
  const date = new Date(ms);
  return `${formatDate(ms)} · ${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  return `${Math.floor(totalMinutes / 60)} h ${padTwo(totalMinutes % 60)}`;
}

export function formatKg(kg: number | null): string {
  return kg === null
    ? "Non renseigné"
    : `${kg.toFixed(1).replace(".", ",")} kg`;
}
