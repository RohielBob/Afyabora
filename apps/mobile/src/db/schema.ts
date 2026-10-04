// Base SQLite locale (ADR-0004 : local-first). Migrations versionnées via PRAGMA user_version.
// RÈGLE : on n'édite JAMAIS une migration déjà livrée ; on en ajoute une nouvelle.

export const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS measurements (
    id TEXT PRIMARY KEY NOT NULL,
    value_mgdl INTEGER NOT NULL,
    original_value REAL NOT NULL,
    original_unit TEXT NOT NULL,
    measured_at TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT 'OTHER',
    source TEXT NOT NULL DEFAULT 'MANUAL',
    import_batch_id TEXT,
    note TEXT,
    client_updated_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    pending_sync INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_measurements_measured_at ON measurements (measured_at);

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    label TEXT NOT NULL,
    details TEXT,
    duration_minutes INTEGER,
    client_updated_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    pending_sync INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at);

  -- Opérations à envoyer au serveur, dans l'ordre (seq croissant).
  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT NOT NULL UNIQUE,
    entity TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    client_updated_at TEXT NOT NULL,
    payload TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );

  -- Valeurs clé/valeur : curseur de pull, identifiant d'appareil, dernière synchro.
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;
