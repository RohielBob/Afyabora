// Bulles de la conversation (L9-09).
//  - QUESTION du patient : à droite, couleur principale ; si elle n'est pas encore partie : « Envoi… », ou
//    l'échec (icône + phrase) avec « Réessayer » et « Retirer » ;
//  - RÉPONSE d'Afyabora : à gauche, avec le logo, sa NATURE (icône + libellé : « D'après vos mesures »,
//    « D'après une fiche », « Urgence »…), le texte, les FICHES citées (relue par un médecin ou non), la
//    mention « Formulé par l'IA locale » si le modèle l'a mise en mots (L9-07), et pour une URGENCE les
//    touches d'appel ;
//  - réponse EN PRÉPARATION : trois points animés, « jusqu'à 2 minutes », puis « La réponse tarde ».
import { Ionicons } from '@expo/vector-icons';
import type { AssistantMessageDto } from '@glyka/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { LogoMark } from '@/components/brand';
import { Button, LoadingDots, Text } from '@/components/ui';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import type { OutgoingQuestion } from '../conversation';
import { KIND_PRESENTATION, SOURCE_STATUS, type EmergencyCall } from '../presentation';
import { EmergencyCalls } from './EmergencyCalls';

/** Largeur maximale d'une bulle : la conversation reste lisible sur un grand écran. */
const BUBBLE_MAX = '86%';

function Appear({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return <Animated.View entering={enterFromBelow(0, reduced)}>{children}</Animated.View>;
}

/** Texte d'une réponse : un paragraphe par bloc (lignes vides), les puces « • » gardées telles quelles. */
function Paragraphs({ text, tone }: { text: string; tone?: 'onPrimary' }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((block, i) => (
          <Text key={i} variant="body" tone={tone} selectable>
            {block}
          </Text>
        ))}
    </View>
  );
}

// ---------------------------------------------------------------- Questions
function QuestionShell({ text, children }: { text: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Appear>
      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
        <View
          accessible
          accessibilityLabel={t('assistant.a11y.question', { text })}
          style={{
            maxWidth: BUBBLE_MAX,
            backgroundColor: colors.primary,
            borderRadius: radii.lg,
            borderBottomRightRadius: radii.xs,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          <Paragraphs text={text} tone="onPrimary" />
        </View>
        {children}
      </View>
    </Appear>
  );
}

export function QuestionBubble({ message }: { message: AssistantMessageDto }) {
  return <QuestionShell text={message.text ?? ''} />;
}

/** Question pas encore reçue par le serveur : en cours d'envoi, ou échouée (avec la raison). */
export function OutgoingBubble({
  question,
  canRetry,
  onRetry,
  onDiscard,
}: {
  question: OutgoingQuestion;
  canRetry: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (question.status === 'sending') {
    return (
      <QuestionShell text={question.text}>
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {t('assistant.outgoing.sending')}
        </Text>
      </QuestionShell>
    );
  }
  const failure = question.failure ?? { kind: 'unknown' as const };
  const reason =
    failure.kind === 'quota'
      ? t('assistant.outgoing.quota', {
          minutes: Math.max(1, Math.ceil(failure.retryAfterSeconds / 60)),
        })
      : t(`assistant.outgoing.${failure.kind}`);
  return (
    <QuestionShell text={question.text}>
      <View
        accessibilityRole="alert"
        style={{ maxWidth: BUBBLE_MAX, alignItems: 'flex-end', gap: spacing.xs }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons
            name={failure.kind === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'}
            size={14}
            color={colors.danger}
          />
          <Text variant="caption" tone="danger" style={{ flexShrink: 1 }}>
            {reason}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label={t('assistant.outgoing.discard')}
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={onDiscard}
          />
          <Button
            label={t('common.retry')}
            variant="secondary"
            size="sm"
            fullWidth={false}
            disabled={!canRetry}
            onPress={onRetry}
          />
        </View>
      </View>
    </QuestionShell>
  );
}

// ---------------------------------------------------------------- Réponses
function AnswerShell({
  children,
  emergency = false,
  label,
}: {
  children: ReactNode;
  emergency?: boolean;
  label?: string;
}) {
  const { colors, mode } = useTheme();
  return (
    <Appear>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <LogoMark size={26} />
        <View
          accessible={!!label}
          accessibilityLabel={label}
          style={{
            maxWidth: BUBBLE_MAX,
            flexShrink: 1,
            backgroundColor: emergency
              ? colors.dangerSoft
              : mode === 'dark'
                ? colors.surfaceRaised
                : colors.surface,
            borderColor: emergency ? colors.danger : colors.border,
            borderWidth: 1,
            borderRadius: radii.lg,
            borderBottomLeftRadius: radii.xs,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          {children}
        </View>
      </View>
    </Appear>
  );
}

export function AnswerBubble({
  message,
  calls,
}: {
  message: AssistantMessageDto;
  calls: readonly EmergencyCall[];
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kind = message.kind ?? 'OUT_OF_SCOPE';
  const look = KIND_PRESENTATION[kind];
  const emergency = kind === 'EMERGENCY';
  const kindColor = look.tone === 'danger' ? colors.danger : colors.textMuted;
  return (
    <AnswerShell emergency={emergency}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
        accessibilityRole="header"
      >
        <Ionicons name={look.icon} size={16} color={kindColor} />
        <Text variant="label" tone={look.tone === 'danger' ? 'danger' : 'muted'}>
          {t(look.labelKey)}
        </Text>
      </View>

      <Paragraphs text={message.text ?? ''} />

      {emergency ? <EmergencyCalls calls={calls} /> : null}

      {message.sources.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text variant="overline" tone="muted">
            {t('assistant.source.title', { count: message.sources.length })}
          </Text>
          {message.sources.map((source) => {
            const status = SOURCE_STATUS[source.status];
            return (
              <View
                key={source.id}
                accessible
                accessibilityLabel={`${source.title}. ${t(status.labelKey)}`}
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceMuted,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  gap: spacing.xxs,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Ionicons name="document-text-outline" size={14} color={colors.primaryText} />
                  <Text variant="label" style={{ flexShrink: 1 }}>
                    {source.title}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Ionicons
                    name={status.icon}
                    size={12}
                    color={source.status === 'VALIDATED' ? colors.success : colors.textMuted}
                  />
                  <Text variant="caption" tone="muted">
                    {t(status.labelKey)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {message.rephrased ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons name="sparkles-outline" size={12} color={colors.textMuted} />
          <Text variant="caption" tone="muted">
            {t('assistant.rephrased')}
          </Text>
        </View>
      ) : null}
    </AnswerShell>
  );
}

/** Réponse en préparation : le modèle local met en mots la réponse (jusqu'à 2 minutes, L9-07). */
export function PendingBubble({ late }: { late: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <AnswerShell label={late ? t('assistant.pending.late') : t('assistant.pending.title')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <LoadingDots color={colors.primaryText} label={t('assistant.pending.title')} />
        <Text variant="bodyStrong" accessibilityLiveRegion="polite">
          {t('assistant.pending.title')}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {late ? t('assistant.pending.late') : t('assistant.pending.hint')}
      </Text>
    </AnswerShell>
  );
}
