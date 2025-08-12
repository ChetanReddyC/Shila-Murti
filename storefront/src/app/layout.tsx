import type { Metadata } from "next";
import { Public_Sans, Noto_Sans } from "next/font/google";
import "./globals.css";
import { CartProvider } from "../contexts";
import AuthSessionProvider from "@/providers/SessionProvider";

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
      <body className={`${publicSans.variable} ${notoSans.variable} w-full`}>
        <AuthSessionProvider>
          <CartProvider>
            {children}
          </CartProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
