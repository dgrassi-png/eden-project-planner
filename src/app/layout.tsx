import type { Metadata } from "next";

import { AppShell } from "@/components/shell/AppShell";
import { APP_NAME } from "@/config/app";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Master planning timeline for E:DEN. Planner = source of truth, Trello = execution layer.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
