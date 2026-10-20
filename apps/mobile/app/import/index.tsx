// Import d'un historique, étape 1 (L4-05, CDC F5) : choisir le fichier (.csv ou .xlsx) et l'unité de ses
// valeurs, puis « Analyser le fichier ». L'analyse se fait sur le serveur (POST /imports/preview) : RIEN
// n'est importé à cette étape. Ensuite : rapport (L4-07), ou choix des colonnes si le serveur ne les
// trouve pas (L4-06). Contrôles immédiats sur le téléphone (type, fichier vide, plus de 5 Mo) pour ne pas
// envoyer un fichier refusé d'avance ; le serveur refait tout.
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { GLUCOSE_UNITS, UNIT_LABELS, type GlucoseUnit } from '@glyka/shared';
import { Button, ChoiceGroup, InlineAlert, PressableScale, Screen, Text } from '@/components/ui';
import {
  FilePickerCard,
  IMPORT_PICKER_TYPES,
  Note,
  ProblemAlert,
  StepTitle,
  UNIT_EXAMPLES,
  checkFile,
  importFlow,
  importsApi,
  previewProblem,
  useImportFlow,
  type PreviewProblem,
} from '@/features/imports';
import { readUnit } from '@/features/measurements';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { formatLocale } from '@/i18n';

export default function ImportStartScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const flow = useImportFlow();
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<PreviewProblem | null>(null);

  // Nouveau parcours à chaque ouverture : unité de départ = l'unité préférée du patient.
  useEffect(() => {
    importFlow.start(readUnit());
  }, []);

  const check = useMemo(() => (flow.file ? checkFile(flow.file) : null), [flow.file]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));

  const pick = async () => {
    setProblem(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: IMPORT_PICKER_TYPES,
      multiple: false,
      copyToCacheDirectory: true,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return; // choix abandonné : rien ne change
    importFlow.chooseFile({
      name: asset.name,
      size: asset.size ?? null,
      uri: asset.uri,
      mimeType: asset.mimeType,
      file: asset.file,
    });
  };

  const analyse = async () => {
    if (!flow.file || !check?.ok) return;
    setSending(true);
    setProblem(null);
    try {
      importFlow.analysed(await importsApi.preview(flow.file, flow.unit));
      router.push('/import/report');
    } catch (error) {
      const found = previewProblem(error);
      // Colonnes introuvables : le patient les choisit lui-même (L4-06), puis l'analyse reprend.
      if (found.kind === 'columns') {
        importFlow.needColumns(found.columns);
        router.push('/import/mapping');
      } else {
        setProblem(found);
      }
    } finally {
      setSending(false);
    }
  };

  const unitOptions = GLUCOSE_UNITS.map((unit: GlucoseUnit) => ({
    value: unit,
    label: UNIT_LABELS[unit],
    hint: t('import.unit.example', {
      value: UNIT_EXAMPLES[unit].toLocaleString(formatLocale(i18n.language), {
        minimumFractionDigits: unit === 'G_L' ? 2 : 0,
      }),
    }),
  }));

  return (
    <Screen>
      {/* En-tête : titre + fermer (sans rien importer). */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('import.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('import.title')}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('import.close')}
          onPress={close}
          style={{
            width: 44,
            height: 44,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </PressableScale>
      </View>
      <Text tone="muted">{t('import.intro')}</Text>

      <Animated.View entering={enterFromBelow(0, reduced)} style={{ gap: spacing.md }}>
        <StepTitle number={1} title={t('import.step.file')} />
        <FilePickerCard
          file={flow.file}
          kind={check?.ok ? check.kind : null}
          busy={sending}
          onPick={() => void pick()}
        />
        {check && !check.ok ? (
          <InlineAlert tone="danger" message={t(`import.fileProblem.${check.problem}`)} />
        ) : null}
      </Animated.View>

      <Animated.View entering={enterFromBelow(1, reduced)} style={{ gap: spacing.md }}>
        <StepTitle number={2} title={t('import.step.unit')} />
        <ChoiceGroup
          label={t('import.unit.hint')}
          options={unitOptions}
          value={flow.unit}
          onChange={(unit) => {
            setProblem(null); // autre unité : l'ancien échec ne vaut plus
            importFlow.chooseUnit(unit);
          }}
          columns={3}
        />
      </Animated.View>

      {problem ? <ProblemAlert problem={problem} onRetry={() => void analyse()} /> : null}

      <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.md }}>
        <Button
          label={t('import.analyse')}
          size="lg"
          loading={sending}
          disabled={!check?.ok}
          icon={<Ionicons name="analytics-outline" size={20} color={colors.onPrimary} />}
          onPress={() => void analyse()}
        />
        <Note icon="lock-closed-outline" text={t('import.privacy')} />
        <Note icon="wifi-outline" text={t('import.network')} />
      </Animated.View>
    </Screen>
  );
}
