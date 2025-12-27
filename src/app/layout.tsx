import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavigationProvider } from "@/context/navigation-context";
import { PreferencesProvider } from "@/context/preferences-context";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatFAB } from "@/components/chat-fab";

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
        <PreferencesProvider>
          <NavigationProvider>
            {children}
            <ChatSidebar />
            <ChatFAB />
          </NavigationProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
