// Réponse d'URGENCE (L9-06, ADR-0005 complétée) : immédiate, sans modèle de langage, avec ce que le patient
// a lui-même enregistré dans son profil (L9-03, L9-04) : son numéro d'urgence, son proche, son médecin.
// Afyabora ne devine JAMAIS un numéro : sans numéro enregistré, la réponse dit « les secours » et invite à
// l'ajouter. Aucun geste médical n'est décrit ici : la fiche « Quand demander de l'aide » est citée.

/** Ce que le profil contient pour l'urgence (tout est facultatif). */
export interface EmergencyContacts {
  emergencyNumber: string | null;
  relative: { name: string; phone: string } | null;
  doctor: { name: string; phone: string } | null;
}

export function emergencyAnswer(contacts: EmergencyContacts): string {
  const parts = [
    contacts.emergencyNumber
      ? `Si vous vous sentez mal, ne restez pas seul : appelez tout de suite le ${contacts.emergencyNumber} (votre numéro d'urgence), ou demandez à quelqu'un de le faire.`
      : "Si vous vous sentez mal, ne restez pas seul : appelez tout de suite les secours, ou demandez à quelqu'un de le faire.",
  ];
  if (contacts.relative) {
    parts.push(`Prévenez aussi ${contacts.relative.name} au ${contacts.relative.phone}.`);
  }
  if (contacts.doctor) {
    parts.push(`Votre médecin : ${contacts.doctor.name}, ${contacts.doctor.phone}.`);
  }
  parts.push("Afyabora ne peut pas vous aider dans une situation d'urgence.");
  if (!contacts.emergencyNumber) {
    parts.push("Pensez à enregistrer votre numéro d'urgence dans votre profil.");
  }
  return parts.join(' ');
}
