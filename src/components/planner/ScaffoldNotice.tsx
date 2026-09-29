export function ScaffoldNotice() {
  return (
    <div role="note" className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
      <strong className="font-semibold">UI scaffolding.</strong> The rows below are generic placeholders for layout only.
      They are not E:DEN planning data. Real tasks will load from Supabase once the planning domain is in place.
    </div>
  );
}
