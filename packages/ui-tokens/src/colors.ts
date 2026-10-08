// Palette Afyabora — dérivée du logo validé par le groupe (goutte rouge, « Afya » bleu marine, « bora » rouge corail).
// Voir docs/design/marque-afyabora.md pour les règles d'usage.
//
// Le rouge de la marque est réservé au logo et aux accents. Un état glycémique n'est JAMAIS exprimé
// par la couleur de la marque : voir `state` ci-dessous (toujours couleur + symbole + libellé).
export const brand = {
  navy: '#0B3366', // « Afya » — couleur principale de l'interface (contraste 12,5:1 sur blanc)
  coral: '#F83E44', // « bora » — grands textes et accents seulement (contraste 3,6:1 sur blanc)
  red: '#E4002B', // goutte, milieu du dégradé — aussi le rouge de texte accessible (4,8:1 sur blanc)
  redLight: '#FF3A4A', // goutte, haut gauche du dégradé
  redDark: '#A80024', // goutte, bas droit du dégradé
} as const;

export const colors = {
  primary: brand.navy,
  primaryDark: '#082650',
  primaryLight: '#DCE6F5',
  accent: brand.coral,
  background: '#F6F8FB',
  surface: '#FFFFFF',
  text: '#0F1F36',
  textMuted: '#51627A',
  border: '#D5DEEA',
  danger: '#C0392B',
  // États glycémiques. Toujours associés à une forme + un libellé (voir @glyka/shared STATE_SYMBOLS).
  state: {
    veryLow: '#B3261E',
    low: '#D9534F',
    inRange: '#2E8B57',
    high: '#E9A23B',
    veryHigh: '#C26A00',
  },
} as const;

export const darkColors = {
  ...colors,
  primary: '#3E73C4', // le bleu marine disparaîtrait sur fond sombre : version éclaircie
  primaryDark: '#2F66BD',
  primaryLight: '#1B2E4E',
  background: '#0A1626',
  surface: '#122238',
  text: '#E8EEF7',
  textMuted: '#9FB1C8',
  border: '#26395A',
} as const;
