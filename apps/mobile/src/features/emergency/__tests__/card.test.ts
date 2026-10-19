// Ticket L6-06 : logique de la carte d'urgence sur le téléphone (card.ts, qr-storage.ts), sans réseau.
import type { EmergencyCardResponse } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';
import {
  EMPTY_DRAFT,
  cardProblem,
  draftFromCard,
  glucoseInput,
  glucoseMgDl,
  lastMeasurementSuggestion,
  previewLines,
  profileSuggestions,
  qrStatus,
  shouldGenerateQr,
  toInput,
  validateDraft,
  type CardDraft,
} from '../card';
import { parseStoredQr } from '../qr-storage';

jest.mock('expo-secure-store', () => ({}));

const CARD: EmergencyCardResponse = {
  fullName: 'Amani Kabeya',
  diabetesType: 'Type 2',
  declaredTreatment: 'Metformine',
  bloodGroup: 'O+',
  lastKnownGlucoseMgDl: 132,
  emergencyContactName: 'Marie',
  emergencyContactPhone: '+243 81 000 0000',
  enabled: true,
  updatedAt: '2026-10-19T08:30:00.000Z',
  qrActive: true,
};
const draft = (over: Partial<CardDraft> = {}): CardDraft => ({ ...EMPTY_DRAFT, ...over });
const label = (type: string) => ({ TYPE_1: 'Type 1', TYPE_2: 'Type 2' })[type] ?? 'Autre';

describe('glycémie dans l’unité du patient', () => {
  it('mg/dL ⇒ texte : 2 décimales en g/L, 1 en mmol/L, entier en mg/dL', () => {
    expect(glucoseInput(132, 'G_L')).toBe('1,32');
    expect(glucoseInput(132, 'MMOL_L')).toBe('7,3');
    expect(glucoseInput(132, 'MG_DL')).toBe('132');
  });

  it('texte ⇒ mg/dL entier ; vide ⇒ absent ; illisible ou hors limites ⇒ erreur', () => {
    expect(glucoseMgDl('1,32', 'G_L')).toBe(132);
    expect(glucoseMgDl('1.32', 'G_L')).toBe(132);
    expect(glucoseMgDl('7,3', 'MMOL_L')).toBe(132);
    expect(glucoseMgDl('  ', 'G_L')).toBeNull();
    expect(glucoseMgDl('abc', 'G_L')).toBe('glucoseInvalid');
    expect(glucoseMgDl('0', 'G_L')).toBe('glucoseInvalid');
    expect(glucoseMgDl('0,1', 'G_L')).toBe('glucoseRange'); // 10 mg/dL
    expect(glucoseMgDl('700', 'MG_DL')).toBe('glucoseRange');
    expect(glucoseMgDl('20', 'MG_DL')).toBe(20);
    expect(glucoseMgDl('600', 'MG_DL')).toBe(600);
  });
});

describe('formulaire', () => {
  it('carte enregistrée ⇒ formulaire (glycémie dans l’unité du patient)', () => {
    expect(draftFromCard(CARD, 'G_L')).toEqual({
      fullName: 'Amani Kabeya',
      diabetesType: 'Type 2',
      declaredTreatment: 'Metformine',
      allergies: '',
      bloodGroup: 'O+',
      glucose: '1,32',
      emergencyContactName: 'Marie',
      emergencyContactPhone: '+243 81 000 0000',
    });
  });

  it('formulaire ⇒ carte : texte nettoyé, champ vide absent, glycémie en mg/dL, état gardé', () => {
    expect(
      toInput(
        draft({ fullName: '  Amani ', allergies: '   ', glucose: '1,32', bloodGroup: 'AB-' }),
        'G_L',
        false,
      ),
    ).toEqual({
      fullName: 'Amani',
      diabetesType: undefined,
      declaredTreatment: undefined,
      allergies: undefined,
      bloodGroup: 'AB-',
      lastKnownGlucoseMgDl: 132,
      emergencyContactName: undefined,
      emergencyContactPhone: undefined,
      enabled: false,
    });
  });

  it('aller-retour : relire la carte puis l’enregistrer ne change rien', () => {
    const { updatedAt: _u, qrActive: _q, ...input } = CARD;
    const back = toInput(draftFromCard(CARD, 'MMOL_L'), 'MMOL_L', true);
    expect(JSON.parse(JSON.stringify(back))).toEqual(input);
  });

  it('vérifications : longueur, glycémie, téléphone', () => {
    expect(validateDraft(draft(), 'G_L')).toEqual({});
    expect(
      validateDraft(
        draft({
          fullName: 'x'.repeat(121),
          declaredTreatment: 'x'.repeat(201),
          glucose: '9,99',
          emergencyContactPhone: 'appelle-moi',
        }),
        'G_L',
      ),
    ).toEqual({
      fullName: 'tooLong',
      declaredTreatment: 'tooLong',
      glucose: 'glucoseRange',
      emergencyContactPhone: 'phoneInvalid',
    });
    // Limites exactes acceptées ; espaces autour ignorés.
    expect(validateDraft(draft({ fullName: ` ${'x'.repeat(120)} ` }), 'G_L')).toEqual({});
    for (const ok of ['+243 81 000 0000', '(081) 000-0000', '0810000000']) {
      expect(validateDraft(draft({ emergencyContactPhone: ok }), 'G_L')).toEqual({});
    }
    expect(validateDraft(draft({ emergencyContactPhone: '12345' }), 'G_L')).toEqual({
      emergencyContactPhone: 'phoneInvalid',
    });
  });
});

describe('propositions', () => {
  const profile = {
    firstName: 'Amani',
    lastName: 'Kabeya',
    diabetesType: 'TYPE_2' as const,
    emergencyContact: { name: 'Marie Kabeya', phone: '+243810000000', relation: 'sœur' },
  };

  it('profil : nom, type et contact pour les champs VIDES seulement', () => {
    expect(profileSuggestions(draft(), profile, label)).toEqual({
      fullName: 'Amani Kabeya',
      diabetesType: 'Type 2',
      emergencyContactName: 'Marie Kabeya (sœur)',
      emergencyContactPhone: '+243810000000',
    });
    expect(
      profileSuggestions(
        draft({ fullName: 'A. K.', emergencyContactPhone: '+1 555' }),
        profile,
        label,
      ),
    ).toEqual({ diabetesType: 'Type 2', emergencyContactName: 'Marie Kabeya (sœur)' });
  });

  it('profil sans contact, ou contact sans lien : rien d’inventé', () => {
    expect(profileSuggestions(draft(), { ...profile, emergencyContact: null }, label)).toEqual({
      fullName: 'Amani Kabeya',
      diabetesType: 'Type 2',
    });
    expect(
      profileSuggestions(
        draft(),
        { ...profile, emergencyContact: { name: 'Marie', phone: '+243810000000' } },
        label,
      ).emergencyContactName,
    ).toBe('Marie');
  });

  it('dernière mesure : dans l’unité du patient, ramenée aux limites de la carte', () => {
    const at = '2026-10-18T21:00:00.000Z';
    expect(lastMeasurementSuggestion({ valueMgDl: 62, measuredAt: at }, 'G_L')).toEqual({
      glucose: '0,62',
      label: '0,62 g/L',
      measuredAt: at,
    });
    expect(lastMeasurementSuggestion({ valueMgDl: 15, measuredAt: at }, 'MG_DL')?.glucose).toBe(
      '20',
    );
    expect(lastMeasurementSuggestion({ valueMgDl: 650, measuredAt: at }, 'MG_DL')?.glucose).toBe(
      '600',
    );
    expect(lastMeasurementSuggestion(null, 'G_L')).toBeNull();
  });
});

describe('aperçu « ce que verra le secouriste »', () => {
  it('champs remplis seulement, dans l’ordre de la page publique, glycémie dans l’unité', () => {
    expect(previewLines(CARD, 'G_L')).toEqual([
      { field: 'fullName', text: 'Amani Kabeya' },
      { field: 'diabetesType', text: 'Type 2' },
      { field: 'declaredTreatment', text: 'Metformine' },
      { field: 'bloodGroup', text: 'O+' },
      { field: 'lastKnownGlucoseMgDl', text: '1,32 g/L' },
      { field: 'emergencyContactName', text: 'Marie' },
      { field: 'emergencyContactPhone', text: '+243 81 000 0000' },
    ]);
    expect(
      previewLines({ enabled: false, updatedAt: CARD.updatedAt, qrActive: false }, 'G_L'),
    ).toEqual([]);
  });
});

describe('QR', () => {
  it('jamais généré / jeton sur ce téléphone / généré ailleurs', () => {
    const stored = { token: 'k3Zt', url: 'https://portail/e/k3Zt' };
    expect(qrStatus({ qrActive: false }, stored)).toEqual({ kind: 'none' });
    expect(qrStatus({ qrActive: true }, stored)).toEqual({ kind: 'ready', ...stored });
    expect(qrStatus({ qrActive: true }, null)).toEqual({ kind: 'elsewhere' });
  });

  it('activer sans QR sur ce téléphone ⇒ en générer un ; désactiver ⇒ jamais', () => {
    const ready = { kind: 'ready' as const, token: 't', url: 'u' };
    expect(shouldGenerateQr(true, { kind: 'none' })).toBe(true);
    expect(shouldGenerateQr(true, { kind: 'elsewhere' })).toBe(true);
    expect(shouldGenerateQr(true, ready)).toBe(false);
    expect(shouldGenerateQr(false, { kind: 'none' })).toBe(false);
  });

  it('jeton gardé : seulement pour CE compte et s’il est bien formé', () => {
    const raw = JSON.stringify({ userId: 'u1', token: 't', url: 'https://p/e/t' });
    expect(parseStoredQr(raw, 'u1')).toEqual({ token: 't', url: 'https://p/e/t' });
    expect(parseStoredQr(raw, 'u2')).toBeNull(); // un autre compte sur le même téléphone
    expect(parseStoredQr(null, 'u1')).toBeNull();
    expect(parseStoredQr('pas du json', 'u1')).toBeNull();
    expect(parseStoredQr(JSON.stringify({ userId: 'u1', token: 1, url: 'x' }), 'u1')).toBeNull();
  });
});

describe('erreurs', () => {
  it.each([
    [new ApiError(0, 'Coupé'), 'offline'],
    [new ApiError(404, 'Profil'), 'noProfile'],
    [new ApiError(429, 'Trop'), 'tooMany'],
    [new ApiError(400, 'Invalide'), 'invalid'],
    [new ApiError(500, 'Panne'), 'error'],
    [new Error('schéma'), 'error'],
  ])('%s ⇒ %s', (error, problem) => {
    expect(cardProblem(error)).toBe(problem);
  });
});
