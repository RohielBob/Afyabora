// Tests du ticket L5-13 : compte à rebours à l'heure du serveur, bandeau, écran « Accès expiré », sans
// navigateur.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { noteServerDate, resetServerClock, serverNow, serverOffsetMs } from '@/lib/server-clock';
import ExpiredRoute, { MOTIF, reasonFromMotif } from '@/routes/expired';
import { AccessBanner } from '../AccessBanner';
import {
  announcement,
  countdownView,
  formatCountdown,
  remainingSeconds,
  SOON_SECONDS,
} from '../countdown';

afterEach(() => resetServerClock());

describe('horloge du serveur', () => {
  it('écart lu dans l’en-tête Date (milieu de la seconde) ; sans en-tête lisible : rien ne change', () => {
    const received = Date.parse('2026-10-18T20:00:00.000Z');
    // Le serveur est en avance de 3 minutes sur l'ordinateur.
    noteServerDate('Sun, 18 Oct 2026 20:03:00 GMT', received);
    expect(serverOffsetMs()).toBe(180_500);
    noteServerDate(null, received);
    noteServerDate('pas une date', received);
    expect(serverOffsetMs()).toBe(180_500);
    expect(Math.abs(serverNow() - (Date.now() + 180_500))).toBeLessThan(50);
  });
});

describe('compte à rebours', () => {
  const end = '2026-10-18T20:30:00.000Z';
  const at = (iso: string) => Date.parse(iso);

  it('secondes restantes arrondies au-dessus, jamais négatives', () => {
    expect(remainingSeconds(end, at('2026-10-18T20:25:23.000Z'))).toBe(277);
    expect(remainingSeconds(end, at('2026-10-18T20:29:59.800Z'))).toBe(1);
    expect(remainingSeconds(end, at('2026-10-18T20:30:00.000Z'))).toBe(0);
    expect(remainingSeconds(end, at('2026-10-18T21:00:00.000Z'))).toBe(0);
  });

  it('« 04:37 » ; au-delà d’une heure « 1:02:05 »', () => {
    expect(formatCountdown(277)).toBe('04:37');
    expect(formatCountdown(59)).toBe('00:59');
    expect(formatCountdown(3725)).toBe('1:02:05');
    expect(formatCountdown(7200)).toBe('2:00:00');
    expect(formatCountdown(-3)).toBe('00:00');
  });

  it('« Accès valable : 04:37 », « bientôt » les 2 dernières minutes, puis « Accès expiré »', () => {
    expect(countdownView(277)).toEqual({
      tone: 'normal',
      text: 'Accès valable : 04:37',
      a11y: 'Accès valable encore 5 minutes',
    });
    expect(countdownView(SOON_SECONDS + 1).tone).toBe('normal');
    expect(countdownView(SOON_SECONDS).tone).toBe('soon');
    expect(countdownView(42)).toMatchObject({
      tone: 'soon',
      a11y: 'Accès valable moins d’une minute',
    });
    expect(countdownView(0)).toEqual({ tone: 'ended', text: 'Accès expiré', a11y: 'Accès expiré' });
  });

  it('annonces aux lecteurs d’écran : une fois à 5 minutes, une fois à 1 minute, même par saut', () => {
    expect(announcement(null, 290)).toBeNull(); // première lecture : rien à annoncer
    expect(announcement(301, 300)).toBe('Il reste 5 minutes d’accès au dossier.');
    expect(announcement(300, 299)).toBeNull();
    expect(announcement(61, 60)).toBe('Il reste 1 minute d’accès au dossier.');
    expect(announcement(400, 30)).toBe('Il reste 1 minute d’accès au dossier.'); // onglet en veille
    expect(announcement(5, 0)).toBeNull(); // la fin a son propre écran
  });
});

describe('bandeau', () => {
  it('minuteur (non relu à chaque seconde), fin d’accès, zone d’annonce polie ; pas de couleur en dur', () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000 + 30_000).toISOString();
    const html = renderToStaticMarkup(
      <AccessBanner expiresAt={expiresAt} onEnd={() => undefined} />,
    );
    expect(html).toMatch(/Accès valable : 10:(30|29)/);
    expect(html).toContain('role="timer"');
    expect(html).toContain('aria-live="off"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Fin de l’accès à');
    expect(html).toContain('sticky');
    expect(html).not.toContain('Se termine bientôt');
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it('les 2 dernières minutes : icône et mot « bientôt » en plus de la couleur', () => {
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    const html = renderToStaticMarkup(
      <AccessBanner expiresAt={expiresAt} onEnd={() => undefined} />,
    );
    expect(html).toContain('Se termine bientôt');
    expect(html).toContain('text-warning');
    expect(html).not.toContain('danger');
  });
});

describe('écran « Accès expiré »', () => {
  const render = (search: string) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[`/expired${search}`]}>
          <ExpiredRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('motif de l’adresse ⇔ raison ; inconnu : « accès expiré »', () => {
    for (const [reason, motif] of Object.entries(MOTIF))
      expect(reasonFromMotif(motif)).toBe(reason);
    expect(reasonFromMotif(null)).toBe('EXPIRED');
    expect(reasonFromMotif('<script>')).toBe('EXPIRED');
  });

  it('titre et explication selon le motif, « données effacées », deux suites', () => {
    const expired = render('?motif=expire');
    expect(expired).toContain('Accès expiré');
    expect(expired).toContain('demandez-lui de vous montrer un nouveau QR');
    expect(expired).toContain('effacées de cet ordinateur');
    expect(expired).toContain('href="/patients"');
    expect(expired).toContain('href="/scan"');
    expect(render('?motif=arrete')).toContain('Le patient a mis fin au partage');
    expect(render('?motif=compte')).toContain('n’est plus approuvé');
    expect(render('?motif=inaccessible')).toContain('n’est pas accessible');
  });
});
