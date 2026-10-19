// Ticket L6-05 : page publique de la carte d'urgence (features/emergency-card/card.ts, routes/emergency.tsx).
// Sans navigateur : le serveur est simulé (fetch), l'écran rendu en HTML.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import EmergencyRoute, { Card } from '@/routes/emergency';
import {
  cardLines,
  cardProblem,
  fetchEmergencyCard,
  glucoseText,
  isEmergencyToken,
  telHref,
} from '../card';

const TOKEN = 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXvWzE';
const CARD = {
  fullName: 'Awa Mbuyi',
  diabetesType: 'Type 1',
  declaredTreatment: 'Insuline',
  bloodGroup: 'O+' as const,
  lastKnownGlucoseMgDl: 132,
  emergencyContactName: 'Marie',
  emergencyContactPhone: '+243 81 000 0000',
  updatedAt: '2026-10-19T08:30:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('jeton lu dans l’adresse', () => {
  it('forme d’un jeton (43 caractères base64url) ; sinon la page ne demande rien', () => {
    expect(isEmergencyToken(TOKEN)).toBe(true);
    for (const bad of [undefined, '', 'abc', `${TOKEN}x`, `${TOKEN.slice(0, 42)}/`]) {
      expect(isEmergencyToken(bad)).toBe(false);
    }
  });
});

describe('lecture de la carte', () => {
  it('GET /e/:token sans jeton de connexion ; réponse vérifiée', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => Response.json(CARD));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchEmergencyCard(TOKEN)).toEqual(CARD);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Headers }];
    expect(url.endsWith(`/e/${TOKEN}`)).toBe(true);
    expect(init.headers.get('Authorization')).toBeNull();
  });

  it('une réponse avec un champ en plus (historique…) est refusée, jamais affichée', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ...CARD, measurements: [{ valueMgDl: 287 }] })),
    );
    await expect(fetchEmergencyCard(TOKEN)).rejects.toThrow();
  });

  it.each([
    [new ApiError(404, 'Introuvable'), 'unavailable'],
    [new ApiError(429, 'Trop'), 'tooMany'],
    [new ApiError(503, 'Occupé'), 'busy'],
    [new ApiError(0, 'Coupé'), 'network'],
    [new ApiError(500, 'Panne'), 'error'],
    [new Error('schéma'), 'error'],
  ])('%s ⇒ %s', (error, problem) => {
    expect(cardProblem(error)).toBe(problem);
  });
});

describe('contenu de la carte', () => {
  it('lignes dans l’ordre de la carte, champs vides absents, nom à part', () => {
    expect(cardLines({ ...CARD, allergies: '' })).toEqual([
      { field: 'diabetesType', text: 'Type 1' },
      { field: 'declaredTreatment', text: 'Insuline' },
      { field: 'bloodGroup', text: 'O+' },
      { field: 'lastKnownGlucoseMgDl', text: '132 mg/dL · 1,32 g/L' },
      { field: 'emergencyContactName', text: 'Marie' },
      { field: 'emergencyContactPhone', text: '+243 81 000 0000' },
    ]);
    expect(cardLines({ updatedAt: CARD.updatedAt })).toEqual([]);
  });

  it('glycémie en mg/dL ET en g/L ; numéro composable', () => {
    expect(glucoseText(54)).toBe('54 mg/dL · 0,54 g/L');
    expect(telHref('+243 (81) 000-0000')).toBe('tel:+243810000000');
  });
});

describe('page /e/:token', () => {
  const render = (path: string) =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/e/:token?" element={<EmergencyRoute />} />
        </Routes>
      </MemoryRouter>,
    );

  it('à l’ouverture : la confirmation, AVANT toute lecture de la carte', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const html = render(`/e/${TOKEN}`);
    expect(html).toContain('Je suis un professionnel de santé ou un secouriste');
    expect(html).toContain('L’ouverture est enregistrée et le patient en est averti.');
    expect(html).toContain('En cas de danger vital, appelez d’abord les secours.');
    expect(html).not.toContain('Awa');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adresse sans jeton valable : « Lien incomplet », aucun bouton', () => {
    for (const path of ['/e', '/e/abc']) {
      const html = render(path);
      expect(html).toContain('Lien incomplet');
      expect(html).not.toContain('Je suis un professionnel');
    }
  });
});

describe('carte affichée', () => {
  it('nom en titre, champs remplis, « Appeler » le contact, date et rappel', () => {
    const html = renderToStaticMarkup(<Card card={CARD} />);
    expect(html).toContain('<h1');
    expect(html).toContain('Awa Mbuyi');
    for (const text of ['Type 1', 'Insuline', 'O+', '132 mg/dL · 1,32 g/L', 'Marie']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="tel:+243810000000"');
    expect(html).toContain('aria-label="Appeler le contact d’urgence au +243 81 000 0000"');
    expect(html).toContain('>Appeler</a>');
    expect(html).toContain('Valeur notée par le patient à cette date');
    expect(html).toContain(
      'Informations déclarées par le patient, mises à jour le 19 octobre 2026',
    );
    expect(html).toContain('pas un dispositif médical');
    expect(html).not.toContain('Allergies'); // champ non renseigné : absent
    // Aucun état glycémique ni couleur d'état (la page ne juge pas la valeur).
    expect(html).not.toMatch(/state-|Dans la plage|Au-dessus|En dessous/);
  });

  it('carte sans nom ni champ : « Patient » et un message clair', () => {
    const html = renderToStaticMarkup(<Card card={{ updatedAt: CARD.updatedAt }} />);
    expect(html).toContain('Patient');
    expect(html).toContain('Le patient n’a renseigné aucune information sur cette carte.');
  });
});
