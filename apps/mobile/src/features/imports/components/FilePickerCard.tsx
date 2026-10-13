// Choix du fichier (L4-05) : grande zone « Choisir un fichier » (bordure en pointillés), puis la fiche du
// fichier choisi : icône du type (tableur ou texte), nom, type et taille, et « Changer ».
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, PressableScale, Text } from '@/components/ui';
import { radii, spacing, touchTarget, useTheme } from '@/theme';
import { fileSize, type FileKind, type PickedFile } from '../start';

/** « 12 Ko », « 1,2 Mo » dans la langue de l'appli. */
export function useFileSizeLabel() {
  const { t, i18n } = useTranslation();
  return (bytes: number) => {
    const { amount, unit } = fileSize(bytes);
    const formatted = amount.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
    return t(`import.size.${unit}`, { amount: formatted });
  };
}

export function FilePickerCard({
  file,
  kind,
  busy,
  onPick,
}: {
  file: PickedFile | null;
  /** Type reconnu du fichier choisi (null : pas encore de fichier, ou fichier refusé). */
  kind: FileKind | null;
  busy: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sizeLabel = useFileSizeLabel();

  if (!file) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('import.file.choose')}
        accessibilityHint={t('import.file.chooseHint')}
        onPress={onPick}
        disabled={busy}
        style={{
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.xl,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.lg,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <Ionicons name="cloud-upload-outline" size={28} color={colors.primaryText} />
        </View>
        <Text variant="heading" align="center">
          {t('import.file.choose')}
        </Text>
        <Text variant="bodySmall" tone="muted" align="center">
          {t('import.file.chooseHint')}
        </Text>
      </PressableScale>
    );
  }

  const meta = [
    kind ? t(`import.file.kind.${kind}`) : null,
    file.size !== null ? sizeLabel(file.size) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: touchTarget,
            height: touchTarget,
            borderRadius: radii.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <Ionicons
            name={kind === 'xlsx' ? 'grid-outline' : 'document-text-outline'}
            size={24}
            color={colors.primaryText}
          />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="label" numberOfLines={1} ellipsizeMode="middle">
            {file.name}
          </Text>
          {meta ? (
            <Text variant="caption" tone="muted">
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      <Button
        label={t('import.file.change')}
        variant="outline"
        size="sm"
        disabled={busy}
        icon={<Ionicons name="swap-horizontal" size={18} color={colors.text} />}
        onPress={onPick}
      />
    </View>
  );
}
