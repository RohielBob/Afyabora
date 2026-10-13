// Import d'un historique, étape « colonnes » (L4-06, CDC F5 étape 2). S'ouvre quand le serveur ne reconnaît
// pas les colonnes de date ou de valeur : il a renvoyé celles du fichier (contrat 0.4.1). Le patient dit
// laquelle contient la date, la glycémie, et s'il le souhaite l'heure, l'unité et le moment de la mesure,
// puis l'analyse reprend avec ce choix (`mapping`). Toujours RIEN d'importé à cette étape.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { UNIT_LABELS } from '@glyka/shared';
import { Button, Card, InlineAlert, PressableScale, Screen, Text } from '@/components/ui';
import {
  COLUMN_ROLES,
  ColumnRoleChoice,
  Note,
  ProblemAlert,
  assignColumn,
  importFlow,
  importsApi,
  mappingIssues,
  previewProblem,
  toMapping,
  useImportFlow,
  type PreviewProblem,
} from '@/features/imports';
import { enterFromBelow, radii, spacing, touchTarget, useReducedMotion, useTheme } from '@/theme';

export default function ImportMappingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const flow = useImportFlow();
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<PreviewProblem | null>(null);
  /** Le serveur a renvoyé une autre liste de colonnes : le patient revérifie son choix. */
  const [columnsChanged, setColumnsChanged] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/import'));

  // Pas de parcours en cours (appli relancée, lien direct) : retour au choix du fichier.
  if (!flow.file || !flow.columns) {
    return (
      <Screen>
        <BackButton onPress={() => router.replace('/import')} />
        <Card variant="outlined">
          <Text variant="heading">{t('import.mapping.lost.title')}</Text>
          <Text tone="muted">{t('import.mapping.lost.text')}</Text>
          <Button label={t('import.file.choose')} onPress={() => router.replace('/import')} />
        </Card>
      </Screen>
    );
  }

  const { file, columns, draft } = flow;
  const missing = mappingIssues(draft).filter((issue) => issue.kind === 'missing');
  const mapping = toMapping(draft);

  const analyse = async () => {
    if (!mapping) return;
    setSending(true);
    setProblem(null);
    setColumnsChanged(false);
    try {
      importFlow.analysed(await importsApi.preview(file, flow.unit, mapping));
      router.push('/import/report');
    } catch (error) {
      const found = previewProblem(error);
      if (found.kind === 'columns') {
        importFlow.needColumns(found.columns);
        setColumnsChanged(true);
      } else {
        setProblem(found);
      }
    } finally {
      setSending(false);
    }
  };

  const hint = (role: (typeof COLUMN_ROLES)[number]['role']) =>
    t(`import.mapping.hint.${role}`, { unit: UNIT_LABELS[flow.unit] });

  return (
    <Screen>
      <BackButton onPress={back} />
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('import.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('import.mapping.title')}
        </Text>
      </View>
      <Text tone="muted">{t('import.mapping.intro', { name: file.name })}</Text>

      {columnsChanged ? (
        <InlineAlert
          tone="warning"
          title={t('import.mapping.changed.title')}
          message={t('import.mapping.changed.text')}
        />
      ) : null}

      {COLUMN_ROLES.map(({ role, required }, index) => (
        <Animated.View key={role} entering={enterFromBelow(index, reduced)}>
          <Card variant="outlined" animateIn={false}>
            <ColumnRoleChoice
              role={role}
              required={required}
              hint={hint(role)}
              columns={columns}
              draft={draft}
              onChange={(column) => {
                setProblem(null);
                importFlow.chooseColumns(assignColumn(draft, role, column));
              }}
            />
          </Card>
        </Animated.View>
      ))}

      {problem ? <ProblemAlert problem={problem} onRetry={() => void analyse()} /> : null}

      <View style={{ gap: spacing.md }}>
        <Button
          label={t('import.mapping.analyse')}
          size="lg"
          loading={sending}
          disabled={!mapping}
          icon={<Ionicons name="analytics-outline" size={20} color={colors.onPrimary} />}
          onPress={() => void analyse()}
        />
        {missing.length > 0 ? (
          <Note
            icon="information-circle-outline"
            text={t('import.mapping.missing', {
              roles: missing
                .map((m) => t(`import.mapping.role.${m.role}`).toLowerCase())
                .join(t('import.mapping.and')),
            })}
          />
        ) : null}
        <Note icon="lock-closed-outline" text={t('import.privacy')} />
      </View>
    </Screen>
  );
}

/** « Retour » vers le choix du fichier (le fichier et l'unité choisis sont gardés). */
function BackButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('import.mapping.back')}
      onPress={onPress}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        alignSelf: 'flex-start',
        minHeight: touchTarget - 8,
        borderRadius: radii.sm,
      }}
    >
      <Ionicons name="chevron-back" size={20} color={colors.primaryText} />
      <Text variant="label" tone="primary">
        {t('common.back')}
      </Text>
    </PressableScale>
  );
}
