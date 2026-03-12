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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of unstyled dark mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dockguard-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-gray-50 dark:bg-gray-950 min-h-screen transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
