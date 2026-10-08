import { createActivityRepository } from "../domain";
import { storage } from "../storage";

export const activityRepository = createActivityRepository(storage);
