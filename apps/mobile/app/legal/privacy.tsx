// Politique de confidentialité (L1-10) : lisible avant de créer un compte (lien sous la case de
// consentement) et à tout moment depuis Paramètres → À propos.
import { LegalDocument } from '@/features/legal';

export default function PrivacyScreen() {
  return <LegalDocument kind="privacy" />;
}
