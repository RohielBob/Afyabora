import { z } from 'zod';

// Les valeurs d'exemple de .env.example commencent par « change-me » : l'API refuse de démarrer avec elles.
const PLACEHOLDER = /change-me/i;
const PLACEHOLDER_MESSAGE =
  "Valeur d'exemple détectée : générez un vrai secret (voir .env.example)";

// Clé AES-256 : exactement 32 octets encodés en base64 (44 caractères).
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères')
    .refine((v) => !PLACEHOLDER.test(v), PLACEHOLDER_MESSAGE),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((v) => !PLACEHOLDER.test(v), PLACEHOLDER_MESSAGE)
    .refine(
      (v) => BASE64.test(v) && Buffer.from(v, 'base64').length === 32,
      'Clé AES-256 attendue : exactement 32 octets encodés en base64 (openssl rand -base64 32)',
    ),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.string().default('Afyabora <no-reply@afyabora.local>'),
  PORTAL_URL: z.string().url().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  LLM_PROVIDER: z.enum(['none', 'anthropic']).default('none'),
  LLM_API_KEY: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validée au démarrage : l'API refuse de démarrer avec une configuration invalide. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `- ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return parsed.data;
}
