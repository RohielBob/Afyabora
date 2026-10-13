// Choix d'une colonne pour un rôle (L4-06) : intitulé (« Date ») + « Obligatoire » / « Facultatif », puis
// les colonnes du fichier en pastilles. Une colonne déjà prise par un autre rôle l'indique sous son nom
// (« pour l'heure ») : la choisir ici la retire de l'autre rôle. Rôle facultatif : pastille « Aucune ».
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ChoiceGroup, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';
import type { ColumnRole, MappingDraft } from '../mapping';

/** Valeur de la pastille « Aucune » (jamais un nom de colonne : les noms vides sont exclus par l'API). */
export const NO_COLUMN = '';

export function ColumnRoleChoice({
  role,
  required,
  hint,
  columns,
  draft,
  onChange,
}: {
  role: ColumnRole;
  required: boolean;
  hint: string;
  columns: readonly string[];
  draft: MappingDraft;
  onChange: (column: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const usedBy = (column: string) =>
    (Object.keys(draft) as ColumnRole[]).find((other) => other !== role && draft[other] === column);

  const options = [
    ...(required ? [] : [{ value: NO_COLUMN, label: t('import.mapping.none') }]),
    ...columns.map((column) => {
      const other = usedBy(column);
      return {
        value: column,
        label: column,
        hint: other
          ? t('import.mapping.usedFor', { role: t(`import.mapping.role.${other}`).toLowerCase() })
          : undefined,
      };
    }),
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="subheading" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {t(`import.mapping.role.${role}`)}
        </Text>
        <View
          style={{
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xxs,
            borderRadius: radii.pill,
            backgroundColor: required ? colors.primarySoft : colors.surfaceMuted,
          }}
        >
          <Text variant="caption" tone={required ? 'primary' : 'muted'}>
            {required ? t('import.mapping.required') : t('import.mapping.optional')}
          </Text>
        </View>
      </View>
      <ChoiceGroup
        label={hint}
        options={options}
        value={draft[role] ?? (required ? null : NO_COLUMN)}
        onChange={onChange}
        columns={2}
      />
    </View>
  );
}
