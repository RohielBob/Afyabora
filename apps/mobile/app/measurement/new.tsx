import { ScreenStub } from '@/components/ui';

export default function NewMeasurementScreen() {
  return (
    <ScreenStub
      title="Nouvelle mesure"
      ticket="L2-03, L2-04"
      description="Saisie en moins de 10 s ; écriture locale puis outbox ; confirmation si valeur inhabituelle ; message de sécurité hypo/hyper."
    />
  );
}
