import { Redirect } from 'expo-router';

// TODO(L1-07) : choisir la destination selon la session
//   pas de session        → /(auth)/welcome
//   profil incomplet      → /(onboarding)/profile-setup
//   session + déverrouillé → /(tabs)
export default function Index() {
  return <Redirect href="/(auth)/welcome" />;
}
