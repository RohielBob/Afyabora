// Code court d'un identifiant (« 7EA972 ») : assez pour reconnaître un lot d'import (L4-09) ou un partage
// (nom du rapport téléchargé par le médecin, L6-04), sans afficher l'identifiant entier. UNE seule règle,
// utilisée par l'API, le téléphone et le portail.
export function shortCode(id: string): string {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}
