import type { Metadata } from "next";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import AmbientBackground from "@/components/effects/AmbientBackground";
// Temporarily disabled — import BootSequence from "@/components/effects/BootSequence";
import TopBar from "@/components/layout/TopBar";
import RouteTransition from "@/components/layout/RouteTransition";
import MentorPanel from "@/components/layout/MentorPanel";
import TimerTicker from "@/components/layout/TimerTicker";
import ProgressSync from "@/components/layout/ProgressSync";
import AuthBoot from "@/components/layout/AuthBoot";
import Toast from "@/components/gamification/Toast";
import LevelUpBurst from "@/components/gamification/LevelUpBurst";

export const metadata: Metadata = {
  title: "ForgeFlow",
  description: "A gamified educational platform for building real AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking, pre-hydration: stamps data-theme onto <html> before
            any CSS resolves, so there's no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AmbientBackground />
        {/* Temporarily disabled — <BootSequence /> */}
        <AuthBoot />
        <ProgressSync />
        <TimerTicker />
        <Toast />
        <LevelUpBurst />
        <MentorPanel />

        <div className="relative z-20">
          <TopBar />
        </div>

        <main className="relative z-10">
          <RouteTransition>{children}</RouteTransition>
        </main>
      </body>
    </html>
  );
}
