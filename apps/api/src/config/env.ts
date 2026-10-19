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
  // Hébergement (L0-10) : un vrai service d'envoi (ex. Brevo) demande un identifiant, un mot de passe et une
  // connexion chiffrée. Sans identifiant (Mailpit en développement), rien de tout cela n'est utilisé.
  SMTP_USER: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  SMTP_PASS: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  // « true » : TLS dès la connexion (port 465). « false » : connexion en clair puis STARTTLS exigé si un
  // identifiant est donné (port 587). Mailpit (port 1025) : en clair.
  SMTP_SECURE: z.preprocess(
    (v) => (v === '' || v === undefined ? 'false' : v),
    z.enum(['true', 'false']).transform((v) => v === 'true'),
  ),
  PORTAL_URL: z.string().url().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  // Nombre de relais (proxys) devant l'API chez l'hébergeur (L0-10 ; Render : 1). Sans ce réglage, toutes les
  // requêtes sembleraient venir de l'adresse du relais : les limites de débit par adresse IP seraient
  // partagées par TOUS les utilisateurs, et le journal d'accès noterait la mauvaise adresse. 0 = aucun relais.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // Modèle de langage (L3-05, ADR-0005) : « none » = gabarits du moteur seulement (défaut, la démo n'en
  // dépend jamais) ; « ollama » = modèle LOCAL (https://ollama.com), sans service externe.
  LLM_PROVIDER: z.enum(['none', 'ollama']).default('none'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  // mistral-nemo : choisi au banc d'essai de L3-06 (aucune phrase au sens déformé, contre 5 pour llama3.1).
  LLM_MODEL: z.string().min(1).default('mistral-nemo'),
  // Temps maximal d'une reformulation (en arrière-plan : GET /insights ne l'attend jamais).
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(90_000),
  LLM_API_KEY: z.string().optional(), // réservé à un futur fournisseur hébergé
  // Fiches de l'assistant (L9-06, ADR-0005 complétée) : servir aussi les BROUILLONS (fiches pas encore
  // relues par le médecin, affichées « Fiche non encore relue ») ? Par défaut : oui hors production, non en
  // production. « true » en production seulement pour une démonstration (l'API l'écrit dans ses journaux).
  // Ligne vide dans le .env (« ASSISTANT_DRAFT_SHEETS= ») = non renseignée.
  ASSISTANT_DRAFT_SHEETS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['true', 'false']).optional(),
  ),
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
