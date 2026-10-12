// Touches d'appel d'urgence (L9-09) : le numéro d'urgence du pays (bouton principal), puis le proche et le
// médecin enregistrés dans le profil. Un appui ouvre le composeur du téléphone (lien `tel:`).
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { Button } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import type { EmergencyCall } from '../presentation';

export function EmergencyCalls({ calls }: { calls: readonly EmergencyCall[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (calls.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {calls.map((call) => {
        const primary = call.kind === 'emergency';
        const label =
          call.kind === 'emergency'
            ? t('assistant.emergency.callNumber', { phone: call.phone })
            : t(`assistant.emergency.call_${call.kind}`, { name: call.name, phone: call.phone });
        return (
          <Button
            key={call.kind}
            label={label}
            variant={primary ? 'danger' : 'outline'}
            size="md"
            fullWidth
            icon={
              // Mêmes couleurs que le libellé du bouton (variante « danger » : contour et texte).
              <Ionicons name="call" size={18} color={primary ? colors.danger : colors.text} />
            }
            accessibilityHint={t('assistant.emergency.callHint')}
            onPress={() => void Linking.openURL(call.uri)}
          />
        );
      })}
    </View>
  );
}
