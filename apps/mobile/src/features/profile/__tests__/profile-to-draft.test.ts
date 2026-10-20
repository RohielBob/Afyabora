// « Mon profil médical » → Modifier : le profil enregistré redevient un brouillon de l'assistant. Renvoyé sans
// changement, il redonne EXACTEMENT le même profil (PUT /me/profile remplace tout le profil : une partie
// modifiée ne doit rien changer aux autres).
import type { PatientProfileInput } from '@glyka/shared';
import { finalPayload, isoToBirthDate, profileToDraft } from '../wizard';

const saved: PatientProfileInput = {
  firstName: 'Amani',
  lastName: 'Demo',
  birthDate: '1980-05-14',
  sex: 'F',
  diabetesType: 'TYPE_1',
  diagnosisYear: 2012,
  preferredUnit: 'G_L',
  thresholds: { veryLowMgDl: 54, targetMinMgDl: 72, targetMaxMgDl: 175, veryHighMgDl: 250 },
  thresholdsReviewedByClinician: true,
  emergencyContact: { name: 'Bisimwa', phone: '+243 81 000 0000', relation: 'Frère' },
  doctorContact: { name: 'Dr Kabila', phone: '+243 99 000 0000' },
  country: 'CD',
  emergencyNumber: '112',
};

describe('profil enregistré → brouillon → profil', () => {
  it('aller-retour sans changement : exactement le même profil', () => {
    expect(finalPayload(profileToDraft(saved))).toEqual(saved);
  });

  it('champs facultatifs absents : restent absents (rien n’est inventé)', () => {
    const minimal: PatientProfileInput = {
      firstName: 'Amani',
      lastName: 'Demo',
      birthDate: '1980-05-14',
      sex: 'M',
      diabetesType: 'TYPE_2',
      preferredUnit: 'MG_DL',
      thresholds: { veryLowMgDl: 54, targetMinMgDl: 70, targetMaxMgDl: 180, veryHighMgDl: 250 },
      thresholdsReviewedByClinician: false,
    };
    const draft = profileToDraft(minimal);
    expect(draft.diagnosisYear).toBe('');
    expect(draft.relativeName).toBe('');
    expect(draft.country).toBeNull();
    expect(finalPayload(draft)).toEqual(minimal);
  });

  it('pays hors de la liste proposée : « Autre » avec son code', () => {
    const draft = profileToDraft({ ...saved, country: 'KE', emergencyNumber: '999' });
    expect(draft.country).toBe('OTHER');
    expect(draft.otherCountry).toBe('KE');
    expect(finalPayload(draft)?.country).toBe('KE');
  });

  it('date de naissance affichée comme à la saisie', () => {
    expect(profileToDraft(saved).birthDate).toBe('14/05/1980');
    expect(isoToBirthDate('pas une date')).toBe('pas une date');
  });

  it('mmol/L : un seuil non touché garde sa valeur exacte malgré l’arrondi de l’affichage', () => {
    // 73 mg/dL s'affiche « 4,1 » mmol/L, qui redonnerait 74 mg/dL.
    const mmol: PatientProfileInput = {
      ...saved,
      preferredUnit: 'MMOL_L',
      thresholds: { veryLowMgDl: 55, targetMinMgDl: 73, targetMaxMgDl: 181, veryHighMgDl: 251 },
    };
    const draft = profileToDraft(mmol);
    expect(draft.thresholds.targetMinMgDl).toBe('4,1');
    // On ne modifie que le prénom : les seuils ne bougent pas.
    expect(finalPayload({ ...draft, firstName: 'Neema' })?.thresholds).toEqual(mmol.thresholds);
  });

  it('un seuil modifié par la personne, lui, prend la nouvelle valeur', () => {
    const draft = profileToDraft(saved);
    const payload = finalPayload({
      ...draft,
      thresholds: { ...draft.thresholds, targetMaxMgDl: '1,60' },
    });
    expect(payload?.thresholds).toEqual({ ...saved.thresholds, targetMaxMgDl: 160 });
  });
});
