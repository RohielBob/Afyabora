// Tests du ticket L5-06 : choix des catégories et de la durée, création du QR (fonctions pures, sans écran).
import {
  SHARE_CATEGORIES,
  SHARE_DURATIONS,
  createShareSchema,
  type CreateShareResponse,
} from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { ApiError } from '@/lib/api-client';
import {
  CATEGORY_ICONS,
  DEFAULT_SHARE_CATEGORIES,
  DEFAULT_SHARE_DURATION,
  SENSITIVE_CATEGORIES,
  SHARE_CATEGORY_ORDER,
  SHARE_DURATION_ORDER,
  buildShareInput,
  createProblem,
  toggleCategory,
} from '../choice';
import { shareFlow } from '../flow';

describe('catégories proposées', () => {
  it('toutes les catégories du contrat, une seule fois chacune', () => {
    expect([...SHARE_CATEGORY_ORDER].sort()).toEqual([...SHARE_CATEGORIES].sort());
  });

  it('notes personnelles et téléchargement du rapport : DÉCOCHÉS au départ (CDC F7)', () => {
    expect(DEFAULT_SHARE_CATEGORIES).not.toContain('PERSONAL_NOTES');
    expect(DEFAULT_SHARE_CATEGORIES).not.toContain('REPORT_DOWNLOAD');
    expect(DEFAULT_SHARE_CATEGORIES).toEqual([
      'GLUCOSE_HISTORY',
      'TREATMENTS',
      'MEALS',
      'ACTIVITY',
      'AI_SUMMARY',
    ]);
  });

  it('les notes personnelles portent une mise en garde quand on les coche', () => {
    expect(SENSITIVE_CATEGORIES).toEqual(['PERSONAL_NOTES']);
  });

  it('chaque catégorie a une icône', () => {
    for (const category of SHARE_CATEGORIES) expect(CATEGORY_ICONS[category]).toBeTruthy();
  });
});

describe('toggleCategory', () => {
  it('coche puis décoche', () => {
    const on = toggleCategory(['GLUCOSE_HISTORY'], 'MEALS');
    expect(on).toEqual(['GLUCOSE_HISTORY', 'MEALS']);
    expect(toggleCategory(on, 'MEALS')).toEqual(['GLUCOSE_HISTORY']);
  });

  it('garde toujours l’ordre d’affichage, quel que soit l’ordre des touches', () => {
    let selected = toggleCategory([], 'PERSONAL_NOTES');
    selected = toggleCategory(selected, 'MEALS');
    selected = toggleCategory(selected, 'GLUCOSE_HISTORY');
    expect(selected).toEqual(['GLUCOSE_HISTORY', 'MEALS', 'PERSONAL_NOTES']);
  });

  it('ne modifie pas la liste reçue', () => {
    const before = ['GLUCOSE_HISTORY'] as const;
    toggleCategory(before, 'MEALS');
    expect(before).toEqual(['GLUCOSE_HISTORY']);
  });
});

describe('buildShareInput', () => {
  it('le corps de POST /shares, accepté par le schéma du serveur', () => {
    const input = buildShareInput(DEFAULT_SHARE_CATEGORIES, 'CONSULTATION');
    expect(input).toEqual({ categories: [...DEFAULT_SHARE_CATEGORIES], duration: 'CONSULTATION' });
    expect(createShareSchema.safeParse(input).success).toBe(true);
  });

  it('rien de coché : pas de requête possible (le bouton reste inactif)', () => {
    expect(buildShareInput([], 'MIN_5')).toBeNull();
  });

  it('doublons et ordre : nettoyés (le serveur refuse les doublons)', () => {
    expect(buildShareInput(['MEALS', 'GLUCOSE_HISTORY', 'MEALS'], 'MIN_5')).toEqual({
      categories: ['GLUCOSE_HISTORY', 'MEALS'],
      duration: 'MIN_5',
    });
  });
});

describe('durées', () => {
  it('les 4 durées du contrat, de la plus courte à la plus longue ; 30 min au départ', () => {
    expect(SHARE_DURATION_ORDER).toEqual([...SHARE_DURATIONS]);
    expect(DEFAULT_SHARE_DURATION).toBe('MIN_30');
  });
});

describe('createProblem', () => {
  it.each([
    ['pas de réseau (statut 0)', new ApiError(0, 'Serveur injoignable'), { kind: 'offline' }],
    ['429', new ApiError(429, 'Trop de requêtes'), { kind: 'tooMany' }],
    ['503', new ApiError(503, 'Indisponible'), { kind: 'busy' }],
    ['500', new ApiError(500, 'Erreur interne'), { kind: 'error' }],
    ['401', new ApiError(401, 'Session expirée'), { kind: 'error' }],
    ['réponse hors contrat', new Error('réponse inattendue'), { kind: 'error' }],
  ])('%s ⇒ %j', (_label, error, problem) => {
    expect(createProblem(error)).toEqual(problem);
  });

  it('400 sans champ fautif : le serveur explique quoi faire (profil à compléter), on le montre tel quel', () => {
    const message = 'Complétez votre profil médical avant de partager vos données.';
    expect(createProblem(new ApiError(400, message, { message }))).toEqual({
      kind: 'rejected',
      detail: message,
    });
  });

  it('400 sur un champ (ne devrait pas arriver : le corps est construit ici) : erreur générique', () => {
    const body = { message: 'Données invalides', issues: [{ path: 'categories', message: 'x' }] };
    expect(createProblem(new ApiError(400, 'Données invalides', body))).toEqual({ kind: 'error' });
  });
});

describe('shareFlow : le QR créé passe à l’écran suivant, en mémoire seulement', () => {
  const share = {
    session: { id: 's1' },
    token: { token: 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXvWzE', expiresAt: 'x' },
  } as unknown as CreateShareResponse;

  afterEach(() => shareFlow.clear());

  it('created ⇒ get ; clear ⇒ null ; les abonnés sont prévenus', () => {
    const seen: (CreateShareResponse | null)[] = [];
    const stop = shareFlow.subscribe(() => seen.push(shareFlow.get()));
    shareFlow.created(share);
    expect(shareFlow.get()).toBe(share);
    shareFlow.clear();
    expect(shareFlow.get()).toBeNull();
    stop();
    shareFlow.created(share);
    expect(seen).toEqual([share, null]);
  });
});

describe('textes (fr et en)', () => {
  const at = (dict: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], dict);

  it.each([
    ['fr', fr],
    ['en', en],
  ])('%s : chaque catégorie et chaque durée a ses textes', (_lang, dict) => {
    for (const category of SHARE_CATEGORIES) {
      expect(at(dict, `share.category.${category}.label`)).toEqual(expect.any(String));
      expect(at(dict, `share.category.${category}.text`)).toEqual(expect.any(String));
    }
    for (const category of SENSITIVE_CATEGORIES) {
      expect(at(dict, `share.category.${category}.note`)).toEqual(expect.any(String));
    }
    for (const duration of SHARE_DURATIONS) {
      expect(at(dict, `share.duration.${duration}.label`)).toEqual(expect.any(String));
      expect(at(dict, `share.duration.${duration}.hint`)).toEqual(expect.any(String));
    }
  });

  it('français et anglais ont exactement les mêmes clés', () => {
    const keys = (node: unknown, prefix = ''): string[] =>
      typeof node === 'object' && node !== null
        ? Object.entries(node).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(en.share).sort()).toEqual(keys(fr.share).sort());
  });
});
