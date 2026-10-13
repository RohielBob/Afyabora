// Messages communs aux écrans de l'import (L4-05, L4-06) : échec de l'analyse (avec « Réessayer » quand
// réessayer a un sens) et petites notes discrètes (icône + texte) sous le bouton principal.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { InlineAlert, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import type { PreviewProblem } from '../start';

/** Message d'échec de l'analyse, avec « Réessayer » quand réessayer a un sens. */
export function ProblemAlert({
  problem,
  onRetry,
}: {
  problem: PreviewProblem;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const retry = { actionLabel: t('common.retry'), onAction: onRetry };
  switch (problem.kind) {
    case 'offline':
      return (
        <InlineAlert
          tone="warning"
          title={t('import.problem.offline.title')}
          message={t('import.problem.offline.text')}
          {...retry}
        />
      );
    case 'tooMany':
      return (
        <InlineAlert
          tone="warning"
          title={t('import.problem.tooMany.title')}
          message={t('import.problem.tooMany.text')}
          {...retry}
        />
      );
    case 'tooLarge':
      return (
        <InlineAlert
          tone="danger"
          title={t('import.problem.tooLarge.title')}
          message={t('import.problem.tooLarge.text')}
        />
      );
    // Le serveur explique précisément pourquoi (classeur abîmé, ancien .xls, profil à compléter…).
    case 'unreadable':
    case 'rejected':
      return (
        <InlineAlert
          tone="danger"
          title={t(`import.problem.${problem.kind}.title`)}
          message={problem.detail}
        />
      );
    default:
      return (
        <InlineAlert
          tone="danger"
          title={t('import.problem.error.title')}
          message={t('import.problem.error.text')}
          {...retry}
        />
      );
  }
}

/** Petite note sous le bouton : icône + texte discret. */
export function Note({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
