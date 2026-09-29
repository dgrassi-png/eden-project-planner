import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { IntegrationState, IntegrationStatus } from "@/lib/integrations/status";

const STATE_BADGE: Record<IntegrationState, { tone: BadgeTone; label: string }> = {
  configured: { tone: "green", label: "Configured" },
  partial: { tone: "amber", label: "Partially configured" },
  not_configured: { tone: "neutral", label: "Not configured" },
};

export function IntegrationCard({
  status,
  description,
  children,
}: {
  status: IntegrationStatus;
  description: ReactNode;
  children?: ReactNode;
}) {
  const badge = STATE_BADGE[status.state];
  return (
    <section className="rounded border border-neutral-200 bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">{status.name}</h2>
          <span className="text-[11px] text-neutral-500">{status.required ? "Required" : "Optional"}</span>
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </header>
      <div className="space-y-3 px-4 py-3">
        <p className="text-xs text-neutral-600">{description}</p>
        <table className="w-full text-xs">
          <thead className="sr-only">
            <tr>
              <th>Variable</th>
              <th>Scope</th>
              <th>Present</th>
            </tr>
          </thead>
          <tbody>
            {status.checks.map((check) => (
              <tr key={check.envVar} className="border-t border-neutral-100">
                <td className="py-1.5 font-mono text-[11px] text-neutral-800">{check.envVar}</td>
                <td className="py-1.5 text-neutral-500">{check.public ? "browser" : "server only"}</td>
                <td className="py-1.5 text-right">
                  {check.present ? <Badge tone="green">set</Badge> : <Badge tone="neutral">missing</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {children}
      </div>
    </section>
  );
}
