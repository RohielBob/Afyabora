// Thème du portail (ADR-0008) : les couleurs, durées et courbes viennent de @glyka/ui-tokens, comme sur le
// mobile. On les transforme en variables CSS (--afy-*) injectées une fois au démarrage, en clair ET en
// sombre (le navigateur choisit selon le réglage de l'ordinateur). Tailwind les utilise via `@theme inline`
// (src/styles/index.css) : aucune couleur n'est écrite en dur dans les pages.
import {
  brand,
  buildTheme,
  durations,
  easings,
  type ColorMode,
  type ThemeColors,
} from '@glyka/ui-tokens';

/** `primaryText` → `--afy-primary-text` */
const toVar = (role: string) => `--afy-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** `VERY_LOW` → `very-low` */
const stateSlug = (state: string) => state.toLowerCase().replace(/_/g, '-');

/** Déclarations CSS des rôles de couleur d'un mode. */
export function colorDeclarations(mode: ColorMode): string {
  const theme = buildTheme(mode);
  const colors: ThemeColors = theme.colors;
  // « Afya » du logo : bleu marine en clair, couleur du texte en sombre (marine illisible sur fond sombre).
  const wordmark = mode === 'light' ? brand.navy : colors.text;
  return [
    ...Object.entries(colors).map(([role, value]) => `${toVar(role)}: ${value};`),
    // États glycémiques (dossier patient, L5-12) : palette dédiée SANS rouge (ADR-0008), toujours avec un
    // symbole et un libellé à côté. `--afy-state-very-low-fg`, `-bg`, `-border`…
    ...Object.entries(theme.states).flatMap(([state, tone]) =>
      Object.entries(tone).map(
        ([part, value]) => `--afy-state-${stateSlug(state)}-${part}: ${value};`,
      ),
    ),
    `--afy-wordmark: ${wordmark};`,
  ].join(' ');
}

/** Durées et courbes d'animation (identiques au mobile). */
export function motionDeclarations(): string {
  const d = Object.entries(durations).map(([name, ms]) => `--afy-duration-${name}: ${ms}ms;`);
  const e = Object.entries(easings).map(
    ([name, [x1, y1, x2, y2]]) => `--afy-ease-${name}: cubic-bezier(${x1}, ${y1}, ${x2}, ${y2});`,
  );
  return [...d, ...e].join(' ');
}

/** Feuille de style complète du thème. */
export function themeStylesheet(): string {
  return [
    `:root { color-scheme: light; ${colorDeclarations('light')} ${motionDeclarations()} }`,
    `@media (prefers-color-scheme: dark) { :root { color-scheme: dark; ${colorDeclarations('dark')} } }`,
  ].join('\n');
}

/** À appeler une fois, avant le premier affichage (src/main.tsx). */
export function applyTheme(doc: Document = document): void {
  const id = 'afy-theme';
  const style = doc.getElementById(id) ?? doc.createElement('style');
  style.id = id;
  style.textContent = themeStylesheet();
  if (!style.parentNode) doc.head.appendChild(style);
}
