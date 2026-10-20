// Thème du portail (ADR-0008) : les couleurs, durées et courbes viennent de @glyka/ui-tokens, comme sur le
// mobile. On les transforme en variables CSS (--afy-*) injectées dans la page. Tailwind les utilise via
// `@theme inline` (src/styles/index.css) : aucune couleur n'est écrite en dur dans les pages.
//
// Le médecin choisit l'apparence (menu « Apparence », src/components/layout/AppearanceMenu.tsx) : Clair
// (par défaut), Sombre ou Automatique, et une couleur d'accent. On n'injecte que le mode RÉELLEMENT affiché,
// et on pose `data-theme="light|dark"` sur <html> (utilisé par la variante `dark:` de Tailwind). En
// « Automatique », on écoute le réglage de l'ordinateur et on change de mode dès qu'il change.
import {
  brand,
  buildTheme,
  DEFAULT_ACCENT,
  durations,
  easings,
  type AccentName,
  type ColorMode,
  type ThemeColors,
} from '@glyka/ui-tokens';
import { useSyncExternalStore } from 'react';
import { getAppearance, resolveMode, subscribeAppearance } from './appearance';

/** `primaryText` → `--afy-primary-text` */
const toVar = (role: string) => `--afy-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** `VERY_LOW` → `very-low` */
const stateSlug = (state: string) => state.toLowerCase().replace(/_/g, '-');

/** Déclarations CSS des rôles de couleur d'un mode et d'une couleur d'accent. */
export function colorDeclarations(mode: ColorMode, accent: AccentName = DEFAULT_ACCENT): string {
  const theme = buildTheme(mode, accent);
  const colors: ThemeColors = theme.colors;
  // « Afya » du logo : bleu marine en clair, couleur du texte en sombre (marine illisible sur fond sombre).
  const wordmark = mode === 'light' ? brand.navy : colors.text;
  return [
    ...Object.entries(colors).map(([role, value]) => `${toVar(role)}: ${value};`),
    // États glycémiques (dossier patient, L5-12) : palette dédiée SANS rouge (ADR-0008), toujours avec un
    // symbole et un libellé à côté. Elle ne dépend PAS de la couleur d'accent. `--afy-state-very-low-fg`…
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

/** Feuille de style complète du thème affiché. `color-scheme` adapte aussi les barres de défilement. */
export function themeStylesheet(mode: ColorMode, accent: AccentName = DEFAULT_ACCENT): string {
  return `:root { color-scheme: ${mode}; ${colorDeclarations(mode, accent)} ${motionDeclarations()} }`;
}

/** Écrit le thème dans la page : feuille de style `#afy-theme` et `data-theme` sur <html>. */
export function applyTheme(
  mode: ColorMode,
  accent: AccentName = DEFAULT_ACCENT,
  doc: Document = document,
): void {
  const id = 'afy-theme';
  const style = doc.getElementById(id) ?? doc.createElement('style');
  style.id = id;
  style.textContent = themeStylesheet(mode, accent);
  if (!style.parentNode) doc.head.appendChild(style);
  doc.documentElement.dataset.theme = mode;
}

// ---------- Mode de l'ordinateur (pour « Automatique ») ----------

const DARK_QUERY = '(prefers-color-scheme: dark)';

function darkMedia(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  } catch {
    return null;
  }
}

/** L'ordinateur est-il réglé en sombre ? (faux si le navigateur ne sait pas le dire) */
export function systemPrefersDark(): boolean {
  return darkMedia()?.matches ?? false;
}

function subscribeSystem(listener: () => void): () => void {
  const media = darkMedia();
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
}

/** Mode réellement affiché, pour un composant (ex. « actuellement : sombre » dans le menu). */
export function useResolvedMode(): ColorMode {
  const preference = useSyncExternalStore(
    subscribeAppearance,
    () => getAppearance().preference,
    () => getAppearance().preference,
  );
  const systemDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false);
  return resolveMode(preference, systemDark);
}

/**
 * À appeler une fois, avant le premier affichage (src/main.tsx) : applique le choix enregistré, puis le
 * réapplique à chaque changement de choix ou de réglage de l'ordinateur. Renvoie la fonction d'arrêt.
 */
export function startTheme(doc: Document = document): () => void {
  const render = () => {
    const { preference, accent } = getAppearance();
    applyTheme(resolveMode(preference, systemPrefersDark()), accent, doc);
  };
  render();
  const stopAppearance = subscribeAppearance(render);
  const stopSystem = subscribeSystem(render);
  return () => {
    stopAppearance();
    stopSystem();
  };
}
