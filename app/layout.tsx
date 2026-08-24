import type { Metadata } from "next";
import { pressStart2P, courierPrime, jetBrainsMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arcade Vault · Portal Retro",
  description: "Juega arcades online y compite por la puntuación más alta.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${pressStart2P.variable} ${courierPrime.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="av-bg" />
        <div className="av-noise" />
        <div id="root">
          <main className="av-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
