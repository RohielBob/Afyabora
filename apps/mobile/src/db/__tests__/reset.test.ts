// L8-06 : à qui appartiennent les données du téléphone (ADR-0004, modifications 3 et 6).
import { ownerAction } from '../reset';

describe('ownerAction (connexion)', () => {
  it('aucune donnée attribuée : elles deviennent celles du compte', () => {
    expect(ownerAction(null, 'u1')).toBe('claim');
  });

  it('même compte après une session expirée : tout est gardé, file d’envoi comprise', () => {
    expect(ownerAction('u1', 'u1')).toBe('keep');
  });

  it('AUTRE compte : tout est effacé avant (ses modifications ne partent jamais sur ce compte)', () => {
    expect(ownerAction('u1', 'u2')).toBe('wipe');
  });
});
