// Ticket L6-04 : onglet « Rapport PDF » du dossier (report.ts, tabs/ReportTab.tsx) et réception d'un fichier
// par le client HTTP (apiFile). Sans navigateur : le serveur et le document sont simulés.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFile, setAccessToken, setTokenRefresher } from '@/lib/api-client';
import {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIODS,
  downloadReport,
  isPdf,
  reportFilename,
  reportPath,
  reportProblem,
  saveInBrowser,
  type ReportDeps,
} from '../report';
import { ReportTab } from '../tabs/ReportTab';

const SESSION = '3f2a1c9e-1111-4111-8111-111111111111';
const NOW = new Date(2026, 9, 19, 9, 5); // 19 oct. 2026, 09:05 (heure de l'ordinateur)
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x33]); // « %PDF-1.3 »

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setTokenRefresher(null);
  setAccessToken(null);
});

describe('période, adresse et nom du fichier', () => {
  it('14, 30 et 90 jours (comme le serveur), 30 au départ', () => {
    expect([...REPORT_PERIODS]).toEqual([14, 30, 90]);
    expect(DEFAULT_REPORT_PERIOD).toBe(30);
  });

  it('route du médecin pour CE partage, avec la période', () => {
    expect(reportPath(SESSION, 90)).toBe(`/doctor/sessions/${SESSION}/report?period=90`);
    expect(reportPath('a/b', 14)).toBe('/doctor/sessions/a%2Fb/report?period=14');
  });

  it('nom : même format que le serveur, date à deux chiffres, code du partage, jamais le nom', () => {
    expect(reportFilename(SESSION, 30, NOW)).toBe('afyabora-rapport-2026-10-19-30j-3F2A1C.pdf');
    expect(
      reportFilename('7ea97249-f951-4671-add5-710f4c6df047', 14, new Date(2026, 0, 5, 23, 59)),
    ).toBe('afyabora-rapport-2026-01-05-14j-7EA972.pdf');
  });

  it('un PDF commence par « %PDF- »', () => {
    expect(isPdf(PDF)).toBe(true);
    expect(isPdf(new TextEncoder().encode('{"code":"X"}'))).toBe(false);
    expect(isPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(false);
  });
});

describe('erreurs', () => {
  it.each([
    [new ApiError(429, 'Trop'), { kind: 'tooMany' }],
    [new ApiError(403, 'Non', { code: 'CATEGORY_NOT_SHARED' }), { kind: 'notShared' }],
    [new ApiError(0, 'Coupé'), { kind: 'network' }],
    [new ApiError(500, 'Panne'), { kind: 'server' }],
    [new Error('autre'), { kind: 'server' }],
    // Fin d'accès : comme le reste du dossier (tout est effacé).
    [new ApiError(403, 'Fini', { code: 'SESSION_EXPIRED' }), { kind: 'ended', reason: 'EXPIRED' }],
    [new ApiError(403, 'Arrêt', { code: 'SESSION_REVOKED' }), { kind: 'ended', reason: 'REVOKED' }],
    [new ApiError(404, 'Inconnu'), { kind: 'ended', reason: 'OTHER' }],
  ])('%s', (error, expected) => {
    expect(reportProblem(error)).toEqual(expected);
  });
});

describe('téléchargement', () => {
  const setup = (over: Partial<ReportDeps> = {}) => {
    const saved: { bytes: Uint8Array; filename: string }[] = [];
    const paths: string[] = [];
    const deps: ReportDeps = {
      fetchPdf: async (path) => {
        paths.push(path);
        return PDF;
      },
      save: (bytes, filename) => saved.push({ bytes, filename }),
      now: () => NOW,
      ...over,
    };
    return { deps, saved, paths };
  };

  it('cas nominal : rapport de ce partage et de cette période, proposé au navigateur', async () => {
    const { deps, saved, paths } = setup();
    const outcome = await downloadReport(SESSION, 90, deps);
    expect(outcome).toEqual({
      ok: true,
      filename: 'afyabora-rapport-2026-10-19-90j-3F2A1C.pdf',
      at: NOW,
    });
    expect(paths).toEqual([`/doctor/sessions/${SESSION}/report?period=90`]);
    expect(saved).toEqual([{ bytes: PDF, filename: 'afyabora-rapport-2026-10-19-90j-3F2A1C.pdf' }]);
  });

  it('refus du serveur : rien n’est proposé au navigateur', async () => {
    const { deps, saved } = setup({
      fetchPdf: async () => {
        throw new ApiError(403, 'Fini', { code: 'SESSION_EXPIRED' });
      },
    });
    expect(await downloadReport(SESSION, 30, deps)).toEqual({
      ok: false,
      problem: { kind: 'ended', reason: 'EXPIRED' },
    });
    expect(saved).toEqual([]);
  });

  it('réponse qui n’est pas un PDF : erreur, rien n’est proposé', async () => {
    const { deps, saved } = setup({ fetchPdf: async () => new TextEncoder().encode('<html>') });
    expect(await downloadReport(SESSION, 30, deps)).toEqual({
      ok: false,
      problem: { kind: 'server' },
    });
    expect(saved).toEqual([]);
  });
});

describe('enregistrement dans le navigateur', () => {
  it('lien temporaire cliqué puis retiré ; l’adresse du fichier est libérée ensuite', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const link = {
      href: '',
      download: '',
      rel: '',
      click: () => events.push(`click:${link.href}:${link.download}`),
      remove: () => events.push('remove'),
    };
    vi.stubGlobal('document', {
      createElement: () => link,
      body: { appendChild: () => events.push('append') },
    });
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:rapport';
      },
      revokeObjectURL: (url: string) => events.push(`revoke:${url}`),
    });

    saveInBrowser(PDF, 'afyabora-rapport-2026-10-19-30j.pdf');
    expect(blobs[0]?.type).toBe('application/pdf');
    expect(blobs[0]?.size).toBe(PDF.length);
    expect(events).toEqual([
      'append',
      'click:blob:rapport:afyabora-rapport-2026-10-19-30j.pdf',
      'remove',
    ]);
    vi.advanceTimersByTime(1_000);
    expect(events.at(-1)).toBe('revoke:blob:rapport');
  });
});

describe('onglet « Rapport PDF »', () => {
  const html = renderToStaticMarkup(<ReportTab sessionId={SESSION} onEnded={() => undefined} />);

  it('périodes 14, 30 et 90 jours, 30 choisi ; bouton de téléchargement', () => {
    expect(html).toContain('Période du rapport');
    for (const days of ['14 j', '30 j', '90 j']) expect(html).toContain(days);
    expect(html).toMatch(/aria-pressed="true"[^>]*>30 j</);
    expect(html).toContain('Télécharger le PDF');
  });

  it('dit AVANT le clic que le téléchargement est inscrit au journal du patient', () => {
    expect(html).toContain('Chaque téléchargement est inscrit dans le journal du patient');
    expect(html).toContain('notes personnelles du patient ne sont jamais dans le rapport');
  });
});

describe('client HTTP : réception d’un fichier', () => {
  const pdfResponse = () =>
    new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } });

  it('octets du fichier ; jeton et Accept PDF envoyés', async () => {
    setAccessToken('jeton-medecin');
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => pdfResponse());
    vi.stubGlobal('fetch', fetchMock);
    const bytes = await apiFile(reportPath(SESSION, 30));
    expect([...bytes]).toEqual([...PDF]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Headers }];
    expect(url.endsWith(`/doctor/sessions/${SESSION}/report?period=30`)).toBe(true);
    expect(init.headers.get('Authorization')).toBe('Bearer jeton-medecin');
    expect(init.headers.get('Accept')).toBe('application/pdf, application/json');
  });

  it('refus du serveur ⇒ ApiError avec le statut et le code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'CATEGORY_NOT_SHARED', message: 'Non partagé' }), {
            status: 403,
          }),
      ),
    );
    const error = (await apiFile('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(403);
    expect(error.code).toBe('CATEGORY_NOT_SHARED');
  });

  it('jeton expiré (401) ⇒ session renouvelée UNE fois, puis le fichier', async () => {
    let count = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (++count === 1 ? new Response('{}', { status: 401 }) : pdfResponse())),
    );
    const refresher = vi.fn(async () => true);
    setTokenRefresher(refresher);
    expect((await apiFile('/x')).length).toBe(PDF.length);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(count).toBe(2);
  });

  it('connexion coupée pendant la réception ⇒ statut 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => {
          throw new TypeError('Failed to fetch');
        },
      })),
    );
    const error = (await apiFile('/x').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });

  it('le délai (60 s) couvre aussi la réception du fichier', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('abandon')));
          }),
      })),
    );
    let settled = false;
    const pending = apiFile('/x')
      .catch((e: unknown) => e)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(((await pending) as ApiError).status).toBe(0);
  });
});
