import type { Metadata } from "next";
import { ForesightApp } from "./components/ForesightApp";
import { requireOwnerPage } from "./server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "工业设计前瞻站 · 私有研究版",
  description: "面向工业设计学生与从业者的行业前瞻、技能储备与危机后机会研究系统。",
};

export default async function Home() {
  const user = await requireOwnerPage("/");
  return <ForesightApp initialUser={{ userId: user.userId, email: user.email, displayName: user.displayName }} />;
}
