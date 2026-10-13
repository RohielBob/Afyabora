// Tests du ticket L4-06 : choix des colonnes quand le serveur ne les reconnaît pas (fonctions pures).
import type { ImportReport } from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { NO_COLUMN } from '../components/ColumnRoleChoice';
import { importFlow } from '../flow';
import {
  COLUMN_ROLES,
  assignColumn,
  keepKnownColumns,
  mappingIssues,
  toMapping,
  type MappingDraft,
} from '../mapping';

describe('rôles des colonnes', () => {
  it('date et valeur obligatoires ; heure, unité, contexte facultatifs ; ordre de l’écran', () => {
    expect(COLUMN_ROLES).toEqual([
      { role: 'date', required: true },
      { role: 'time', required: false },
      { role: 'value', required: true },
      { role: 'unit', required: false },
      { role: 'context', required: false },
    ]);
  });
});

describe('ce qui empêche de relancer l’analyse', () => {
  it('rien choisi : date et valeur manquent', () => {
    expect(mappingIssues({})).toEqual([
      { kind: 'missing', role: 'date' },
      { kind: 'missing', role: 'value' },
    ]);
    expect(toMapping({})).toBeNull();
  });

  it('seulement la date, ou seulement la valeur : il manque l’autre', () => {
    expect(mappingIssues({ date: 'Quand' })).toEqual([{ kind: 'missing', role: 'value' }]);
    expect(mappingIssues({ value: 'Combien' })).toEqual([{ kind: 'missing', role: 'date' }]);
    expect(toMapping({ date: 'Quand', time: 'H' })).toBeNull();
  });

  it('une colonne pour deux rôles : signalé, rien n’est envoyé', () => {
    const draft: MappingDraft = { date: 'Quand', value: 'Quand', unit: 'U', context: 'U' };
    expect(mappingIssues(draft)).toEqual([
      { kind: 'shared', column: 'Quand', roles: ['date', 'value'] },
      { kind: 'shared', column: 'U', roles: ['unit', 'context'] },
    ]);
    expect(toMapping(draft)).toBeNull();
  });

  it('choix complet ⇒ correspondance envoyée, rôles facultatifs seulement s’ils sont choisis', () => {
    expect(toMapping({ date: 'Quand', value: 'Combien' })).toEqual({
      date: 'Quand',
      value: 'Combien',
    });
    expect(
      toMapping({ date: 'Quand', time: 'H', value: 'Combien', unit: 'U', context: 'Note' }),
    ).toEqual({ date: 'Quand', time: 'H', value: 'Combien', unit: 'U', context: 'Note' });
    expect(mappingIssues({ date: 'Quand', value: 'Combien' })).toEqual([]);
  });
});

describe('choisir une colonne', () => {
  it('une colonne déjà prise par un autre rôle lui est retirée', () => {
    const draft: MappingDraft = { date: 'A', time: 'B', value: 'C' };
    expect(assignColumn(draft, 'value', 'B')).toEqual({ date: 'A', value: 'B' });
    expect(assignColumn(draft, 'context', 'A')).toEqual({ time: 'B', value: 'C', context: 'A' });
  });

  it('« Aucune » retire le rôle ; changer de colonne garde les autres choix', () => {
    const draft: MappingDraft = { date: 'A', time: 'B', value: 'C' };
    expect(NO_COLUMN).toBe('');
    expect(assignColumn(draft, 'time', NO_COLUMN)).toEqual({ date: 'A', value: 'C' });
    expect(assignColumn(draft, 'date', 'D')).toEqual({ date: 'D', time: 'B', value: 'C' });
    // Reprendre la même colonne pour le même rôle ne change rien.
    expect(assignColumn(draft, 'date', 'A')).toEqual(draft);
  });

  it('nouvelle liste de colonnes : seuls les choix encore présents sont gardés', () => {
    const draft: MappingDraft = { date: 'Quand', value: 'Combien', unit: 'Unité' };
    expect(keepKnownColumns(draft, ['Quand', 'Unité', 'Autre'])).toEqual({
      date: 'Quand',
      unit: 'Unité',
    });
    expect(keepKnownColumns(draft, [])).toEqual({});
  });
});

describe('parcours : colonnes et choix en mémoire', () => {
  const file = { name: 'carnet.csv', size: 40, uri: 'file:///carnet.csv' };
  const report: ImportReport = {
    batchId: '3f2b8c1e-6a4d-4e1b-9c7a-1d2e3f4a5b6c',
    analyzed: 1,
    valid: 1,
    duplicates: 0,
    inconsistent: 0,
    errors: 0,
    rows: [],
  };

  it('colonnes reçues ⇒ gardées ; le rapport précédent est oublié', () => {
    importFlow.start('G_L');
    importFlow.chooseFile(file);
    importFlow.analysed(report);
    importFlow.needColumns(['Quand', 'Combien']);
    expect(importFlow.get()).toMatchObject({
      columns: ['Quand', 'Combien'],
      draft: {},
      report: null,
    });
  });

  it('nouvelle liste : les choix encore valables restent ; autre fichier ⇒ tout est effacé', () => {
    importFlow.start('G_L');
    importFlow.chooseFile(file);
    importFlow.needColumns(['Quand', 'Combien']);
    importFlow.chooseColumns({ date: 'Quand', value: 'Combien' });
    importFlow.needColumns(['Quand', 'Valeur']);
    expect(importFlow.get().draft).toEqual({ date: 'Quand' });

    importFlow.chooseUnit('MMOL_L'); // même fichier : les colonnes et le choix restent
    expect(importFlow.get()).toMatchObject({
      columns: ['Quand', 'Valeur'],
      draft: { date: 'Quand' },
    });

    importFlow.chooseFile({ ...file, name: 'autre.csv' });
    expect(importFlow.get()).toMatchObject({ columns: null, draft: {} });
  });
});

describe('traductions de L4-06', () => {
  it('chaque rôle a un nom et une aide, en français et en anglais', () => {
    for (const dict of [fr, en] as unknown as {
      import: { mapping: { role: Record<string, string>; hint: Record<string, string> } };
    }[]) {
      for (const { role } of COLUMN_ROLES) {
        expect(dict.import.mapping.role[role]).toBeTruthy();
        expect(dict.import.mapping.hint[role]).toBeTruthy();
      }
      expect(dict.import.mapping.hint.unit).toContain('{{unit}}');
    }
  });
});
