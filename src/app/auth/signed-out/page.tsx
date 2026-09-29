import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Disconnesso" };

export default function SignedOutPage() {
  return (
    <div className="p-6 text-sm">
      <h1 className="mb-1 font-semibold">Sei uscito dal Planner</h1>
      <p className="text-[var(--eden-color-text-muted)]">La sessione E:DEN Identity resta gestita dal portale Identity.</p>
      <Link href="/auth/eden/start" className="mt-3 inline-block text-[var(--eden-color-accent-primary-ink)] underline">
        Accedi di nuovo
      </Link>
    </div>
  );
}
