// Réglages → Sécurité (L1-09) : verrouiller l'app par un code (et l'empreinte / le visage si disponibles).
// Parcours :
//  - activer   : choisir 4 ou 6 chiffres → taper le code → le retaper → verrouillage actif ;
//  - modifier  : taper le code actuel → nouveau code → le retaper ;
//  - désactiver: taper le code actuel (personne d'autre ne peut couper la protection).
// Le code n'est jamais affiché ni stocké en clair (empreinte SHA-256, voir lock-rules.ts).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, ChoiceGroup, InlineAlert, Screen, Text, Toggle } from '@/components/ui';
import {
  LOCK_TIMEOUTS,
  PinPad,
  biometricSupport,
  changePin,
  disableLock,
  enableLock,
  pinProblem,
  updateLockSettings,
  useAppLock,
  verifyPin,
  type BiometricSupport,
  StorageProtectionCard,
  type PinPadHandle,
} from '@/features/security';
import { enterFromBelow, spacing, useReducedMotion } from '@/theme';

/** Étape du parcours : écran des réglages, ou saisie d'un code. */
type Mode =
  | { kind: 'view' }
  | { kind: 'length'; purpose: 'enable' | 'change' }
  | { kind: 'create'; purpose: 'enable' | 'change'; length: number }
  | { kind: 'confirm'; purpose: 'enable' | 'change'; first: string }
  | { kind: 'verify'; then: 'disable' | 'change' };

export default function SecurityScreen() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const { settings } = useAppLock();
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [support, setSupport] = useState<BiometricSupport>({ available: false, kind: 'other' });
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const pad = useRef<PinPadHandle>(null);

  useEffect(() => {
    void biometricSupport().then(setSupport);
  }, []);

  const bioLabel = t(
    support.kind === 'face' ? 'security.settings.bioFace' : 'security.settings.bioFinger',
  );
  const go = (next: Mode, note: typeof message = null) => {
    setMessage(note);
    setMode(next);
  };

  // ---------- Saisie d'un code ----------
  const onCode = async (pin: string) => {
    if (mode.kind === 'create') {
      const problem = pinProblem(pin);
      if (problem) {
        setMessage({ tone: 'danger', text: t(`security.settings.problem.${problem}`) });
        pad.current?.reject();
        return;
      }
      go({ kind: 'confirm', purpose: mode.purpose, first: pin });
      return;
    }
    if (mode.kind === 'confirm') {
      if (pin !== mode.first) {
        pad.current?.reject();
        go(
          { kind: 'create', purpose: mode.purpose, length: mode.first.length },
          { tone: 'danger', text: t('security.settings.mismatch') },
        );
        return;
      }
      if (mode.purpose === 'enable') await enableLock(pin, support.available);
      else await changePin(pin);
      go(
        { kind: 'view' },
        {
          tone: 'success',
          text: t(
            mode.purpose === 'enable' ? 'security.settings.enabled' : 'security.settings.changed',
          ),
        },
      );
      return;
    }
    if (mode.kind === 'verify') {
      if (!(await verifyPin(pin))) {
        setMessage({ tone: 'danger', text: t('security.lock.wrong') });
        pad.current?.reject();
        return;
      }
      if (mode.then === 'disable') {
        await disableLock();
        go({ kind: 'view' }, { tone: 'success', text: t('security.settings.disabled') });
      } else {
        go({ kind: 'length', purpose: 'change' });
      }
    }
  };

  if (mode.kind !== 'view') {
    const title =
      mode.kind === 'length'
        ? t('security.settings.lengthTitle')
        : mode.kind === 'create'
          ? t('security.settings.createTitle')
          : mode.kind === 'confirm'
            ? t('security.settings.confirmTitle')
            : t('security.settings.verifyTitle');
    const length =
      mode.kind === 'create'
        ? mode.length
        : mode.kind === 'confirm'
          ? mode.first.length
          : settings.pinLength;

    return (
      <Screen scrollKey={mode.kind}>
        <Animated.View
          key={mode.kind}
          entering={enterFromBelow(0, reduced)}
          style={{ gap: spacing.xl }}
        >
          <View style={{ gap: spacing.xs }}>
            <Text variant="overline" tone="primary">
              {t('security.settings.title')}
            </Text>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
          </View>
          {message ? <InlineAlert tone={message.tone} message={message.text} /> : null}
          {mode.kind === 'length' ? (
            <ChoiceGroup
              label={t('security.settings.lengthLabel')}
              value={null}
              columns={1}
              onChange={(value) =>
                go({ kind: 'create', purpose: mode.purpose, length: value === 'six' ? 6 : 4 })
              }
              options={[
                {
                  value: 'four',
                  label: t('security.settings.four'),
                  hint: t('security.settings.fourHint'),
                },
                {
                  value: 'six',
                  label: t('security.settings.six'),
                  hint: t('security.settings.sixHint'),
                },
              ]}
            />
          ) : (
            <PinPad
              key={`${mode.kind}-${length}`}
              ref={pad}
              length={length}
              onComplete={(pin) => void onCode(pin)}
            />
          )}
          <Button label={t('common.cancel')} variant="ghost" onPress={() => go({ kind: 'view' })} />
        </Animated.View>
      </Screen>
    );
  }

  // ---------- Écran des réglages ----------
  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('settings.title')}
        </Text>
        <Text variant="title">{t('security.settings.title')}</Text>
        <Text tone="muted">{t('security.settings.intro')}</Text>
      </View>

      {message ? <InlineAlert tone={message.tone} message={message.text} /> : null}

      <Card variant="outlined" index={0}>
        <Toggle
          label={t('security.settings.lockLabel')}
          hint={t('security.settings.lockHint')}
          value={settings.enabled}
          onChange={(on) =>
            on ? go({ kind: 'length', purpose: 'enable' }) : go({ kind: 'verify', then: 'disable' })
          }
        />
        {settings.enabled ? (
          <Animated.View
            entering={enterFromBelow(0, reduced)}
            style={{ gap: spacing.lg, marginTop: spacing.sm }}
          >
            {support.available ? (
              <Toggle
                label={bioLabel}
                hint={t('security.settings.bioHint')}
                value={settings.biometrics}
                onChange={(biometrics) => void updateLockSettings({ biometrics })}
              />
            ) : (
              <Text variant="bodySmall" tone="muted">
                {t('security.settings.bioUnavailable')}
              </Text>
            )}
            <ChoiceGroup
              label={t('security.settings.timeoutLabel')}
              value={settings.timeout}
              columns={3}
              onChange={(timeout) => void updateLockSettings({ timeout })}
              options={LOCK_TIMEOUTS.map((value) => ({
                value,
                label: t(`security.settings.timeout.${value}`),
              }))}
            />
            <Button
              label={t('security.settings.change')}
              variant="outline"
              onPress={() => go({ kind: 'verify', then: 'change' })}
            />
          </Animated.View>
        ) : null}
      </Card>

      <StorageProtectionCard index={1} />

      <Card variant="tinted" index={2}>
        <Text variant="subheading">{t('security.settings.tipsTitle')}</Text>
        <Text variant="bodySmall" tone="muted">
          {t('security.settings.tips')}
        </Text>
      </Card>
    </Screen>
  );
}
