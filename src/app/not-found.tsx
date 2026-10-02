import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-sm text-neutral-600">
      <p className="font-medium text-neutral-900">Page not found</p>
      <Link href="/planner" className="text-blue-700 hover:underline">
        Back to planner
      </Link>
    </div>
  );
}
