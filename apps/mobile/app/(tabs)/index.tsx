import { ScreenStub } from '@/components/ui';

export default function DashboardScreen() {
  return (
    <ScreenStub
      title="Tableau de bord"
      ticket="L2-05, L2-06, L2-07, L2-08"
      description="Dernière mesure + badge d'état, graphique 7/14/30/90 j, statistiques, qualité des données, indicateur de synchronisation. Calculé depuis la base LOCALE."
    />
  );
}
