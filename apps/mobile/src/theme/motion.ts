// Aides d'animation (react-native-reanimated) construites sur les jetons de mouvement de @glyka/ui-tokens.
import { durations, easings } from '@glyka/ui-tokens';
import { Easing, FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';

/** Courbes de Bézier des jetons, au format reanimated. */
export const easing = {
  standard: Easing.bezier(...easings.standard),
  decelerate: Easing.bezier(...easings.decelerate),
  accelerate: Easing.bezier(...easings.accelerate),
};

/** Animation d'entrée d'un élément de liste n° `index` (apparition décalée), ou rien si animations réduites. */
export function enterFromBelow(index = 0, reduced = false) {
  if (reduced) return FadeIn.duration(durations.fast);
  return FadeInDown.duration(durations.base)
    .delay(Math.min(index, 8) * 45) // au-delà de 8 éléments, plus de décalage : on n'attend pas
    .easing(easing.decelerate);
}

export const fadeIn = (reduced = false) =>
  FadeIn.duration(reduced ? durations.fast : durations.base);
export const fadeOut = () => FadeOut.duration(durations.fast).easing(easing.accelerate);

/** Vrai si le téléphone demande de réduire les animations (réglage d'accessibilité). */
export { useReducedMotion };
