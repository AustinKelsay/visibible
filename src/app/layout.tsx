import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { SessionProvider } from "@/context/session-context";
import { NavigationProvider } from "@/context/navigation-context";
import { PreferencesProvider } from "@/context/preferences-context";
import { GenerationProvider } from "@/context/generation-context";
import { BulkGenerationProvider } from "@/context/bulk-generation-context";
import { ChatSidebar } from "@/components/chat-sidebar";
import { BuyCreditsModal } from "@/components/buy-credits-modal";
import { FeedbackPrompt } from "@/components/feedback-prompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Visibible",
  description: "Explore Scripture with AI-powered insights and imagery. Read and visualize every verse of the Bible.",
};

const enableVercelAnalytics =
  process.env.VERCEL_ENV === "preview" ||
  process.env.VERCEL_ENV === "production";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConvexClientProvider>
          <SessionProvider>
            <PreferencesProvider>
              <NavigationProvider>
                <GenerationProvider>
                  <BulkGenerationProvider>
                    {children}
                    <ChatSidebar />
                    <FeedbackPrompt />
                    <BuyCreditsModal />
                  </BulkGenerationProvider>
                </GenerationProvider>
              </NavigationProvider>
            </PreferencesProvider>
          </SessionProvider>
        </ConvexClientProvider>
        {enableVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
