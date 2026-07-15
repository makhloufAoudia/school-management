import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/profile";

// Étape 1 (une seule fois) : redirige l'admin vers l'écran de consentement
// Google pour autoriser le site à téléverser sur son Drive.
export async function GET(request: NextRequest) {
  const { role } = await getSessionProfile();
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_OAUTH_CLIENT_ID manquant dans .env.local" },
      { status: 500 }
    );
  }

  const redirectUri = `${request.nextUrl.origin}/api/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/drive");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url);
}
