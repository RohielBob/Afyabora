// Fuseau horaire du TÉLÉPHONE, pour le moteur d'analyse @glyka/analytics (L3-02, L8-11).
import type { PatientTimeZone } from '@glyka/analytics';

/**
 * Fuseau du téléphone, instant par instant (minutes, UTC+1 → 60). Un seul décalage pris « maintenant »
 * serait faux d'une heure pour les mesures d'avant un changement d'heure (pays avec heure d'été).
 */
export const deviceTimeZone: PatientTimeZone = (at: number) => -new Date(at).getTimezoneOffset();
