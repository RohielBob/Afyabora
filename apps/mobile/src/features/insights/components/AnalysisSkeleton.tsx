// Pendant le calcul (lecture de la base locale + moteur, souvent quelques millisecondes) : la forme du
// résumé et de deux observations apparaît déjà, au lieu d'un écran vide qui sauterait ensuite.
import { View } from 'react-native';
import { Card, Skeleton } from '@/components/ui';
import { radii, spacing } from '@/theme';

export function AnalysisSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ gap: spacing.lg }}
    >
      <Card variant="outlined" animateIn={false} style={{ gap: spacing.md }}>
        <Skeleton width={120} height={12} />
        <Skeleton width={140} height={40} radius={radii.md} />
        <Skeleton height={8} radius={radii.pill} />
        <Skeleton width="60%" height={14} />
      </Card>
      {[0, 1].map((i) => (
        <Card key={i} variant="outlined" animateIn={false} style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Skeleton width={40} height={40} radius={radii.md} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Skeleton width="55%" height={14} />
              <Skeleton width={90} height={18} radius={radii.pill} />
            </View>
          </View>
          <Skeleton height={14} />
          <Skeleton width="80%" height={14} />
        </Card>
      ))}
    </View>
  );
}
