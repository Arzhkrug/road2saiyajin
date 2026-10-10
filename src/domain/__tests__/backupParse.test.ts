import type { Activity } from "../activities/types";
import {
  BACKUP_COLLECTIONS,
  BACKUP_FORMAT,
  buildBackup,
  parseBackup,
  serializeBackup,
  type BackupCollection,
  type BackupCollectionSource,
  type BackupFile,
  type BackupIssue,
  type BackupIssueCode,
  type BackupSources,
  type ParseBackupResult,
} from "../backup";
import type { BodyCompositionMeasurement } from "../body/composition/types";
import type { WeightMeasurement } from "../body/types";
import { SEED_EXERCISES } from "../exercises/catalog";
import { SEED_WORKOUT_TEMPLATES } from "../workouts/seed";
import type {
  PerformanceEntry,
  SessionStatus,
  WorkoutSession,
} from "../workouts/types";
import { assertEqual, assertTrue, test } from "./harness";

/* ---------- Jeux de données ---------- */

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

const source = <T>(items: readonly T[]): BackupCollectionSource<T> => ({
  items,
  skippedByRepository: 0,
  readError: null,
});

const buildInput = (sources: BackupSources) => ({
  exportedAt: 1_900_000_000_000,
  appVersion: "1.0.0",
  sources,
  catalog: {
    templateIds: SEED_WORKOUT_TEMPLATES.map((template) => template.id),
    exerciseIds: SEED_EXERCISES.map((exercise) => exercise.id),
  },
});

const baseSources = (): BackupSources => ({
  workoutSessions: source(sessions()),
  weightMeasurements: source(weights()),
  bodyCompositionMeasurements: source(compositions()),
  activities: source(activities()),
});

const baseFile = (): BackupFile => buildBackup(buildInput(baseSources())).file;
const baseText = (): string => serializeBackup(baseFile());

/** Remplace des champs de l'enveloppe ; une valeur `undefined` supprime le champ du JSON. */
const withFields = (overrides: Record<string, unknown>): string =>
  JSON.stringify({ ...baseFile(), ...overrides });

/** Remplace une collection ET son compteur déclaré. */
const withCollection = (
  key: BackupCollection,
  entries: readonly unknown[],
): string => {
  const file = baseFile();
  return JSON.stringify({
    ...file,
    data: { ...file.data, [key]: entries },
    counts: { ...file.counts, [key]: entries.length },
  });
};

const failed = (text: string): readonly BackupIssue[] => {
  const result = parseBackup(text);
  if (result.ok) {
    throw new Error(`échec attendu pour : ${text.slice(0, 80)}`);
  }
  return result.errors;
};

const succeeded = (text: string): Extract<ParseBackupResult, { ok: true }> => {
  const result = parseBackup(text);
  if (!result.ok) {
    throw new Error(
      `succès attendu, erreurs : ${JSON.stringify(result.errors)}`,
    );
  }
  return result;
};

const has = (
  errors: readonly BackupIssue[],
  code: BackupIssueCode,
  path: string,
): boolean =>
  errors.some((error) => error.code === code && error.path === path);

/* ---------- Succès ---------- */

test("lecture: une sauvegarde valide est acceptée sans anomalie, données identiques", () => {
  const file = baseFile();
  const result = succeeded(baseText());
  assertEqual(result.backup.format, BACKUP_FORMAT, "format");
  assertEqual(result.backup.schemaVersion, 1, "version");
  assertEqual(result.backup.exportedAt, file.exportedAt, "exportedAt");
  assertEqual(result.backup.appVersion, "1.0.0", "appVersion");
  assertEqual(
    JSON.stringify(result.backup.data),
    JSON.stringify(file.data),
    "données",
  );
  assertEqual(
    JSON.stringify(result.backup.declaredCounts),
    JSON.stringify(file.counts),
    "compteurs",
  );
  assertEqual(
    JSON.stringify(result.backup.catalogRefs),
    JSON.stringify(file.catalogRefs),
    "catalogue",
  );
  assertEqual(result.report.hasAnomalies, false, "aucune anomalie");
  assertEqual(result.report.issues.length, 0, "aucun problème");
  assertEqual(result.report.declaredCompleteness, "complete", "déclarée");
  assertEqual(result.report.effectiveCompleteness, "complete", "effective");
});

test("lecture: séances terminées, en cours et annulées conservées", () => {
  const result = succeeded(baseText());
  const statuses = result.backup.data.workoutSessions.map(
    (session) => session.status,
  );
  assertEqual(statuses.join(","), "completed,in_progress,cancelled", "statuts");
  assertEqual(
    result.backup.data.workoutSessions[0]?.bodyweightKg,
    74.2,
    "snapshot de poids",
  );
  assertEqual(
    result.backup.data.workoutSessions[0]?.performances[1]?.actualReps,
    9,
    "performance",
  );
});

test("lecture: séance historique à template et exercice inconnus conservée", () => {
  const legacy = makeSession(
    "legacy_1",
    "completed",
    500_000,
    80,
    [
      {
        ...perf("legacy_1", 1, 7, 500_000, 80),
        exerciseId: "exercice_disparu",
      },
    ],
    "ancien_template",
  );
  const result = succeeded(
    withCollection("workoutSessions", [...sessions(), legacy]),
  );
  assertEqual(result.backup.data.workoutSessions.length, 4, "séance conservée");
  assertEqual(
    result.backup.data.workoutSessions.find(
      (session) => session.id === "legacy_1",
    )?.templateId,
    "ancien_template",
    "templateId inchangé",
  );
  assertEqual(result.report.hasAnomalies, false, "aucune anomalie");
  assertEqual(
    result.report.effectiveCompleteness,
    "complete",
    "aucune perte signalée à tort",
  );
});

test("lecture: ids distincts au même timestamp tous conservés", () => {
  const result = succeeded(baseText());
  assertEqual(result.backup.data.weightMeasurements.length, 3, "poids");
  assertEqual(
    result.backup.data.bodyCompositionMeasurements.length,
    3,
    "composition",
  );
  assertEqual(result.backup.data.activities.length, 3, "activités");
  for (const collection of BACKUP_COLLECTIONS) {
    const report = result.report.collections[collection];
    assertEqual(
      report.duplicateCount + report.conflictCount + report.invalidCount,
      0,
      collection,
    );
  }
});

test("lecture: champs inconnus de l’enveloppe ignorés (politique conservatrice)", () => {
  const result = succeeded(withFields({ futureField: { x: 1 } }));
  assertEqual(result.report.hasAnomalies, false, "aucune anomalie");
  assertEqual(
    "futureField" in result.backup,
    false,
    "non repris dans le résultat",
  );
});

/* ---------- Texte, JSON, format, version ---------- */

test("lecture: chaîne vide ou blanche refusée", () => {
  for (const text of ["", "   ", "\n\t"]) {
    assertTrue(
      has(failed(text), "empty_input", ""),
      `vide : ${JSON.stringify(text)}`,
    );
  }
});

test("lecture: JSON malformé ou tronqué refusé", () => {
  for (const text of [
    "{",
    '{"format":',
    "pas du json",
    baseText().slice(0, 200),
  ]) {
    assertTrue(
      has(failed(text), "invalid_json", ""),
      `malformé : ${text.slice(0, 20)}`,
    );
  }
});

test("lecture: valeur JSON primitive, nulle ou tableau refusée", () => {
  for (const text of ["42", '"texte"', "null", "true", "[]", "[1,2]"]) {
    assertTrue(has(failed(text), "not_an_object", ""), `valeur : ${text}`);
  }
});

test("lecture: format inconnu ou absent refusé", () => {
  for (const format of ["autre-application", "", 5, null, undefined]) {
    assertTrue(
      has(failed(withFields({ format })), "unknown_format", "format"),
      `format : ${String(format)}`,
    );
  }
});

test("lecture: version de schéma invalide refusée", () => {
  for (const schemaVersion of ["1", 1.5, 0, -1, null, undefined]) {
    assertTrue(
      has(
        failed(withFields({ schemaVersion })),
        "invalid_schema_version",
        "schemaVersion",
      ),
      `version : ${String(schemaVersion)}`,
    );
  }
});

test("lecture: version de schéma non prise en charge refusée, sans conversion", () => {
  for (const schemaVersion of [2, 3, 999]) {
    const errors = failed(withFields({ schemaVersion }));
    assertTrue(
      has(errors, "unsupported_schema_version", "schemaVersion"),
      `version ${schemaVersion}`,
    );
    assertEqual(
      errors.length,
      1,
      "une seule erreur, aucune tentative de lecture des données",
    );
  }
});

/* ---------- Enveloppe ---------- */

test("lecture: champs d’enveloppe manquants refusés", () => {
  for (const key of [
    "exportedAt",
    "appVersion",
    "completeness",
    "data",
    "counts",
    "catalogRefs",
  ]) {
    assertTrue(
      has(failed(withFields({ [key]: undefined })), "missing_field", key),
      `manquant : ${key}`,
    );
  }
});

test("lecture: collections manquantes ou invalides refusées", () => {
  const file = baseFile();
  for (const key of BACKUP_COLLECTIONS) {
    const missing = JSON.stringify({
      ...file,
      data: { ...file.data, [key]: undefined },
    });
    assertTrue(
      has(failed(missing), "missing_field", `data.${key}`),
      `manquante : ${key}`,
    );
    for (const value of [{}, null, "texte", 5]) {
      const invalid = JSON.stringify({
        ...file,
        data: { ...file.data, [key]: value },
      });
      assertTrue(
        has(failed(invalid), "invalid_collection", `data.${key}`),
        `invalide : ${key} = ${JSON.stringify(value)}`,
      );
    }
  }
  assertTrue(
    has(failed(withFields({ data: [] })), "invalid_field", "data"),
    "data tableau",
  );
});

test("lecture: métadonnées invalides refusées", () => {
  for (const exportedAt of [-1, 1.5, "5", null]) {
    assertTrue(
      has(failed(withFields({ exportedAt })), "invalid_field", "exportedAt"),
      `exportedAt ${String(exportedAt)}`,
    );
  }
  for (const appVersion of ["", "  ", 5, null]) {
    assertTrue(
      has(failed(withFields({ appVersion })), "invalid_field", "appVersion"),
      `appVersion ${String(appVersion)}`,
    );
  }
  for (const completeness of ["parfaite", 5, null]) {
    assertTrue(
      has(
        failed(withFields({ completeness })),
        "invalid_field",
        "completeness",
      ),
      `completeness ${String(completeness)}`,
    );
  }
});

test("lecture: plusieurs erreurs d’enveloppe signalées ensemble", () => {
  const errors = failed(
    withFields({ exportedAt: -1, appVersion: "", completeness: "x" }),
  );
  assertTrue(has(errors, "invalid_field", "exportedAt"), "exportedAt");
  assertTrue(has(errors, "invalid_field", "appVersion"), "appVersion");
  assertTrue(has(errors, "invalid_field", "completeness"), "completeness");
});

test("lecture: références du catalogue invalides refusées", () => {
  const file = baseFile();
  const refs = (value: unknown): string => withFields({ catalogRefs: value });
  assertTrue(
    has(failed(refs("x")), "invalid_field", "catalogRefs"),
    "pas un objet",
  );
  assertTrue(
    has(
      failed(refs({ ...file.catalogRefs, templateIds: "session_a" })),
      "invalid_field",
      "catalogRefs.templateIds",
    ),
    "templateIds non tableau",
  );
  assertTrue(
    has(
      failed(refs({ ...file.catalogRefs, exerciseIds: ["dips", ""] })),
      "invalid_field",
      "catalogRefs.exerciseIds",
    ),
    "identifiant vide",
  );
  assertTrue(
    has(
      failed(refs({ ...file.catalogRefs, exerciseIds: ["dips", 5] })),
      "invalid_field",
      "catalogRefs.exerciseIds",
    ),
    "identifiant non textuel",
  );
  assertTrue(
    has(
      failed(refs({ templateIds: [] })),
      "missing_field",
      "catalogRefs.exerciseIds",
    ),
    "exerciseIds manquant",
  );
});

/* ---------- Compteurs ---------- */

test("lecture: compteurs invalides refusés", () => {
  const file = baseFile();
  for (const value of [-1, 1.5, "3", null]) {
    const text = withFields({ counts: { ...file.counts, activities: value } });
    assertTrue(
      has(failed(text), "invalid_field", "counts.activities"),
      `compteur ${String(value)}`,
    );
  }
  assertTrue(
    has(
      failed(withFields({ counts: { ...file.counts, activities: undefined } })),
      "missing_field",
      "counts.activities",
    ),
    "compteur manquant",
  );
});

test("lecture: compteur différent du contenu refusé (supérieur et inférieur)", () => {
  const file = baseFile();
  for (const declared of [99, 2, 0]) {
    const errors = failed(
      withFields({ counts: { ...file.counts, activities: declared } }),
    );
    assertTrue(
      has(errors, "count_mismatch", "counts.activities"),
      `déclaré ${declared}`,
    );
    assertEqual(errors[0]?.collection, "activities", "collection signalée");
  }
  const several = failed(
    withFields({
      counts: { ...file.counts, workoutSessions: 10, weightMeasurements: 10 },
    }),
  );
  assertEqual(
    several.filter((error) => error.code === "count_mismatch").length,
    2,
    "plusieurs écarts",
  );
});

/* ---------- Entrées ---------- */

test("lecture: entrée invalide dans chaque collection, exclue et signalée", () => {
  const cases: {
    key: BackupCollection;
    good: readonly unknown[];
    bad: unknown;
  }[] = [
    {
      key: "workoutSessions",
      good: sessions(),
      bad: { ...sessions()[0], id: "bad_1", status: "inconnu" },
    },
    {
      key: "weightMeasurements",
      good: weights(),
      bad: { id: "bad_1", recordedAt: 77, weightKg: 5 },
    },
    {
      key: "bodyCompositionMeasurements",
      good: compositions(),
      bad: { ...compositions()[0], id: "bad_1", bodyFatPercent: null },
    },
    {
      key: "activities",
      good: activities(),
      bad: { ...activities()[0], id: "bad_1", durationMinutes: 0 },
    },
  ];
  for (const { key, good, bad } of cases) {
    const result = succeeded(withCollection(key, [...good, bad]));
    const report = result.report.collections[key];
    assertEqual(report.receivedCount, good.length + 1, `${key} : reçues`);
    assertEqual(report.acceptedCount, good.length, `${key} : acceptées`);
    assertEqual(report.invalidCount, 1, `${key} : invalides`);
    assertEqual(
      result.backup.data[key].length,
      good.length,
      `${key} : données`,
    );
    const found = result.report.issues.find(
      (item) => item.code === "invalid_entry",
    );
    assertEqual(found?.collection, key, `${key} : collection signalée`);
    assertEqual(found?.index, good.length, `${key} : index signalé`);
    assertEqual(found?.id, "bad_1", `${key} : id signalé`);
    assertEqual(found?.path, `data.${key}[${good.length}]`, `${key} : chemin`);
    assertTrue((found?.message.length ?? 0) > 0, `${key} : raison`);
    assertEqual(
      result.report.effectiveCompleteness,
      "incomplete",
      `${key} : complétude dégradée`,
    );
    assertEqual(
      result.report.declaredCompleteness,
      "complete",
      `${key} : déclaration conservée`,
    );
  }
});

test("lecture: entrée qui n’est pas un objet, ou sans id, invalide sans planter", () => {
  const result = succeeded(
    withCollection("weightMeasurements", [
      ...weights(),
      null,
      5,
      "x",
      [],
      { recordedAt: 1, weightKg: 70 },
    ]),
  );
  const report = result.report.collections.weightMeasurements;
  assertEqual(report.invalidCount, 5, "cinq invalides");
  assertEqual(report.acceptedCount, 3, "trois valides");
  const noId = result.report.issues.find((item) => item.index === 7);
  assertEqual(noId?.id, null, "id absent signalé comme null");
});

test("lecture: id dupliqué au contenu identique → une copie, doublon signalé", () => {
  const copy: WeightMeasurement = {
    weightKg: 74.2,
    recordedAt: 5_000,
    id: "weight_5000",
  };
  const forward = succeeded(
    withCollection("weightMeasurements", [...weights(), copy]),
  );
  const backward = succeeded(
    withCollection("weightMeasurements", [copy, ...weights()]),
  );
  for (const result of [forward, backward]) {
    const report = result.report.collections.weightMeasurements;
    assertEqual(report.acceptedCount, 3, "une seule copie");
    assertEqual(report.duplicateCount, 1, "doublon compté");
    assertEqual(report.conflictCount, 0, "pas un conflit");
    assertEqual(report.invalidCount, 0, "pas invalide");
    const found = result.report.issues.find(
      (item) => item.code === "duplicate_id",
    );
    assertEqual(found?.id, "weight_5000", "id signalé");
    assertEqual(
      result.report.effectiveCompleteness,
      "incomplete",
      "complétude dégradée",
    );
  }
  assertEqual(
    JSON.stringify(
      forward.backup.data.weightMeasurements.map((item) => item.id).sort(),
    ),
    JSON.stringify(
      backward.backup.data.weightMeasurements.map((item) => item.id).sort(),
    ),
    "mêmes ids acceptés quel que soit l’ordre",
  );
});

test("lecture: id avec contenus contradictoires → conflit, toutes versions exclues", () => {
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
  for (const entries of [
    [...weights(), a, b],
    [b, a, ...weights()],
  ]) {
    const result = succeeded(withCollection("weightMeasurements", entries));
    const report = result.report.collections.weightMeasurements;
    assertEqual(report.conflictCount, 1, "conflit compté");
    assertEqual(report.conflictingIds.join(","), "weight_9000", "id signalé");
    assertEqual(report.duplicateCount, 0, "pas un doublon");
    assertEqual(report.acceptedCount, 3, "id en conflit exclu");
    assertTrue(
      result.backup.data.weightMeasurements.every(
        (item) => item.id !== "weight_9000",
      ),
      "aucune version conservée",
    );
    const found = result.report.issues.find(
      (item) => item.code === "conflicting_id",
    );
    assertEqual(found?.collection, "weightMeasurements", "collection signalée");
    assertEqual(found?.id, "weight_9000", "id du conflit");
    assertEqual(
      result.report.effectiveCompleteness,
      "incomplete",
      "complétude dégradée",
    );
  }
});

test("lecture: un conflit dans une séance est détecté sur le contenu complet", () => {
  const original = sessions()[0];
  const altered: unknown = {
    ...original,
    performances: [{ ...perf("session_a_1000000", 1, 7, 1_000_000, 74.2) }],
  };
  const result = succeeded(
    withCollection("workoutSessions", [...sessions(), altered]),
  );
  assertEqual(
    result.report.collections.workoutSessions.conflictCount,
    1,
    "conflit",
  );
  assertEqual(
    result.report.collections.workoutSessions.acceptedCount,
    2,
    "les deux versions exclues",
  );
});

test("lecture: même id dans deux collections différentes, aucun faux conflit", () => {
  const sharedWeight: WeightMeasurement = {
    id: "shared_1",
    recordedAt: 7_000,
    weightKg: 70,
  };
  const sharedComposition: BodyCompositionMeasurement = {
    id: "shared_1",
    recordedAt: 7_000,
    bodyFatPercent: 20,
    muscleMassKg: null,
    bmi: null,
    visceralFatIndex: null,
    waterPercent: null,
  };
  const file = baseFile();
  const text = JSON.stringify({
    ...file,
    data: {
      ...file.data,
      weightMeasurements: [...weights(), sharedWeight],
      bodyCompositionMeasurements: [...compositions(), sharedComposition],
    },
    counts: {
      ...file.counts,
      weightMeasurements: 4,
      bodyCompositionMeasurements: 4,
    },
  });
  const result = succeeded(text);
  assertEqual(result.report.hasAnomalies, false, "aucune anomalie");
  assertEqual(result.backup.data.weightMeasurements.length, 4, "poids");
  assertEqual(
    result.backup.data.bodyCompositionMeasurements.length,
    4,
    "composition",
  );
});

/* ---------- Complétude ---------- */

test("lecture: complétude déclarée incomplète ou non vérifiée correctement signalée", () => {
  const incomplete = succeeded(withFields({ completeness: "incomplete" }));
  assertEqual(incomplete.report.declaredCompleteness, "incomplete", "déclarée");
  assertEqual(
    incomplete.report.effectiveCompleteness,
    "incomplete",
    "effective",
  );
  assertEqual(incomplete.report.hasAnomalies, false, "sans anomalie propre");

  const unverified = succeeded(withFields({ completeness: "unverified" }));
  assertEqual(unverified.report.declaredCompleteness, "unverified", "déclarée");
  assertEqual(
    unverified.report.effectiveCompleteness,
    "unverified",
    "jamais promue en complète",
  );
  assertEqual(
    unverified.backup.effectiveCompleteness,
    "unverified",
    "dans la sauvegarde aussi",
  );
});

test("lecture: une anomalie dégrade une sauvegarde déclarée complète ou non vérifiée", () => {
  const bad = { id: "bad_1", recordedAt: 1, weightKg: 5 };
  for (const declared of ["complete", "unverified"] as const) {
    const file = baseFile();
    const text = JSON.stringify({
      ...file,
      completeness: declared,
      data: { ...file.data, weightMeasurements: [...weights(), bad] },
      counts: { ...file.counts, weightMeasurements: 4 },
    });
    const result = succeeded(text);
    assertEqual(
      result.report.declaredCompleteness,
      declared,
      "déclaration conservée",
    );
    assertEqual(
      result.report.effectiveCompleteness,
      "incomplete",
      "effective dégradée",
    );
  }
});

/* ---------- Déterminisme ---------- */

test("lecture: résultat déterministe pour une même entrée", () => {
  const text = baseText();
  assertEqual(
    JSON.stringify(parseBackup(text)),
    JSON.stringify(parseBackup(text)),
    "résultat identique",
  );
  const bad = withCollection("weightMeasurements", [
    ...weights(),
    { id: "bad_1", recordedAt: 1, weightKg: 5 },
  ]);
  assertEqual(
    JSON.stringify(parseBackup(bad)),
    JSON.stringify(parseBackup(bad)),
    "avec anomalies",
  );
  const failing = withFields({ exportedAt: -1, appVersion: "" });
  assertEqual(
    JSON.stringify(parseBackup(failing)),
    JSON.stringify(parseBackup(failing)),
    "échec identique",
  );
});

test("lecture: l’entrée n’est pas modifiée et le cycle export → lecture → export est identique", () => {
  const text = baseText();
  const copy = `${text}`;
  const result = succeeded(text);
  assertEqual(text, copy, "texte inchangé");
  const toSource = <T>(items: readonly T[]): BackupCollectionSource<T> =>
    source(items);
  const rebuilt = buildBackup({
    exportedAt: result.backup.exportedAt,
    appVersion: result.backup.appVersion,
    sources: {
      workoutSessions: toSource(result.backup.data.workoutSessions),
      weightMeasurements: toSource(result.backup.data.weightMeasurements),
      bodyCompositionMeasurements: toSource(
        result.backup.data.bodyCompositionMeasurements,
      ),
      activities: toSource(result.backup.data.activities),
    },
    catalog: result.backup.catalogRefs,
  });
  assertEqual(
    serializeBackup(rebuilt.file),
    text,
    "aucune perte ni altération",
  );
});
