import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "工业设计前瞻站 · 私有研究版",
  description: "工业设计行业前瞻研究、技能储备与危机后机会管理系统",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
