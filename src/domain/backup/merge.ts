import type { Activity } from "../activities/types";
import type { BodyCompositionMeasurement } from "../body/composition/types";
import type { WeightMeasurement } from "../body/types";
import type { EpochMs, WorkoutSession } from "../workouts/types";
import { canonicalize } from "./canonical";
import type { ParseBackupResult } from "./parse";
import {
  BACKUP_COLLECTIONS,
  type BackupCollection,
  type BackupCompleteness,
} from "./types";

/* ---------- Entrées ---------- */

/** Résultat réussi de `parseBackup` : seule entrée acceptée du plan. */
export type ParsedBackup = Extract<ParseBackupResult, { readonly ok: true }>;

/**
 * État de lecture d'une collection locale. Une erreur n'est jamais assimilée à une liste vide.
 * `skippedByRepository` : entrées ignorées par le repository à la lecture ;
 * `null` = non détectable (jamais `0` par défaut).
 */
export type LocalCollectionState<T> =
  | {
      readonly status: "ok";
      readonly items: readonly T[];
      readonly skippedByRepository: number | null;
    }
  | { readonly status: "error"; readonly message: string };

export interface LocalData {
  readonly workoutSessions: LocalCollectionState<WorkoutSession>;
  readonly weightMeasurements: LocalCollectionState<WeightMeasurement>;
  readonly bodyCompositionMeasurements: LocalCollectionState<BodyCompositionMeasurement>;
  readonly activities: LocalCollectionState<Activity>;
}

/* ---------- Sorties ---------- */

export type MergeReliability = "reliable" | "caution" | "blocked";

export type MergeWarningCode =
  | "backup_incomplete"
  | "backup_unverified"
  | "backup_anomalies"
  | "local_entries_skipped"
  | "local_skipped_unknown"
  | "local_duplicate_ids"
  | "local_conflicting_ids";

export interface MergeWarning {
  readonly code: MergeWarningCode;
  readonly collection: BackupCollection | null;
  readonly message: string;
}

export interface MergeBlocker {
  readonly code: "local_read_error";
  readonly collection: BackupCollection;
  readonly message: string;
}

/** Même id, contenus différents : la version locale est conservée, rien n'est écrasé. */
export interface MergeConflict<T> {
  readonly id: string;
  readonly local: T;
  readonly imported: T;
}

/** Nouvel id, mais contenu (hors id) identique à une entrée locale. Insérée, simplement signalée. */
export interface PossibleDuplicate {
  readonly importedId: string;
  readonly localId: string;
}

/**
 * Raisons pour lesquelles une collection locale ne peut pas être réécrite sans risque de perte.
 * Un repository réécrit tout son tableau : une entrée qu'il n'a pas pu lire disparaîtrait.
 */
export type RewriteBlockReason =
  | "local_read_error"
  | "local_entries_skipped"
  | "local_skipped_unknown";

export interface CollectionPersistence {
  /**
   * Vrai uniquement si la lecture locale a réussi ET si le nombre d'entrées ignorées
   * a été MESURÉ à 0. Indépendant du fait que le plan soit calculable.
   */
  readonly safeToRewrite: boolean;
  readonly reasons: readonly RewriteBlockReason[];
}

export interface CollectionMergePlan<T> {
  readonly collection: BackupCollection;
  readonly status: "ready" | "blocked";
  readonly blockReason: string | null;
  /** Entrées réellement retenues par la lecture de la sauvegarde (pas les compteurs du fichier). */
  readonly acceptedFromBackup: number;
  /** null si la lecture locale a échoué. */
  readonly localCount: number | null;
  readonly localSkippedByRepository: number | null;
  readonly insertions: readonly T[];
  readonly exactDuplicateIds: readonly string[];
  readonly conflicts: readonly MergeConflict<T>[];
  readonly possibleDuplicates: readonly PossibleDuplicate[];
  /** Entrées non classées car la collection est bloquée. */
  readonly unprocessedCount: number;
  /** Anomalies déjà détectées par `parseBackup` (entrées exclues avant le plan). */
  readonly backupInvalidCount: number;
  readonly backupDuplicateCount: number;
  readonly backupConflictCount: number;
  /** Ids locaux portés par plusieurs copies strictement identiques (triés par code unité). */
  readonly localDuplicateIds: readonly string[];
  /** Copies locales en trop de ces ids. */
  readonly localDuplicateCount: number;
  /** Ids locaux portés par des contenus différents (triés par code unité). Rien n'est modifié. */
  readonly localConflictingIds: readonly string[];
  readonly persistence: CollectionPersistence;
}

export interface MergeTotals {
  readonly insertions: number;
  readonly exactDuplicates: number;
  readonly conflicts: number;
  readonly possibleDuplicates: number;
  readonly unprocessed: number;
  /** Copies locales identiques en trop, toutes collections. */
  readonly localDuplicates: number;
  /** Ids locaux en contradiction, toutes collections. */
  readonly localConflictingIds: number;
}

export interface MergePersistenceSummary {
  /**
   * Vrai si au moins une insertion existe ET si chaque collection qui reçoit des
   * insertions est sûre à réécrire. Une collection non sûre SANS insertion n'est pas
   * écrite : elle ne bloque pas. À ne pas confondre avec `previewComplete`.
   */
  readonly canPersist: boolean;
  /** Collections qui recevraient des insertions, triées dans l'ordre de BACKUP_COLLECTIONS. */
  readonly collectionsToWrite: readonly BackupCollection[];
  /** Collections non sûres à réécrire, avec ou sans insertions. */
  readonly unsafeCollections: readonly BackupCollection[];
}

export interface MergePlan {
  readonly strategy: "merge";
  readonly reliability: MergeReliability;
  /** Vrai si toutes les collections locales ont pu être lues et classées (aucun blocage). */
  readonly previewComplete: boolean;
  readonly persistence: MergePersistenceSummary;
  readonly backup: {
    readonly exportedAt: EpochMs;
    readonly appVersion: string;
    readonly declaredCompleteness: BackupCompleteness;
    readonly effectiveCompleteness: BackupCompleteness;
    readonly hasAnomalies: boolean;
  };
  readonly warnings: readonly MergeWarning[];
  readonly blockers: readonly MergeBlocker[];
  readonly totals: MergeTotals;
  readonly collections: {
    readonly workoutSessions: CollectionMergePlan<WorkoutSession>;
    readonly weightMeasurements: CollectionMergePlan<WeightMeasurement>;
    readonly bodyCompositionMeasurements: CollectionMergePlan<BodyCompositionMeasurement>;
    readonly activities: CollectionMergePlan<Activity>;
  };
}

export interface MergedData {
  readonly workoutSessions: readonly WorkoutSession[];
  readonly weightMeasurements: readonly WeightMeasurement[];
  readonly bodyCompositionMeasurements: readonly BodyCompositionMeasurement[];
  readonly activities: readonly Activity[];
}

/* ---------- Utilitaires ---------- */

const compareCodeUnits = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const byId = (a: { readonly id: string }, b: { readonly id: string }): number =>
  compareCodeUnits(a.id, b.id);

/** Contenu sans l'id : sert uniquement à repérer des jumeaux probables. */
const contentKey = (item: { readonly id: string }): string =>
  canonicalize(
    Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id")),
  );

interface BackupIssueCounts {
  readonly invalid: number;
  readonly duplicate: number;
  readonly conflict: number;
}

interface LocalAnomalies {
  readonly duplicateIds: readonly string[];
  readonly duplicateCount: number;
  readonly conflictingIds: readonly string[];
}

const NO_ANOMALIES: LocalAnomalies = {
  duplicateIds: [],
  duplicateCount: 0,
  conflictingIds: [],
};

/** Détecte, sans rien modifier, les ids locaux portés par plusieurs entrées. */
function detectLocalAnomalies(
  groups: ReadonlyMap<string, readonly { readonly text: string }[]>,
): LocalAnomalies {
  const duplicateIds: string[] = [];
  const conflictingIds: string[] = [];
  let duplicateCount = 0;

  for (const [id, group] of groups) {
    if (group.length < 2) {
      continue;
    }
    if (new Set(group.map((entry) => entry.text)).size > 1) {
      conflictingIds.push(id);
    } else {
      duplicateIds.push(id);
      duplicateCount += group.length - 1;
    }
  }

  duplicateIds.sort(compareCodeUnits);
  conflictingIds.sort(compareCodeUnits);
  return { duplicateIds, duplicateCount, conflictingIds };
}

function persistenceOf<T>(
  local: LocalCollectionState<T>,
): CollectionPersistence {
  const reasons: RewriteBlockReason[] = [];
  if (local.status === "error") {
    reasons.push("local_read_error");
  } else if (local.skippedByRepository === null) {
    reasons.push("local_skipped_unknown");
  } else if (local.skippedByRepository > 0) {
    reasons.push("local_entries_skipped");
  }
  return { safeToRewrite: reasons.length === 0, reasons };
}

function blockedPlan<T>(
  collection: BackupCollection,
  accepted: number,
  message: string,
  issues: BackupIssueCounts,
  local: LocalCollectionState<T>,
): CollectionMergePlan<T> {
  return {
    collection,
    status: "blocked",
    blockReason: `Local ${collection} could not be read: ${message}`,
    acceptedFromBackup: accepted,
    localCount: null,
    localSkippedByRepository: null,
    insertions: [],
    exactDuplicateIds: [],
    conflicts: [],
    possibleDuplicates: [],
    unprocessedCount: accepted,
    backupInvalidCount: issues.invalid,
    backupDuplicateCount: issues.duplicate,
    backupConflictCount: issues.conflict,
    localDuplicateIds: NO_ANOMALIES.duplicateIds,
    localDuplicateCount: NO_ANOMALIES.duplicateCount,
    localConflictingIds: NO_ANOMALIES.conflictingIds,
    persistence: persistenceOf(local),
  };
}

/**
 * Classe chaque entrée acceptée de la sauvegarde par rapport au local, sur l'id exact :
 * insertion, doublon exact ou conflit. Contrat : `accepted` provient de `parseBackup`,
 * donc sans id dupliqué.
 */
function planCollection<T extends { readonly id: string }>(
  collection: BackupCollection,
  accepted: readonly T[],
  local: LocalCollectionState<T>,
  detectContentTwins: boolean,
  issues: BackupIssueCounts,
): CollectionMergePlan<T> {
  if (local.status === "error") {
    return blockedPlan<T>(
      collection,
      accepted.length,
      local.message,
      issues,
      local,
    );
  }

  const localById = new Map<string, { item: T; text: string }[]>();
  for (const item of local.items) {
    const entry = { item, text: canonicalize(item) };
    const group = localById.get(item.id);
    if (group === undefined) {
      localById.set(item.id, [entry]);
    } else {
      group.push(entry);
    }
  }
  const anomalies = detectLocalAnomalies(localById);

  const twinByContent = new Map<string, string>();
  if (detectContentTwins) {
    for (const item of [...local.items].sort(byId)) {
      const key = contentKey(item);
      if (!twinByContent.has(key)) {
        twinByContent.set(key, item.id);
      }
    }
  }

  const insertions: T[] = [];
  const exactDuplicateIds: string[] = [];
  const conflicts: MergeConflict<T>[] = [];
  const possibleDuplicates: PossibleDuplicate[] = [];

  for (const imported of [...accepted].sort(byId)) {
    const matches = localById.get(imported.id);
    if (matches === undefined) {
      insertions.push(imported);
      if (detectContentTwins) {
        const twinId = twinByContent.get(contentKey(imported));
        if (twinId !== undefined) {
          possibleDuplicates.push({ importedId: imported.id, localId: twinId });
        }
      }
      continue;
    }
    const importedText = canonicalize(imported);
    if (matches.some((match) => match.text === importedText)) {
      exactDuplicateIds.push(imported.id);
      continue;
    }
    const retained = [...matches].sort((a, b) =>
      compareCodeUnits(a.text, b.text),
    )[0];
    if (retained !== undefined) {
      conflicts.push({ id: imported.id, local: retained.item, imported });
    }
  }

  return {
    collection,
    status: "ready",
    blockReason: null,
    acceptedFromBackup: accepted.length,
    localCount: local.items.length,
    localSkippedByRepository: local.skippedByRepository,
    insertions,
    exactDuplicateIds,
    conflicts,
    possibleDuplicates,
    unprocessedCount: 0,
    backupInvalidCount: issues.invalid,
    backupDuplicateCount: issues.duplicate,
    backupConflictCount: issues.conflict,
    localDuplicateIds: anomalies.duplicateIds,
    localDuplicateCount: anomalies.duplicateCount,
    localConflictingIds: anomalies.conflictingIds,
    persistence: persistenceOf(local),
  };
}

/* ---------- API publique ---------- */

/**
 * Plan de fusion PUR : aucune écriture, aucune lecture externe, aucun effet de bord.
 * Stratégie unique : fusion. Aucune donnée locale n'est jamais remplacée, supprimée ni
 * dédoublonnée ; un conflit ou une anomalie est seulement signalé. Aucun mode
 * « remplacer tout » n'existe.
 *
 * Deux notions distinctes :
 * - `previewComplete` : le plan a pu être calculé sur toutes les collections ;
 * - `persistence.canPersist` : une réécriture ne ferait perdre aucune donnée locale.
 */
export function createMergePlan(
  parsed: ParsedBackup,
  local: LocalData,
): MergePlan {
  const { backup, report } = parsed;
  const issuesOf = (collection: BackupCollection): BackupIssueCounts => ({
    invalid: report.collections[collection].invalidCount,
    duplicate: report.collections[collection].duplicateCount,
    conflict: report.collections[collection].conflictCount,
  });

  const collections = {
    workoutSessions: planCollection(
      "workoutSessions",
      backup.data.workoutSessions,
      local.workoutSessions,
      false,
      issuesOf("workoutSessions"),
    ),
    weightMeasurements: planCollection(
      "weightMeasurements",
      backup.data.weightMeasurements,
      local.weightMeasurements,
      true,
      issuesOf("weightMeasurements"),
    ),
    bodyCompositionMeasurements: planCollection(
      "bodyCompositionMeasurements",
      backup.data.bodyCompositionMeasurements,
      local.bodyCompositionMeasurements,
      true,
      issuesOf("bodyCompositionMeasurements"),
    ),
    activities: planCollection(
      "activities",
      backup.data.activities,
      local.activities,
      true,
      issuesOf("activities"),
    ),
  };

  const warnings: MergeWarning[] = [];
  if (backup.declaredCompleteness === "incomplete") {
    warnings.push({
      code: "backup_incomplete",
      collection: null,
      message:
        "The backup declares itself incomplete: some data was not exported.",
    });
  }
  if (backup.effectiveCompleteness === "unverified") {
    warnings.push({
      code: "backup_unverified",
      collection: null,
      message:
        "The backup is unverified: its completeness could not be established at export time.",
    });
  }
  if (report.hasAnomalies) {
    warnings.push({
      code: "backup_anomalies",
      collection: null,
      message:
        "Reading the backup found invalid entries, duplicates or conflicting ids: they were excluded.",
    });
  }

  const blockers: MergeBlocker[] = [];
  const collectionsToWrite: BackupCollection[] = [];
  const unsafeCollections: BackupCollection[] = [];
  let insertions = 0;
  let exactDuplicates = 0;
  let conflictTotal = 0;
  let possibleDuplicateTotal = 0;
  let unprocessed = 0;
  let localDuplicates = 0;
  let localConflictingIds = 0;
  let writeIsSafe = true;

  for (const name of BACKUP_COLLECTIONS) {
    const plan = collections[name];
    insertions += plan.insertions.length;
    exactDuplicates += plan.exactDuplicateIds.length;
    conflictTotal += plan.conflicts.length;
    possibleDuplicateTotal += plan.possibleDuplicates.length;
    unprocessed += plan.unprocessedCount;
    localDuplicates += plan.localDuplicateCount;
    localConflictingIds += plan.localConflictingIds.length;

    if (!plan.persistence.safeToRewrite) {
      unsafeCollections.push(name);
    }
    if (plan.insertions.length > 0) {
      collectionsToWrite.push(name);
      if (!plan.persistence.safeToRewrite) {
        writeIsSafe = false;
      }
    }

    if (plan.status === "blocked") {
      blockers.push({
        code: "local_read_error",
        collection: name,
        message: plan.blockReason ?? `Local ${name} could not be read`,
      });
      continue;
    }
    if (plan.localSkippedByRepository === null) {
      warnings.push({
        code: "local_skipped_unknown",
        collection: name,
        message: `Local ${name}: the repository cannot report ignored entries, so local completeness is unverified and the collection is not safe to rewrite.`,
      });
    } else if (plan.localSkippedByRepository > 0) {
      warnings.push({
        code: "local_entries_skipped",
        collection: name,
        message: `Local ${name}: ${plan.localSkippedByRepository} unreadable entries were ignored by the repository; rewriting would lose them.`,
      });
    }
    if (plan.localDuplicateIds.length > 0) {
      warnings.push({
        code: "local_duplicate_ids",
        collection: name,
        message: `Local ${name}: ${plan.localDuplicateIds.length} id(s) are carried by identical copies (${plan.localDuplicateCount} extra). Nothing was removed.`,
      });
    }
    if (plan.localConflictingIds.length > 0) {
      warnings.push({
        code: "local_conflicting_ids",
        collection: name,
        message: `Local ${name}: ${plan.localConflictingIds.length} id(s) are carried by different contents. Nothing was changed.`,
      });
    }
  }

  const reliability: MergeReliability =
    blockers.length > 0
      ? "blocked"
      : warnings.length > 0
        ? "caution"
        : "reliable";

  return {
    strategy: "merge",
    reliability,
    previewComplete: blockers.length === 0,
    persistence: {
      canPersist: insertions > 0 && writeIsSafe,
      collectionsToWrite,
      unsafeCollections,
    },
    backup: {
      exportedAt: backup.exportedAt,
      appVersion: backup.appVersion,
      declaredCompleteness: backup.declaredCompleteness,
      effectiveCompleteness: backup.effectiveCompleteness,
      hasAnomalies: report.hasAnomalies,
    },
    warnings,
    blockers,
    totals: {
      insertions,
      exactDuplicates,
      conflicts: conflictTotal,
      possibleDuplicates: possibleDuplicateTotal,
      unprocessed,
      localDuplicates,
      localConflictingIds,
    },
    collections,
  };
}

function mergeOne<T>(
  local: LocalCollectionState<T>,
  plan: CollectionMergePlan<T>,
): readonly T[] | null {
  return local.status === "ok" && plan.status === "ready"
    ? [...local.items, ...plan.insertions]
    : null;
}

/**
 * Résultat pur de l'application du plan : local inchangé (toutes les copies conservées)
 * + insertions. L'ordre n'est pas garanti (chaque repository retrie à l'écriture).
 * `null` si une collection est bloquée : aucune restauration partielle n'est produite.
 * Ce résultat peut exister pour une collection non sûre à réécrire : consulter
 * `plan.persistence` avant toute écriture.
 */
export function getMergedCollections(
  local: LocalData,
  plan: MergePlan,
): MergedData | null {
  const workoutSessions = mergeOne(
    local.workoutSessions,
    plan.collections.workoutSessions,
  );
  const weightMeasurements = mergeOne(
    local.weightMeasurements,
    plan.collections.weightMeasurements,
  );
  const bodyCompositionMeasurements = mergeOne(
    local.bodyCompositionMeasurements,
    plan.collections.bodyCompositionMeasurements,
  );
  const activities = mergeOne(local.activities, plan.collections.activities);
  if (
    workoutSessions === null ||
    weightMeasurements === null ||
    bodyCompositionMeasurements === null ||
    activities === null
  ) {
    return null;
  }
  return {
    workoutSessions,
    weightMeasurements,
    bodyCompositionMeasurements,
    activities,
  };
}
