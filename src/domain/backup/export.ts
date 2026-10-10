import type { Activity } from "../activities/types";
import { validateActivity } from "../activities/validation";
import type { BodyCompositionMeasurement } from "../body/composition/types";
import { validateCompositionMeasurement } from "../body/composition/validation";
import { validateWeightMeasurement } from "../body/measurements";
import type { WeightMeasurement } from "../body/types";
import {
  isNonEmptyString,
  isTimestamp,
  type ValidationResult,
} from "../validation";
import type { WorkoutSession } from "../workouts/types";
import { validateWorkoutSession } from "../workouts/validation";
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  type BackupBuildResult,
  type BackupCollectionSource,
  type BackupCompleteness,
  type BackupFile,
  type BuildBackupInput,
  type CollectionExportReport,
} from "./types";

export class BackupExportError extends Error {
  constructor(message: string) {
    super(`Invalid backup export: ${message}`);
    this.name = "BackupExportError";
  }
}

/** Comparaison lexicographique par code unité UTF-16 : indépendante de la locale. */
const compareCodeUnits = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const SUFFIX_ID_PATTERN = /^[a-z]+_\d+(?:_(\d+))?$/;

/** 1 pour `prefix_T`, N pour `prefix_T_N`, 0 si le format est inconnu (_2 avant _10). */
function getIdSequence(id: string): number {
  const match = SUFFIX_ID_PATTERN.exec(id);
  if (match === null) {
    return 0;
  }
  const suffix = match[1];
  return suffix === undefined ? 1 : Number(suffix);
}

/** Sérialisation canonique : clés triées récursivement, pour comparer des contenus. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) =>
    compareCodeUnits(a, b),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`;
}

/* ---------- Comparateurs d'export (ordre croissant, total, sans locale) ---------- */

const compareSessions = (a: WorkoutSession, b: WorkoutSession): number =>
  a.createdAt - b.createdAt || compareCodeUnits(a.id, b.id);

const compareWeights = (a: WeightMeasurement, b: WeightMeasurement): number =>
  a.recordedAt - b.recordedAt ||
  getIdSequence(a.id) - getIdSequence(b.id) ||
  compareCodeUnits(a.id, b.id);

const compareCompositions = (
  a: BodyCompositionMeasurement,
  b: BodyCompositionMeasurement,
): number =>
  a.recordedAt - b.recordedAt ||
  getIdSequence(a.id) - getIdSequence(b.id) ||
  compareCodeUnits(a.id, b.id);

const compareActivities = (a: Activity, b: Activity): number =>
  a.startedAt - b.startedAt ||
  a.createdAt - b.createdAt ||
  getIdSequence(a.id) - getIdSequence(b.id) ||
  compareCodeUnits(a.id, b.id);

/* ---------- Préparation d'une collection ---------- */

interface Prepared<T> {
  readonly items: T[];
  readonly report: CollectionExportReport;
}

const statusOf = (
  readError: string | null,
  skipped: number | null,
  invalid: number,
  duplicates: number,
  conflicts: number,
): BackupCompleteness => {
  if (
    readError !== null ||
    (skipped !== null && skipped > 0) ||
    invalid > 0 ||
    duplicates > 0 ||
    conflicts > 0
  ) {
    return "incomplete";
  }
  return skipped === null ? "unverified" : "complete";
};

const isValidSafely = <T>(
  item: T,
  validate: (value: T) => ValidationResult,
): boolean => {
  try {
    return validate(item).isValid;
  } catch {
    return false;
  }
};

/**
 * Valide, regroupe par id (dans CETTE collection uniquement), puis :
 * - contenus identiques : une copie, les autres comptées comme doublons ;
 * - contenus différents : conflit, l'id est exclu (aucune version n'est choisie).
 * Le résultat ne dépend pas de l'ordre d'entrée.
 */
function prepareCollection<T extends { readonly id: string }>(
  source: BackupCollectionSource<T>,
  validate: (item: T) => ValidationResult,
  compare: (a: T, b: T) => number,
): Prepared<T> {
  const groups = new Map<string, T[]>();
  let invalid = 0;

  for (const item of source.items) {
    if (!isValidSafely(item, validate)) {
      invalid += 1;
      continue;
    }
    const group = groups.get(item.id);
    if (group === undefined) {
      groups.set(item.id, [item]);
    } else {
      group.push(item);
    }
  }

  const kept: T[] = [];
  const conflictingIds: string[] = [];
  let duplicates = 0;

  for (const [id, group] of groups) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }
    if (new Set(group.map((item) => canonicalize(item))).size > 1) {
      conflictingIds.push(id);
      continue;
    }
    duplicates += group.length - 1;

    /* Copies de contenu identique : on retient celle au JSON le plus petit (stable). */
    let chosen = first;
    let chosenText = JSON.stringify(first);
    for (const candidate of group) {
      const text = JSON.stringify(candidate);
      if (compareCodeUnits(text, chosenText) < 0) {
        chosen = candidate;
        chosenText = text;
      }
    }
    kept.push(chosen);
  }

  kept.sort(compare);
  conflictingIds.sort(compareCodeUnits);

  return {
    items: kept,
    report: {
      readCount: source.items.length,
      exportedCount: kept.length,
      invalidCount: invalid,
      duplicateCount: duplicates,
      conflictCount: conflictingIds.length,
      conflictingIds,
      skippedByRepository: source.skippedByRepository,
      readError: source.readError,
      status: statusOf(
        source.readError,
        source.skippedByRepository,
        invalid,
        duplicates,
        conflictingIds.length,
      ),
    },
  };
}

const sortStrings = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareCodeUnits);

function overallCompleteness(
  statuses: readonly BackupCompleteness[],
): BackupCompleteness {
  if (statuses.includes("incomplete")) {
    return "incomplete";
  }
  return statuses.includes("unverified") ? "unverified" : "complete";
}

/**
 * Construit la sauvegarde et son rapport. Fonction pure : l'horloge et la version
 * sont fournies par l'appelant, aucune donnée n'est modifiée ni lue ailleurs.
 * Aucune vérification de référence (template/exercice) : un historique n'est jamais
 * écarté parce que le catalogue a changé.
 *
 * Statut `complete` : uniquement si chaque collection a un `skippedByRepository`
 * MESURÉ égal à 0, sans erreur de lecture, entrée invalide, doublon ni conflit.
 */
export function buildBackup(input: BuildBackupInput): BackupBuildResult {
  if (!isTimestamp(input.exportedAt)) {
    throw new BackupExportError("exportedAt must be a valid timestamp");
  }
  if (!isNonEmptyString(input.appVersion)) {
    throw new BackupExportError("appVersion is required");
  }

  const sessions = prepareCollection(
    input.sources.workoutSessions,
    validateWorkoutSession,
    compareSessions,
  );
  const weights = prepareCollection(
    input.sources.weightMeasurements,
    validateWeightMeasurement,
    compareWeights,
  );
  const compositions = prepareCollection(
    input.sources.bodyCompositionMeasurements,
    validateCompositionMeasurement,
    compareCompositions,
  );
  const activities = prepareCollection(
    input.sources.activities,
    validateActivity,
    compareActivities,
  );

  const collections = {
    workoutSessions: sessions.report,
    weightMeasurements: weights.report,
    bodyCompositionMeasurements: compositions.report,
    activities: activities.report,
  };
  const completeness = overallCompleteness(
    Object.values(collections).map((report) => report.status),
  );

  return {
    file: {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: input.exportedAt,
      appVersion: input.appVersion,
      completeness,
      data: {
        workoutSessions: sessions.items,
        weightMeasurements: weights.items,
        bodyCompositionMeasurements: compositions.items,
        activities: activities.items,
      },
      counts: {
        workoutSessions: sessions.items.length,
        weightMeasurements: weights.items.length,
        bodyCompositionMeasurements: compositions.items.length,
        activities: activities.items.length,
      },
      catalogRefs: {
        templateIds: sortStrings(input.catalog.templateIds),
        exerciseIds: sortStrings(input.catalog.exerciseIds),
      },
    },
    report: { completeness, collections },
  };
}

/** JSON lisible et déterministe. */
export const serializeBackup = (file: BackupFile): string =>
  JSON.stringify(file, null, 2);
