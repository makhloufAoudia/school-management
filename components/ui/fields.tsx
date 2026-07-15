"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const boxBase =
  "peer w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:focus:border-indigo-400";

// Label flotté : posé sur la bordure haute de l'input (style Gmail/Material)
const labelFloated =
  "pointer-events-none absolute -top-2 start-2.5 bg-white px-1 text-xs text-slate-500 transition-all peer-focus:text-indigo-600 dark:bg-slate-900 dark:text-slate-400 dark:peer-focus:text-indigo-400";

// Label qui descend dans le champ quand il est vide, remonte sur la bordure sinon
const labelDynamic =
  labelFloated +
  " peer-placeholder-shown:top-2.5 peer-placeholder-shown:bg-transparent peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400" +
  " peer-focus:-top-2 peer-focus:bg-white peer-focus:text-xs dark:peer-focus:bg-slate-900";

export function FloatInput({
  label,
  // On ignore tout `placeholder` passé par l'appelant : le label flottant EST
  // le placeholder. Un vrai placeholder casserait `peer-placeholder-shown` et
  // se superposerait au label (bug d'affichage).
  placeholder: _ignoredPlaceholder,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  // Les champs date/time affichent toujours un format : label flotté en permanence
  const alwaysFloated = props.type === "date" || props.type === "time";
  // Champ mot de passe : on ajoute un bouton œil pour afficher/masquer.
  const isPassword = props.type === "password";
  const type = isPassword && reveal ? "text" : props.type;
  return (
    <div className="relative">
      <input
        id={id}
        {...props}
        type={type}
        placeholder=" "
        className={`${boxBase}${isPassword ? " !pe-10" : ""}`}
      />
      <label
        htmlFor={id}
        className={alwaysFloated ? labelFloated : labelDynamic}
      >
        {label}
      </label>
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute end-2 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition-colors hover:text-indigo-500"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export function FloatSelect({
  label,
  children,
  ...props
}: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="relative">
      <select id={id} {...props} className={boxBase}>
        {children}
      </select>
      <label htmlFor={id} className={labelFloated}>
        {label}
      </label>
    </div>
  );
}

export function FloatTextarea({
  label,
  placeholder: _ignoredPlaceholder,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="relative">
      <textarea id={id} {...props} placeholder=" " className={boxBase} />
      <label htmlFor={id} className={labelDynamic}>
        {label}
      </label>
    </div>
  );
}
