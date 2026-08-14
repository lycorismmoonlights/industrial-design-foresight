import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ForbiddenPage() {
  return (
    <main className="access-page">
      <section>
        <p className="eyebrow">OWNER ONLY</p>
        <h1>这个研究空间是私有的</h1>
        <p>当前 ChatGPT 账号不在所有者白名单中。请切换到部署时配置的 OWNER_EMAIL。</p>
        <Link className="button primary" href="/signout-with-chatgpt?return_to=/">切换账号</Link>
      </section>
    </main>
  );
}
