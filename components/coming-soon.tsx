import { getTranslations } from "next-intl/server";

export default async function ComingSoon({ titleKey }: { titleKey: string }) {
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t(titleKey)}</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        {tc("comingSoon")}
      </div>
    </div>
  );
}
