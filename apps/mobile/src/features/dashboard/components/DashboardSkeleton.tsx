// Pendant la lecture de la base locale (souvent quelques millisecondes) : la forme de la carte apparaît
// déjà, en gris qui « respire », au lieu d'un écran vide qui sauterait ensuite.
import { View } from 'react-native';
import { Card, Skeleton } from '@/components/ui';
import { radii, spacing } from '@/theme';

export function DashboardSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Card variant="outlined" animateIn={false} style={{ gap: spacing.md }}>
        <Skeleton width={110} height={12} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Skeleton width={150} height={38} radius={radii.md} />
          <Skeleton width={96} height={26} radius={radii.pill} />
        </View>
        <Skeleton width="70%" height={14} />
        <Skeleton width={150} height={40} radius={radii.pill} />
      </Card>
    </View>
  );
}
