import SignupForm from "./signup-form";

export const dynamic = "force-dynamic";

// Page publique d'inscription d'une école (le middleware l'autorise sans
// authentification). La création se fait via l'action serveur signUpSchool.
export default function SignupPage() {
  return <SignupForm />;
}
