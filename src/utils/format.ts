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

/** 45 → « 45 min », 60 → « 1h », 90 → « 1h 30 ». */
export function formatActivityDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) {
    return `${total} min`;
  }
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${padTwo(rest)}`;
}

const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

const startOfDay = (ms: number): number => {
  const date = new Date(ms);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
};

/** « Aujourd'hui », « Hier », « 12 oct. » (avec l'année si ce n'est pas l'année courante). */
export function formatDayLabel(ms: number, now: number): string {
  const diffDays = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
  if (diffDays === 0) {
    return "Aujourd'hui";
  }
  if (diffDays === 1) {
    return "Hier";
  }
  const date = new Date(ms);
  const base = `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""}`;
  return date.getFullYear() === new Date(now).getFullYear()
    ? base
    : `${base} ${date.getFullYear()}`;
}
