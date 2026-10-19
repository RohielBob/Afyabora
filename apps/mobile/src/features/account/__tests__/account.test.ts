// Ticket L1-14 (mobile) : exporter mes données, supprimer mon compte. Réseau, synchronisation, fichiers et
// partage sont simulés : chaque scénario est vérifié sans téléphone.
import { ApiError, type ApiFile } from '@/lib/api-client';
import {
  canConfirmDeletion,
  deleteProblem,
  exportFilename,
  exportMyData,
  exportProblem,
  isExport,
  type ExportDeps,
  type ExportPhase,
} from '../account';

const NOW = new Date('2026-10-19T21:30:00.000Z');
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const EXPORT = {
  exportedAt: '2026-10-19T21:30:00.000Z',
  profile: {},
  measurements: [],
  events: [],
};

function file(bytes: Uint8Array, disposition?: string): ApiFile {
  const headers = new Headers();
  if (disposition) headers.set('content-disposition', disposition);
  return { bytes, headers };
}

function deps(overrides: Partial<ExportDeps<string>> = {}) {
  const log: string[] = [];
  const base: ExportDeps<string> = {
    isOnline: async () => true,
    pending: () => 0,
    syncNow: async () => {
      log.push('sync');
      return { pendingCount: 0 };
    },
    download: async () => {
      log.push('download');
      return file(encode(EXPORT), 'attachment; filename="afyabora-export-2026-10-19.json"');
    },
    save: async (_bytes, name) => {
      log.push(`save:${name}`);
      return `cache/${name}`;
    },
    share: async (saved) => {
      log.push(`share:${saved}`);
      return true;
    },
    now: () => NOW,
  };
  return { deps: { ...base, ...overrides }, log };
}

describe('exportMyData', () => {
  it('cas normal : téléchargement, fichier rangé sous le nom du serveur, partage ouvert', async () => {
    const { deps: d, log } = deps();
    const phases: ExportPhase[] = [];
    const outcome = await exportMyData(d, (phase) => phases.push(phase));

    expect(outcome).toEqual({
      ok: true,
      saved: 'cache/afyabora-export-2026-10-19.json',
      filename: 'afyabora-export-2026-10-19.json',
      unsent: 0,
    });
    expect(log).toEqual([
      'download',
      'save:afyabora-export-2026-10-19.json',
      'share:cache/afyabora-export-2026-10-19.json',
    ]);
    expect(phases).toEqual(['downloading', 'sharing']);
  });

  it('sans réseau : rien n’est demandé au serveur', async () => {
    const { deps: d, log } = deps({ isOnline: async () => false });
    expect(await exportMyData(d)).toEqual({ ok: false, problem: 'offline' });
    expect(log).toEqual([]);
  });

  it('saisies en attente : envoyées AVANT le téléchargement (sinon absentes du fichier)', async () => {
    const { deps: d, log } = deps({ pending: () => 3 });
    const phases: ExportPhase[] = [];
    const outcome = await exportMyData(d, (phase) => phases.push(phase));
    expect(outcome).toMatchObject({ ok: true, unsent: 0 });
    expect(log.slice(0, 2)).toEqual(['sync', 'download']);
    expect(phases[0]).toBe('syncing');
  });

  it('envoi incomplet ou en échec : export quand même, avec le nombre de saisies manquantes', async () => {
    const partial = deps({ pending: () => 3, syncNow: async () => ({ pendingCount: 1 }) });
    expect(await exportMyData(partial.deps)).toMatchObject({ ok: true, unsent: 1 });

    const broken = deps({
      pending: () => 2,
      syncNow: async () => {
        throw new Error('serveur occupé');
      },
    });
    expect(await exportMyData(broken.deps)).toMatchObject({ ok: true, unsent: 2 });
  });

  it('erreurs du serveur : hors-ligne, trop de demandes, profil absent, autre ; rien n’est rangé', async () => {
    for (const [error, problem] of [
      [new ApiError(0, 'injoignable'), 'offline'],
      [new ApiError(429, 'trop'), 'tooMany'],
      [new ApiError(404, 'pas de profil'), 'noProfile'],
      [new ApiError(500, 'panne'), 'error'],
    ] as const) {
      const { deps: d, log } = deps({
        download: async () => {
          throw error;
        },
      });
      expect(await exportMyData(d)).toEqual({ ok: false, problem, unsent: 0 });
      expect(log.some((l) => l.startsWith('save'))).toBe(false);
    }
  });

  it('réponse qui n’est pas un export : erreur, rien n’est rangé ni partagé', async () => {
    const { deps: d, log } = deps({
      download: async () => file(new TextEncoder().encode('<html>proxy</html>')),
    });
    expect(await exportMyData(d)).toEqual({ ok: false, problem: 'error', unsent: 0 });
    expect(log).toEqual([]);
  });

  it('partage indisponible ou en échec : le fichier est rangé, problème « cannotShare »', async () => {
    for (const share of [
      async () => false,
      async () => {
        throw new Error('annulé');
      },
    ]) {
      const { deps: d } = deps({ share });
      expect(await exportMyData(d)).toEqual({
        ok: false,
        problem: 'cannotShare',
        saved: 'cache/afyabora-export-2026-10-19.json',
        filename: 'afyabora-export-2026-10-19.json',
        unsent: 0,
      });
    }
  });
});

describe('outils de l’export', () => {
  it('exportFilename : nom du serveur s’il est sûr, sinon nom local daté', () => {
    expect(exportFilename('attachment; filename="afyabora-export-2026-10-19.json"', NOW)).toBe(
      'afyabora-export-2026-10-19.json',
    );
    const local = 'afyabora-export-2026-10-19.json';
    expect(exportFilename(null, NOW)).toBe(local);
    expect(exportFilename('attachment; filename="../../secret.json"', NOW)).toBe(local);
    expect(exportFilename('attachment; filename="..export.json"', NOW)).toBe(local); // « .. » sans « / »
    expect(exportFilename('attachment; filename="export.exe"', NOW)).toBe(local);
    expect(exportFilename('attachment; filename="a b.json"', NOW)).toBe(local);
  });

  it('isExport : objet JSON avec exportedAt', () => {
    expect(isExport(encode(EXPORT))).toBe(true);
    expect(isExport(encode({ profile: {} }))).toBe(false);
    expect(isExport(encode(null))).toBe(false);
    expect(isExport(encode([EXPORT]))).toBe(false);
    expect(isExport(new TextEncoder().encode('pas du json'))).toBe(false);
  });

  it('exportProblem : erreur hors API = erreur générale', () => {
    expect(exportProblem(new Error('x'))).toBe('error');
  });
});

describe('suppression du compte', () => {
  it('deleteProblem : mot de passe, trop d’essais, hors-ligne, autre', () => {
    expect(
      deleteProblem(new ApiError(403, 'non', { message: 'non', code: 'INVALID_PASSWORD' })),
    ).toBe('password');
    expect(deleteProblem(new ApiError(403, 'interdit', { code: 'FORBIDDEN' }))).toBe('error');
    expect(deleteProblem(new ApiError(429, 'trop'))).toBe('tooMany');
    expect(deleteProblem(new ApiError(0, 'injoignable'))).toBe('offline');
    expect(deleteProblem(new ApiError(500, 'panne'))).toBe('error');
    expect(deleteProblem(new Error('x'))).toBe('error');
  });

  it('canConfirmDeletion : mot de passe ET case cochée', () => {
    expect(canConfirmDeletion('', false)).toBe(false);
    expect(canConfirmDeletion('secret', false)).toBe(false);
    expect(canConfirmDeletion('', true)).toBe(false);
    expect(canConfirmDeletion('secret', true)).toBe(true);
  });
});
