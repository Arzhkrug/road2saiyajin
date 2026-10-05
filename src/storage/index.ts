import { asyncStorageStore } from "./asyncStorageStore";
import type { KeyValueStore } from "./types";

export type { KeyValueStore } from "./types";

export const storage: KeyValueStore = asyncStorageStore;
