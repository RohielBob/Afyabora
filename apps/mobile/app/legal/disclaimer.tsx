// Avertissement « outil d'aide, pas un avis médical » (L1-10) : ce que fait l'application, et ce qu'elle
// ne fait pas. Lisible avant de créer un compte et depuis Paramètres → À propos.
import { LegalDocument } from '@/features/legal';

export default function DisclaimerScreen() {
  return <LegalDocument kind="disclaimer" />;
}
