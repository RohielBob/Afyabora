// Accueil de l'assistant « Afyabora » (L9-10, CDC F6), ouvert depuis l'onglet Analyse :
//  - « Nouvelle conversation » et accès aux fiches de connaissances (relues par un médecin) ;
//  - MES CONVERSATIONS, la plus récemment utilisée d'abord (20 par page, « Voir plus ») ; appui ⇒ la
//    conversation ; corbeille ⇒ confirmation dans la carte, puis effacement réel (messages compris) ;
//  - « Effacer toutes mes conversations » avec confirmation ;
//  - les conversations sont gardées sur le serveur, chiffrées, jusqu'à ce que le patient les efface ; rien
//    sur le téléphone. Hors-ligne : message clair et « Réessayer ».
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { LogoMark } from '@/components/brand';
import { Button, InlineAlert, ListRow, Screen, Skeleton, Text } from '@/components/ui';
import {
  BackLink,
  ConfirmBox,
  ConversationRow,
  useConversationList,
  type RemoveResult,
} from '@/features/assistant';
import { MedicalDisclaimer } from '@/features/legal';
import { spacing, useTheme } from '@/theme';

export default function AssistantHomeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const list = useConversationList();
  const [confirming, setConfirming] = useState<string | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Exclude<RemoveResult, 'done'> | null>(null);

  const run = async (task: () => Promise<RemoveResult>) => {
    setBusy(true);
    setFailure(null);
    const result = await task();
    setBusy(false);
    if (result === 'done') setConfirming(null);
    else setFailure(result);
  };

  return (
    <Screen>
      <BackLink fallback="/(tabs)/insights" />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <LogoMark size={44} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="title" accessibilityRole="header">
            {t('assistant.title')}
          </Text>
          <Text variant="bodySmall" tone="muted">
            {t('assistant.home.subtitle')}
          </Text>
        </View>
      </View>

      <Button
        label={t('assistant.home.new')}
        icon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
        onPress={() => router.push('/assistant/chat')}
      />
      <ListRow
        title={t('assistant.home.sheets')}
        subtitle={t('assistant.home.sheetsHint')}
        icon={<Ionicons name="library-outline" size={22} color={colors.primaryText} />}
        onPress={() => router.push('/assistant/sheets')}
        showChevron
      />

      <View style={{ gap: spacing.md }}>
        <Text variant="overline" tone="muted" accessibilityRole="header">
          {t('assistant.list.title')}
        </Text>

        {list.status === 'loading' ? (
          <View style={{ gap: spacing.md }} accessibilityLabel={t('assistant.list.loading')}>
            <Skeleton height={76} />
            <Skeleton height={76} />
          </View>
        ) : null}
        {list.status === 'offline' ? (
          <InlineAlert
            tone="warning"
            title={t('assistant.load.offlineTitle')}
            message={t('assistant.list.offline')}
            actionLabel={t('common.retry')}
            onAction={() => void list.reload()}
          />
        ) : null}
        {list.status === 'error' || list.status === 'notFound' ? (
          <InlineAlert
            tone="danger"
            message={t('assistant.list.error')}
            actionLabel={t('common.retry')}
            onAction={() => void list.reload()}
          />
        ) : null}

        {list.status === 'ready' && list.items.length === 0 ? (
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
            <Ionicons name="chatbubbles-outline" size={32} color={colors.textSubtle} />
            <Text variant="bodySmall" tone="muted" align="center">
              {t('assistant.list.empty')}
            </Text>
          </View>
        ) : null}

        {failure ? (
          <InlineAlert
            tone="danger"
            message={t(
              failure === 'offline' ? 'assistant.list.removeOffline' : 'assistant.list.removeError',
            )}
          />
        ) : null}

        {list.items.map((conversation, i) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            index={i}
            confirming={confirming === conversation.id}
            busy={busy}
            onAskRemove={() => {
              setFailure(null);
              setConfirming(conversation.id);
            }}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void run(() => list.remove(conversation.id))}
          />
        ))}

        {list.nextCursor ? (
          <Button
            label={t('assistant.list.more')}
            variant="secondary"
            loading={list.loadingMore}
            onPress={() => void list.loadMore()}
          />
        ) : null}
      </View>

      {list.items.length > 0 ? (
        confirming === 'all' ? (
          <ConfirmBox
            title={t('assistant.list.removeAllTitle')}
            message={t('assistant.list.removeAllText')}
            confirmLabel={t('assistant.list.removeAllConfirm')}
            busy={busy}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void run(list.removeAll)}
          />
        ) : (
          <Button
            label={t('assistant.list.removeAll')}
            variant="ghost"
            icon={<Ionicons name="trash-outline" size={18} color={colors.primaryText} />}
            onPress={() => {
              setFailure(null);
              setConfirming('all');
            }}
          />
        )
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Ionicons
          name="lock-closed-outline"
          size={16}
          color={colors.textMuted}
          style={{ marginTop: 2 }}
        />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          {t('assistant.list.privacy')}
        </Text>
      </View>

      <View style={{ marginTop: 'auto' }}>
        <MedicalDisclaimer variant="compact" />
      </View>
    </Screen>
  );
}
