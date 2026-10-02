"use client";

export interface Notice {
  tone: "info" | "error";
  message: string;
}

export function NoticeBar({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  if (!notice) return null;
  const tone = notice.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900";
  return (
    <div role={notice.tone === "error" ? "alert" : "status"} className={`flex items-center gap-3 border-t px-4 py-1.5 text-xs ${tone}`}>
      <span className="flex-1">{notice.message}</span>
      <button type="button" onClick={onDismiss} className="text-[11px] underline">
        Dismiss
      </button>
    </div>
  );
}
