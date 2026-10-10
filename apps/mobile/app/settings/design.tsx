// Planche de style (développement uniquement) : montre tout le système de design au même endroit
// pour le faire valider par l'équipe et vérifier un composant dans tous les thèmes.
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { GLUCOSE_STATES } from '@glyka/shared';
import { LoadingScreen, LogoMark, Wordmark } from '@/components/brand';
import {
  Button,
  Card,
  LoadingDots,
  RangeBadge,
  Screen,
  SegmentedControl,
  SkeletonCard,
  Spinner,
  Text,
  TextField,
} from '@/components/ui';
import { radii, spacing, textStyles, useTheme, type TextVariant } from '@/theme';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="overline" tone="primary">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function DesignBoardScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'jour' | 'semaine' | 'mois'>('semaine');
  const [showLoader, setShowLoader] = useState(false);

  // Démonstration de l'écran de chargement : affiché 2,5 s puis retour à la planche.
  useEffect(() => {
    if (!showLoader) return;
    const timer = setTimeout(() => setShowLoader(false), 2500);
    return () => clearTimeout(timer);
  }, [showLoader]);

  if (showLoader) return <LoadingScreen message="Synchronisation de vos mesures…" />;

  const swatches: [string, string][] = [
    ['primary', colors.primary],
    ['primarySoft', colors.primarySoft],
    ['background', colors.background],
    ['surface', colors.surface],
    ['surfaceMuted', colors.surfaceMuted],
    ['border', colors.border],
    ['text', colors.text],
    ['textMuted', colors.textMuted],
  ];

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <LogoMark size={64} />
        <Wordmark size={28} />
        <Text variant="caption" tone="muted">
          Planche de style · système de design Afyabora
        </Text>
      </View>

      <Section title="Couleurs (rôles du thème actif)">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {swatches.map(([name, value]) => (
            <View key={name} style={{ width: '23%', gap: 4 }}>
              <View
                style={{
                  height: 44,
                  borderRadius: radii.sm,
                  backgroundColor: value,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Typographie (Plus Jakarta Sans)">
        {(Object.keys(textStyles) as TextVariant[]).map((variant) => (
          <Text key={variant} variant={variant} numberOfLines={1}>
            {variant === 'metric' ? '148' : `${variant} — Suivez votre glycémie`}
          </Text>
        ))}
      </Section>

      <Section title="Boutons">
        <Button
          label="Enregistrer la mesure"
          loading={loading}
          onPress={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1600);
          }}
        />
        <Button label="Partager avec mon médecin" variant="secondary" onPress={() => undefined} />
        <Button label="Exporter mes données" variant="outline" onPress={() => undefined} />
        <Button label="Plus tard" variant="ghost" onPress={() => undefined} />
        <Button label="Révoquer l'accès" variant="danger" onPress={() => undefined} />
        <Button label="Indisponible" disabled onPress={() => undefined} />
      </Section>

      <Section title="Champs de saisie">
        <TextField
          label="Adresse email"
          placeholder="vous@exemple.com"
          keyboardType="email-address"
        />
        <TextField label="Mot de passe" secret hint="12 caractères minimum" />
        <TextField
          label="Glycémie"
          defaultValue="0,45"
          error="Valeur inhabituelle : confirmez-la"
        />
      </Section>

      <Section title="États glycémiques (couleur + symbole + libellé, jamais rouge)">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {GLUCOSE_STATES.map((state) => (
            <RangeBadge key={state} state={state} />
          ))}
        </View>
      </Section>

      <Section title="Sélecteur">
        <SegmentedControl
          accessibilityLabel="Période"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'jour', label: 'Jour' },
            { value: 'semaine', label: 'Semaine' },
            { value: 'mois', label: 'Mois' },
          ]}
        />
      </Section>

      <Section title="Cartes (apparition décalée)">
        {[0, 1, 2].map((i) => (
          <Card
            key={i}
            index={i}
            variant={i === 1 ? 'tinted' : i === 2 ? 'outlined' : 'elevated'}
            onPress={() => undefined}
          >
            <Text variant="subheading">
              {['Carte surélevée', 'Carte teintée', 'Carte contour'][i]}
            </Text>
            <Text variant="bodySmall" tone="muted">
              Touchez-la : elle s'enfonce légèrement.
            </Text>
          </Card>
        ))}
      </Section>

      <Section title="Chargement">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
          <Spinner size={28} />
          <LoadingDots />
        </View>
        <SkeletonCard />
        <Button
          label="Voir l'écran de chargement"
          variant="outline"
          onPress={() => setShowLoader(true)}
        />
      </Section>
    </Screen>
  );
}
