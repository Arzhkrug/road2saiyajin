import type { Activity } from "../activities/types";
import {
  BACKUP_COLLECTIONS,
  buildBackup,
  createMergePlan,
  getMergedCollections,
  parseBackup,
  serializeBackup,
  type BackupFile,
  type LocalCollectionState,
  type LocalData,
  type MergePlan,
  type MergeWarningCode,
  type ParsedBackup,
} from "../backup";
import type { BodyCompositionMeasurement } from "../body/composition/types";
import type { WeightMeasurement } from "../body/types";
import type {
  PerformanceEntry,
  SessionStatus,
  WorkoutSession,
} from "../workouts/types";
import { assertEqual, assertTrue, test } from "./harness";

/* ---------- Jeux de données ---------- */

const perf = (sessionId: string, createdAt: number): PerformanceEntry => ({
  id: `${sessionId}__session_a_emom__1`,
  blockId: "session_a_emom",
  blockType: "emom",
  exerciseId: "pull_up_pronation",
  order: 1,
  targetReps: 6,
  actualReps: 6,
  externalLoadKg: 0,
  bodyweightKg: 74.2,
  recordedAt: createdAt + 1_000,
});

const session = (
  id: string,
  createdAt: number,
  templateId = "session_a",
  status: SessionStatus = "completed",
): WorkoutSession => ({
  id,
  templateId,
  status,
  createdAt,
  startedAt: createdAt,
  completedAt: status === "completed" ? createdAt + 3_600_000 : null,
  bodyweightKg: 74.2,
  notes: null,
  performances: [perf(id, createdAt)],
});

const weight = (
  id: string,
  recordedAt: number,
  weightKg: number,
): WeightMeasurement => ({
  id,
  recordedAt,
  weightKg,
});

const composition = (
  id: string,
  recordedAt: number,
  bodyFatPercent: number,
): BodyCompositionMeasurement => ({
  id,
  recordedAt,
  bodyFatPercent,
  muscleMassKg: null,
  bmi: null,
  visceralFatIndex: null,
  waterPercent: null,
});

const activity = (
  id: string,
  startedAt: number,
  durationMinutes: number,
): Activity => ({
  id,
  type: "boxing",
  startedAt,
  durationMinutes,
  intensity: null,
  notes: null,
  createdAt: startedAt,
});

interface Content {
  sessions?: WorkoutSession[];
  weights?: WeightMeasurement[];
  compositions?: BodyCompositionMeasurement[];
  activities?: Activity[];
}

const sourceOf = <T>(items: readonly T[], skipped: number | null) => ({
  items,
  skippedByRepository: skipped,
  readError: null,
});

const fileOf = (
  content: Content = {},
  skipped: number | null = 0,
): BackupFile =>
  buildBackup({
    exportedAt: 1_900_000_000_000,
    appVersion: "1.0.0",
    sources: {
      workoutSessions: sourceOf(content.sessions ?? [], skipped),
      weightMeasurements: sourceOf(content.weights ?? [], skipped),
      bodyCompositionMeasurements: sourceOf(
        content.compositions ?? [],
        skipped,
      ),
      activities: sourceOf(content.activities ?? [], skipped),
    },
    catalog: { templateIds: [], exerciseIds: [] },
  }).file;

const parsedFromText = (text: string): ParsedBackup => {
  const result = parseBackup(text);
  if (!result.ok) {
    throw new Error(`succès attendu : ${JSON.stringify(result.errors)}`);
  }
  return result;
};

const parsedOf = (
  content: Content = {},
  skipped: number | null = 0,
): ParsedBackup => parsedFromText(serializeBackup(fileOf(content, skipped)));

const ok = <T>(
  items: readonly T[] = [],
  skipped: number | null = 0,
): LocalCollectionState<T> => ({
  status: "ok",
  items,
  skippedByRepository: skipped,
});

const readFailure = <T>(): LocalCollectionState<T> => ({
  status: "error",
  message: "lecture impossible",
});

const localOf = (overrides: Partial<LocalData> = {}): LocalData => ({
  workoutSessions: ok<WorkoutSession>(),
  weightMeasurements: ok<WeightMeasurement>(),
  bodyCompositionMeasurements: ok<BodyCompositionMeasurement>(),
  activities: ok<Activity>(),
  ...overrides,
});

const hasWarning = (plan: MergePlan, code: MergeWarningCode): boolean =>
  plan.warnings.some((warning) => warning.code === code);

const ids = (items: readonly { readonly id: string }[]): string =>
  items.map((item) => item.id).join(",");

const fullContent = (): Content => ({
  sessions: [
    session("session_a_1000000", 1_000_000),
    session("session_b_2000000", 2_000_000, "session_b"),
  ],
  weights: [
    weight("weight_5000", 5_000, 74.2),
    weight("weight_6000", 6_000, 75),
  ],
  compositions: [composition("composition_1000", 1_000, 18.5)],
  activities: [
    activity("activity_1000", 1_000, 60),
    activity("activity_3000", 3_000, 30),
  ],
});

/* ---------- Tests ---------- */

test("fusion: collections locales vides → tout est inséré, plan fiable", () => {
  const plan = createMergePlan(parsedOf(fullContent()), localOf());
  assertEqual(plan.strategy, "merge", "stratégie");
  assertEqual(plan.totals.insertions, 7, "insertions");
  assertEqual(plan.totals.exactDuplicates, 0, "doublons");
  assertEqual(plan.totals.conflicts, 0, "conflits");
  assertEqual(plan.reliability, "reliable", "fiabilité");
  assertEqual(plan.warnings.length, 0, "aucun avertissement");
  assertEqual(plan.blockers.length, 0, "aucun blocage");
  assertEqual(plan.previewComplete, true, "prévisualisation complète");
  assertEqual(plan.persistence.canPersist, true, "persistable");
});

test("fusion: sauvegarde vide → rien à insérer, rien à persister", () => {
  const plan = createMergePlan(
    parsedOf(),
    localOf({ weightMeasurements: ok([weight("weight_1", 1, 70)]) }),
  );
  assertEqual(plan.totals.insertions, 0, "insertions");
  assertEqual(plan.persistence.canPersist, false, "rien à persister");
  assertEqual(
    plan.persistence.collectionsToWrite.length,
    0,
    "aucune collection à écrire",
  );
  assertEqual(
    plan.collections.weightMeasurements.localCount,
    1,
    "local conservé",
  );
  assertEqual(plan.reliability, "reliable", "fiabilité");
});

test("fusion: nouvelles séances ajoutées, snapshots conservés", () => {
  const plan = createMergePlan(parsedOf(fullContent()), localOf());
  const inserted = plan.collections.workoutSessions.insertions;
  assertEqual(ids(inserted), "session_a_1000000,session_b_2000000", "séances");
  assertEqual(inserted[0]?.bodyweightKg, 74.2, "poids de la séance");
  assertEqual(
    inserted[0]?.performances[0]?.bodyweightKg,
    74.2,
    "poids de la performance",
  );
});

test("fusion: nouvelles mesures de poids, de composition et activités ajoutées", () => {
  const plan = createMergePlan(parsedOf(fullContent()), localOf());
  assertEqual(
    plan.collections.weightMeasurements.insertions.length,
    2,
    "poids",
  );
  assertEqual(
    plan.collections.bodyCompositionMeasurements.insertions.length,
    1,
    "composition",
  );
  assertEqual(plan.collections.activities.insertions.length, 2, "activités");
});

test("fusion: doublon exact → aucune insertion", () => {
  const content = fullContent();
  const local = localOf({
    weightMeasurements: ok([weight("weight_5000", 5_000, 74.2)]),
  });
  const plan = createMergePlan(parsedOf(content), local);
  const weights = plan.collections.weightMeasurements;
  assertEqual(weights.exactDuplicateIds.join(","), "weight_5000", "doublon");
  assertEqual(
    ids(weights.insertions),
    "weight_6000",
    "seul le nouvel id est inséré",
  );
  assertEqual(weights.conflicts.length, 0, "pas de conflit");
});

test("fusion: même id, contenu différent → conflit, local conservé, rien d’écrasé", () => {
  const localWeight = weight("weight_5000", 5_000, 70);
  const plan = createMergePlan(
    parsedOf({ weights: [weight("weight_5000", 5_000, 74.2)] }),
    localOf({ weightMeasurements: ok([localWeight]) }),
  );
  const weights = plan.collections.weightMeasurements;
  assertEqual(weights.conflicts.length, 1, "conflit");
  assertEqual(weights.insertions.length, 0, "aucune insertion");
  assertEqual(
    weights.conflicts[0]?.local.weightKg,
    70,
    "version locale conservée",
  );
  assertEqual(
    weights.conflicts[0]?.imported.weightKg,
    74.2,
    "version importée signalée",
  );
  assertEqual(plan.totals.conflicts, 1, "total");
  assertEqual(
    getMergedCollections(
      localOf({ weightMeasurements: ok([localWeight]) }),
      plan,
    )?.weightMeasurements[0]?.weightKg,
    70,
    "résultat fusionné",
  );
});

test("fusion: conflits indépendants dans chaque collection", () => {
  const local = localOf({
    workoutSessions: ok([
      { ...session("session_a_1000000", 1_000_000), notes: "locale" },
    ]),
    weightMeasurements: ok([weight("weight_5000", 5_000, 70)]),
    bodyCompositionMeasurements: ok([
      composition("composition_1000", 1_000, 25),
    ]),
    activities: ok([activity("activity_1000", 1_000, 15)]),
  });
  const plan = createMergePlan(parsedOf(fullContent()), local);
  for (const name of BACKUP_COLLECTIONS) {
    assertEqual(
      plan.collections[name].conflicts.length,
      1,
      `${name} : un conflit`,
    );
  }
  assertEqual(plan.totals.conflicts, 4, "total");
  assertEqual(
    plan.collections.workoutSessions.insertions.length,
    1,
    "l’autre séance est insérée",
  );
  assertEqual(
    plan.collections.workoutSessions.conflicts[0]?.local.notes,
    "locale",
    "séance locale conservée",
  );
});

test("fusion: ids identiques dans des collections différentes → aucun effet croisé", () => {
  const plan = createMergePlan(
    parsedOf({
      weights: [weight("shared_1", 7_000, 70)],
      activities: [activity("shared_1", 7_000, 30)],
    }),
    localOf(),
  );
  assertEqual(
    plan.collections.weightMeasurements.insertions.length,
    1,
    "poids",
  );
  assertEqual(plan.collections.activities.insertions.length, 1, "activité");
  const withLocalWeight = createMergePlan(
    parsedOf({
      weights: [weight("shared_1", 7_000, 70)],
      activities: [activity("shared_1", 7_000, 30)],
    }),
    localOf({ weightMeasurements: ok([weight("shared_1", 7_000, 70)]) }),
  );
  assertEqual(
    withLocalWeight.collections.weightMeasurements.exactDuplicateIds.length,
    1,
    "poids : doublon",
  );
  assertEqual(
    withLocalWeight.collections.activities.insertions.length,
    1,
    "activité : inchangée",
  );
  assertEqual(
    withLocalWeight.collections.activities.conflicts.length,
    0,
    "pas de faux conflit",
  );
});

test("fusion: deux plans identiques, indépendants de l’ordre des données locales", () => {
  const parsed = parsedOf(fullContent());
  const items = [
    weight("weight_5000", 5_000, 70),
    weight("weight_9", 9, 80),
    weight("weight_5000_2", 5_000, 71),
  ];
  const forward = createMergePlan(
    parsed,
    localOf({ weightMeasurements: ok(items) }),
  );
  const again = createMergePlan(
    parsed,
    localOf({ weightMeasurements: ok(items) }),
  );
  const reversed = createMergePlan(
    parsed,
    localOf({ weightMeasurements: ok([...items].reverse()) }),
  );
  assertEqual(JSON.stringify(forward), JSON.stringify(again), "deux appels");
  assertEqual(
    JSON.stringify(forward),
    JSON.stringify(reversed),
    "ordre local inversé",
  );
});

test("fusion: réimporter après fusion ne propose plus aucune insertion (idempotence)", () => {
  const parsed = parsedOf(fullContent());
  const local = localOf({
    weightMeasurements: ok([weight("weight_5000", 5_000, 74.2)]),
  });
  const first = createMergePlan(parsed, local);
  const merged = getMergedCollections(local, first);
  if (merged === null) {
    throw new Error("fusion attendue");
  }
  const afterLocal = localOf({
    workoutSessions: ok(merged.workoutSessions),
    weightMeasurements: ok(merged.weightMeasurements),
    bodyCompositionMeasurements: ok(merged.bodyCompositionMeasurements),
    activities: ok(merged.activities),
  });
  const second = createMergePlan(parsed, afterLocal);
  assertEqual(second.totals.insertions, 0, "plus d’insertion");
  assertEqual(second.totals.conflicts, 0, "aucun conflit");
  assertEqual(second.totals.exactDuplicates, 7, "tout est doublon exact");
  assertEqual(second.persistence.canPersist, false, "rien à persister");
  assertEqual(
    merged.weightMeasurements.length,
    2,
    "aucune copie en double après fusion",
  );
});

test("fusion: erreur de lecture locale → collection bloquée, jamais traitée comme vide", () => {
  const local = localOf({ activities: readFailure<Activity>() });
  const plan = createMergePlan(parsedOf(fullContent()), local);
  const blocked = plan.collections.activities;
  assertEqual(blocked.status, "blocked", "statut");
  assertEqual(blocked.insertions.length, 0, "aucune insertion proposée");
  assertEqual(blocked.localCount, null, "compte local inconnu");
  assertEqual(blocked.unprocessedCount, 2, "entrées non classées");
  assertEqual(plan.blockers.length, 1, "un blocage");
  assertEqual(
    plan.blockers[0]?.collection,
    "activities",
    "collection signalée",
  );
  assertEqual(plan.reliability, "blocked", "fiabilité");
  assertEqual(plan.previewComplete, false, "prévisualisation incomplète");
  assertEqual(blocked.persistence.safeToRewrite, false, "collection non sûre");
  assertEqual(
    blocked.persistence.reasons.join(","),
    "local_read_error",
    "raison",
  );
  assertTrue(
    plan.persistence.unsafeCollections.includes("activities"),
    "listée comme non sûre",
  );
  assertEqual(
    plan.collections.weightMeasurements.status,
    "ready",
    "autres collections analysées",
  );
  assertEqual(
    getMergedCollections(local, plan),
    null,
    "aucun résultat fusionné partiel",
  );
  assertEqual(plan.totals.unprocessed, 2, "total non classé");
});

test("fusion: sauvegarde incomplète signalée, jamais fiable", () => {
  const plan = createMergePlan(parsedOf(fullContent(), 2), localOf());
  assertEqual(plan.backup.declaredCompleteness, "incomplete", "déclarée");
  assertEqual(plan.backup.effectiveCompleteness, "incomplete", "effective");
  assertTrue(hasWarning(plan, "backup_incomplete"), "avertissement");
  assertEqual(plan.reliability, "caution", "fiabilité");
  assertEqual(
    plan.persistence.canPersist,
    true,
    "persistable côté local, avec avertissement",
  );
});

test("fusion: sauvegarde non vérifiée signalée, jamais fiable", () => {
  const plan = createMergePlan(parsedOf(fullContent(), null), localOf());
  assertEqual(plan.backup.effectiveCompleteness, "unverified", "effective");
  assertTrue(hasWarning(plan, "backup_unverified"), "avertissement");
  assertEqual(plan.reliability, "caution", "fiabilité");
});

test("fusion: anomalies de lecture de la sauvegarde → avertissement et comptes retenus", () => {
  const file = fileOf({ weights: [weight("weight_5000", 5_000, 74.2)] });
  const text = JSON.stringify({
    ...file,
    completeness: "complete",
    data: {
      ...file.data,
      weightMeasurements: [
        ...file.data.weightMeasurements,
        { id: "bad_1", recordedAt: 1, weightKg: 5 },
      ],
    },
    counts: { ...file.counts, weightMeasurements: 2 },
  });
  const plan = createMergePlan(parsedFromText(text), localOf());
  assertEqual(plan.backup.hasAnomalies, true, "anomalies");
  assertEqual(
    plan.backup.effectiveCompleteness,
    "incomplete",
    "complétude dégradée",
  );
  assertTrue(hasWarning(plan, "backup_anomalies"), "avertissement");
  assertEqual(
    plan.collections.weightMeasurements.backupInvalidCount,
    1,
    "invalide reportée",
  );
  assertEqual(plan.reliability, "caution", "fiabilité");
});

test("fusion: les compteurs du fichier ne décident pas ; seules les entrées retenues comptent", () => {
  const file = fileOf({ weights: [weight("weight_5000", 5_000, 74.2)] });
  const text = JSON.stringify({
    ...file,
    data: {
      ...file.data,
      weightMeasurements: [
        ...file.data.weightMeasurements,
        { id: "bad_1", recordedAt: 1, weightKg: 5 },
      ],
    },
    counts: { ...file.counts, weightMeasurements: 2 },
  });
  const parsed = parsedFromText(text);
  const plan = createMergePlan(parsed, localOf());
  assertEqual(
    parsed.backup.declaredCounts.weightMeasurements,
    2,
    "le fichier déclare 2",
  );
  assertEqual(
    plan.collections.weightMeasurements.acceptedFromBackup,
    1,
    "une seule retenue",
  );
  assertEqual(
    plan.collections.weightMeasurements.insertions.length,
    1,
    "une seule insertion",
  );
  assertEqual(plan.totals.insertions, 1, "total cohérent");
});

test("fusion: séance de template et d’exercice inconnus conservée", () => {
  const legacy: WorkoutSession = {
    ...session("legacy_1", 500_000, "ancien_template"),
    performances: [
      { ...perf("legacy_1", 500_000), exerciseId: "exercice_disparu" },
    ],
  };
  const plan = createMergePlan(parsedOf({ sessions: [legacy] }), localOf());
  const inserted = plan.collections.workoutSessions.insertions[0];
  assertEqual(inserted?.templateId, "ancien_template", "templateId inchangé");
  assertEqual(
    inserted?.performances[0]?.exerciseId,
    "exercice_disparu",
    "exerciseId inchangé",
  );
  assertEqual(plan.collections.workoutSessions.insertions.length, 1, "insérée");
  assertEqual(plan.reliability, "reliable", "aucun avertissement à tort");
});

test("fusion: aucune modification des objets locaux ni importés", () => {
  const parsed = parsedOf(fullContent());
  const local = localOf({
    weightMeasurements: ok([
      weight("weight_5000", 5_000, 70),
      weight("weight_5000", 5_000, 71),
    ]),
    activities: ok([activity("activity_1000", 1_000, 60)]),
  });
  const before = JSON.stringify({ parsed, local });
  const plan = createMergePlan(parsed, local);
  getMergedCollections(local, plan);
  assertEqual(JSON.stringify({ parsed, local }), before, "entrées intactes");
});

test("fusion: les nombres annoncés correspondent aux entrées réellement classées", () => {
  const local = localOf({
    weightMeasurements: ok([weight("weight_5000", 5_000, 74.2)]),
    activities: ok([activity("activity_3000", 3_000, 99)]),
  });
  const plan = createMergePlan(parsedOf(fullContent()), local);
  let insertions = 0;
  let duplicates = 0;
  let conflicts = 0;
  for (const name of BACKUP_COLLECTIONS) {
    const item = plan.collections[name];
    assertEqual(
      item.acceptedFromBackup,
      item.insertions.length +
        item.exactDuplicateIds.length +
        item.conflicts.length +
        item.unprocessedCount,
      `${name} : toutes les entrées retenues sont classées`,
    );
    insertions += item.insertions.length;
    duplicates += item.exactDuplicateIds.length;
    conflicts += item.conflicts.length;
  }
  assertEqual(plan.totals.insertions, insertions, "insertions");
  assertEqual(plan.totals.exactDuplicates, duplicates, "doublons");
  assertEqual(plan.totals.conflicts, conflicts, "conflits");
  assertEqual(plan.totals.insertions, 5, "valeur attendue");
});

test("fusion: tri déterministe par code unité, indépendant de la locale", () => {
  const upper = session("session_a_B", 4_000_000);
  const lower = session("session_a_a", 3_000_000);
  const plan = createMergePlan(
    parsedOf({ sessions: [lower, upper] }),
    localOf(),
  );
  assertEqual(
    ids(plan.collections.workoutSessions.insertions),
    "session_a_B,session_a_a",
    "majuscule avant minuscule",
  );
  const withDuplicates = createMergePlan(
    parsedOf({
      weights: [weight("weight_b", 2, 71), weight("weight_a", 1, 70)],
    }),
    localOf({
      weightMeasurements: ok([
        weight("weight_b", 2, 71),
        weight("weight_a", 1, 70),
      ]),
    }),
  );
  assertEqual(
    withDuplicates.collections.weightMeasurements.exactDuplicateIds.join(","),
    "weight_a,weight_b",
    "doublons triés",
  );
});

test("fusion: jumeaux probables (nouvel id, même contenu) insérés et signalés, jamais fusionnés", () => {
  const plan = createMergePlan(
    parsedOf({
      weights: [weight("weight_other", 100, 70), weight("weight_200", 200, 70)],
      sessions: [{ ...session("other_id", 1_000_000) }],
    }),
    localOf({
      weightMeasurements: ok([weight("weight_100", 100, 70)]),
      workoutSessions: ok([session("session_a_1000000", 1_000_000)]),
    }),
  );
  const weights = plan.collections.weightMeasurements;
  assertEqual(weights.insertions.length, 2, "les deux sont insérées");
  assertEqual(weights.possibleDuplicates.length, 1, "un seul jumeau probable");
  assertEqual(
    weights.possibleDuplicates[0]?.importedId,
    "weight_other",
    "id importé",
  );
  assertEqual(weights.possibleDuplicates[0]?.localId, "weight_100", "id local");
  assertEqual(
    plan.collections.workoutSessions.possibleDuplicates.length,
    0,
    "jamais pour les séances",
  );
  assertEqual(
    plan.collections.workoutSessions.insertions.length,
    1,
    "séance insérée",
  );
  assertEqual(plan.totals.possibleDuplicates, 1, "total");
});

test("fusion: entrées locales ignorées ou inconnues → prudence ; fiable seulement si mesuré à 0", () => {
  const parsed = parsedOf(fullContent());
  const skipped = createMergePlan(
    parsed,
    localOf({ weightMeasurements: ok<WeightMeasurement>([], 3) }),
  );
  assertTrue(hasWarning(skipped, "local_entries_skipped"), "ignorées");
  assertEqual(skipped.reliability, "caution", "prudence");
  const unknown = createMergePlan(
    parsed,
    localOf({ activities: ok<Activity>([], null) }),
  );
  assertTrue(hasWarning(unknown, "local_skipped_unknown"), "inconnu");
  assertEqual(unknown.reliability, "caution", "prudence");
  const measured = createMergePlan(parsed, localOf());
  assertEqual(
    measured.reliability,
    "reliable",
    "mesuré à 0 sur toutes les collections",
  );
});

test("fusion: doublons locaux du même id → conflit déterministe, doublon exact reconnu", () => {
  const low = weight("weight_9000", 9_000, 70);
  const high = weight("weight_9000", 9_000, 71);
  const parsed = parsedOf({ weights: [weight("weight_9000", 9_000, 72)] });
  const forward = createMergePlan(
    parsed,
    localOf({ weightMeasurements: ok([low, high]) }),
  );
  const backward = createMergePlan(
    parsed,
    localOf({ weightMeasurements: ok([high, low]) }),
  );
  assertEqual(
    forward.collections.weightMeasurements.conflicts[0]?.local.weightKg,
    70,
    "ordre direct",
  );
  assertEqual(
    backward.collections.weightMeasurements.conflicts[0]?.local.weightKg,
    70,
    "ordre inversé",
  );
  const matching = createMergePlan(
    parsedOf({ weights: [weight("weight_9000", 9_000, 71)] }),
    localOf({ weightMeasurements: ok([low, high]) }),
  );
  assertEqual(
    matching.collections.weightMeasurements.exactDuplicateIds.length,
    1,
    "une copie locale identique suffit",
  );
  assertEqual(
    matching.collections.weightMeasurements.conflicts.length,
    0,
    "pas de conflit",
  );
});

test("fusion: résultat fusionné = local inchangé + insertions", () => {
  const local = localOf({
    weightMeasurements: ok([weight("weight_1", 1, 70)]),
  });
  const plan = createMergePlan(
    parsedOf({ weights: [weight("weight_2", 2, 71)] }),
    local,
  );
  const merged = getMergedCollections(local, plan);
  assertEqual(
    ids(merged?.weightMeasurements ?? []),
    "weight_1,weight_2",
    "local puis insertions",
  );
  assertEqual(merged?.workoutSessions.length, 0, "autres collections vides");
});

/* ---------- Anomalies locales et sécurité de persistance ---------- */

test("fusion: doublons locaux strictement identiques → signalés, rien de supprimé", () => {
  const copy = weight("weight_5000", 5_000, 74.2);
  const reordered: WeightMeasurement = {
    weightKg: 74.2,
    recordedAt: 5_000,
    id: "weight_5000",
  };
  const local = localOf({
    weightMeasurements: ok([copy, reordered, weight("weight_7", 7, 70)]),
  });
  const plan = createMergePlan(
    parsedOf({ weights: [weight("weight_6000", 6_000, 75)] }),
    local,
  );
  const weights = plan.collections.weightMeasurements;
  assertEqual(
    weights.localDuplicateIds.join(","),
    "weight_5000",
    "id dupliqué signalé",
  );
  assertEqual(weights.localDuplicateCount, 1, "une copie en trop");
  assertEqual(
    weights.localConflictingIds.length,
    0,
    "pas contradictoire (clés dans un autre ordre)",
  );
  assertEqual(plan.totals.localDuplicates, 1, "total global");
  assertEqual(plan.totals.localConflictingIds, 0, "aucun conflit local global");
  assertTrue(hasWarning(plan, "local_duplicate_ids"), "avertissement");
  assertEqual(plan.reliability, "caution", "au minimum prudence");
  assertEqual(
    weights.localCount,
    3,
    "les trois entrées locales sont comptées, aucune retirée",
  );
  const merged = getMergedCollections(local, plan);
  assertEqual(
    merged?.weightMeasurements.length,
    4,
    "les deux copies locales conservées + insertion",
  );
  assertEqual(
    plan.collections.activities.localDuplicateCount,
    0,
    "autres collections intactes",
  );
});

test("fusion: doublons locaux contradictoires → signalés, rien de fusionné ni remplacé", () => {
  const a = activity("activity_9", 9_000, 30);
  const b = activity("activity_9", 9_000, 45);
  const local = localOf({ activities: ok([a, b]) });
  const plan = createMergePlan(
    parsedOf({ activities: [activity("activity_10", 10_000, 20)] }),
    local,
  );
  const activities = plan.collections.activities;
  assertEqual(
    activities.localConflictingIds.join(","),
    "activity_9",
    "id contradictoire signalé",
  );
  assertEqual(
    activities.localDuplicateIds.length,
    0,
    "pas un doublon identique",
  );
  assertEqual(
    activities.localDuplicateCount,
    0,
    "aucune copie identique en trop",
  );
  assertEqual(plan.totals.localConflictingIds, 1, "total global");
  assertTrue(hasWarning(plan, "local_conflicting_ids"), "avertissement");
  assertEqual(plan.reliability, "caution", "au minimum prudence");
  const merged = getMergedCollections(local, plan);
  assertEqual(
    merged?.activities.length,
    3,
    "les deux versions locales conservées + insertion",
  );
  assertEqual(
    merged?.activities
      .filter((item) => item.id === "activity_9")
      .map((item) => item.durationMinutes)
      .join(","),
    "30,45",
    "contenus locaux intacts",
  );
});

test("fusion: ordre local inversé → même rapport d’anomalies locales", () => {
  const parsed = parsedOf(fullContent());
  const items = [
    weight("weight_5000", 5_000, 74.2),
    weight("weight_5000", 5_000, 74.2),
    weight("weight_8000", 8_000, 70),
    weight("weight_8000", 8_000, 71),
    weight("weight_a", 1, 60),
    weight("weight_a", 1, 60),
  ];
  const forward = createMergePlan(
    parsed,
    localOf({ weightMeasurements: ok(items) }),
  );
  const backward = createMergePlan(
    parsed,
    localOf({ weightMeasurements: ok([...items].reverse()) }),
  );
  assertEqual(
    JSON.stringify(forward),
    JSON.stringify(backward),
    "plans identiques",
  );
  assertEqual(
    forward.collections.weightMeasurements.localDuplicateIds.join(","),
    "weight_5000,weight_a",
    "doublons triés par code unité",
  );
  assertEqual(
    forward.collections.weightMeasurements.localDuplicateCount,
    2,
    "copies en trop",
  );
  assertEqual(
    forward.collections.weightMeasurements.localConflictingIds.join(","),
    "weight_8000",
    "contradictoires",
  );
});

test("persistance: skippedByRepository > 0 → collection non sûre à réécrire, plan toujours calculable", () => {
  const plan = createMergePlan(
    parsedOf(fullContent()),
    localOf({ weightMeasurements: ok<WeightMeasurement>([], 3) }),
  );
  const weights = plan.collections.weightMeasurements;
  assertEqual(weights.persistence.safeToRewrite, false, "non sûre");
  assertEqual(
    weights.persistence.reasons.join(","),
    "local_entries_skipped",
    "raison",
  );
  assertEqual(weights.status, "ready", "plan calculé malgré tout");
  assertEqual(
    weights.insertions.length,
    2,
    "insertions visibles dans la prévisualisation",
  );
  assertEqual(plan.previewComplete, true, "prévisualisation complète");
  assertEqual(plan.persistence.canPersist, false, "persistance refusée");
  assertEqual(
    plan.persistence.unsafeCollections.join(","),
    "weightMeasurements",
    "collection non sûre listée",
  );
  assertEqual(
    plan.collections.activities.persistence.safeToRewrite,
    true,
    "autres collections sûres",
  );
});

test("persistance: skippedByRepository null → collection non sûre, même si la prévisualisation continue", () => {
  const plan = createMergePlan(
    parsedOf(fullContent()),
    localOf({ activities: ok<Activity>([], null) }),
  );
  const activities = plan.collections.activities;
  assertEqual(activities.persistence.safeToRewrite, false, "non sûre");
  assertEqual(
    activities.persistence.reasons.join(","),
    "local_skipped_unknown",
    "raison",
  );
  assertTrue(hasWarning(plan, "local_skipped_unknown"), "avertissement");
  assertEqual(
    plan.blockers.length,
    0,
    "aucun blocage : la prévisualisation continue",
  );
  assertEqual(plan.reliability, "caution", "prudence");
  assertEqual(plan.persistence.canPersist, false, "persistance refusée");
  const none = createMergePlan(parsedOf(fullContent()), localOf());
  assertEqual(
    none.collections.activities.persistence.safeToRewrite,
    true,
    "mesuré à 0 : sûre",
  );
});

test("persistance: prévisualisation calculable ≠ réécriture autorisée", () => {
  const onlyWeights = parsedOf({ weights: [weight("weight_6000", 6_000, 75)] });

  const unsafeButUntouched = createMergePlan(
    onlyWeights,
    localOf({ activities: ok<Activity>([], null) }),
  );
  assertEqual(
    unsafeButUntouched.persistence.canPersist,
    true,
    "collection non sûre sans insertion : ne bloque pas",
  );
  assertEqual(
    unsafeButUntouched.persistence.collectionsToWrite.join(","),
    "weightMeasurements",
    "seule la collection modifiée est à écrire",
  );
  assertEqual(
    unsafeButUntouched.persistence.unsafeCollections.join(","),
    "activities",
    "non sûre mais non écrite",
  );

  const unsafeAndWritten = createMergePlan(
    onlyWeights,
    localOf({ weightMeasurements: ok<WeightMeasurement>([], null) }),
  );
  assertEqual(unsafeAndWritten.previewComplete, true, "plan calculable");
  assertEqual(unsafeAndWritten.totals.insertions, 1, "insertion proposée");
  assertEqual(
    unsafeAndWritten.persistence.canPersist,
    false,
    "mais réécriture refusée",
  );

  const readError = createMergePlan(
    onlyWeights,
    localOf({ weightMeasurements: readFailure<WeightMeasurement>() }),
  );
  assertEqual(
    readError.previewComplete,
    false,
    "erreur de lecture : prévisualisation incomplète",
  );
  assertEqual(readError.persistence.canPersist, false, "réécriture refusée");

  const empty = createMergePlan(parsedOf(), localOf());
  assertEqual(empty.previewComplete, true, "rien à insérer : plan calculable");
  assertEqual(empty.persistence.canPersist, false, "mais rien à persister");
});
