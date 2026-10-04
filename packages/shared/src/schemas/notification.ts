import { z } from 'zod';
import { NOTIFICATION_CATEGORIES } from '../enums';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const notificationPreferencesSchema = z.object({
  enabled: z.record(z.enum(NOTIFICATION_CATEGORIES), z.boolean()),
  /** Par défaut false : le contenu de la notification ne contient AUCUNE valeur de santé. */
  showValuesOnLockScreen: z.boolean().default(false),
  quietHours: z.object({ start: hhmm, end: hhmm }).optional(),
  /** Rappels de mesure programmés (heure locale) */
  reminders: z
    .array(z.object({ time: hhmm, label: z.string().max(60), days: z.array(z.number().int().min(1).max(7)) }))
    .max(8)
    .default([]),
  /** Alerte « pas de mesure depuis X heures » */
  dataGapHours: z.number().int().min(6).max(168).default(24),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const registerDeviceSchema = z.object({
  deviceId: z.string().uuid(),
  expoPushToken: z.string().min(10).max(200),
  platform: z.enum(['android', 'ios']),
});
