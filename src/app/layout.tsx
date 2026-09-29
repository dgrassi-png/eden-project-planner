import type { Metadata } from "next";

import { AppShell } from "@/components/shell/AppShell";
import { APP_NAME } from "@/config/app";
import edenMark from "@/vendor/eden_ui/img/eden-mark.svg";

// E:DEN foundation first (tokens), then the operational Carbon/Ice layer, then the planner bridge.
import "@/vendor/eden_ui/css/eden-foundation.css";
import "@/vendor/eden_ui/css/eden-operational.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Master planning timeline for E:DEN. Planner = source of truth, Trello = execution layer.",
  robots: { index: false, follow: false },
  icons: { icon: edenMark.src },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" data-eden-foundation="" className="h-full antialiased">
      <body className="h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
