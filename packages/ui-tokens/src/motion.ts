// Mouvement (L7-03, ADR-0008) : les animations sont un SYSTÈME, pas des effets au cas par cas.
// Toutes les animations de l'app utilisent ces durées, courbes et ressorts. Principes :
//  - modérées : elles guident le regard, elles ne retardent jamais l'utilisateur (≤ 400 ms sauf écran de lancement) ;
//  - cohérentes : une même action s'anime toujours de la même façon ;
//  - respectueuses : si le téléphone demande « réduire les animations », on passe en fondu court ou instantané.

/** Durées en millisecondes. */
export const durations = {
  instant: 90, // retour au toucher
  fast: 150, // petits changements (couleur, coche)
  base: 240, // apparition d'un élément, changement d'état
  slow: 380, // entrée d'un écran, feuille modale
  splash: 1100, // animation du logo au lancement (une seule fois)
} as const;

/** Courbes de Bézier [x1, y1, x2, y2]. */
export const easings = {
  standard: [0.2, 0, 0, 1], // la plupart des transitions
  decelerate: [0, 0, 0, 1], // éléments qui ENTRENT à l'écran
  accelerate: [0.3, 0, 1, 1], // éléments qui SORTENT
} as const;

/** Ressorts (physique) pour les interactions directes : doux, sans rebond excessif. */
export const springs = {
  press: { damping: 20, stiffness: 340, mass: 0.6 }, // enfoncement d'un bouton / d'une carte
  gentle: { damping: 18, stiffness: 170, mass: 1 }, // indicateur qui glisse, interrupteur
  bouncy: { damping: 11, stiffness: 160, mass: 0.9 }, // apparition du logo (une fois)
} as const;

/** Échelle d'un élément pressé (bouton, carte). */
export const pressScale = { button: 0.97, card: 0.985 } as const;

/** Décalage entre les éléments d'une liste qui apparaissent l'un après l'autre. */
export const staggerMs = 45;
