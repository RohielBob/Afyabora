import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_PROFILES, generateSeries } from './glucose-series.ts';

const endDate = new Date(Date.UTC(2026, 9, 3));

test('même graine, mêmes données (démo reproductible)', () => {
  const a = generateSeries({ ...DEMO_PROFILES.jean, endDate });
  const b = generateSeries({ ...DEMO_PROFILES.jean, endDate });
  assert.deepEqual(a, b);
});

test('toutes les valeurs sont plausibles (20–600 mg/dL) et les dates ordonnées', () => {
  for (const profile of Object.values(DEMO_PROFILES)) {
    const s = generateSeries({ ...profile, endDate });
    assert.ok(s.length > 0);
    assert.ok(s.every((m) => m.mgDl >= 20 && m.mgDl <= 600));
    for (let i = 1; i < s.length; i++) assert.ok(s[i]!.measuredAt >= s[i - 1]!.measuredAt);
  }
});

test('Paul n\'a aucune mesure sur les 5 derniers jours', () => {
  const s = generateSeries({ ...DEMO_PROFILES.paul, endDate });
  const last = s[s.length - 1]!.measuredAt.getTime();
  assert.ok(endDate.getTime() - last >= 4 * 86_400_000);
});
