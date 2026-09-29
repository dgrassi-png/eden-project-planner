import Link from "next/link";

export function SupabaseNotConfiguredNotice() {
  return (
    <div role="note" className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
      <strong className="font-semibold">Supabase not configured.</strong> The rows below are generic UI scaffolding,
      not E:DEN planning data. Set the Supabase variables and apply the migrations to plan with real data (see{" "}
      <Link href="/settings/integrations" className="underline">
        Integrations
      </Link>
      ).
    </div>
  );
}

export function PlannerErrorState({ message }: { message: string }) {
  return (
    <div className="p-4">
      <div role="alert" className="max-w-3xl rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
        <p className="font-semibold">Planning data could not be loaded</p>
        <p className="mt-1">{message}</p>
      </div>
    </div>
  );
}
