import type { Activity } from "../activities/types";
import { validateActivity } from "../activities/validation";
import type { BodyCompositionMeasurement } from "../body/composition/types";
import { validateCompositionMeasurement } from "../body/composition/validation";
import { validateWeightMeasurement } from "../body/measurements";
import type { WeightMeasurement } from "../body/types";
import {
  isNonEmptyString,
  isOneOf,
  isTimestamp,
  type ValidationResult,
} from "../validation";
import type { EpochMs, WorkoutSession } from "../workouts/types";
import { validateWorkoutSession } from "../workouts/validation";
import { canonicalize } from "./canonical";
import {
  BACKUP_COLLECTIONS,
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  type BackupCatalogRefs,
  type BackupCollection,
  type BackupCompleteness,
  type BackupCounts,
  type BackupData,
} from "./types";

/* ---------- Types de résultat ---------- */

export type BackupIssueCode =
  | "empty_input"
  | "invalid_json"
  | "not_an_object"
  | "unknown_format"
  | "invalid_schema_version"
  | "unsupported_schema_version"
  | "missing_field"
  | "invalid_field"
  | "invalid_collection"
  | "count_mismatch"
  | "invalid_entry"
  | "duplicate_id"
  | "conflicting_id";

export interface BackupIssue {
  readonly code: BackupIssueCode;
  /** Chemin dans le fichier, ex. `data.weightMeasurements[2]` ou `counts.activities`. */
  readonly path: string;
  readonly message: string;
  readonly collection: BackupCollection | null;
  readonly index: number | null;
  readonly id: string | null;
}

export interface ParsedCollectionReport {
  /** Compteur déclaré dans le fichier. */
  readonly declaredCount: number;
  /** Entrées réellement présentes dans le tableau. */
  readonly receivedCount: number;
  /** Entrées valides, uniques et sans conflit : celles de `backup.data`. */
  readonly acceptedCount: number;
  readonly invalidCount: number;
  /** Copies EN TROP d'un même id au contenu identique (une copie est acceptée). */
  readonly duplicateCount: number;
  /** Nombre d'ids portés par des contenus différents : exclus. */
  readonly conflictCount: number;
  readonly conflictingIds: readonly string[];
}

export interface ParsedBackupReport {
  /** Ce que le fichier affirme : une simple déclaration, jamais une preuve. */
  readonly declaredCompleteness: BackupCompleteness;
  /** Dégradée en `incomplete` dès qu'une anomalie d'entrée est détectée. */
  readonly effectiveCompleteness: BackupCompleteness;
  readonly hasAnomalies: boolean;
  readonly collections: Readonly<
    Record<BackupCollection, ParsedCollectionReport>
  >;
  readonly issues: readonly BackupIssue[];
}

/** Sauvegarde dont l'enveloppe est valide et dont `data` ne contient que des entrées acceptées. */
export interface ValidatedBackup {
  readonly format: typeof BACKUP_FORMAT;
  readonly schemaVersion: number;
  readonly exportedAt: EpochMs;
  readonly appVersion: string;
  readonly declaredCompleteness: BackupCompleteness;
  readonly effectiveCompleteness: BackupCompleteness;
  readonly data: BackupData;
  /** Compteurs déclarés (égaux au nombre d'entrées reçues, sinon l'analyse aurait échoué). */
  readonly declaredCounts: BackupCounts;
  readonly catalogRefs: BackupCatalogRefs;
}

export type ParseBackupResult =
  | {
      readonly ok: true;
      readonly backup: ValidatedBackup;
      readonly report: ParsedBackupReport;
    }
  | { readonly ok: false; readonly errors: readonly BackupIssue[] };

/* ---------- Utilitaires ---------- */

const COMPLETENESS_VALUES = ["complete", "incomplete", "unverified"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compareCodeUnits = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

interface IssueLocation {
  readonly collection?: BackupCollection;
  readonly index?: number;
  readonly id?: string | null;
}

const issue = (
  code: BackupIssueCode,
  path: string,
  message: string,
  where: IssueLocation = {},
): BackupIssue => ({
  code,
  path,
  message,
  collection: where.collection ?? null,
  index: where.index ?? null,
  id: where.id ?? null,
});

const failure = (...errors: BackupIssue[]): ParseBackupResult => ({
  ok: false,
  errors,
});

const missingOrInvalid = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  expectation: string,
): BackupIssue =>
  record[key] === undefined
    ? issue("missing_field", path, `${path} is required`)
    : issue("invalid_field", path, `${path} must be ${expectation}`);

function readRecord(
  parent: Record<string, unknown>,
  key: string,
  errors: BackupIssue[],
): Record<string, unknown> | null {
  const value = parent[key];
  if (isRecord(value)) {
    return value;
  }
  errors.push(missingOrInvalid(parent, key, key, "an object"));
  return null;
}

function readCollection(
  data: Record<string, unknown>,
  collection: BackupCollection,
  errors: BackupIssue[],
): readonly unknown[] | null {
  const path = `data.${collection}`;
  const value = data[collection];
  if (value === undefined) {
    errors.push(
      issue("missing_field", path, `${path} is required`, { collection }),
    );
    return null;
  }
  if (!Array.isArray(value)) {
    errors.push(
      issue("invalid_collection", path, `${path} must be an array`, {
        collection,
      }),
    );
    return null;
  }
  const list: readonly unknown[] = value;
  return list;
}

function readCount(
  counts: Record<string, unknown>,
  collection: BackupCollection,
  errors: BackupIssue[],
): number | null {
  const path = `counts.${collection}`;
  const value = counts[collection];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  errors.push({
    ...missingOrInvalid(counts, collection, path, "a non-negative integer"),
    collection,
  });
  return null;
}

function readStringList(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  errors: BackupIssue[],
): string[] | null {
  const value = parent[key];
  if (!Array.isArray(value)) {
    errors.push(
      missingOrInvalid(parent, key, path, "an array of non-empty strings"),
    );
    return null;
  }
  const list: readonly unknown[] = value;
  const result: string[] = [];
  for (const item of list) {
    if (typeof item !== "string" || item === "") {
      errors.push(
        issue(
          "invalid_field",
          path,
          `${path} must contain only non-empty strings`,
        ),
      );
      return null;
    }
    result.push(item);
  }
  return result;
}

/* ---------- Traitement d'une collection ---------- */

interface Processed<T> {
  readonly accepted: T[];
  readonly report: ParsedCollectionReport;
  readonly issues: BackupIssue[];
}

function validationReasons<T>(
  item: T,
  validate: (value: T) => ValidationResult,
): string[] {
  try {
    const result = validate(item);
    return result.isValid ? [] : [...result.errors];
  } catch {
    return ["entry structure rejected by the validator"];
  }
}

/**
 * Valide chaque entrée avec le validateur du domaine, puis regroupe par id (dans CETTE
 * collection uniquement) : copies identiques = une copie + doublons signalés ;
 * contenus différents = conflit, l'id est exclu. Aucune version n'est choisie.
 */
function processCollection<T extends { readonly id: string }>(
  collection: BackupCollection,
  raw: readonly unknown[],
  declaredCount: number,
  validate: (item: T) => ValidationResult,
): Processed<T> {
  const issues: BackupIssue[] = [];
  const groups = new Map<string, { index: number; item: T }[]>();
  let invalid = 0;

  raw.forEach((value, index) => {
    const path = `data.${collection}[${index}]`;
    if (!isRecord(value)) {
      invalid += 1;
      issues.push(
        issue("invalid_entry", path, `${path} must be an object`, {
          collection,
          index,
        }),
      );
      return;
    }
    const rawId = value.id;
    const id = typeof rawId === "string" && rawId !== "" ? rawId : null;
    const candidate: unknown = value;
    const item = candidate as T;
    const reasons = validationReasons(item, validate);
    if (id === null && reasons.length === 0) {
      reasons.push("id is required");
    }
    if (reasons.length > 0 || id === null) {
      invalid += 1;
      issues.push(
        issue("invalid_entry", path, `${path}: ${reasons.join("; ")}`, {
          collection,
          index,
          id,
        }),
      );
      return;
    }
    const group = groups.get(id);
    if (group === undefined) {
      groups.set(id, [{ index, item }]);
    } else {
      group.push({ index, item });
    }
  });

  const accepted: T[] = [];
  const conflictingIds: string[] = [];
  let duplicates = 0;

  for (const [id, group] of groups) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }
    if (new Set(group.map((entry) => canonicalize(entry.item))).size > 1) {
      conflictingIds.push(id);
      const where = group.map((entry) => entry.index).join(", ");
      issues.push(
        issue(
          "conflicting_id",
          `data.${collection}[${first.index}]`,
          `id "${id}" appears with different contents at indexes ${where}: all versions excluded`,
          { collection, index: first.index, id },
        ),
      );
      continue;
    }
    accepted.push(first.item);
    for (const extra of group.slice(1)) {
      duplicates += 1;
      issues.push(
        issue(
          "duplicate_id",
          `data.${collection}[${extra.index}]`,
          `id "${id}" is an identical copy of the entry at index ${first.index}`,
          { collection, index: extra.index, id },
        ),
      );
    }
  }

  issues.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  conflictingIds.sort(compareCodeUnits);

  return {
    accepted,
    issues,
    report: {
      declaredCount,
      receivedCount: raw.length,
      acceptedCount: accepted.length,
      invalidCount: invalid,
      duplicateCount: duplicates,
      conflictCount: conflictingIds.length,
      conflictingIds,
    },
  };
}

/* ---------- API publique ---------- */

/**
 * Lit, parse et valide une sauvegarde JSON. Fonction pure : aucune écriture, aucun
 * effet de bord, aucune référence au catalogue courant.
 */
export function parseBackup(text: string): ParseBackupResult {
  if (text.trim() === "") {
    return failure(issue("empty_input", "", "The backup text is empty"));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown parsing error";
    return failure(
      issue("invalid_json", "", `The backup is not valid JSON: ${detail}`),
    );
  }

  if (!isRecord(parsed)) {
    return failure(
      issue("not_an_object", "", "The backup must be a JSON object"),
    );
  }
  if (parsed.format !== BACKUP_FORMAT) {
    return failure(
      issue("unknown_format", "format", `format must be "${BACKUP_FORMAT}"`),
    );
  }

  const version = parsed.schemaVersion;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return failure(
      issue(
        "invalid_schema_version",
        "schemaVersion",
        "schemaVersion must be an integer >= 1",
      ),
    );
  }
  if (version !== BACKUP_SCHEMA_VERSION) {
    return failure(
      issue(
        "unsupported_schema_version",
        "schemaVersion",
        `schemaVersion ${version} is not supported (supported: ${BACKUP_SCHEMA_VERSION}); no automatic conversion is attempted`,
      ),
    );
  }

  const errors: BackupIssue[] = [];

  const exportedAtRaw = parsed.exportedAt;
  const exportedAt =
    typeof exportedAtRaw === "number" && isTimestamp(exportedAtRaw)
      ? exportedAtRaw
      : null;
  if (exportedAt === null) {
    errors.push(
      missingOrInvalid(
        parsed,
        "exportedAt",
        "exportedAt",
        "a non-negative integer timestamp",
      ),
    );
  }

  const appVersionRaw = parsed.appVersion;
  const appVersion =
    typeof appVersionRaw === "string" && isNonEmptyString(appVersionRaw)
      ? appVersionRaw
      : null;
  if (appVersion === null) {
    errors.push(
      missingOrInvalid(
        parsed,
        "appVersion",
        "appVersion",
        "a non-empty string",
      ),
    );
  }

  const completenessRaw = parsed.completeness;
  const declaredCompleteness = isOneOf(COMPLETENESS_VALUES, completenessRaw)
    ? completenessRaw
    : null;
  if (declaredCompleteness === null) {
    errors.push(
      missingOrInvalid(
        parsed,
        "completeness",
        "completeness",
        "complete, incomplete or unverified",
      ),
    );
  }

  const dataRecord = readRecord(parsed, "data", errors);
  const sessionsRaw =
    dataRecord === null
      ? null
      : readCollection(dataRecord, "workoutSessions", errors);
  const weightsRaw =
    dataRecord === null
      ? null
      : readCollection(dataRecord, "weightMeasurements", errors);
  const compositionsRaw =
    dataRecord === null
      ? null
      : readCollection(dataRecord, "bodyCompositionMeasurements", errors);
  const activitiesRaw =
    dataRecord === null
      ? null
      : readCollection(dataRecord, "activities", errors);

  const countsRecord = readRecord(parsed, "counts", errors);
  const sessionsCount =
    countsRecord === null
      ? null
      : readCount(countsRecord, "workoutSessions", errors);
  const weightsCount =
    countsRecord === null
      ? null
      : readCount(countsRecord, "weightMeasurements", errors);
  const compositionsCount =
    countsRecord === null
      ? null
      : readCount(countsRecord, "bodyCompositionMeasurements", errors);
  const activitiesCount =
    countsRecord === null
      ? null
      : readCount(countsRecord, "activities", errors);

  const refsRecord = readRecord(parsed, "catalogRefs", errors);
  const templateIds =
    refsRecord === null
      ? null
      : readStringList(
          refsRecord,
          "templateIds",
          "catalogRefs.templateIds",
          errors,
        );
  const exerciseIds =
    refsRecord === null
      ? null
      : readStringList(
          refsRecord,
          "exerciseIds",
          "catalogRefs.exerciseIds",
          errors,
        );

  if (
    errors.length > 0 ||
    exportedAt === null ||
    appVersion === null ||
    declaredCompleteness === null ||
    sessionsRaw === null ||
    weightsRaw === null ||
    compositionsRaw === null ||
    activitiesRaw === null ||
    sessionsCount === null ||
    weightsCount === null ||
    compositionsCount === null ||
    activitiesCount === null ||
    templateIds === null ||
    exerciseIds === null
  ) {
    return failure(...errors);
  }

  const mismatches: BackupIssue[] = [];
  const checkCount = (
    collection: BackupCollection,
    received: number,
    declared: number,
  ): void => {
    if (received !== declared) {
      mismatches.push(
        issue(
          "count_mismatch",
          `counts.${collection}`,
          `counts.${collection} declares ${declared} but the file contains ${received}`,
          { collection },
        ),
      );
    }
  };
  checkCount("workoutSessions", sessionsRaw.length, sessionsCount);
  checkCount("weightMeasurements", weightsRaw.length, weightsCount);
  checkCount(
    "bodyCompositionMeasurements",
    compositionsRaw.length,
    compositionsCount,
  );
  checkCount("activities", activitiesRaw.length, activitiesCount);
  if (mismatches.length > 0) {
    return failure(...mismatches);
  }

  const sessions = processCollection<WorkoutSession>(
    "workoutSessions",
    sessionsRaw,
    sessionsCount,
    validateWorkoutSession,
  );
  const weights = processCollection<WeightMeasurement>(
    "weightMeasurements",
    weightsRaw,
    weightsCount,
    validateWeightMeasurement,
  );
  const compositions = processCollection<BodyCompositionMeasurement>(
    "bodyCompositionMeasurements",
    compositionsRaw,
    compositionsCount,
    validateCompositionMeasurement,
  );
  const activities = processCollection<Activity>(
    "activities",
    activitiesRaw,
    activitiesCount,
    validateActivity,
  );

  const collections = {
    workoutSessions: sessions.report,
    weightMeasurements: weights.report,
    bodyCompositionMeasurements: compositions.report,
    activities: activities.report,
  };
  const issues = [
    ...sessions.issues,
    ...weights.issues,
    ...compositions.issues,
    ...activities.issues,
  ];
  const hasAnomalies = BACKUP_COLLECTIONS.some((collection) => {
    const report = collections[collection];
    return (
      report.invalidCount + report.duplicateCount + report.conflictCount > 0
    );
  });
  /* Jamais améliorée : une anomalie dégrade la complétude, rien ne la relève. */
  const effectiveCompleteness: BackupCompleteness = hasAnomalies
    ? "incomplete"
    : declaredCompleteness;

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      schemaVersion: version,
      exportedAt,
      appVersion,
      declaredCompleteness,
      effectiveCompleteness,
      data: {
        workoutSessions: sessions.accepted,
        weightMeasurements: weights.accepted,
        bodyCompositionMeasurements: compositions.accepted,
        activities: activities.accepted,
      },
      declaredCounts: {
        workoutSessions: sessionsCount,
        weightMeasurements: weightsCount,
        bodyCompositionMeasurements: compositionsCount,
        activities: activitiesCount,
      },
      catalogRefs: { templateIds, exerciseIds },
    },
    report: {
      declaredCompleteness,
      effectiveCompleteness,
      hasAnomalies,
      collections,
      issues,
    },
  };
}
