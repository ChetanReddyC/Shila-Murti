import type { Metadata } from "next";
import { Public_Sans, Noto_Sans } from "next/font/google";
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
      <body className={`${publicSans.variable} ${notoSans.variable} w-full`}>
        <AuthSessionProvider>
          <CartProvider>
            <NavigationLoadingProvider>
              {/* Global post-elevation passkey prompt */}
              <PasskeyNudge />
              {/* Global header - persists across all pages */}
              <Header />
              {children}
            </NavigationLoadingProvider>
          </CartProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
