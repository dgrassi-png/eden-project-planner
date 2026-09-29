import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Accesso" };

const MESSAGES: Record<string, string> = {
  denied: "Il tuo account E:DEN non ha accesso al Planner. Richiedi l'accesso dal portale E:DEN Identity.",
  expired: "La sessione di accesso è scaduta o è stata avviata da un altro browser. Riprova.",
  invalid: "Il codice di accesso non è valido o è già stato usato. Riprova.",
  unavailable: "E:DEN Identity non è raggiungibile in questo momento. Riprova tra poco.",
  contract: "Risposta inattesa da E:DEN Identity. L'accesso è stato bloccato per sicurezza.",
  misconfigured: "Il Planner non è configurato per l'accesso. Contatta l'amministratore.",
};

export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const reason = (await searchParams).reason;
  const message = (typeof reason === "string" && MESSAGES[reason]) || MESSAGES.unavailable;
  return (
    <div className="p-6">
      <div role="alert" className="max-w-lg rounded-[var(--eden-radius-panel)] border border-[var(--eden-color-border)] bg-[var(--eden-color-surface)] p-4 text-sm">
        <h1 className="mb-1 font-semibold">Accesso non riuscito</h1>
        <p className="text-[var(--eden-color-text-muted)]">{message}</p>
        <Link href="/auth/eden/start" className="mt-3 inline-block text-[var(--eden-color-accent-primary-ink)] underline">
          Accedi con E:DEN
        </Link>
      </div>
    </div>
  );
}
