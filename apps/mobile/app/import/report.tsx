// Import d'un historique, rapport et décisions (L4-07, CDC F5 étapes 4 et 5). Le rapport de l'analyse :
// lignes analysées, valides, doublons, incohérentes, erreurs, avec le détail de chaque ligne non valide.
// Décision ligne par ligne ou en lot (Corriger · Ignorer · Accepter), puis « Importer » : c'est le SEUL
// bouton qui écrit des mesures. Ensuite, l'import peut être annulé (toutes ses mesures retirées).
// Les mesures importées sont sur le compte (serveur) ; elles arrivent dans l'Historique du téléphone avec
// la synchronisation (L8-05, L8-06).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { ImportCommitResponse, ImportRowReport } from '@glyka/shared';
import { Button, Card, InlineAlert, Screen, Text } from '@/components/ui';
import {
  BackButton,
  Note,
  REPORT_GROUPS,
  ROWS_PAGE,
  ReportRowCard,
  ReportSummary,
  buildDecisions,
  chooseForAll,
  commitProblem,
  importCount,
  importsApi,
  groupRows,
  pageOf,
  useImportFlow,
  type Choices,
  type CommitProblem,
  type CorrectionProblem,
  type ReportGroup,
} from '@/features/imports';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

type Phase = 'review' | 'importing' | 'done' | 'reverting' | 'reverted';

const GROUP_ICON: Record<ReportGroup, keyof typeof Ionicons.glyphMap> = {
  INCONSISTENT: 'alert-circle-outline',
  DUPLICATE: 'copy-outline',
  ERROR: 'close-circle-outline',
};
const GROUP_TONE = { INCONSISTENT: 'warning', DUPLICATE: 'info', ERROR: 'danger' } as const;

export default function ImportReportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const flow = useImportFlow();
  const [choices, setChoices] = useState<Choices>({});
  const [shown, setShown] = useState<Record<ReportGroup, number>>({
    INCONSISTENT: ROWS_PAGE,
    DUPLICATE: ROWS_PAGE,
    ERROR: ROWS_PAGE,
  });
  const [phase, setPhase] = useState<Phase>('review');
  const [problems, setProblems] = useState<Record<number, CorrectionProblem>>({});
  const [issue, setIssue] = useState<CommitProblem | null>(null);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [reverted, setReverted] = useState(0);
  const [confirmRevert, setConfirmRevert] = useState(false);

  const report = flow.report;
  const groups = useMemo(() => (report ? groupRows(report) : null), [report]);

  const finish = () => router.dismissTo('/(tabs)/timeline');

  // Pas de rapport en mémoire (appli relancée, lien direct) : retour au choix du fichier.
  if (!report || !groups) {
    return (
      <Screen>
        <Card variant="outlined">
          <Text variant="heading">{t('import.mapping.lost.title')}</Text>
          <Text tone="muted">{t('import.mapping.lost.text')}</Text>
          <Button label={t('import.file.choose')} onPress={() => router.replace('/import')} />
        </Card>
      </Screen>
    );
  }

  const count = importCount(report, choices);
  const busy = phase === 'importing' || phase === 'reverting';

  const update = (line: number, choice: Choices[number]) => {
    setChoices((current) => ({ ...current, [line]: choice }));
    setProblems(({ [line]: _done, ...rest }) => rest);
    setIssue(null);
  };

  const importNow = async () => {
    const { decisions, problems: found } = buildDecisions(report, choices, flow.unit);
    setProblems(found);
    if (Object.keys(found).length > 0) return; // corrections à compléter : rien n'est envoyé
    setPhase('importing');
    setIssue(null);
    try {
      setResult(await importsApi.commit(report.batchId, decisions));
      setPhase('done');
    } catch (error) {
      setIssue(commitProblem(error, decisions));
      setPhase('review');
    }
  };

  const revertNow = async () => {
    setPhase('reverting');
    setIssue(null);
    try {
      setReverted((await importsApi.revert(report.batchId)).reverted);
      setPhase('reverted');
    } catch (error) {
      setIssue(commitProblem(error, []));
      setPhase('done');
    } finally {
      setConfirmRevert(false);
    }
  };

  // ---------------------------------------------------------------- import terminé, puis annulé
  if (phase === 'reverted') {
    return (
      <Screen>
        <Outcome
          icon="arrow-undo-outline"
          title={t('import.done.revertedTitle')}
          text={t('import.done.revertedText', { count: reverted })}
        />
        <Button label={t('import.done.finish')} onPress={finish} />
      </Screen>
    );
  }

  if ((phase === 'done' || phase === 'reverting') && result) {
    return (
      <Screen>
        <Outcome
          icon="checkmark-circle"
          title={t('import.done.title', { count: result.imported })}
          text={t('import.done.skipped', { count: result.skipped })}
        />
        <InlineAlert tone="info" message={t('import.done.sync')} />
        {issue ? <IssueAlert issue={issue} /> : null}
        <Button label={t('import.done.finish')} onPress={finish} disabled={busy} />
        {confirmRevert ? (
          <Animated.View entering={enterFromBelow(0, reduced)} style={{ gap: spacing.sm }}>
            <InlineAlert
              tone="warning"
              title={t('import.done.revertConfirmTitle')}
              message={t('import.done.revertConfirmText', { count: result.imported })}
            />
            {/* Libellés sans ambiguïté (« Annuler » / « Annuler cet import » prêtaient à confusion),
                l'un sous l'autre pour tenir sur une ligne chacun. */}
            <Button
              label={t('import.done.revertYes', { count: result.imported })}
              variant="danger"
              loading={phase === 'reverting'}
              onPress={() => void revertNow()}
            />
            <Button
              label={t('import.done.keep')}
              variant="outline"
              disabled={busy}
              onPress={() => setConfirmRevert(false)}
            />
          </Animated.View>
        ) : (
          <Button
            label={t('import.done.revert')}
            variant="ghost"
            icon={<Ionicons name="arrow-undo-outline" size={20} color={colors.primaryText} />}
            onPress={() => setConfirmRevert(true)}
          />
        )}
      </Screen>
    );
  }

  // ---------------------------------------------------------------- rapport et décisions
  const serverErrors = issue?.kind === 'rows' ? issue.byLine : {};
  const nothingToCheck = REPORT_GROUPS.every((group) => groups[group].length === 0);

  return (
    <Screen>
      <BackButton
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/import'))}
      />
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('import.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('import.report.title')}
        </Text>
        {flow.file ? (
          <Text variant="bodySmall" tone="muted" numberOfLines={1} ellipsizeMode="middle">
            {flow.file.name}
          </Text>
        ) : null}
      </View>

      <Animated.View entering={enterFromBelow(0, reduced)}>
        <Card variant="outlined" animateIn={false}>
          <ReportSummary report={report} />
        </Card>
      </Animated.View>

      {nothingToCheck ? <InlineAlert tone="success" message={t('import.report.allValid')} /> : null}

      {REPORT_GROUPS.map((group, index) => {
        const rows = groups[group];
        if (rows.length === 0) return null;
        return (
          <Animated.View
            key={group}
            entering={enterFromBelow(index + 1, reduced)}
            style={{ gap: spacing.md }}
          >
            <GroupHeader group={group} count={rows.length} />
            {group !== 'ERROR' ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t('import.report.acceptAll')}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onPress={() => setChoices((c) => chooseForAll(c, rows, 'ACCEPT'))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t('import.report.ignoreAll')}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onPress={() => setChoices((c) => chooseForAll(c, rows, 'IGNORE'))}
                  />
                </View>
              </View>
            ) : null}
            {pageOf(rows, shown[group]).visible.map((row: ImportRowReport) => (
              <ReportRowCard
                key={row.line}
                row={row}
                choice={choices[row.line]}
                defaultUnit={flow.unit}
                problem={problems[row.line]}
                serverError={serverErrors[row.line]}
                disabled={busy}
                onChange={(choice) => update(row.line, choice)}
              />
            ))}
            {pageOf(rows, shown[group]).next > 0 ? (
              <Button
                label={t('import.report.more', { count: pageOf(rows, shown[group]).next })}
                variant="ghost"
                onPress={() => setShown((s) => ({ ...s, [group]: s[group] + ROWS_PAGE }))}
              />
            ) : null}
          </Animated.View>
        );
      })}

      <View style={{ gap: spacing.md }}>
        {Object.keys(problems).length > 0 ? (
          <InlineAlert tone="danger" message={t('import.report.fixCorrections')} />
        ) : null}
        {issue && issue.kind !== 'rows' ? <IssueAlert issue={issue} onRetry={importNow} /> : null}
        {issue?.kind === 'rows' ? (
          <InlineAlert tone="danger" message={t('import.report.rowsRefused')} />
        ) : null}
        <Button
          label={
            count > 0 ? t('import.report.import', { count }) : t('import.report.nothingToImport')
          }
          size="lg"
          loading={phase === 'importing'}
          disabled={count === 0 || issue?.kind === 'done' || issue?.kind === 'expired'}
          icon={<Ionicons name="download-outline" size={20} color={colors.onPrimary} />}
          onPress={() => void importNow()}
        />
        <Note icon="information-circle-outline" text={t('import.report.defaults')} />
        <Note icon="arrow-undo-outline" text={t('import.report.undoable')} />
      </View>
    </Screen>
  );
}

/** Titre d'un groupe : icône + libellé + nombre, et une phrase qui dit quoi faire. */
function GroupHeader({ group, count }: { group: ReportGroup; count: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        accessible
        accessibilityRole="header"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <Ionicons name={GROUP_ICON[group]} size={20} color={colors[GROUP_TONE[group]]} />
        <Text variant="subheading">{t(`import.report.group.${group}.title`, { count })}</Text>
      </View>
      <Text variant="bodySmall" tone="muted">
        {t(`import.report.group.${group}.text`)}
      </Text>
    </View>
  );
}

/** Échec de l'import ou de l'annulation (hors refus d'une ligne précise). */
function IssueAlert({ issue, onRetry }: { issue: CommitProblem; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (issue.kind === 'rows') return null;
  if (issue.kind === 'done' || issue.kind === 'expired' || issue.kind === 'notFound') {
    return (
      <InlineAlert
        tone="warning"
        title={t(`import.issue.${issue.kind}.title`)}
        message={t(`import.issue.${issue.kind}.text`)}
        actionLabel={t('import.issue.restart')}
        onAction={() => router.replace('/import')}
      />
    );
  }
  return (
    <InlineAlert
      tone={issue.kind === 'offline' ? 'warning' : 'danger'}
      title={t(`import.issue.${issue.kind}.title`)}
      message={t(`import.issue.${issue.kind}.text`)}
      {...(onRetry ? { actionLabel: t('common.retry'), onAction: () => void onRetry() } : {})}
    />
  );
}

/** Écran de fin : grande icône, titre, phrase. */
function Outcome({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={enterFromBelow(0, reduced)}
      style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primarySoft,
        }}
      >
        <Ionicons name={icon} size={36} color={colors.primaryText} />
      </View>
      <Text variant="title" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Text tone="muted" align="center">
        {text}
      </Text>
    </Animated.View>
  );
}
