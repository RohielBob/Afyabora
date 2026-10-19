// Réglages → Mes données et mon compte (L1-14, CDC F1, RGPD : droit d'accès et droit à l'effacement).
//  - EXPORTER : un fichier JSON (profil, mesures, événements, notes) confié au partage du système ; les
//    saisies en attente partent d'abord ;
//  - SUPPRIMER : en deux temps (explication, puis mot de passe + case « je comprends ») ; irréversible, tout
//    est effacé sur le serveur puis sur le téléphone, et l'accueil confirme la suppression.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, Checkbox, InlineAlert, Screen, Text, TextField } from '@/components/ui';
import {
  canConfirmDeletion,
  deleteProblem,
  useAccountExport,
  type DeleteProblem,
  type ExportState,
} from '@/features/account';
import { deleteAccount } from '@/features/auth';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export default function AccountScreen() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const { colors } = useTheme();
  const exporter = useAccountExport();

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('settings.title')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('account.title')}
        </Text>
        <Text tone="muted">{t('account.intro')}</Text>
      </View>

      <Card variant="outlined" index={0}>
        <SectionTitle icon="download-outline" title={t('account.export.title')} />
        <Text tone="muted">{t('account.export.body')}</Text>
        <Text variant="bodySmall" tone="muted">
          {t('account.export.privacy')}
        </Text>
        {exporter.pending > 0 && exporter.state.status === 'idle' ? (
          <Text variant="bodySmall" tone="muted">
            {t('account.export.pendingFirst', { count: exporter.pending })}
          </Text>
        ) : null}
        <ExportResult state={exporter.state} />
        <Button
          label={t(
            exporter.state.status === 'idle' ? 'account.export.button' : 'account.export.again',
          )}
          icon={<Ionicons name="share-outline" size={20} color={colors.onPrimary} />}
          loading={exporter.state.status === 'working'}
          onPress={() => void exporter.start()}
        />
        {exporter.state.status === 'working' ? (
          <Text variant="bodySmall" tone="muted" align="center" accessibilityLiveRegion="polite">
            {t(`account.export.phase.${exporter.state.phase}`)}
          </Text>
        ) : null}
        {exporter.state.status === 'done' ? (
          <Animated.View entering={enterFromBelow(0, reduced)}>
            <Button
              label={t('account.export.shareAgain')}
              variant="outline"
              onPress={() => void exporter.shareAgain()}
            />
          </Animated.View>
        ) : null}
      </Card>

      <DeleteAccountCard index={1} />
    </Screen>
  );
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radii.sm,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={colors.primaryText} />
      </View>
      <Text variant="subheading" style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}

function ExportResult({ state }: { state: ExportState }) {
  const { t } = useTranslation();
  if (state.status === 'done') {
    return (
      <View style={{ gap: spacing.sm }}>
        <InlineAlert
          tone="success"
          message={t('account.export.done', { name: state.saved.filename })}
        />
        {state.unsent > 0 ? (
          <InlineAlert
            tone="warning"
            message={t('account.export.unsent', { count: state.unsent })}
          />
        ) : null}
      </View>
    );
  }
  if (state.status === 'failed') {
    return (
      <InlineAlert
        tone={state.problem === 'cannotShare' ? 'warning' : 'danger'}
        message={t(`account.export.problem.${state.problem}`)}
      />
    );
  }
  return null;
}

function DeleteAccountCard({ index }: { index: number }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [step, setStep] = useState<'explain' | 'confirm'>('explain');
  const [password, setPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<DeleteProblem | null>(null);

  const cancel = () => {
    setStep('explain');
    setPassword('');
    setUnderstood(false);
    setProblem(null);
  };

  const confirm = async () => {
    if (!canConfirmDeletion(password, understood) || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      // Réussite : la session se ferme et la navigation revient d'elle-même à l'accueil (« compte supprimé »).
      await deleteAccount(password);
    } catch (error) {
      setProblem(deleteProblem(error));
      setPassword(''); // un mot de passe refusé n'est pas gardé à l'écran
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined" index={index}>
      <SectionTitle icon="trash-outline" title={t('account.delete.title')} />
      <Text tone="muted">{t('account.delete.body')}</Text>
      <View style={{ gap: spacing.xs }}>
        {(['data', 'shares', 'emergency', 'phone'] as const).map((item) => (
          <View key={item} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Text tone="muted">•</Text>
            <Text variant="bodySmall" tone="muted" style={{ flex: 1 }}>
              {t(`account.delete.what.${item}`)}
            </Text>
          </View>
        ))}
      </View>
      <InlineAlert tone="warning" message={t('account.delete.irreversible')} />

      {step === 'explain' ? (
        <Button
          label={t('account.delete.start')}
          variant="danger"
          onPress={() => setStep('confirm')}
        />
      ) : (
        <Animated.View entering={enterFromBelow(0, reduced)} style={{ gap: spacing.md }}>
          {problem ? (
            <InlineAlert tone="danger" message={t(`account.delete.problem.${problem}`)} />
          ) : null}
          <TextField
            label={t('account.delete.password')}
            hint={t('account.delete.passwordHint')}
            value={password}
            onChangeText={setPassword}
            secret
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
          />
          <Checkbox
            checked={understood}
            onChange={setUnderstood}
            label={t('account.delete.understand')}
            accessibilityLabel={t('account.delete.understand')}
          />
          <Button
            label={t('account.delete.confirm')}
            variant="danger"
            loading={busy}
            disabled={!canConfirmDeletion(password, understood)}
            onPress={() => void confirm()}
          />
          <Button label={t('common.cancel')} variant="ghost" disabled={busy} onPress={cancel} />
        </Animated.View>
      )}
    </Card>
  );
}
