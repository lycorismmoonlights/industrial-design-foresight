import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "工业设计前瞻站",
  description: "工业设计行业前瞻研究与危机应对系统测试版",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
