// Tests du ticket L5-10 (côté téléphone) : code de secours affiché par groupes, que le portail sait relire.
import { groupCode } from '../components/BackupCode';

describe('groupCode', () => {
  it('groupes de 4 caractères séparés par une espace', () => {
    expect(groupCode('abcdefghij')).toBe('abcd efgh ij');
    expect(groupCode('abcd')).toBe('abcd');
    expect(groupCode('')).toBe('');
  });

  it('jeton réel (43 caractères) : 11 groupes ; sans les espaces, c’est exactement le jeton', () => {
    const token = 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXv-_E'; // 43 caractères base64url
    const grouped = groupCode(token);
    expect(grouped.split(' ')).toHaveLength(11);
    expect(grouped.replace(/\s+/g, '')).toBe(token); // ce que fait le portail (readShareToken)
  });

  it('les tirets et soulignés du jeton sont gardés', () => {
    expect(groupCode('ab-_cd-_')).toBe('ab-_ cd-_');
  });
});
