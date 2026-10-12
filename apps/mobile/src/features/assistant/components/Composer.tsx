// Zone de saisie de la conversation (L9-09) : champ sur plusieurs lignes (5 au plus avant défilement),
// bouton d'envoi rond (icône + nom pour les lecteurs d'écran), compteur à l'approche de 500 caractères (même
// limite que le serveur). Envoi désactivé tant que la question est vide ou qu'une autre question part.
import { Ionicons } from '@expo/vector-icons';
import { ASSISTANT_QUESTION_MAX_LENGTH } from '@glyka/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, TextInput, View } from 'react-native';
import { PressableScale, Text, textStyle } from '@/components/ui';
import { radii, spacing, touchTarget, useTheme } from '@/theme';
import { questionProblem, showCounter } from '../conversation';

export function Composer({
  busy,
  onSend,
}: {
  /** Une question est en cours d'envoi : on attend avant d'en envoyer une autre. */
  busy: boolean;
  /** Renvoie vrai si la question est partie (le champ est alors vidé). */
  onSend: (text: string) => boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const problem = questionProblem(text);
  const canSend = !busy && problem === null;
  const length = text.trim().length;

  const send = () => {
    if (canSend && onSend(text)) setText('');
  };

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
        gap: spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={ASSISTANT_QUESTION_MAX_LENGTH + 50} // marge : le compteur prévient avant le refus
          placeholder={t('assistant.composer.placeholder')}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.focus}
          accessibilityLabel={t('assistant.composer.label')}
          accessibilityHint={t('assistant.composer.hint')}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            textStyle('body'),
            {
              flex: 1,
              minHeight: touchTarget,
              maxHeight: 132, // 5 lignes environ, puis le champ défile
              color: colors.text,
              backgroundColor: colors.background,
              borderRadius: radii.lg,
              borderWidth: focused ? 1.5 : 1,
              borderColor: focused ? colors.focus : colors.borderStrong,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
              textAlignVertical: 'top',
            },
            // Web : retire le cadre ajouté par le navigateur (la bordure du champ suffit).
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('assistant.composer.send')}
          accessibilityState={{ disabled: !canSend, busy }}
          disabled={!canSend}
          onPress={send}
          style={{
            width: touchTarget,
            height: touchTarget,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canSend ? colors.primary : colors.surfaceMuted,
            borderWidth: canSend ? 0 : 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons
            name="arrow-up"
            size={22}
            color={canSend ? colors.onPrimary : colors.textSubtle}
          />
        </PressableScale>
      </View>
      {showCounter(text) ? (
        <Text
          variant="caption"
          tone={problem === 'tooLong' ? 'danger' : 'muted'}
          align="right"
          accessibilityLiveRegion="polite"
        >
          {problem === 'tooLong'
            ? t('assistant.composer.tooLong', { max: ASSISTANT_QUESTION_MAX_LENGTH })
            : t('assistant.composer.counter', {
                count: length,
                max: ASSISTANT_QUESTION_MAX_LENGTH,
              })}
        </Text>
      ) : null}
    </View>
  );
}
