// Ticket L6-01 : le PDF « Préparer ma consultation » est produit, en moins de 10 s pour 90 jours, et ses
// couleurs sont celles du système de design.
// Pour regarder les PDF produits : définir REPORT_SAMPLE_DIR (dossier) avant de lancer ce test.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReport, type ReportDays } from '../src/modules/reports/report-data';
import { frenchSpacing, renderReportPdf } from '../src/modules/reports/report-document';
import { brandNavy, brandRed, ink, statePalette } from '../src/modules/reports/report-palette';
import { reportView } from '../src/modules/reports/report-view';
import { NOW, PATIENT, fixtureMeasurements } from './support/report-fixture';

const SAMPLES = process.env.REPORT_SAMPLE_DIR;

const pdfFor = async (
  days: ReportDays,
  patient = PATIENT,
  measurements = fixtureMeasurements(days),
) => {
  const view = reportView(
    buildReport({ patient, measurements, days, now: NOW, author: { kind: 'PATIENT' } }),
  );
  return renderReportPdf(view);
};
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('PDF « Préparer ma consultation »', () => {
  it('90 jours (≈ 260 mesures) : un vrai PDF, en moins de 10 s', async () => {
    expect(fixtureMeasurements(90).length).toBeGreaterThan(200);
    const started = Date.now();
    const pdf = await pdfFor(90);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(2);
    expect(pdf.length).toBeLessThan(1_000_000);
    if (SAMPLES) writeFileSync(resolve(SAMPLES, 'rapport-90-jours.pdf'), pdf);
  }, 20_000);

  it('14 et 30 jours, mg/dL, et données insuffisantes : produits sans erreur', async () => {
    const thirty = await pdfFor(30);
    const mg = await pdfFor(14, { ...PATIENT, preferredUnit: 'MG_DL' });
    const few = await pdfFor(30, PATIENT, fixtureMeasurements(30).slice(0, 4));
    for (const pdf of [thirty, mg, few]) expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    if (SAMPLES) {
      writeFileSync(resolve(SAMPLES, 'rapport-30-jours.pdf'), thirty);
      writeFileSync(resolve(SAMPLES, 'rapport-14-jours-mgdl.pdf'), mg);
      writeFileSync(resolve(SAMPLES, 'rapport-insuffisant.pdf'), few);
    }
  }, 30_000);

  it('typographie française : jamais « : », « % » ou « » » en début de ligne ; pas de ligature', () => {
    expect(frenchSpacing('Très haut : au-dessus de 2,50 g/L ; 74 % « cible »')).toBe(
      'Très haut\u00a0: au-dessus de 2,50 g/L\u00a0; 74\u00a0% «\u00a0cible\u00a0»',
    );
    expect(frenchSpacing('différente, modifié, vérifier')).toBe(
      'dif\u200cférente, modif\u200cié, vérif\u200cier',
    );
  });

  it('couleurs = celles de @glyka/ui-tokens (fichier source des jetons), états sans le rouge de la marque', () => {
    const tokens = readFileSync(
      resolve(__dirname, '../../../packages/ui-tokens/src/colors.ts'),
      'utf8',
    );
    const light = tokens.slice(tokens.indexOf('light: {'), tokens.indexOf('dark: {'));
    for (const [state, tone] of Object.entries(statePalette)) {
      expect(light).toContain(
        `${state}: { fg: '${tone.fg}', bg: '${tone.bg}', border: '${tone.border}' }`,
      );
      expect(Object.values(tone)).not.toContain(brandRed);
    }
    expect(tokens).toContain(`red: '${brandRed}'`);
    expect(tokens).toContain(`navy: '${brandNavy}'`);
    for (const value of Object.values(ink)) expect(tokens).toContain(`'${value}'`);
  });
});
