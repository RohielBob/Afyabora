// Ticket L1-08 : logique de l'assistant de profil (sans interface).
import {
  birthDateToIso,
  convertThresholds,
  displayToMgDl,
  finalPayload,
  firstInvalidStep,
  formatValue,
  initialDraft,
  maskBirthDate,
  validateStep,
  type ProfileDraft,
} from '../wizard';

const complete = (): ProfileDraft => ({
  ...initialDraft(),
  firstName: 'Jean',
  lastName: 'Demo',
  birthDate: '14/05/1980',
  sex: 'M',
  diabetesType: 'TYPE_2',
  diagnosisYear: '2016',
});

describe('unités et nombres', () => {
  it('les seuils par défaut s’affichent en g/L avec une virgule', () => {
    expect(initialDraft().thresholds).toEqual({
      veryLowMgDl: '0,54',
      targetMinMgDl: '0,70',
      targetMaxMgDl: '1,80',
      veryHighMgDl: '2,50',
    });
  });

  it('accepte la virgule ou le point et convertit en mg/dL entier', () => {
    expect(displayToMgDl('0,7', 'G_L')).toBe(70);
    expect(displayToMgDl('1.48', 'G_L')).toBe(148);
    expect(displayToMgDl('10', 'MMOL_L')).toBe(180);
    expect(displayToMgDl('abc', 'G_L')).toBeNull();
    expect(displayToMgDl('', 'MG_DL')).toBeNull();
  });

  it('changer d’unité convertit les seuils sans les changer en mg/dL', () => {
    const inMgDl = convertThresholds(initialDraft().thresholds, 'G_L', 'MG_DL');
    expect(inMgDl).toEqual({
      veryLowMgDl: '54',
      targetMinMgDl: '70',
      targetMaxMgDl: '180',
      veryHighMgDl: '250',
    });
    expect(formatValue(180, 'MMOL_L')).toBe('10,0');
  });
});

describe('date de naissance', () => {
  it('ajoute les « / » pendant la frappe et convertit au format du serveur', () => {
    expect(maskBirthDate('1405')).toBe('14/05');
    expect(maskBirthDate('14051980')).toBe('14/05/1980');
    expect(birthDateToIso('14/05/1980')).toBe('1980-05-14');
    expect(birthDateToIso('4/5/1980')).toBe('1980-05-04');
  });
});

describe('validation étape par étape (règles du serveur)', () => {
  it('étape 1 : prénom, nom, date et sexe obligatoires ; les erreurs des autres étapes sont ignorées', () => {
    const errors = validateStep('identity', initialDraft());
    expect(Object.keys(errors).sort()).toEqual(['birthDate', 'firstName', 'lastName', 'sex']);
  });

  it('étape 1 : date de naissance dans le futur refusée', () => {
    expect(validateStep('identity', { ...complete(), birthDate: '01/01/2999' })).toEqual({
      birthDate: 'onboarding.errors.birthDate',
    });
  });

  it('étape 2 : type de diabète obligatoire, année du diagnostic facultative mais cohérente', () => {
    expect(validateStep('diabetes', { ...complete(), diabetesType: null })).toEqual({
      diabetesType: 'onboarding.errors.diabetesType',
    });
    expect(validateStep('diabetes', { ...complete(), diagnosisYear: '' })).toEqual({});
    expect(validateStep('diabetes', { ...complete(), diagnosisYear: '1975' })).toEqual({
      diagnosisYear: 'onboarding.errors.diagnosisYear',
    });
  });

  it('étape 3 : seuils dans le mauvais ordre ou illisibles refusés, avec le champ fautif', () => {
    const draft = complete();
    expect(
      validateStep('thresholds', {
        ...draft,
        thresholds: { ...draft.thresholds, veryLowMgDl: '0,90' },
      }),
    ).toEqual({ 'thresholds.veryLowMgDl': 'onboarding.errors.thresholds.veryLowMgDl' });
    expect(
      Object.keys(
        validateStep('thresholds', {
          ...draft,
          thresholds: { ...draft.thresholds, targetMaxMgDl: 'x' },
        }),
      ),
    ).toContain('thresholds.targetMaxMgDl');
  });

  it('étape 4 : contacts facultatifs, mais un contact commencé doit avoir nom ET téléphone', () => {
    expect(validateStep('contacts', complete())).toEqual({});
    expect(validateStep('contacts', { ...complete(), relativeName: 'Marie' })).toEqual({
      'emergencyContact.phone': 'onboarding.errors.emergencyContact.phone',
    });
    expect(validateStep('contacts', { ...complete(), doctorPhone: '+243820000000' })).toEqual({
      'doctorContact.name': 'onboarding.errors.doctorContact.name',
    });
  });
});

describe('profil final', () => {
  it('donne la requête du serveur : seuils en mg/dL, contacts seulement s’ils sont remplis', () => {
    const payload = finalPayload({
      ...complete(),
      unit: 'MG_DL',
      thresholds: {
        veryLowMgDl: '60',
        targetMinMgDl: '80',
        targetMaxMgDl: '170',
        veryHighMgDl: '240',
      },
      doctorName: 'Dr Demo',
      doctorPhone: '+243820000000',
    });
    expect(payload).toEqual({
      firstName: 'Jean',
      lastName: 'Demo',
      birthDate: '1980-05-14',
      sex: 'M',
      diabetesType: 'TYPE_2',
      diagnosisYear: 2016,
      preferredUnit: 'MG_DL',
      thresholds: { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 170, veryHighMgDl: 240 },
      thresholdsReviewedByClinician: false,
      doctorContact: { name: 'Dr Demo', phone: '+243820000000' },
    });
  });

  it('indique la première étape à corriger', () => {
    expect(firstInvalidStep(complete())).toBeNull();
    expect(firstInvalidStep({ ...complete(), diabetesType: null })).toBe('diabetes');
    expect(finalPayload({ ...complete(), diabetesType: null })).toBeNull();
  });
});
