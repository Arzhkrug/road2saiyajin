import type { Activity } from "../activities/types";
import type { BodyCompositionMeasurement } from "../body/composition/types";
import type { WeightMeasurement } from "../body/types";
import type { EpochMs, WorkoutSession } from "../workouts/types";

export const BACKUP_FORMAT = "road-to-saiyajin-backup";
export const BACKUP_SCHEMA_VERSION = 1;

export const BACKUP_COLLECTIONS = [
  "workoutSessions",
  "weightMeasurements",
  "bodyCompositionMeasurements",
  "activities",
] as const;
export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

export type BackupCompleteness = "complete" | "incomplete" | "unverified";

export interface BackupData {
  readonly workoutSessions: readonly WorkoutSession[];
  readonly weightMeasurements: readonly WeightMeasurement[];
  readonly bodyCompositionMeasurements: readonly BodyCompositionMeasurement[];
  readonly activities: readonly Activity[];
}

export type BackupCounts = Readonly<Record<BackupCollection, number>>;

export interface BackupCatalogRefs {
  readonly templateIds: readonly string[];
  readonly exerciseIds: readonly string[];
}

export interface BackupFile {
  readonly format: typeof BACKUP_FORMAT;
  readonly schemaVersion: number;
  readonly exportedAt: EpochMs;
  readonly appVersion: string;
  /** Complétude constatée à l'export : un import doit pouvoir l'afficher. */
  readonly completeness: BackupCompleteness;
  readonly data: BackupData;
  readonly counts: BackupCounts;
  readonly catalogRefs: BackupCatalogRefs;
}

/** Ce qu'un repository a lu, tel que fourni à l'export. */
export interface BackupCollectionSource<T> {
  readonly items: readonly T[];
  /**
   * Nombre d'entrées ignorées par le repository à la lecture.
   *
   * CONTRAT : `null` = non détectable. Tant qu'un repository ne MESURE pas ce
   * compteur, le service d'export doit transmettre `null` et jamais `0` : inventer
   * `0` produirait un faux statut `complete`. Seule une valeur mesurée peut être 0.
   */
  readonly skippedByRepository: number | null;
  /**
   * Message si la lecture a échoué. La collection est alors `incomplete`,
   * même si `items` contient encore des entrées (elles sont exportées quand même).
   */
  readonly readError: string | null;
}

export interface BackupSources {
  readonly workoutSessions: BackupCollectionSource<WorkoutSession>;
  readonly weightMeasurements: BackupCollectionSource<WeightMeasurement>;
  readonly bodyCompositionMeasurements: BackupCollectionSource<BodyCompositionMeasurement>;
  readonly activities: BackupCollectionSource<Activity>;
}

/**
 * Rapport d'export (non écrit dans le fichier). Pour chaque collection :
 * readCount = invalidCount + exportedCount + duplicateCount + (entrées des ids en conflit).
 */
export interface CollectionExportReport {
  readonly readCount: number;
  readonly exportedCount: number;
  /** Entrées refusées par le validateur du type. */
  readonly invalidCount: number;
  /** Copies EN TROP d'un même id au contenu identique (une copie est exportée). */
  readonly duplicateCount: number;
  /** Nombre d'ids distincts portés par des contenus différents : exclus de l'export. */
  readonly conflictCount: number;
  /** Les ids en conflit, triés par code unité. */
  readonly conflictingIds: readonly string[];
  readonly skippedByRepository: number | null;
  readonly readError: string | null;
  readonly status: BackupCompleteness;
}

export interface BackupExportReport {
  readonly completeness: BackupCompleteness;
  readonly collections: Readonly<
    Record<BackupCollection, CollectionExportReport>
  >;
}

export interface BuildBackupInput {
  readonly exportedAt: EpochMs;
  readonly appVersion: string;
  readonly sources: BackupSources;
  readonly catalog: {
    readonly templateIds: readonly string[];
    readonly exerciseIds: readonly string[];
  };
}

export interface BackupBuildResult {
  readonly file: BackupFile;
  readonly report: BackupExportReport;
}
