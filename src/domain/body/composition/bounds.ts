import type { CompositionIndicator } from "./types";

/**
 * Limites de VALIDATION LOGICIELLE de la saisie : elles servent uniquement à
 * refuser des valeurs absurdes (faute de frappe, unité confondue).
 * Ce ne sont PAS des repères de santé ni des recommandations médicales.
 */
export const COMPOSITION_BOUNDS: Readonly<
  Record<CompositionIndicator, { readonly min: number; readonly max: number }>
> = {
  bodyFatPercent: { min: 1, max: 75 },
  muscleMassKg: { min: 5, max: 150 },
  bmi: { min: 8, max: 80 },
  visceralFatIndex: { min: 1, max: 60 },
  waterPercent: { min: 20, max: 90 },
};
