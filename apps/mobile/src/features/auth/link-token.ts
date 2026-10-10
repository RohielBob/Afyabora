// Le lien reçu par email ressemble à « http://…/verify-email?token=XXXX » (ou /reset-password?token=…).
// La personne peut coller le lien complet OU seulement le code : on en extrait le jeton.
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/; // format d'un jeton opaque (base64url), voir l'API

export function extractToken(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromLink = text.match(/[?&]token=([A-Za-z0-9_-]+)/)?.[1];
  const candidate = fromLink ?? text;
  return TOKEN.test(candidate) ? candidate : null;
}
