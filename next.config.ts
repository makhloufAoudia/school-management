import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Auto-hébergement : produit un dossier .next/standalone contenant le
  // serveur et ses seules dépendances utiles. On envoie ce dossier sur la
  // machine plutôt que les 800 Mo de node_modules.
  output: "standalone",
  devIndicators: {
    position: "bottom-right",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb", // téléversement des PDF de cours
    },
  },
};

export default withNextIntl(nextConfig);
