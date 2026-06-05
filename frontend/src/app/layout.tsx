import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dockguard.acharlas.dev"),
  title: "DockGuard",
  description:
    "Container image analysis dashboard with Security (Trivy) and Build (Dive) lenses. FastAPI + Next.js 14 + PostgreSQL + Redis.",
  openGraph: {
    title: "DockGuard",
    description:
      "Container image analysis dashboard with Security (Trivy) and Build (Dive) lenses. Scan Docker images for vulnerabilities and analyze build efficiency.",
    url: "https://dockguard.acharlas.dev",
    siteName: "DockGuard",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DockGuard — Container Image Analysis Dashboard",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DockGuard",
    description:
      "Container image analysis dashboard with Security (Trivy) and Build (Dive) lenses.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dockguard-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen transition-colors duration-200">
        <ErrorBoundary>
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
      </body>
    </html>
  );
}
