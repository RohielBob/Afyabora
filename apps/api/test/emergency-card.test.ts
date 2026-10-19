// Ticket L6-05 : règles pures de la carte d'urgence (emergency-card.ts), sans base.
import type { EmergencyCard } from '@prisma/client';
import { emergencyCardPublicSchema, emergencyCardResponseSchema } from '@glyka/shared';
import { describe, expect, it } from 'vitest';
import {
  cardColumns,
  cardResponse,
  EMERGENCY_NOTIFICATION,
  emergencyUrl,
  hashEmergencyToken,
  isWellFormedEmergencyToken,
  issueEmergencyToken,
  publicCard,
} from '../src/modules/emergency/emergency-card';

const UPDATED = new Date('2026-10-19T08:30:00.000Z');
const card = (over: Partial<EmergencyCard> = {}): EmergencyCard => ({
  patientId: '11111111-1111-4111-8111-111111111111',
  fullName: 'Amani Kabeya',
  diabetesType: 'Type 2',
  declaredTreatment: 'Metformine',
  allergies: null,
  bloodGroup: 'O+',
  lastKnownGlucoseMgDl: 132,
  emergencyContactName: 'Marie',
  emergencyContactPhone: '+243810000000',
  enabled: true,
  tokenHash: 'a'.repeat(64),
  updatedAt: UPDATED,
  ...over,
});

describe('jeton du QR d’urgence', () => {
  it('32 octets aléatoires en base64url (43 caractères) ; seul le hash SHA-256 est gardé', () => {
    const fixed = Buffer.alloc(32, 7);
    const { token, tokenHash } = issueEmergencyToken(() => fixed);
    expect(token).toBe(fixed.toString('base64url'));
    expect(token).toHaveLength(43);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashEmergencyToken(token));
    expect(tokenHash).not.toContain(token);
  });

  it('deux jetons ne se ressemblent pas', () => {
    expect(issueEmergencyToken().token).not.toBe(issueEmergencyToken().token);
  });

  it('forme vérifiée avant toute lecture en base', () => {
    expect(isWellFormedEmergencyToken(issueEmergencyToken().token)).toBe(true);
    for (const bad of ['', 'court', 'a'.repeat(44), `${'a'.repeat(42)}!`, '../../etc/passwd']) {
      expect(isWellFormedEmergencyToken(bad)).toBe(false);
    }
  });

  it('adresse du QR : la page publique du portail', () => {
    expect(emergencyUrl('https://portail.afyabora.org/', 'abc')).toBe(
      'https://portail.afyabora.org/e/abc',
    );
    expect(emergencyUrl('http://localhost:5173', 'abc')).toBe('http://localhost:5173/e/abc');
  });
});

describe('carte enregistrée', () => {
  it('un texte vide ou fait d’espaces est enregistré comme absent ; le reste est nettoyé', () => {
    expect(
      cardColumns({
        fullName: '  Amani Kabeya ',
        diabetesType: '',
        allergies: '   ',
        bloodGroup: 'AB-',
        lastKnownGlucoseMgDl: 95,
        enabled: true,
      }),
    ).toEqual({
      fullName: 'Amani Kabeya',
      diabetesType: null,
      declaredTreatment: null,
      allergies: null,
      bloodGroup: 'AB-',
      lastKnownGlucoseMgDl: 95,
      emergencyContactName: null,
      emergencyContactPhone: null,
      enabled: true,
    });
  });

  it('réponse au patient : champs remplis, activée ou non, QR généré ou non', () => {
    const response = cardResponse(card({ tokenHash: null, enabled: false }));
    expect(response).toEqual({
      fullName: 'Amani Kabeya',
      diabetesType: 'Type 2',
      declaredTreatment: 'Metformine',
      bloodGroup: 'O+',
      lastKnownGlucoseMgDl: 132,
      emergencyContactName: 'Marie',
      emergencyContactPhone: '+243810000000',
      enabled: false,
      updatedAt: '2026-10-19T08:30:00.000Z',
      qrActive: false,
    });
    expect(cardResponse(card()).qrActive).toBe(true);
    expect(emergencyCardResponseSchema.parse(response)).toEqual(response);
  });
});

describe('page publique', () => {
  it('UNIQUEMENT les champs renseignés et la date ; jamais l’identifiant, l’état ni le jeton', () => {
    const shown = publicCard(card());
    expect(shown).toEqual({
      fullName: 'Amani Kabeya',
      diabetesType: 'Type 2',
      declaredTreatment: 'Metformine',
      bloodGroup: 'O+',
      lastKnownGlucoseMgDl: 132,
      emergencyContactName: 'Marie',
      emergencyContactPhone: '+243810000000',
      updatedAt: '2026-10-19T08:30:00.000Z',
    });
    expect(Object.keys(shown)).not.toContain('allergies'); // champ vide : absent
    expect(JSON.stringify(shown)).not.toMatch(/patientId|enabled|tokenHash|1111/);
    expect(emergencyCardPublicSchema.parse(shown)).toEqual(shown);
  });

  it('carte presque vide : seulement la date', () => {
    const empty = card({
      fullName: null,
      diabetesType: null,
      declaredTreatment: null,
      bloodGroup: null,
      lastKnownGlucoseMgDl: null,
      emergencyContactName: null,
      emergencyContactPhone: '',
    });
    expect(publicCard(empty)).toEqual({ updatedAt: '2026-10-19T08:30:00.000Z' });
  });

  it('le schéma public refuse tout champ de plus (historique, identifiant…)', () => {
    expect(() =>
      emergencyCardPublicSchema.parse({ updatedAt: UPDATED.toISOString(), measurements: [] }),
    ).toThrow();
  });
});

describe('notification d’ouverture', () => {
  it('catégorie « accès d’urgence » ; aucune donnée de santé dans le texte', () => {
    expect(EMERGENCY_NOTIFICATION.category).toBe('EMERGENCY_ACCESS');
    const text = `${EMERGENCY_NOTIFICATION.title} ${EMERGENCY_NOTIFICATION.body}`;
    expect(text).not.toMatch(/\d/); // aucune valeur
    expect(text).not.toMatch(/glyc|diab|mg|g\/L|traitement|allerg/i);
  });
});
