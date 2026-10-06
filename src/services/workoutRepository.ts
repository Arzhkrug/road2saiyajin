import { createWorkoutRepository } from "../domain";
import { storage } from "../storage";

export const workoutRepository = createWorkoutRepository(storage);
