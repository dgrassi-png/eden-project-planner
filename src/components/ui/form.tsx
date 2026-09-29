import type { ReactNode } from "react";

import type { Issue } from "@/domain/result";

/** Input styling without a width, for inline layouts. */
export const inputBaseClass =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-neutral-50 disabled:text-neutral-500";

export const inputClass = `${inputBaseClass} w-full`;

export function FormField({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-neutral-600">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-neutral-400">{hint}</span> : null}
    </label>
  );
}

const BUTTON_TONES = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-700 disabled:bg-neutral-400",
  secondary: "border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-400",
  danger: "border border-red-200 text-red-700 hover:bg-red-50 disabled:text-red-300",
} as const;

export function Button({
  tone = "secondary",
  type = "button",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BUTTON_TONES }) {
  return (
    <button
      type={type}
      className={`rounded px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed ${BUTTON_TONES[tone]} ${className}`}
      {...props}
    />
  );
}

export function FormError({ message, issues }: { message: string | null; issues?: Issue[] }) {
  if (!message) return null;
  const details = (issues ?? []).map((i) => i.message).filter((m) => m !== message);
  return (
    <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
      <p>{message}</p>
      {details.length ? (
        <ul className="mt-1 list-disc pl-4">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}
