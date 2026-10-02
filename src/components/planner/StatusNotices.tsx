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
