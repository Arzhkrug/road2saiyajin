import {
  createPausedTimerAt,
  createTimer,
  getElapsedMs,
  getRemainingMs,
  pauseTimer,
  resumeTimer,
  startTimer,
  syncTimer,
} from "../timer/countdown";
import { getEmomPosition, getEmomTotalMs } from "../timer/emomClock";
import { SESSION_A_TEMPLATE } from "../workouts/seed";
import type { EmomConfig } from "../workouts/types";
import { assertEqual, assertTrue, test } from "./harness";

const MINUTE = 60_000;

const emomConfig = (): EmomConfig => {
  const block = SESSION_A_TEMPLATE.blocks[0];
  if (block === undefined || block.type !== "emom") {
    throw new Error("La Session A doit commencer par un bloc EMOM");
  }
  return block.config;
};

test("timer: idle avant démarrage", () => {
  const timer = createTimer(60_000);
  assertEqual(timer.status, "idle", "statut");
  assertEqual(getRemainingMs(timer, 123_456), 60_000, "reste");
});

test("timer: démarrage et temps restant calculé depuis les timestamps", () => {
  const timer = startTimer(createTimer(60_000), 1_000);
  assertEqual(timer.status, "running", "statut");
  assertEqual(getRemainingMs(timer, 1_000), 60_000, "reste à t0");
  assertEqual(
    getRemainingMs(timer, 18_000),
    43_000,
    "reste sans aucun tick intermédiaire",
  );
});

test("timer: expiration", () => {
  const timer = startTimer(createTimer(60_000), 0);
  assertEqual(syncTimer(timer, 59_999).status, "running", "avant expiration");
  const done = syncTimer(timer, 60_000);
  assertEqual(done.status, "completed", "à expiration");
  assertEqual(getRemainingMs(done, 999_999), 0, "reste final");
});

test("timer: pause fige le temps, reprise sans dérive", () => {
  const running = startTimer(createTimer(60_000), 0);
  const paused = pauseTimer(running, 10_000);
  assertEqual(paused.status, "paused", "statut pause");
  assertEqual(
    getElapsedMs(paused, 40_000),
    10_000,
    "écoulé figé pendant la pause",
  );
  const resumed = resumeTimer(paused, 40_000);
  assertEqual(resumed.status, "running", "statut reprise");
  assertEqual(getElapsedMs(resumed, 40_000), 10_000, "écoulé à la reprise");
  assertEqual(
    getElapsedMs(resumed, 50_000),
    20_000,
    "écoulé 10 s après reprise",
  );
});

test("timer: pause après expiration donne completed", () => {
  const timer = startTimer(createTimer(1_000), 0);
  assertEqual(pauseTimer(timer, 5_000).status, "completed", "statut");
});

test("timer: reprise à une position donnée", () => {
  const paused = createPausedTimerAt(1_200_000, 180_000, 5_000);
  assertEqual(getElapsedMs(paused, 99_999), 180_000, "écoulé en pause");
  const resumed = resumeTimer(paused, 10_000);
  assertEqual(getElapsedMs(resumed, 20_000), 190_000, "écoulé après reprise");
});

test("emom: durée totale 20 minutes", () => {
  assertEqual(getEmomTotalMs(emomConfig()), 20 * MINUTE, "durée");
});

test("emom: minute 1 = premier mouvement, minute 2 = deuxième", () => {
  const config = emomConfig();
  const first = getEmomPosition(config, 0);
  assertEqual(first.intervalNumber, 1, "minute 1");
  assertEqual(
    first.movement?.exerciseId,
    "pull_up_pronation",
    "exercice minute 1",
  );
  assertEqual(first.movement?.targetReps, 6, "cible minute 1");
  const second = getEmomPosition(config, MINUTE);
  assertEqual(second.intervalNumber, 2, "minute 2");
  assertEqual(second.movement?.exerciseId, "dips", "exercice minute 2");
  assertEqual(second.movement?.targetReps, 8, "cible minute 2");
});

test("emom: alternance sur 20 minutes", () => {
  const config = emomConfig();
  for (let index = 0; index < 20; index += 1) {
    const position = getEmomPosition(config, index * MINUTE + 1_000);
    const expected = index % 2 === 0 ? "pull_up_pronation" : "dips";
    assertEqual(position.movement?.exerciseId, expected, `minute ${index + 1}`);
  }
});

test("emom: fin à 20 minutes", () => {
  const config = emomConfig();
  const last = getEmomPosition(config, 20 * MINUTE - 1);
  assertEqual(last.isFinished, false, "avant la fin");
  assertEqual(last.intervalNumber, 20, "dernière minute");
  const end = getEmomPosition(config, 20 * MINUTE);
  assertTrue(end.isFinished, "terminé à 20 min");
  assertEqual(end.startedIntervals, 20, "intervalles démarrés");
});

test("emom: plusieurs minutes écoulées en arrière-plan", () => {
  const position = getEmomPosition(emomConfig(), 7 * MINUTE + 5_000);
  assertEqual(position.intervalNumber, 8, "minute courante");
  assertEqual(position.movement?.exerciseId, "dips", "exercice");
  assertEqual(position.intervalRemainingMs, 55_000, "reste dans la minute");
});
