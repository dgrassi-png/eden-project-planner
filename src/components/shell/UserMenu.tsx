import type { Principal } from "@/lib/auth/session";

/** Signed-in identity and local logout. */
export function UserMenu({ principal }: { principal: Principal | null }) {
  if (!principal) return null;
  if (principal.mode === "local-dev") {
    return <p className="text-[11px] leading-snug text-neutral-500">Local dev (no sign-in)</p>;
  }
  return (
    <form action="/auth/logout" method="post" className="space-y-1">
      <p className="truncate text-[11px] text-neutral-300" title={principal.email ?? undefined}>
        {principal.email}
      </p>
      <button type="submit" className="text-[11px] text-neutral-400 underline hover:text-neutral-100">
        Esci
      </button>
    </form>
  );
}
