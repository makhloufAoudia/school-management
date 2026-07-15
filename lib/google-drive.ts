// Client Google Drive via OAuth (compte personnel), sans dépendance externe.
// Le site téléverse en ton nom : les fichiers t'appartiennent et utilisent
// ton quota Drive (15 Go gratuits).
//
// Variables d'environnement requises :
//   GOOGLE_OAUTH_CLIENT_ID       depuis Google Cloud Console (client OAuth "Web")
//   GOOGLE_OAUTH_CLIENT_SECRET   idem
//   GOOGLE_REFRESH_TOKEN         obtenu une fois via /api/google/auth
//   GOOGLE_DRIVE_FOLDER_ID       l'ID du dossier Drive de destination

const TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token error: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Téléverse un fichier dans le dossier Drive configuré, le rend lisible
 * par toute personne disposant du lien, et renvoie son ID.
 */
export async function uploadToDrive(
  fileName: string,
  mimeType: string,
  content: Buffer,
  folderId?: string
): Promise<string> {
  const token = await getAccessToken();

  const boundary = "----school-" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({
    name: fileName,
    mimeType,
    parents: [folderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID],
  });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    content,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    throw new Error(`Drive upload error: ${await res.text()}`);
  }

  const { id } = (await res.json()) as { id: string };

  // Lisible par toute personne ayant le lien (nécessaire pour l'aperçu intégré)
  const permRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }
  );
  if (!permRes.ok) {
    throw new Error(`Drive permission error: ${await permRes.text()}`);
  }

  return id;
}

/**
 * Ouvre une session d'upload « resumable » et renvoie l'URL de session.
 * Le navigateur peut ensuite envoyer (PUT) le fichier directement à cette URL,
 * sans passer par le serveur Next.js — indispensable sur Vercel où le corps
 * d'une requête serverless est limité (~4,5 Mo). L'URL de session porte son
 * propre jeton d'upload : aucun access token Google n'est exposé au client.
 */
export async function createResumableUploadSession(
  fileName: string,
  mimeType: string,
  folderId?: string
): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
      },
      body: JSON.stringify({
        name: fileName,
        mimeType,
        parents: [folderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Drive resumable init error: ${await res.text()}`);
  }

  const location = res.headers.get("location");
  if (!location) {
    throw new Error("Drive resumable init: aucune URL de session renvoyée");
  }
  return location;
}

/**
 * Rend un fichier lisible par toute personne disposant du lien (nécessaire pour
 * l'aperçu intégré). Appelé après un upload direct depuis le navigateur.
 */
export async function makeFilePublic(fileId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }
  );
  if (!res.ok) {
    throw new Error(`Drive permission error: ${await res.text()}`);
  }
}

/**
 * Récupère le contenu binaire d'un fichier Drive (pour le téléchargement/zip).
 */
export async function downloadFromDrive(fileId: string): Promise<Buffer> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Drive download error: ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  // 404 : déjà supprimé côté Drive, on ignore
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete error: ${await res.text()}`);
  }
}

/**
 * Crée un sous-dossier dans Drive (sous `parentId`, ou le dossier racine par
 * défaut) et renvoie son ID. Sert à isoler les fichiers par école.
 */
export async function createDriveFolder(
  name: string,
  parentId?: string
): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId ?? process.env.GOOGLE_DRIVE_FOLDER_ID],
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Drive folder create error: ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}

/**
 * Déplace un fichier Drive vers `newParentId` (retire ses parents actuels).
 * Idempotent : si le fichier est déjà dans ce dossier, l'opération n'a
 * pas d'effet visible.
 */
export async function moveDriveFile(
  fileId: string,
  newParentId: string
): Promise<void> {
  const token = await getAccessToken();

  const getRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!getRes.ok) {
    throw new Error(`Drive get error: ${await getRes.text()}`);
  }
  const { parents } = (await getRes.json()) as { parents?: string[] };
  const removeParents = (parents ?? []).join(",");

  const url =
    `https://www.googleapis.com/drive/v3/files/${fileId}` +
    `?addParents=${encodeURIComponent(newParentId)}` +
    (removeParents ? `&removeParents=${encodeURIComponent(removeParents)}` : "") +
    `&fields=id`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Drive move error: ${await res.text()}`);
  }
}
