// Palette Glyka (proposition de départ — L7 la finalise dans Figma puis met ce fichier à jour).
export const colors = {
  primary: '#0B6E6E',
  primaryDark: '#084F4F',
  primaryLight: '#D7EEEE',
  accent: '#E9A23B',
  background: '#F7FAFA',
  surface: '#FFFFFF',
  text: '#10231F',
  textMuted: '#52665F',
  border: '#D6E2E0',
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
  background: '#0E1A18',
  surface: '#152623',
  text: '#E8F1EF',
  textMuted: '#9DB3AD',
  border: '#27403B',
} as const;
