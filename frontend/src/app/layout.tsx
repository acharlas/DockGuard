import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DockGuard",
  description: "Docker image security scanning dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
