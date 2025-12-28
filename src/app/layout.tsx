import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { NavigationProvider } from "@/context/navigation-context";
import { PreferencesProvider } from "@/context/preferences-context";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatFAB } from "@/components/chat-fab";
import { ChatPrompt } from "@/components/chat-prompt";

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
  description: "AI-powered chat application",
};

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
          <PreferencesProvider>
            <NavigationProvider>
              {children}
              <ChatSidebar />
              <ChatFAB />
              <ChatPrompt />
            </NavigationProvider>
          </PreferencesProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
