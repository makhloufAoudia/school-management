import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Écrit le refresh token directement dans .env.local (dev uniquement)
function saveTokenToEnv(token: string): boolean {
  try {
    const envPath = join(process.cwd(), ".env.local");
    let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    if (/^GOOGLE_REFRESH_TOKEN=.*$/m.test(content)) {
      content = content.replace(
        /^GOOGLE_REFRESH_TOKEN=.*$/m,
        `GOOGLE_REFRESH_TOKEN=${token}`
      );
    } else {
      content += `\nGOOGLE_REFRESH_TOKEN=${token}\n`;
    }
    writeFileSync(envPath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

// Étape 2 : Google redirige ici avec un code, qu'on échange contre
// le refresh token à copier dans .env.local (GOOGLE_REFRESH_TOKEN).
export async function GET(request: NextRequest) {
  const { role } = await getSessionProfile();
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
  }

  const redirectUri = `${request.nextUrl.origin}/api/google/callback`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.refresh_token) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2>❌ Erreur</h2>
        <pre>${JSON.stringify(data, null, 2)}</pre>
        <p>Réessayez via <a href="/api/google/auth">/api/google/auth</a></p>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const saved = saveTokenToEnv(data.refresh_token);

  return new NextResponse(
    saved
      ? `<html><body style="font-family:sans-serif;padding:2rem;max-width:640px;margin:auto">
      <h2>✅ Autorisation réussie</h2>
      <p><strong>Le jeton a été enregistré automatiquement dans <code>.env.local</code>.</strong></p>
      <p>Il ne reste qu'à redémarrer le serveur : <code>Ctrl+C</code> puis <code>npm run dev</code>.</p>
    </body></html>`
      : `<html><body style="font-family:sans-serif;padding:2rem;max-width:640px;margin:auto">
      <h2>✅ Autorisation réussie</h2>
      <p>Copiez cette ligne dans votre fichier <code>.env.local</code> :</p>
      <pre style="background:#f1f5f9;padding:1rem;border-radius:8px;white-space:pre-wrap;word-break:break-all">GOOGLE_REFRESH_TOKEN=${data.refresh_token}</pre>
      <p>Puis redémarrez le serveur (<code>npm run dev</code>).</p>
      <p style="color:#64748b;font-size:.9rem">Ce jeton est secret : ne le partagez pas.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
