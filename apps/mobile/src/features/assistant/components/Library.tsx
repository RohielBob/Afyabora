// Éléments des écrans « Afyabora » (accueil, liste des conversations) et du lecteur de fiches (L9-10).
import { Ionicons } from '@expo/vector-icons';
import type { AssistantConversationDto, KnowledgeSheetSummary } from '@glyka/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, InlineAlert, PressableScale, Text } from '@/components/ui';
import { enterFromBelow, radii, spacing, touchTarget, useReducedMotion, useTheme } from '@/theme';
import { reviewOf, whenLabel, type SheetBlock, type Span } from '../library';

/** « ‹ Retour » en haut d'un écran (ou vers `fallback` si l'écran a été ouvert directement). */
export function BackLink({ fallback }: { fallback: '/assistant' | '/(tabs)/insights' }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        alignSelf: 'flex-start',
        minHeight: touchTarget - 8,
      }}
    >
      <Ionicons name="chevron-back" size={20} color={colors.primaryText} />
      <Text variant="label" tone="primary">
        {t('common.back')}
      </Text>
    </PressableScale>
  );
}

/** Date d'une conversation : « Aujourd'hui, 14:32 », « Hier », « 3 oct. ». */
export function useWhen() {
  const { t, i18n } = useTranslation();
  return (iso: string) => {
    const when = whenLabel(iso, new Date());
    const time = when.date.toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (when.kind === 'today') return t('assistant.list.today', { time });
    if (when.kind === 'yesterday') return t('assistant.list.yesterday', { time });
    return when.date.toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };
}

/**
 * Une conversation de la liste : début de la première question, date, nombre de messages ; appui ⇒ la
 * conversation ; corbeille ⇒ confirmation DANS la carte (pas de fenêtre), puis effacement réel.
 */
export function ConversationRow({
  conversation,
  index,
  confirming,
  busy,
  onAskRemove,
  onCancel,
  onConfirm,
}: {
  conversation: AssistantConversationDto;
  index: number;
  confirming: boolean;
  busy: boolean;
  onAskRemove: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const when = useWhen();
  const preview = conversation.preview || t('assistant.list.noPreview');
  const meta = `${when(conversation.updatedAt)} · ${t('assistant.list.messages', { count: conversation.messageCount })}`;
  return (
    <Card variant="outlined" index={index} style={{ padding: 0, gap: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <PressableScale
          scaleTo="card"
          accessibilityRole="button"
          accessibilityLabel={`${preview}. ${meta}`}
          accessibilityHint={t('assistant.list.openHint')}
          onPress={() =>
            router.push({ pathname: '/assistant/chat', params: { id: conversation.id } })
          }
          style={{ flex: 1, padding: spacing.lg, gap: spacing.xs }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="chatbubbles-outline" size={18} color={colors.primaryText} />
            <Text variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }}>
              {preview}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {meta}
          </Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('assistant.list.remove')}
          onPress={onAskRemove}
          style={{
            width: touchTarget,
            height: touchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.sm,
          }}
        >
          <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
        </PressableScale>
      </View>
      {confirming ? (
        <ConfirmBox
          title={t('assistant.list.removeTitle')}
          message={t('assistant.list.removeText')}
          confirmLabel={t('assistant.list.removeConfirm')}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
          style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
        />
      ) : null}
    </Card>
  );
}

/** Confirmation dans la page avant un effacement réel (comme la suppression d'une mesure). */
export function ConfirmBox({
  title,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
  style,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  style?: object;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={enterFromBelow(0, reduced)} style={[{ gap: spacing.sm }, style]}>
      <InlineAlert tone="warning" title={title} message={message} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label={t('common.cancel')} variant="outline" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={confirmLabel}
            variant="danger"
            loading={busy}
            // Sans icône : en demi-largeur, « Tout effacer » passait sur deux lignes (vérifié en L9-10).
            onPress={onConfirm}
          />
        </View>
      </View>
    </Animated.View>
  );
}

/** Relecture d'une fiche : « Relue par un médecin le … » (coche) ou « Fiche non encore relue » (alerte). */
export function ReviewBadge({
  sheet,
}: {
  sheet: Pick<KnowledgeSheetSummary, 'status' | 'reviewedOn'>;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const review = reviewOf(sheet);
  const validated = review.kind === 'validated';
  const label = validated
    ? review.reviewedOn
      ? t('assistant.sheets.reviewedOn', {
          date: review.reviewedOn.toLocaleDateString(i18n.language, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
        })
      : t('assistant.source.validated')
    : t('assistant.source.draft');
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: spacing.xs,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Ionicons
        name={validated ? 'checkmark-circle' : 'alert-circle-outline'}
        size={14}
        color={validated ? colors.success : colors.textMuted}
      />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/** Une fiche de la liste : titre, résumé, relecture ; appui ⇒ la fiche complète. */
export function SheetRow({ sheet, index }: { sheet: KnowledgeSheetSummary; index: number }) {
  const { colors } = useTheme();
  return (
    <Card
      variant="outlined"
      index={index}
      onPress={() => router.push({ pathname: '/assistant/sheets/[id]', params: { id: sheet.id } })}
      accessibilityLabel={`${sheet.title}. ${sheet.summary}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="document-text-outline" size={20} color={colors.primaryText} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {sheet.title}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      <Text variant="bodySmall" tone="muted">
        {sheet.summary}
      </Text>
      <ReviewBadge sheet={sheet} />
    </Card>
  );
}

function Spans({ spans }: { spans: readonly Span[] }) {
  return (
    <>
      {spans.map((span, i) =>
        span.bold ? (
          <Text key={i} variant="bodyStrong">
            {span.text}
          </Text>
        ) : (
          span.text
        ),
      )}
    </>
  );
}

/** Texte d'une fiche : titres, paragraphes, listes à puces, gras. */
export function SheetBody({ blocks }: { blocks: readonly SheetBlock[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <Text
              key={i}
              variant="heading"
              accessibilityRole="header"
              style={{ marginTop: i === 0 ? 0 : spacing.sm }}
            >
              {block.text}
            </Text>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <Text key={i} variant="body" selectable>
              <Spans spans={block.spans} />
            </Text>
          );
        }
        return (
          <View key={i} style={{ gap: spacing.sm }}>
            {block.items.map((item, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.primaryText,
                    marginTop: 9,
                  }}
                />
                <Text variant="body" selectable style={{ flex: 1 }}>
                  <Spans spans={item} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
