import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "G7 Pulse",
  description: "Gestão financeira para empresas de serviço e BPO financeiro",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
