import type { Metadata } from "next";
import { ForesightApp } from "./components/ForesightApp";

export const metadata: Metadata = {
  title: "工业设计前瞻站 · 测试版",
  description: "面向工业设计学生与从业者的行业前瞻、技能储备与危机后机会研究系统。",
};

export default function Home() {
  return <ForesightApp />;
}
