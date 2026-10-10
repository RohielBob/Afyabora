// Emplacement du bouton « + » dans la barre d'onglets (L2-03). Ce n'est pas un vrai écran : le bouton
// ouvre directement la saisie. Si quelqu'un arrive ici par une adresse, on le renvoie vers la saisie.
import { Redirect } from 'expo-router';

export default function AddRoute() {
  return <Redirect href="/measurement/new" />;
}
