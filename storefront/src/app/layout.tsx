import type { Metadata } from "next";
import { Suspense } from "react";
import { Public_Sans, Noto_Sans, Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "../contexts";
import AuthSessionProvider from "@/providers/SessionProvider";
import PasskeyNudge from "@/components/PasskeyNudge";
import Header from "@/components/Header";
import NavigationLoadingProvider from "@/providers/NavigationLoadingProvider";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-public-sans",
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sans",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-cinzel",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Shila Murthi",
  description: "Timeless beauty of handcrafted stone idols",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
      </head>
      <body className={`${publicSans.variable} ${notoSans.variable} ${cinzel.variable} ${inter.variable} w-full`}>
        <AuthSessionProvider>
          <CartProvider>
            <Suspense fallback={null}>
              <NavigationLoadingProvider>
                {/* Global post-elevation passkey prompt */}
                <PasskeyNudge />
                {/* Global header - persists across all pages */}
                <Header />
                {children}
              </NavigationLoadingProvider>
            </Suspense>
          </CartProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
