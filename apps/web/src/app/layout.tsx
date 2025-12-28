import type { Metadata } from "next";

import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";
import { getToken } from "@/lib/auth-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pressStart2P = Press_Start_2P({
  weight: "400",
  variable: "--font-press-start-2p",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "rimfront",
  description: "rimfront",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pressStart2P.variable} antialiased`}
      >
        <Providers initialToken={token}>
          <div className="h-svh">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
