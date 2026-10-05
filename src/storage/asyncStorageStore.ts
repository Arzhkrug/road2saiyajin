import AsyncStorage from "@react-native-async-storage/async-storage";

import type { KeyValueStore } from "./types";

const KEY_PREFIX = "r2s:";

const withPrefix = (key: string): string => `${KEY_PREFIX}${key}`;

export const asyncStorageStore: KeyValueStore = {
  async getItem<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(withPrefix(key));
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(withPrefix(key), JSON.stringify(value));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(withPrefix(key));
  },
};
