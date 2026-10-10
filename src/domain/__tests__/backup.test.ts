import { SEED_EXERCISES } from "../exercises/catalog";
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BackupExportError,
  buildBackup,
  serializeBackup,
  type BackupCollectionSource,
  type BackupSources,
  type BuildBackupInput,
} from "../backup";
import type { Activity } from "../activities/types";
import type { BodyCompositionMeasurement } from "../body/composition/types";
import type { WeightMeasurement } from "../body/types";
import { SEED_WORKOUT_TEMPLATES } from "../workouts/seed";
import type {
  PerformanceEntry,
  SessionStatus,
  WorkoutSession,
} from "../workouts/types";
import { assertEqual, assertTrue, test } from "./harness";

const EXPORTED_AT = 1_900_000_000_000;

const perf = (
  sessionId: string,
  order: number,
  actualReps: number,
  createdAt: number,
  bodyweightKg: number | null,
): PerformanceEntry => ({
  id: `${sessionId}__session_a_emom__${order}`,
  blockId: "session_a_emom",
  blockType: "emom",
  exerciseId: order % 2 === 1 ? "pull_up_pronation" : "dips",
  order,
  targetReps: order % 2 === 1 ? 6 : 8,
  actualReps,
  externalLoadKg: 0,
  bodyweightKg,
  recordedAt: createdAt + order * 1_000,
});

const makeSession = (
  id: string,
  status: SessionStatus,
  createdAt: number,
  bodyweightKg: number | null,
  performances: PerformanceEntry[] = [],
  templateId = "session_a",
): WorkoutSession => ({
  id,
  templateId,
  status,
  createdAt,
  startedAt: createdAt,
  completedAt: status === "completed" ? createdAt + 3_600_000 : null,
  bodyweightKg,
  notes: null,
  performances,
});

const sessions = (): WorkoutSession[] => [
  makeSession("session_a_1000000", "completed", 1_000_000, 74.2, [
    perf("session_a_1000000", 1, 6, 1_000_000, 74.2),
    perf("session_a_1000000", 2, 9, 1_000_000, 74.2),
  ]),
  makeSession("session_a_2000000", "in_progress", 2_000_000, 75.0, [
    perf("session_a_2000000", 1, 5, 2_000_000, 75.0),
  ]),
  makeSession(
    "session_b_3000000",
    "cancelled",
    3_000_000,
    null,
    [],
    "session_b",
  ),
];

const weights = (): WeightMeasurement[] => [
  { id: "weight_5000", recordedAt: 5_000, weightKg: 74.2 },
  { id: "weight_5000_2", recordedAt: 5_000, weightKg: 73.9 },
  { id: "weight_6000", recordedAt: 6_000, weightKg: 75 },
];

const compositions = (): BodyCompositionMeasurement[] => [
  {
    id: "composition_1000",
    recordedAt: 1_000,
    bodyFatPercent: 18.5,
    muscleMassKg: null,
    bmi: null,
    visceralFatIndex: null,
    waterPercent: null,
  },
  {
    id: "composition_1000_2",
    recordedAt: 1_000,
    bodyFatPercent: null,
    muscleMassKg: 61.5,
    bmi: null,
    visceralFatIndex: null,
    waterPercent: null,
  },
  {
    id: "composition_2000",
    recordedAt: 2_000,
    bodyFatPercent: null,
    muscleMassKg: null,
    bmi: null,
    visceralFatIndex: null,
    waterPercent: 55,
  },
];

const activities = (): Activity[] => [
  {
    id: "activity_1000",
    type: "boxing",
    startedAt: 1_000,
    durationMinutes: 60,
    intensity: "high",
    notes: null,
    createdAt: 1_000,
  },
  {
    id: "activity_1000_2",
    type: "boxing",
    startedAt: 1_000,
    durationMinutes: 45,
    intensity: null,
    notes: "Pads",
    createdAt: 1_000,
  },
  {
    id: "activity_3000",
    type: "boxing",
    startedAt: 3_000,
    durationMinutes: 30,
    intensity: "low",
    notes: null,
    createdAt: 3_000,
  },
];

const source = <T>(
  items: T[],
  skipped: number | null = 0,
): BackupCollectionSource<T> => ({
  items,
  skippedByRepository: skipped,
  readError: null,
});

const baseSources = (skipped: number | null = 0): BackupSources => ({
  workoutSessions: source(sessions(), skipped),
  weightMeasurements: source(weights(), skipped),
  bodyCompositionMeasurements: source(compositions(), skipped),
  activities: source(activities(), skipped),
});

const input = (sources: BackupSources = baseSources()): BuildBackupInput => ({
  exportedAt: EXPORTED_AT,
  appVersion: "1.0.0",
  sources,
  catalog: {
    templateIds: SEED_WORKOUT_TEMPLATES.map((template) => template.id),
    exerciseIds: SEED_EXERCISES.map((exercise) => exercise.id),
  },
});

const withWeights = (items: WeightMeasurement[]): BuildBackupInput =>
  input({ ...baseSources(), weightMeasurements: source(items) });

const expectedData = (): string =>
  JSON.stringify({
    workoutSessions: sessions(),
    weightMeasurements: weights(),
    bodyCompositionMeasurements: compositions(),
    activities: activities(),
  });

test("sauvegarde: enveloppe (format, version, date, application)", () => {
  const { file } = buildBackup(input());
  assertEqual(file.format, BACKUP_FORMAT, "format");
  assertEqual(file.schemaVersion, BACKUP_SCHEMA_VERSION, "version du schéma");
  assertEqual(file.exportedAt, EXPORTED_AT, "exportedAt injecté");
  assertEqual(file.appVersion, "1.0.0", "appVersion");
});

test("sauvegarde: compteurs égaux au contenu réel", () => {
  const { file } = buildBackup(input());
  assertEqual(file.counts.workoutSessions, 3, "séances");
  assertEqual(file.counts.weightMeasurements, 3, "poids");
  assertEqual(file.counts.bodyCompositionMeasurements, 3, "composition");
  assertEqual(file.counts.activities, 3, "activités");
  assertEqual(
    file.counts.workoutSessions,
    file.data.workoutSessions.length,
    "cohérence séances",
  );
  assertEqual(
    file.counts.activities,
    file.data.activities.length,
    "cohérence activités",
  );
});

test("sauvegarde: ordre déterministe, indépendant de l’ordre d’entrée", () => {
  const reversed: BackupSources = {
    workoutSessions: source(sessions().reverse()),
    weightMeasurements: source(weights().reverse()),
    bodyCompositionMeasurements: source(compositions().reverse()),
    activities: source(activities().reverse()),
  };
  assertEqual(
    serializeBackup(buildBackup(input(reversed)).file),
    serializeBackup(buildBackup(input()).file),
    "même fichier",
  );
});

test("sauvegarde: aller-retour JSON sans aucune perte de champ", () => {
  const text = serializeBackup(buildBackup(input()).file);
  const parsed: { data: unknown } = JSON.parse(text);
  assertEqual(
    JSON.stringify(parsed.data),
    expectedData(),
    "données identiques",
  );
});

test("sauvegarde: séances terminées, en cours et annulées, snapshots de poids conservés", () => {
  const { file } = buildBackup(input());
  const byId = (id: string) =>
    file.data.workoutSessions.find((session) => session.id === id);
  assertEqual(byId("session_a_1000000")?.status, "completed", "terminée");
  assertEqual(byId("session_a_2000000")?.status, "in_progress", "en cours");
  assertEqual(byId("session_b_3000000")?.status, "cancelled", "annulée");
  assertEqual(
    byId("session_a_1000000")?.bodyweightKg,
    74.2,
    "poids de la séance 1",
  );
  assertEqual(
    byId("session_a_2000000")?.bodyweightKg,
    75.0,
    "poids de la séance 2",
  );
  assertEqual(
    byId("session_a_1000000")?.performances[0]?.bodyweightKg,
    74.2,
    "poids de la performance",
  );
  assertEqual(
    byId("session_a_1000000")?.performances[1]?.actualReps,
    9,
    "reps réalisées",
  );
  assertEqual(
    byId("session_a_1000000")?.performances[0]?.targetReps,
    6,
    "cible conservée",
  );
});

test("sauvegarde: ids de mesures et d’activités au même timestamp conservés", () => {
  const { file } = buildBackup(input());
  assertEqual(
    file.data.weightMeasurements.map((item) => item.id).join(","),
    "weight_5000,weight_5000_2,weight_6000",
    "ids de poids",
  );
  assertEqual(
    file.data.bodyCompositionMeasurements.map((item) => item.id).join(","),
    "composition_1000,composition_1000_2,composition_2000",
    "ids de composition",
  );
  assertEqual(
    file.data.activities.map((item) => item.id).join(","),
    "activity_1000,activity_1000_2,activity_3000",
    "ids d’activités",
  );
});

test("sauvegarde: références du catalogue triées et sans doublon", () => {
  const { file } = buildBackup(input());
  assertEqual(
    file.catalogRefs.templateIds.join(","),
    "session_a,session_b",
    "templates",
  );
  assertEqual(file.catalogRefs.exerciseIds.length, 8, "exercices");
  const sorted = [...file.catalogRefs.exerciseIds].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  assertEqual(file.catalogRefs.exerciseIds.join(","), sorted.join(","), "tri");
  const duplicated = buildBackup({
    ...input(),
    catalog: { templateIds: ["b", "a", "a"], exerciseIds: ["x", "x"] },
  });
  assertEqual(
    duplicated.file.catalogRefs.templateIds.join(","),
    "a,b",
    "doublons retirés",
  );
  assertEqual(
    duplicated.file.catalogRefs.exerciseIds.join(","),
    "x",
    "doublons retirés",
  );
});

test("sauvegarde: complète quand tout est vérifié", () => {
  const { file, report } = buildBackup(input());
  assertEqual(report.completeness, "complete", "rapport");
  assertEqual(file.completeness, "complete", "fichier");
  assertEqual(report.collections.workoutSessions.status, "complete", "séances");
  assertEqual(report.collections.workoutSessions.exportedCount, 3, "exportées");
  assertEqual(
    report.collections.workoutSessions.conflictCount,
    0,
    "aucun conflit",
  );
});

test("sauvegarde: non vérifiée quand le repository ne peut pas signaler les entrées ignorées", () => {
  const { file, report } = buildBackup(input(baseSources(null)));
  assertEqual(report.completeness, "unverified", "rapport");
  assertEqual(file.completeness, "unverified", "fichier");
  assertEqual(
    report.collections.activities.skippedByRepository,
    null,
    "inconnu, pas 0",
  );
});

test("sauvegarde: incomplète quand des entrées ont été ignorées par un repository", () => {
  const sources: BackupSources = {
    ...baseSources(),
    weightMeasurements: source(weights(), 2),
  };
  const { file, report } = buildBackup(input(sources));
  assertEqual(report.completeness, "incomplete", "rapport");
  assertEqual(file.completeness, "incomplete", "fichier");
  assertEqual(
    report.collections.weightMeasurements.skippedByRepository,
    2,
    "compteur",
  );
  assertEqual(
    report.collections.activities.status,
    "complete",
    "autres collections intactes",
  );
});

test("sauvegarde: erreur de lecture → collection vide et sauvegarde incomplète", () => {
  const sources: BackupSources = {
    ...baseSources(),
    activities: {
      items: [],
      skippedByRepository: null,
      readError: "lecture impossible",
    },
  };
  const { file, report } = buildBackup(input(sources));
  assertEqual(report.completeness, "incomplete", "rapport");
  assertEqual(file.completeness, "incomplete", "fichier");
  assertEqual(file.counts.activities, 0, "aucune activité exportée");
  assertEqual(
    report.collections.activities.readError,
    "lecture impossible",
    "erreur conservée",
  );
  assertEqual(
    report.collections.workoutSessions.status,
    "complete",
    "séances intactes",
  );
});

test("sauvegarde: erreur de lecture avec des entrées déjà lues → exportées mais incomplète", () => {
  const sources: BackupSources = {
    ...baseSources(),
    activities: {
      items: activities(),
      skippedByRepository: 0,
      readError: "lecture partielle",
    },
  };
  const { file, report } = buildBackup(input(sources));
  assertEqual(file.counts.activities, 3, "les entrées lues sont exportées");
  assertEqual(
    report.collections.activities.exportedCount,
    3,
    "compteur du rapport",
  );
  assertEqual(
    report.collections.activities.readError,
    "lecture partielle",
    "erreur conservée",
  );
  assertEqual(
    report.collections.activities.status,
    "incomplete",
    "collection incomplète",
  );
  assertEqual(report.completeness, "incomplete", "sauvegarde incomplète");
  assertEqual(file.completeness, "incomplete", "fichier incomplet");
});

test("sauvegarde: entrée invalide exclue, comptée et signalée", () => {
  const bad: WeightMeasurement = { id: "weight_1", recordedAt: 1, weightKg: 5 };
  const { file, report } = buildBackup(withWeights([...weights(), bad]));
  assertEqual(file.data.weightMeasurements.length, 3, "invalide exclue");
  assertEqual(
    report.collections.weightMeasurements.invalidCount,
    1,
    "compteur",
  );
  assertEqual(report.collections.weightMeasurements.readCount, 4, "lues");
  assertEqual(report.completeness, "incomplete", "sauvegarde incomplète");
});

test("sauvegarde: même id et même contenu → une seule copie, doublon signalé, ordre inversé", () => {
  const copy: WeightMeasurement = {
    id: "weight_5000",
    recordedAt: 5_000,
    weightKg: 74.2,
  };
  const forward = buildBackup(withWeights([...weights(), copy]));
  const backward = buildBackup(withWeights([copy, ...weights().reverse()]));
  for (const result of [forward, backward]) {
    const report = result.report.collections.weightMeasurements;
    assertEqual(
      result.file.data.weightMeasurements.length,
      3,
      "une seule copie exportée",
    );
    assertEqual(report.duplicateCount, 1, "doublon compté");
    assertEqual(report.conflictCount, 0, "pas un conflit");
    assertEqual(report.readCount, 4, "lues");
    assertEqual(report.status, "incomplete", "collection signalée");
  }
  assertEqual(
    serializeBackup(forward.file),
    serializeBackup(backward.file),
    "fichier identique",
  );
  assertEqual(
    JSON.stringify(forward.report),
    JSON.stringify(backward.report),
    "rapport identique",
  );
});

test("sauvegarde: même id, contenu identique mais clés dans un autre ordre → doublon, pas conflit", () => {
  const reordered: WeightMeasurement = {
    weightKg: 74.2,
    recordedAt: 5_000,
    id: "weight_5000",
  };
  const forward = buildBackup(withWeights([...weights(), reordered]));
  const backward = buildBackup(withWeights([reordered, ...weights()]));
  assertEqual(
    forward.report.collections.weightMeasurements.duplicateCount,
    1,
    "doublon",
  );
  assertEqual(
    forward.report.collections.weightMeasurements.conflictCount,
    0,
    "aucun conflit",
  );
  assertEqual(
    serializeBackup(forward.file),
    serializeBackup(backward.file),
    "fichier identique malgré l’ordre des clés",
  );
});

test("sauvegarde: même id, contenu différent → conflit, id exclu, indépendant de l’ordre", () => {
  const a: WeightMeasurement = {
    id: "weight_9000",
    recordedAt: 9_000,
    weightKg: 70,
  };
  const b: WeightMeasurement = {
    id: "weight_9000",
    recordedAt: 9_000,
    weightKg: 71,
  };
  const forward = buildBackup(withWeights([...weights(), a, b]));
  const backward = buildBackup(withWeights([b, a, ...weights().reverse()]));
  for (const result of [forward, backward]) {
    const report = result.report.collections.weightMeasurements;
    assertEqual(
      result.file.data.weightMeasurements.length,
      3,
      "id en conflit exclu",
    );
    assertTrue(
      result.file.data.weightMeasurements.every(
        (item) => item.id !== "weight_9000",
      ),
      "aucune version conservée",
    );
    assertEqual(report.conflictCount, 1, "conflit compté");
    assertEqual(report.conflictingIds.join(","), "weight_9000", "id signalé");
    assertEqual(report.duplicateCount, 0, "pas un doublon");
    assertEqual(report.readCount, 5, "lues");
    assertEqual(report.status, "incomplete", "collection incomplète");
  }
  assertEqual(
    serializeBackup(forward.file),
    serializeBackup(backward.file),
    "fichier identique",
  );
  assertEqual(
    JSON.stringify(forward.report),
    JSON.stringify(backward.report),
    "rapport identique",
  );
});

test("sauvegarde: un conflit rend le statut global incomplet", () => {
  const a: WeightMeasurement = {
    id: "weight_9000",
    recordedAt: 9_000,
    weightKg: 70,
  };
  const b: WeightMeasurement = {
    id: "weight_9000",
    recordedAt: 9_000,
    weightKg: 71,
  };
  const { file, report } = buildBackup(withWeights([...weights(), a, b]));
  assertEqual(report.completeness, "incomplete", "rapport global");
  assertEqual(file.completeness, "incomplete", "fichier");
  assertEqual(
    report.collections.weightMeasurements.status,
    "incomplete",
    "collection concernée",
  );
  assertEqual(
    report.collections.workoutSessions.status,
    "complete",
    "séances intactes",
  );
  assertEqual(
    report.collections.activities.status,
    "complete",
    "activités intactes",
  );
  assertEqual(
    report.collections.activities.conflictCount,
    0,
    "aucun conflit ailleurs",
  );
});

test("sauvegarde: ids distincts au même timestamp toujours conservés, sans anomalie", () => {
  const { file, report } = buildBackup(input());
  assertEqual(file.counts.weightMeasurements, 3, "poids (deux à 5000)");
  assertEqual(
    file.counts.bodyCompositionMeasurements,
    3,
    "composition (deux à 1000)",
  );
  assertEqual(file.counts.activities, 3, "activités (deux à 1000)");
  for (const collection of Object.values(report.collections)) {
    assertEqual(collection.duplicateCount, 0, "aucun doublon");
    assertEqual(collection.conflictCount, 0, "aucun conflit");
    assertEqual(collection.invalidCount, 0, "aucune entrée invalide");
  }
});

test("sauvegarde: la détection est limitée à chaque collection (même id dans deux collections)", () => {
  const sources: BackupSources = {
    ...baseSources(),
    weightMeasurements: source([
      ...weights(),
      { id: "shared_1", recordedAt: 7_000, weightKg: 70 },
    ]),
    bodyCompositionMeasurements: source([
      ...compositions(),
      {
        id: "shared_1",
        recordedAt: 7_000,
        bodyFatPercent: 20,
        muscleMassKg: null,
        bmi: null,
        visceralFatIndex: null,
        waterPercent: null,
      },
    ]),
  };
  const { file, report } = buildBackup(input(sources));
  assertEqual(file.counts.weightMeasurements, 4, "poids conservé");
  assertEqual(
    file.counts.bodyCompositionMeasurements,
    4,
    "composition conservée",
  );
  assertEqual(
    report.completeness,
    "complete",
    "aucun faux conflit entre collections",
  );
});

test("sauvegarde: tri des ids par code unité, indépendant de la locale", () => {
  const upper = makeSession("session_a_B", "completed", 4_000_000, null);
  const lower = makeSession("session_a_a", "completed", 4_000_000, null);
  const forward = buildBackup(
    input({
      ...baseSources(),
      workoutSessions: source([...sessions(), lower, upper]),
    }),
  );
  const backward = buildBackup(
    input({
      ...baseSources(),
      workoutSessions: source([upper, lower, ...sessions()]),
    }),
  );
  const ids = (result: typeof forward): string =>
    result.file.data.workoutSessions
      .slice(-2)
      .map((session) => session.id)
      .join(",");
  assertEqual(
    ids(forward),
    "session_a_B,session_a_a",
    "majuscule avant minuscule (code unité)",
  );
  assertEqual(ids(backward), ids(forward), "ordre d’entrée sans effet");
});

test("sauvegarde: sauvegarde vide valide", () => {
  const empty: BackupSources = {
    workoutSessions: source<WorkoutSession>([]),
    weightMeasurements: source<WeightMeasurement>([]),
    bodyCompositionMeasurements: source<BodyCompositionMeasurement>([]),
    activities: source<Activity>([]),
  };
  const { file, report } = buildBackup(input(empty));
  assertEqual(report.completeness, "complete", "complète");
  assertEqual(
    file.counts.workoutSessions + file.counts.activities,
    0,
    "compteurs nuls",
  );
  assertEqual(file.data.workoutSessions.length, 0, "aucune séance");
});

test("sauvegarde: date ou version d’application invalide refusée", () => {
  let refused = 0;
  for (const exportedAt of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    try {
      buildBackup({ ...input(), exportedAt });
    } catch (error) {
      if (error instanceof BackupExportError) {
        refused += 1;
      }
    }
  }
  try {
    buildBackup({ ...input(), appVersion: "  " });
  } catch (error) {
    if (error instanceof BackupExportError) {
      refused += 1;
    }
  }
  assertEqual(refused, 5, "cinq refus");
});

test("sauvegarde: une séance au template inconnu est exportée (aucun historique écarté)", () => {
  const legacy = makeSession(
    "legacy_1",
    "completed",
    500_000,
    80,
    [perf("legacy_1", 1, 7, 500_000, 80)],
    "ancien_template",
  );
  const sources: BackupSources = {
    ...baseSources(),
    workoutSessions: source([...sessions(), legacy]),
  };
  const { file, report } = buildBackup(input(sources));
  assertEqual(file.data.workoutSessions.length, 4, "séance conservée");
  assertEqual(
    file.data.workoutSessions[0]?.templateId,
    "ancien_template",
    "templateId inchangé",
  );
  assertEqual(report.completeness, "complete", "aucune perte");
});

test("sauvegarde: sérialisation lisible, déterministe et relisible", () => {
  const first = serializeBackup(buildBackup(input()).file);
  const second = serializeBackup(buildBackup(input()).file);
  assertEqual(first, second, "identique");
  const parsed: { format: string; schemaVersion: number } = JSON.parse(first);
  assertEqual(parsed.format, BACKUP_FORMAT, "format relu");
  assertEqual(parsed.schemaVersion, 1, "version relue");
});

test("sauvegarde: les sources ne sont jamais modifiées", () => {
  const sources = baseSources();
  const before = JSON.stringify(sources);
  buildBackup(input(sources));
  assertEqual(JSON.stringify(sources), before, "sources intactes");
});
