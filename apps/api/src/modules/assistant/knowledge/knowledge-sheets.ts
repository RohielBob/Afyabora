// Lecture des fiches de connaissances de l'assistant (L9-02) depuis `apps/api/knowledge/fiches/`.
// Le dossier est en dehors de `src` (contenu, pas du code) mais dans `apps/api` : l'image Docker de l'API le
// contient (seul `docs/` en est exclu). Le chemin est le même depuis `src/` (tests) et depuis `dist/` (build).
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseSheet, type ParsedSheet } from './sheet-format';

/** Dossier des fiches : apps/api/knowledge/fiches (depuis src/modules/assistant/knowledge ou dist/…). */
export const KNOWLEDGE_DIR = resolve(__dirname, '../../../../knowledge/fiches');

/**
 * Lit et vérifie TOUTES les fiches du dossier (fichiers `.md`, par ordre alphabétique). Une seule fiche
 * fautive ⇒ SheetFormatError (de parseSheet) : mieux vaut que l'API refuse de démarrer que de servir une fiche non conforme.
 */
export function loadSheets(dir: string = KNOWLEDGE_DIR): ParsedSheet[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  // L'identifiant d'une fiche est le nom de son fichier (vérifié par parseSheet) : il est donc unique.
  return files.map((name) => parseSheet(readFileSync(join(dir, name), 'utf8'), name));
}
