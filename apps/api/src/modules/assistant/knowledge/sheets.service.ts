// Fiches servies par l'assistant (L9-06) : lues et VÉRIFIÉES une fois au démarrage (L9-02 : une seule fiche
// fautive ⇒ l'API refuse de démarrer). Brouillons servis ou non selon ASSISTANT_DRAFT_SHEETS (voir env.ts) :
// par défaut oui hors production, non en production — ADR-0005 complétée : en production, seules les fiches
// relues par le médecin.
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KnowledgeSheet, KnowledgeSheetSummary } from '@glyka/shared';
import { loadSheets } from './knowledge-sheets';
import type { ParsedSheet } from './sheet-format';

/** Les brouillons sont-ils servis ? Réglage explicite, sinon : oui hors production. */
export function draftsAllowed(nodeEnv: string | undefined, setting: string | undefined): boolean {
  if (setting === 'true') return true;
  if (setting === 'false') return false;
  return nodeEnv !== 'production';
}

@Injectable()
export class SheetsService implements OnModuleInit {
  private readonly logger = new Logger('AssistantSheets');
  private sheets: ParsedSheet[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const all = loadSheets();
    const drafts = draftsAllowed(
      this.config.get<string>('NODE_ENV'),
      this.config.get<string>('ASSISTANT_DRAFT_SHEETS'),
    );
    this.sheets = all.filter((s) => drafts || s.sheet.status === 'VALIDATED');
    const draftCount = this.sheets.filter((s) => s.sheet.status === 'DRAFT').length;
    this.logger.log(
      `${this.sheets.length} fiche(s) servie(s) sur ${all.length}, dont ${draftCount} brouillon(s).`,
    );
    if (draftCount > 0 && this.config.get<string>('NODE_ENV') === 'production') {
      this.logger.warn('Fiches NON RELUES servies en production : réservé à une démonstration.');
    }
  }

  /** Fiches disponibles (pour la recherche de l'assistant). */
  available(): readonly ParsedSheet[] {
    return this.sheets;
  }

  /** GET /assistant/sheets : la liste, sans le texte. */
  list(): KnowledgeSheetSummary[] {
    return this.sheets.map(({ sheet }) => ({
      id: sheet.id,
      title: sheet.title,
      summary: sheet.summary,
      status: sheet.status,
      version: sheet.version,
      reviewedOn: sheet.reviewedOn,
    }));
  }

  /** GET /assistant/sheets/{sheetId} : la fiche complète, ou null si elle n'est pas servie. */
  get(id: string): KnowledgeSheet | null {
    return this.sheets.find((s) => s.sheet.id === id)?.sheet ?? null;
  }
}
