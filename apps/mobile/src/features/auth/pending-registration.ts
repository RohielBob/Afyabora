// Inscription en attente de vérification, gardée EN MÉMOIRE uniquement (jamais sur le disque, jamais dans
// l'adresse de l'écran) : elle permet le bouton « Renvoyer l'email » sans redemander le mot de passe.
// L'API renvoie un nouveau lien quand on se réinscrit avec une adresse non vérifiée (décision L1-01).
// Effacée dès que l'adresse est vérifiée ; perdue si l'app est fermée (on peut alors se réinscrire).
import type { RegisterPatientInput } from '@glyka/shared';

let pending: RegisterPatientInput | null = null;

export const pendingRegistration = {
  set(input: RegisterPatientInput) {
    pending = input;
  },
  get(email: string): RegisterPatientInput | null {
    return pending && pending.email === email ? pending : null;
  },
  clear() {
    pending = null;
  },
};
