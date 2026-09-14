import type { Metadata } from "next";
import { ProjectShowcase } from "./ProjectShowcase";
import "./showcase.css";

export const metadata: Metadata = {
  title: "工业设计前瞻站 · 跨学院共研计划",
  description: "从行业变化到设计行动：一个已有研究原型、邀请跨学院共同验证的学生研究项目。",
};

// Deliberately static: this presentation contains curated public material only.
// Owner records, runtime configuration and authenticated APIs are not imported.
export default function ShowcasePage() {
  return <ProjectShowcase />;
}
