// Garde-fou des tests sur une VRAIE base PostgreSQL (L8-09, L5-01) : ils écrivent et effacent des données,
// donc ils ne tournent que si DATABASE_URL désigne une base dont le NOM finit par « _test » (CI :
// glyka_test). Sinon ils sont ignorés : la base de développement n'est jamais touchée.

/** Vrai seulement pour une base dont le NOM finit par « _test » (l'hôte ne compte pas). */
export function isTestDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const name = new URL(url).pathname.replace(/^\//, '');
    return /_test$/.test(name);
  } catch {
    return false;
  }
}
