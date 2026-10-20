// Résumé du profil médical : une carte par partie (identité, diabète, unité et seuils, contacts), chacune
// avec « Modifier ». Utilisé par le dernier écran de l'assistant de profil (L1-08) et par l'onglet Profil
// (« Mon profil médical »), qui affiche le profil enregistré et ouvre l'assistant sur la bonne étape.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { spacing } from '@/theme';
import type { ProfileDraft, Step } from '../wizard';
import { UNIT_LABEL } from './ThresholdsEditor';

/** Résumé : une carte par étape, chacune avec « Modifier ». */
export function ProfileSummary({
  draft,
  onEdit,
  intro,
}: {
  draft: ProfileDraft;
  onEdit: (step: Step) => void;
  /** Phrase au-dessus des cartes (assistant : « Vérifiez vos informations… ») ; rien sur l'onglet Profil. */
  intro?: string;
}) {
  const { t } = useTranslation();
  const dash = '—';
  const sexLabel = { F: 'sexF', M: 'sexM', OTHER: 'sexOther' } as const;
  const typeLabel = {
    TYPE_1: 'type1',
    TYPE_2: 'type2',
    GESTATIONAL: 'gestational',
    OTHER: 'other',
  } as const;
  const unit = UNIT_LABEL[draft.unit];

  const sections: { step: Step; title: string; lines: [string, string][] }[] = [
    {
      step: 'identity',
      title: t('onboarding.identity.title'),
      lines: [
        [t('onboarding.summary.name'), `${draft.firstName.trim()} ${draft.lastName.trim()}`],
        [t('onboarding.identity.birthDate'), draft.birthDate],
        [
          t('onboarding.identity.sex'),
          draft.sex ? t(`onboarding.identity.${sexLabel[draft.sex]}`) : dash,
        ],
      ],
    },
    {
      step: 'diabetes',
      title: t('onboarding.diabetes.title'),
      lines: [
        [
          t('onboarding.diabetes.type'),
          draft.diabetesType ? t(`onboarding.diabetes.${typeLabel[draft.diabetesType]}`) : dash,
        ],
        [t('onboarding.diabetes.year'), draft.diagnosisYear || dash],
      ],
    },
    {
      step: 'thresholds',
      title: t('onboarding.thresholds.title'),
      lines: [
        [t('onboarding.thresholds.unit'), unit],
        [
          t('onboarding.summary.target'),
          `${draft.thresholds.targetMinMgDl} – ${draft.thresholds.targetMaxMgDl} ${unit}`,
        ],
        [t('onboarding.thresholds.veryLowMgDl'), `< ${draft.thresholds.veryLowMgDl} ${unit}`],
        [t('onboarding.thresholds.veryHighMgDl'), `> ${draft.thresholds.veryHighMgDl} ${unit}`],
      ],
    },
    {
      step: 'contacts',
      title: t('onboarding.contacts.title'),
      lines: [
        [
          t('onboarding.contacts.relativeTitle'),
          draft.relativeName.trim()
            ? `${draft.relativeName.trim()} · ${draft.relativePhone.trim()}`
            : t('onboarding.summary.none'),
        ],
        [
          t('onboarding.contacts.doctorTitle'),
          draft.doctorName.trim()
            ? `${draft.doctorName.trim()} · ${draft.doctorPhone.trim()}`
            : t('onboarding.summary.none'),
        ],
        [
          t('onboarding.contacts.emergencyTitle'),
          emergencySummary(draft, (key) => t(key)) ?? t('onboarding.summary.none'),
        ],
      ],
    },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      {intro ? <Text tone="muted">{intro}</Text> : null}
      {sections.map((section, i) => (
        <Card key={section.step} index={i} variant="outlined">
          {/* Titre long (ex. en swahili) : il passe à la ligne au lieu de chevaucher « Modifier ». */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: spacing.md,
            }}
          >
            <Text variant="subheading" style={{ flexShrink: 1 }}>
              {section.title}
            </Text>
            <Text
              variant="label"
              tone="primary"
              accessibilityRole="button"
              accessibilityLabel={`${t('onboarding.summary.edit')} : ${section.title}`}
              onPress={() => onEdit(section.step)}
            >
              {t('onboarding.summary.edit')}
            </Text>
          </View>
          {section.lines.map(([label, value]) => (
            <View
              key={label}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}
            >
              <Text variant="bodySmall" tone="muted">
                {label}
              </Text>
              <Text variant="bodySmall" style={{ flexShrink: 1, textAlign: 'right' }}>
                {value}
              </Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

/** Ligne « En cas d'urgence » du résumé : « RD Congo · 112 », « KE · 999 », « 112 »… ; null si rien. */
function emergencySummary(draft: ProfileDraft, t: (key: string) => string): string | null {
  const country =
    draft.country === null
      ? ''
      : draft.country === 'OTHER'
        ? draft.otherCountry.trim().toUpperCase()
        : t(`onboarding.contacts.countries.${draft.country}`);
  const parts = [country, draft.emergencyNumber.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
