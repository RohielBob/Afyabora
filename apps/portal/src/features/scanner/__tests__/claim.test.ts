// Tests du ticket L5-10 : lecture du code du QR, messages d'échec, problèmes de caméra (sans navigateur).
import { describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { ApiError } from '@/lib/api-client';
import { cameraProblem, claimProblem, readShareToken } from '../claim';

const TOKEN = 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXv-_E';

describe('readShareToken', () => {
  it('jeton tel quel (43 caractères base64url, tirets et soulignés compris)', () => {
    expect(TOKEN).toHaveLength(43);
    expect(readShareToken(TOKEN)).toBe(TOKEN);
  });

  it('code recopié par groupes, collé avec retours à la ligne ou tabulations : espaces retirés', () => {
    const grouped = TOKEN.match(/.{1,4}/g)!.join(' ');
    expect(readShareToken(grouped)).toBe(TOKEN);
    expect(readShareToken(`  ${TOKEN.slice(0, 20)}\n${TOKEN.slice(20)}\t `)).toBe(TOKEN);
  });

  it.each([
    ['vide', ''],
    ['trop court', TOKEN.slice(0, 42)],
    ['trop long', `${TOKEN}x`],
    ['adresse web (autre QR)', 'https://exemple.org/rendez-vous?id=42'],
    ['base64 classique (« + »)', `${TOKEN.slice(0, 42)}+`],
    ['base64 classique (« / »)', `${TOKEN.slice(0, 42)}/`],
    ['caractère accentué', `${TOKEN.slice(0, 42)}é`],
  ])('refusé sans requête : %s', (_label, text) => {
    expect(readShareToken(text)).toBeNull();
  });
});

describe('claimProblem', () => {
  it.each([
    ['pas de réseau', new ApiError(0, 'x'), { kind: 'network' }],
    [
      '404 TOKEN_INVALID',
      new ApiError(404, 'QR invalide ou expiré', { code: 'TOKEN_INVALID' }),
      { kind: 'invalid' },
    ],
    ['400 (format refusé)', new ApiError(400, 'Données invalides'), { kind: 'invalid' }],
    [
      '403 DOCTOR_NOT_APPROVED',
      new ApiError(403, 'x', { code: 'DOCTOR_NOT_APPROVED' }),
      { kind: 'notApproved' },
    ],
    ['403 autre (rôle)', new ApiError(403, 'x'), { kind: 'server' }],
    ['500', new ApiError(500, 'x'), { kind: 'server' }],
    ['réponse hors contrat', new Error('x'), { kind: 'server' }],
  ])('%s', (_label, error, problem) => {
    expect(claimProblem(error)).toEqual(problem);
  });

  it('429 : délai donné par le serveur ; à défaut 60 s ; jamais 0', () => {
    expect(claimProblem(new ApiError(429, 'x', { retryAfterSeconds: 37 }))).toEqual({
      kind: 'blocked',
      seconds: 37,
    });
    expect(claimProblem(new ApiError(429, 'x'))).toEqual({ kind: 'blocked', seconds: 60 });
    expect(claimProblem(new ApiError(429, 'x', { retryAfterSeconds: 0 }))).toEqual({
      kind: 'blocked',
      seconds: 1,
    });
  });

  it('un QR refusé donne TOUJOURS le même message, sans préciser la cause', () => {
    expect(fr.scan.problem.invalid.title).toBe('QR invalide ou expiré');
    expect(JSON.stringify(fr.scan.problem.invalid)).not.toMatch(
      /déjà utilisé|inconnu|expiré depuis/,
    );
  });
});

describe('cameraProblem', () => {
  const named = (name: string, message = '') => Object.assign(new Error(message), { name });
  it.each([
    ['refus (Chrome, Edge, Firefox)', named('NotAllowedError'), 'denied'],
    ['refus (texte)', 'Permission denied', 'denied'],
    ['aucune caméra', named('NotFoundError'), 'none'],
    ['aucune caméra (texte)', 'Requested device not found', 'none'],
    ['caméra occupée', named('NotReadableError'), 'busy'],
    ['caméra occupée (texte)', 'Could not start video source', 'busy'],
    ['autre', named('OverconstrainedError'), 'other'],
  ])('%s ⇒ %s', (_label, error, problem) => {
    expect(cameraProblem(error)).toBe(problem);
  });

  it('adresse non sécurisée (http hors localhost) : caméra indisponible, quoi qu’il arrive', () => {
    expect(cameraProblem(named('NotAllowedError'), false)).toBe('insecure');
  });
});

describe('textes', () => {
  it('un titre et un texte pour chaque problème de scan et de caméra', () => {
    for (const p of Object.values(fr.scan.problem)) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.text.length).toBeGreaterThan(0);
    }
    for (const kind of ['denied', 'none', 'busy', 'insecure', 'other'] as const) {
      expect(fr.scan.camera.problem[kind].title.length).toBeGreaterThan(0);
    }
    expect(fr.scan.problem.blocked.text).toContain('{{seconds}}');
  });
});
