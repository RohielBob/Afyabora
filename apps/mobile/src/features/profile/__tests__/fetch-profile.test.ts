// « Mon profil médical » : lecture du profil, avec une seconde tentative si le serveur hébergé dormait.
import { ApiError } from '@/lib/api-client';
import { profileApi } from '../api';
import { fetchProfile, loadProblem } from '../useMedicalProfile';

jest.mock('../api', () => ({ profileApi: { get: jest.fn(), save: jest.fn() } }));
jest.mock('../local-thresholds', () => ({ saveThresholds: jest.fn(), readThresholds: jest.fn() }));

const get = profileApi.get as jest.Mock;
const profile = { firstName: 'Amani' };
const offline = new ApiError(0, 'Serveur injoignable');

describe('loadProblem', () => {
  it('pas de réseau, profil absent, autre erreur', () => {
    expect(loadProblem(offline)).toBe('offline');
    expect(loadProblem(new ApiError(404, 'Introuvable'))).toBe('noProfile');
    expect(loadProblem(new ApiError(500, 'Erreur'))).toBe('error');
    expect(loadProblem(new ApiError(400, 'Invalide'))).toBe('error');
    expect(loadProblem(new Error('autre'))).toBe('error');
  });
});

describe('fetchProfile', () => {
  beforeEach(() => get.mockReset());

  it('serveur éveillé : une seule lecture, sans réveil', async () => {
    get.mockResolvedValueOnce(profile);
    const wake = jest.fn();
    await expect(fetchProfile(wake)).resolves.toBe(profile);
    expect(get).toHaveBeenCalledTimes(1);
    expect(wake).not.toHaveBeenCalled();
  });

  it('serveur endormi : réveil, puis UNE seconde lecture qui réussit', async () => {
    get.mockRejectedValueOnce(offline).mockResolvedValueOnce(profile);
    const wake = jest.fn().mockResolvedValue(true);
    await expect(fetchProfile(wake)).resolves.toBe(profile);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('vraiment hors ligne (le réveil échoue) : l’erreur d’origine, sans seconde lecture', async () => {
    get.mockRejectedValueOnce(offline);
    await expect(fetchProfile(jest.fn().mockResolvedValue(false))).rejects.toBe(offline);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('autre erreur (profil absent, serveur en erreur) : pas de réveil, pas de seconde lecture', async () => {
    const missing = new ApiError(404, 'Introuvable');
    get.mockRejectedValueOnce(missing);
    const wake = jest.fn();
    await expect(fetchProfile(wake)).rejects.toBe(missing);
    expect(wake).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
