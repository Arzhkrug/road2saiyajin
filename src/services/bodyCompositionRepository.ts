import { createBodyCompositionRepository } from "../domain";
import { storage } from "../storage";

export const bodyCompositionRepository =
  createBodyCompositionRepository(storage);
