// Image de la carte d'urgence : les lignes de texte tiennent dans l'image, quelle que soit la langue.
import en from '@/i18n/en.json';
import es from '@/i18n/es.json';
import fr from '@/i18n/fr.json';
import kg from '@/i18n/kg.json';
import ln from '@/i18n/ln.json';
import lua from '@/i18n/lua.json';
import pt from '@/i18n/pt.json';
import sw from '@/i18n/sw.json';
import { CHAR_WIDTH, MIN_FONT_SIZE, fitFontSize } from '../image-text';

const WIDTH = 312; // 360 px moins 24 px de marge de chaque côté
const widthOf = (text: string, size: number, charWidth: number, spacing = 0) =>
  [...text].length * (size * charWidth + spacing);

describe('fitFontSize', () => {
  it('texte court : taille d’origine, jamais agrandie', () => {
    expect(fitFontSize('CARTE D’URGENCE', 24, WIDTH, CHAR_WIDTH.upperExtraBold, 1.5)).toBe(24);
    expect(fitFontSize('', 24, WIDTH, CHAR_WIDTH.upperExtraBold)).toBe(24);
  });

  it('texte long : réduit juste assez pour tenir (arrondi vers le bas)', () => {
    const size = fitFontSize('TARJETA DE EMERGENCIA', 24, WIDTH, CHAR_WIDTH.upperExtraBold, 1.5);
    expect(size).toBeLessThan(24);
    expect(
      widthOf('TARJETA DE EMERGENCIA', size, CHAR_WIDTH.upperExtraBold, 1.5),
    ).toBeLessThanOrEqual(WIDTH);
    // Une taille de plus ne tiendrait plus : la réduction est minimale.
    expect(
      widthOf('TARJETA DE EMERGENCIA', size + 1, CHAR_WIDTH.upperExtraBold, 1.5),
    ).toBeGreaterThan(WIDTH);
  });

  it('l’espacement des lettres compte : sans lui, ce texte semblerait tenir et déborderait', () => {
    // 10 lettres, 0,5 em, espacement 5 px : en 24 px, 120 px sans l'espacement, mais 170 px avec.
    const size = fitFontSize('ABCDEFGHIJ', 24, 150, 0.5, 5);
    expect(size).toBe(20);
    expect(widthOf('ABCDEFGHIJ', size, 0.5, 5)).toBeLessThanOrEqual(150);
  });

  it('jamais sous la taille minimale lisible', () => {
    expect(fitFontSize('A'.repeat(200), 24, WIDTH, CHAR_WIDTH.bold)).toBe(MIN_FONT_SIZE);
  });

  it.each([
    ['fr', fr],
    ['en', en],
    ['es', es],
    ['pt', pt],
    ['ln', ln],
    ['sw', sw],
    ['kg', kg],
    ['lua', lua],
  ])('« %s » : titre, consigne et public tiennent dans l’image', (_code, dict) => {
    const { title, instruction, audience } = dict.emergency.image;
    const checks: [string, number, number, number][] = [
      [title, 24, CHAR_WIDTH.upperExtraBold, 1.5],
      [instruction, 17, CHAR_WIDTH.bold, 0],
      [audience, 13, CHAR_WIDTH.medium, 0],
    ];
    for (const [text, max, charWidth, spacing] of checks) {
      const size = fitFontSize(text, max, WIDTH, charWidth, spacing);
      expect(size).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
      expect(widthOf(text, size, charWidth, spacing)).toBeLessThanOrEqual(WIDTH);
    }
  });
});
