import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Force dynamic rendering for the whole app. The home page is per-user
// (shows the user's conversations, account menu, preferences). Without
// this, Next.js prerenders the home page at build time and attaches
// `Cache-Control: s-maxage=31536000` to the response — that long-cached
// identical HTML interacts badly with incognito + cookie changes and
// produces Chrome's "This page couldn't load" error.
export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "viralpost — 你的 X 增长 agent",
  description:
    "真正的 AI agent,帮你管理 X(Twitter)账号 —— 主动收集信息、记住你的定位、陪你写推文。",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

// Mobile viewport. Without this, mobile browsers render the page at
// desktop scale (~960px) and downscale — fonts/buttons become tiny.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // Cap zoom-out for layout stability; allow zoom-in for accessibility.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
