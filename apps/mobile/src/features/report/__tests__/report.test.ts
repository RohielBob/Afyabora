// Ticket L6-03 : logique du rapport « Préparer ma consultation » (report.ts), sans téléphone ni réseau :
// nom du fichier, reconnaissance d'un PDF, erreurs expliquées, et l'enchaînement « envoyer les mesures en
// attente ⇒ créer ⇒ ranger ⇒ partager ».
import { ApiError, type ApiFile } from '@/lib/api-client';
import {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIODS,
  createReport,
  filenameOf,
  isPdf,
  localFilename,
  reportPath,
  reportProblem,
  type ReportDeps,
  type ReportPhase,
} from '../report';

const NOW = new Date(2026, 9, 19, 8, 30); // 19 octobre 2026, 8 h 30, heure du téléphone
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // « %PDF-1.4 »
const pdfFile = (disposition?: string): ApiFile => ({
  bytes: PDF,
  headers: new Headers(disposition ? { 'content-disposition': disposition } : {}),
});

describe('périodes et adresse', () => {
  it('14, 30 et 90 jours (comme le serveur), 30 au départ', () => {
    expect([...REPORT_PERIODS]).toEqual([14, 30, 90]);
    expect(DEFAULT_REPORT_PERIOD).toBe(30);
  });

  it('GET /reports/consultation avec la période', () => {
    expect(reportPath(90)).toBe('/reports/consultation?period=90');
  });
});

describe('nom du fichier', () => {
  it('calculé sur le téléphone : même format que le serveur, date locale à deux chiffres', () => {
    expect(localFilename(30, NOW)).toBe('afyabora-rapport-2026-10-19-30j.pdf');
    expect(localFilename(14, new Date(2026, 0, 5, 23, 59))).toBe(
      'afyabora-rapport-2026-01-05-14j.pdf',
    );
  });

  it('celui du serveur quand il est sûr', () => {
    expect(filenameOf('attachment; filename="afyabora-rapport-2026-10-18-90j.pdf"', 90, NOW)).toBe(
      'afyabora-rapport-2026-10-18-90j.pdf',
    );
    expect(filenameOf('attachment; filename=rapport.pdf', 30, NOW)).toBe('rapport.pdf');
  });

  it('en-tête absent (navigateur) ⇒ nom calculé', () => {
    expect(filenameOf(null, 30, NOW)).toBe('afyabora-rapport-2026-10-19-30j.pdf');
    expect(filenameOf('attachment', 30, NOW)).toBe('afyabora-rapport-2026-10-19-30j.pdf');
  });

  it.each([
    ['chemin', 'attachment; filename="../../secret.pdf"'],
    ['dossier', 'attachment; filename="rapports/a.pdf"'],
    ['pas un PDF', 'attachment; filename="rapport.exe"'],
    ['caractères spéciaux', 'attachment; filename="rapport de Jean.pdf"'],
    ['commence par un point', 'attachment; filename=".cache.pdf"'],
  ])('nom dangereux (%s) ⇒ jamais utilisé', (_cas, header) => {
    expect(filenameOf(header, 30, NOW)).toBe('afyabora-rapport-2026-10-19-30j.pdf');
  });
});

describe('reconnaître un PDF', () => {
  it('commence par « %PDF- »', () => {
    expect(isPdf(PDF)).toBe(true);
    expect(isPdf(new TextEncoder().encode('{"message":"erreur"}'))).toBe(false);
    expect(isPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(false); // l'en-tête seul
    expect(isPdf(new Uint8Array())).toBe(false);
  });
});

describe('erreurs expliquées', () => {
  it.each([
    [new ApiError(0, 'Serveur injoignable'), 'offline'],
    [new ApiError(429, 'Trop'), 'tooMany'],
    [new ApiError(404, 'Profil'), 'noProfile'],
    [new ApiError(500, 'Panne'), 'error'],
    [new ApiError(403, 'Rôle'), 'error'],
    [new Error('autre'), 'error'],
  ])('%s ⇒ %s', (error, kind) => {
    expect(reportProblem(error).kind).toBe(kind);
  });
});

describe('créer puis partager', () => {
  /** Faux téléphone : chaque appel est noté dans `steps`, dans l'ordre. */
  const setup = (over: Partial<ReportDeps<string>> = {}) => {
    const steps: string[] = [];
    const phases: ReportPhase[] = [];
    const deps: ReportDeps<string> = {
      isOnline: async () => true,
      pendingMeasurements: () => 0,
      syncNow: async () => {
        steps.push('sync');
        return { pendingMeasurements: 0 };
      },
      download: async (days) => {
        steps.push(`download:${days}`);
        return pdfFile('attachment; filename="afyabora-rapport-2026-10-19-30j.pdf"');
      },
      save: async (bytes, filename) => {
        steps.push(`save:${filename}:${bytes.length}`);
        return `fichier://${filename}`;
      },
      share: async (saved) => {
        steps.push(`share:${saved}`);
        return true;
      },
      now: () => NOW,
      ...over,
    };
    return { deps, steps, phases, onPhase: (p: ReportPhase) => phases.push(p) };
  };

  it('cas nominal : créé, rangé, partagé ; aucune synchronisation inutile', async () => {
    const { deps, steps, phases, onPhase } = setup();
    const outcome = await createReport(30, deps, onPhase);
    expect(outcome).toEqual({
      ok: true,
      saved: 'fichier://afyabora-rapport-2026-10-19-30j.pdf',
      filename: 'afyabora-rapport-2026-10-19-30j.pdf',
      unsent: 0,
    });
    expect(steps).toEqual([
      'download:30',
      `save:afyabora-rapport-2026-10-19-30j.pdf:${PDF.length}`,
      'share:fichier://afyabora-rapport-2026-10-19-30j.pdf',
    ]);
    expect(phases).toEqual(['creating', 'sharing']);
  });

  it('la période choisie est celle demandée au serveur', async () => {
    const { deps, steps } = setup();
    await createReport(90, deps);
    expect(steps[0]).toBe('download:90');
  });

  it('sans réseau : rien n’est demandé, problème « hors-ligne »', async () => {
    const { deps, steps } = setup({ isOnline: async () => false });
    const outcome = await createReport(30, deps);
    expect(outcome).toEqual({ ok: false, problem: { kind: 'offline' } });
    expect(steps).toEqual([]);
  });

  it('mesures en attente : envoyées AVANT la création du rapport', async () => {
    const { deps, steps, phases, onPhase } = setup({ pendingMeasurements: () => 3 });
    const outcome = await createReport(30, deps, onPhase);
    expect(steps.slice(0, 2)).toEqual(['sync', 'download:30']);
    expect(phases).toEqual(['syncing', 'creating', 'sharing']);
    expect(outcome.ok && outcome.unsent).toBe(0);
  });

  it('mesures restées sur le téléphone après l’envoi : rapport créé, et le nombre est annoncé', async () => {
    const { deps } = setup({
      pendingMeasurements: () => 3,
      syncNow: async () => ({ pendingMeasurements: 2 }),
    });
    const outcome = await createReport(30, deps);
    expect(outcome.ok).toBe(true);
    expect(outcome.unsent).toBe(2);
  });

  it('envoi en échec : rapport créé quand même, toutes les mesures en attente annoncées', async () => {
    const { deps, steps } = setup({
      pendingMeasurements: () => 4,
      syncNow: async () => {
        throw new Error('panne');
      },
    });
    const outcome = await createReport(30, deps);
    expect(outcome.ok).toBe(true);
    expect(outcome.unsent).toBe(4);
    expect(steps[0]).toBe('download:30');
  });

  it.each([
    [new ApiError(429, 'Trop'), 'tooMany'],
    [new ApiError(404, 'Profil'), 'noProfile'],
    [new ApiError(0, 'Coupé'), 'offline'],
  ])('refus du serveur (%s) ⇒ %s, rien n’est rangé ni partagé', async (error, kind) => {
    const { deps, steps } = setup({
      download: async () => {
        throw error;
      },
    });
    const outcome = await createReport(30, deps);
    expect(outcome).toEqual({ ok: false, problem: { kind }, unsent: 0 });
    expect(steps).toEqual([]);
  });

  it('réponse qui n’est pas un PDF ⇒ erreur, rien n’est rangé', async () => {
    const { deps, steps } = setup({
      download: async () => ({ bytes: new TextEncoder().encode('<html>'), headers: new Headers() }),
    });
    const outcome = await createReport(30, deps);
    expect(outcome).toEqual({ ok: false, problem: { kind: 'error' }, unsent: 0 });
    expect(steps).toEqual([]);
  });

  it('nom du serveur absent ⇒ nom calculé sur le téléphone', async () => {
    const { deps, steps } = setup({ download: async () => pdfFile() });
    const outcome = await createReport(14, deps);
    expect(outcome.ok && outcome.filename).toBe('afyabora-rapport-2026-10-19-14j.pdf');
    expect(steps[0]).toBe(`save:afyabora-rapport-2026-10-19-14j.pdf:${PDF.length}`);
  });

  it('écriture du fichier impossible ⇒ erreur, pas de partage', async () => {
    const { deps, steps } = setup({
      save: async () => {
        throw new Error('disque plein');
      },
    });
    const outcome = await createReport(30, deps);
    expect(outcome).toEqual({ ok: false, problem: { kind: 'error' }, unsent: 0 });
    expect(steps).toEqual(['download:30']);
  });

  it.each([
    ['partage absent de l’appareil', async () => false],
    [
      'partage en échec',
      async () => {
        throw new Error('annulé');
      },
    ],
  ])('%s ⇒ « partage indisponible », le fichier reste rangé', async (_cas, share) => {
    const { deps } = setup({ share });
    const outcome = await createReport(30, deps);
    expect(outcome).toEqual({
      ok: false,
      problem: { kind: 'cannotShare' },
      saved: 'fichier://afyabora-rapport-2026-10-19-30j.pdf',
      filename: 'afyabora-rapport-2026-10-19-30j.pdf',
      unsent: 0,
    });
  });
});
