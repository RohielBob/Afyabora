// Conversation avec l'assistant « Afyabora » (L9-09, CDC F6, ADR-0005 complétée) :
//  - sans paramètre : NOUVELLE conversation (identifiant créé sur le téléphone, créée sur le serveur au
//    premier envoi) ; avec `?id=` : conversation existante relue sur le serveur (liste : L9-10) ;
//  - Afyabora se présente et propose 4 questions ; réponses avec leur nature, les fiches citées (relue par
//    un médecin ou non), la mention de l'IA locale, et les touches d'appel en cas d'urgence ;
//  - touche « Urgence » toujours visible dans l'en-tête, même sans réseau ;
//  - hors-ligne : la question reste affichée « non envoyée » avec « Réessayer » (sans doublon) ;
//  - réponse « en préparation » (jusqu'à 2 minutes) relue automatiquement ; annonce aux lecteurs d'écran ;
//  - avertissement « outil d'aide, pas un avis médical ». Rien n'est gardé sur le téléphone.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ScrollView, View } from 'react-native';
import { Button, InlineAlert, LoadingDots, Screen } from '@/components/ui';
import {
  AnswerBubble,
  ChatHeader,
  Composer,
  EmergencyPanel,
  OutgoingBubble,
  PendingBubble,
  QuestionBubble,
  Welcome,
  isLate,
  isSending,
  pendingAnswers,
  useConversation,
  useEmergencyCalls,
} from '@/features/assistant';
import { MedicalDisclaimer } from '@/features/legal';
import { newId } from '@/lib/uuid';
import { spacing, useReducedMotion, useTheme } from '@/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AssistantChatScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ id?: string }>();
  const existing = typeof params.id === 'string' && UUID.test(params.id);
  const [conversationId] = useState(() => (existing ? (params.id as string) : newId()));
  const { state, ask, retry, discard, reload } = useConversation(conversationId, existing);
  const calls = useEmergencyCalls();
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sending = isSending(state);

  // Lecteurs d'écran : annonce qu'une réponse en préparation est prête.
  const wasPending = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending = new Set(pendingAnswers(state).map((m) => m.id));
    for (const id of wasPending.current) {
      if (!pending.has(id))
        AccessibilityInfo.announceForAccessibility(t('assistant.a11y.answerReady'));
    }
    wasPending.current = pending;
  }, [state, t]);

  const empty = state.load === 'ready' && state.messages.length === 0 && state.outbox.length === 0;

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ flex: 1 }}>
        <ChatHeader
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/assistant'))}
          emergencyOpen={emergencyOpen}
          onToggleEmergency={() => setEmergencyOpen((open) => !open)}
        />
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          // Nouvelle bulle ⇒ on descend pour la montrer. Pas pour l'accueil (son titre resterait caché),
          // ni quand le panneau d'urgence est ouvert (il reste en haut, visible).
          onContentSizeChange={() => {
            if (!empty && !emergencyOpen) scrollRef.current?.scrollToEnd({ animated: !reduced });
          }}
        >
          {emergencyOpen ? <EmergencyPanel calls={calls} /> : null}

          {state.load === 'loading' ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <LoadingDots color={colors.primaryText} label={t('assistant.load.loading')} />
            </View>
          ) : null}
          {state.load === 'offline' ? (
            <InlineAlert
              tone="warning"
              title={t('assistant.load.offlineTitle')}
              message={t('assistant.load.offline')}
              actionLabel={t('common.retry')}
              onAction={() => void reload()}
            />
          ) : null}
          {state.load === 'error' ? (
            <InlineAlert
              tone="danger"
              message={t('assistant.load.error')}
              actionLabel={t('common.retry')}
              onAction={() => void reload()}
            />
          ) : null}
          {state.load === 'notFound' ? (
            <View style={{ gap: spacing.md }}>
              <InlineAlert tone="info" message={t('assistant.load.notFound')} />
              <Button
                label={t('assistant.load.newConversation')}
                variant="secondary"
                onPress={() => router.replace('/assistant/chat')}
              />
            </View>
          ) : null}

          {empty ? <Welcome onAsk={ask} disabled={sending} /> : null}

          {state.messages.map((message) =>
            message.role === 'USER' ? (
              <QuestionBubble key={message.id} message={message} />
            ) : message.status === 'PENDING' ? (
              <PendingBubble key={message.id} late={isLate(message, Date.now())} />
            ) : (
              <AnswerBubble key={message.id} message={message} calls={calls} />
            ),
          )}
          {state.outbox.map((question) => (
            <OutgoingBubble
              key={question.id}
              question={question}
              canRetry={!sending}
              onRetry={() => retry(question.id)}
              onDiscard={() => discard(question.id)}
            />
          ))}

          <View style={{ marginTop: 'auto', paddingTop: spacing.md }}>
            <MedicalDisclaimer variant="compact" />
          </View>
        </ScrollView>
        <Composer busy={sending || state.load !== 'ready'} onSend={ask} />
      </View>
    </Screen>
  );
}
