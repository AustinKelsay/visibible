import type { Metadata } from "next";
import { EB_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { GuestSessionProvider } from "@/context/guest-session-context";
import { SessionProvider } from "@/context/session-context";
import { NavigationProvider } from "@/context/navigation-context";
import { PreferencesProvider } from "@/context/preferences-context";
import { GenerationProvider } from "@/context/generation-context";
import { BulkGenerationProvider } from "@/context/bulk-generation-context";
import { BuyCreditsModal } from "@/components/buy-credits-modal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The words page sets the verse in this serif face.
const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
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
    // The reader marks <html> with its appearance before React loads (src/components/spread/reader-appearance.tsx).
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ebGaramond.variable} antialiased`}
      >
        <GuestSessionProvider>
          <ConvexClientProvider>
            <SessionProvider>
              <PreferencesProvider>
                <NavigationProvider>
                  <GenerationProvider>
                    <BulkGenerationProvider>
                      {children}
                      <BuyCreditsModal />
                    </BulkGenerationProvider>
                  </GenerationProvider>
                </NavigationProvider>
              </PreferencesProvider>
            </SessionProvider>
          </ConvexClientProvider>
        </GuestSessionProvider>
        {enableVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
