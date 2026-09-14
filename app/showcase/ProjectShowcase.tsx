"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Download, FileCheck2, Layers3, Microscope, Printer, Radar, ShieldCheck } from "lucide-react";

const sourceUrl = "https://environment.ec.europa.eu/strategy/circular-economy/ecodesign-sustainable-products-regulation_en";

const steps = [
  { label: "看见变化", title: "可维修性，进入产品规则的讨论", tag: "可核验的背景事实", body: "欧盟 ESPR 建立了制定产品生态设计要求的框架，涵盖耐用、维修和产品信息等方向。", fields: [["原始来源", "欧盟委员会 · ESPR 官方说明"], ["适用范围", "欧盟市场；具体要求须按产品类别核对"], ["来源先验", "官方规则来源 5/5；不等于机会已经成立"]], note: "这条资料不能证明：中国消费者愿意支付溢价，或某一产品现在就适用全部要求。" },
  { label: "形成问题", title: "可维修设计，能否成为一个好课题？", tag: "待验证假设", body: "以一种桌面小家电为候选对象，研究维修需求、服务条件与成本是否支持一个有价值的设计课题。", fields: [["设计研究", "谁会维修？在哪一步放弃？"], ["方法研究", "AI 整理是否保留了来源范围、限制和反方证据？"], ["商业研究", "维修成本、备件与支付意愿能否支持方案？"]], note: "选题由团队与老师确认；这里展示研究方法，尚未开展用户访谈或产品实验。" },
  { label: "寻找反证", title: "让不同专业，挑战同一个假设", tag: "必须补齐的证据", body: "计算机同学保证资料可追溯，人工智能同学检查摘要失真与反证遗漏，经管同学检验需求与成本，设计同学把结果转化为研究任务。", fields: [["反证线索 A", "可拆解方案可能增加成本；摘要可能遗漏产品适用边界"], ["反证线索 B", "用户可能更在意价格，维修服务也可能不可获得"], ["收缩条件", "目标用户没有相应需求，或关键可行性问题无法验证"]], note: "这些是待检查的反方问题，不是已经收集到的实验结论。涉及结构安全时另请专业人员核验。" },
  { label: "安排验证", title: "把一个趋势，变成一项可验收的行动", tag: "拟议的首个共同交付", body: "围绕一个候选产品，比较人工阅读与 AI 辅助整理的证据质量，再用小样本维修需求访谈与成本假设表检验机会判断。", fields: [["共同成果", "一张机会卡 + 一份证据包 + 一份 AI 评估与需求验证记录"], ["判定方法", "检查原文一致性、反证遗漏与用户需求；样本和阈值在实验前约定"], ["最终审核", "项目负责人汇总，专业同学复核，老师评议"]], note: "当前只具备规则背景证据，尚不足以宣称市场机会已被验证。" },
];

const roles = [
  { id: "design", area: "设计 / 工业设计", question: "值得解决什么问题？", task: "定义场景、访谈与机会表达", first: "围绕一个产品整理维修任务图，并提出 3 个需要证据回答的问题。", output: "研究问题卡、任务流程、机会卡", gain: "可放入作品集的研究逻辑与决策过程", skills: "用户研究、信息组织或产品设计", count: "2 人（含项目负责人）" },
  { id: "computing", area: "计算机", question: "判断能被复核和复用吗？", task: "数据质量、采集与可视化", first: "选择一个来源，检查字段、重复项与失败记录，交付可复现的数据质量说明。", output: "数据字典、质量检查、可复现脚本", gain: "已有代码库中的完整工程贡献记录", skills: "Web、Python、数据处理任选一项", count: "1–2 人" },
  { id: "ai", area: "人工智能", question: "AI 的整理值得信任吗？", task: "摘要忠实度、分类与反证评估", first: "选取 10 条公开资料做双人复核标注，检查 AI 是否误读原文、遗漏反证或夸大结论。", output: "标注集、评估脚本、模型误差分析", gain: "真实研究场景中的模型评估与人机协作案例", skills: "模型评估、NLP 或数据标注", count: "1–2 人" },
  { id: "business", area: "经管", question: "谁需要，为什么会采用？", task: "需求、成本与反方证据", first: "为候选方案列出成本假设，设计一份能推翻需求判断的访谈提纲。", output: "需求证据、成本表、反证备忘录", gain: "连接产品与产业问题的研究案例", skills: "访谈、产业分析或成本分析", count: "1–2 人" },
];

const milestones = [
  { week: "01", title: "界定问题", text: "确认一个产品场景、分工、证据模板与验收标准。", result: "交付：共研任务书" },
  { week: "02–03", title: "建立证据", text: "收集公开资料，做小样本观察；交叉复核来源与反证。", result: "交付：证据包初版" },
  { week: "04–05", title: "做一次验证", text: "开展需求访谈、AI 评估或数据实验，记录失败与限制。", result: "交付：验证记录与机会卡" },
  { week: "06", title: "共同评审", text: "演示完整证据链，根据结果决定继续、收缩或停止。", result: "交付：共研简报与成果归档" },
];

function SectionHeading({ index, eyebrow, title, text }: { index: string; eyebrow: string; title: string; text: string }) {
  return <div className="pitch-heading"><p className="pitch-kicker">{index} / {eyebrow}</p><h2>{title}</h2><p>{text}</p></div>;
}

export function ProjectShowcase() {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState(0);
  const [decision, setDecision] = useState<"research" | "act" | null>(null);
  const current = steps[step];

  return <div className="pitch">
    <a className="pitch-skip" href="#pitch-main">跳到项目介绍</a>
    <header className="pitch-nav">
      <a className="pitch-brand" href="#pitch-main"><span><Radar size={22} /></span><strong>工业设计前瞻站<small>FORESIGHT / RESEARCH TO ACTION</small></strong></a>
      <nav aria-label="项目介绍导航"><a href="#method">项目基础</a><a href="#case">互动案例</a><a href="#team">参与方式</a><a href="#pilot" className="pitch-nav-cta">共研计划 <ArrowUpRight size={14} /></a></nav>
    </header>

    <main id="pitch-main">
      <section className="pitch-section pitch-hero" aria-labelledby="pitch-title">
        <div className="pitch-hero-copy">
          <p className="pitch-print-only pitch-print-brand">工业设计前瞻站</p>
          <p className="pitch-kicker"><span className="pitch-status-dot" /> 跨学院共研计划 · 讨论稿 / 2026.09</p>
          <h1 id="pitch-title">把行业变化，<br />变成下一步<br /><em>设计行动。</em></h1>
          <p className="pitch-intro">一个从工业设计出发的前瞻研究系统。<br />连接行业证据、专业判断与小规模验证，让不同学院的同学围绕真实问题共同研究。</p>
          <div className="pitch-actions"><a className="pitch-button solid" href="#case">用一个案例看懂 <ArrowRight size={16} /></a><a className="pitch-button" href="#ask">希望老师支持什么 <ArrowDown size={15} /></a></div>
          <p className="pitch-caption">已有可运行研究原型 · 邀请共同验证 · 项目负责人保留最终审核</p>
        </div>
        <div className="pitch-instrument" aria-label="从行业证据到跨学院研究行动的概念图">
          <div className="pitch-instrument-head"><span>RESEARCH RADAR</span><span>概念示意 / 非实时数据</span></div>
          <div className="pitch-orbit"><div className="pitch-orbit-ring ring-one" /><div className="pitch-orbit-ring ring-two" /><div className="pitch-orbit-ring ring-three" /><div className="pitch-orbit-line line-horizontal" /><div className="pitch-orbit-line line-vertical" /><div className="pitch-orbit-core"><Radar size={29} /><strong>设计行动</strong><small>共同验证</small></div><span className="pitch-orbit-label orbit-top">技术与工具</span><span className="pitch-orbit-label orbit-right">产业与市场</span><span className="pitch-orbit-label orbit-bottom">社会与规则</span><span className="pitch-orbit-label orbit-left">教育与能力</span><i className="pitch-blip blip-one" /><i className="pitch-blip blip-two" /><i className="pitch-blip blip-three" /><div className="pitch-signal-note"><span>候选研究方向</span><strong>可维修产品设计</strong><small>来源 → 评估 → 需求 → 验证</small></div></div>
          <div className="pitch-instrument-foot"><span><i /> 证据先于结论</span><span>保留反证与退出条件</span></div>
        </div>
        <div className="pitch-hero-bottom"><p>这次希望获得的支持</p><strong>一次跨学院引荐，启动一轮有边界的共同研究。</strong><span>建议 6 周 / 5–8 人 / 1 个选题</span></div>
      </section>

      <section id="method" className="pitch-section">
        <SectionHeading index="01" eyebrow="WHY THIS PROJECT" title="学生需要的，是从信息到判断的能力。" text="项目要回答一个具体问题：面对行业变化，我们凭什么选择研究方向、学习技能和投入一项设计？" />
        <div className="pitch-three">
          <article className="pitch-value"><Layers3 /><h3>把分散资料连起来</h3><p>围绕同一个研究问题保留来源、时间、适用范围与证据立场，减少资料与结论脱节。</p></article>
          <article className="pitch-value"><ShieldCheck /><h3>把判断过程留下来</h3><p>区分事实、假设与反证；AI 协助整理，人工决定采用什么、为何修改判断。</p></article>
          <article className="pitch-value"><Microscope /><h3>把研究推进到验证</h3><p>让专业分工落实为可验收的贡献：数据检查、AI 评估、需求访谈与设计机会卡。</p></article>
        </div>
        <div className="pitch-flow" aria-label="研究工作流程">{["来源采集", "AI 辅助整理", "人工审核", "证据与假设", "技能 / 机会行动"].map((label, index) => <div key={label}><span>0{index + 1}</span><strong>{label}</strong>{index < 4 ? <ArrowRight size={15} /> : <Check size={15} />}</div>)}</div>
        <div className="pitch-foundation"><div><p className="pitch-kicker">已有原型基础</p><h3>系统已经有骨架，下一步需要专业内容。</h3></div><ul><li>来源管理、定时采集与运行记录</li><li>AI 整理、待审核箱与证据关联</li><li>行业雷达、假设、技能与机会记录</li><li>修订历史、导出与每周研究面板</li></ul></div>
        <p className="pitch-footnote">当前定位：单所有者研究原型。代码已具备上述模块；接口在线运行依赖相应配置。多人账号、团队权限和持续研究成效仍待后续验证。</p>
      </section>

      <section id="case" className="pitch-section pitch-case-section">
        <SectionHeading index="02" eyebrow="A SHARED RESEARCH QUESTION" title="一条规则，怎样变成跨学院的共同课题？" text="以“可维修产品设计”为例，体验从来源到行动的判断过程。官方背景可核验；研究问题、反证线索和任务均为演示提案。" />
        <div className="pitch-case-interactive">
          <div className="pitch-steps" role="group" aria-label="案例步骤">{steps.map((item, index) => <button key={item.label} type="button" aria-pressed={step === index} aria-controls="case-detail" onClick={() => setStep(index)}><span>0{index + 1}</span>{item.label}<ChevronRight size={16} /></button>)}</div>
          <article id="case-detail" className="pitch-case-card" aria-live="polite">
            <div className="pitch-case-tag"><span>{current.tag}</span><small>0{step + 1} / 04</small></div><h3>{current.title}</h3><p>{current.body}</p>
            <dl>{current.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <div className="pitch-evidence-limit"><ShieldCheck size={17} /><p>{current.note}</p></div>
            <div className="pitch-case-controls"><a href={sourceUrl} target="_blank" rel="noreferrer">查看官方原文 <ArrowUpRight size={13} /></a><div><button type="button" aria-label="上一步" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={17} /></button><button type="button" aria-label="下一步" disabled={step === 3} onClick={() => setStep(step + 1)}><ChevronRight size={17} /></button></div></div>
          </article>
          <div className="pitch-review"><div><strong>现在，证据足够支持哪一步？</strong><p>试着做一次审核，看看系统倡导的判断边界。</p></div><div className="pitch-review-options"><button type="button" aria-pressed={decision === "research"} onClick={() => setDecision("research")}>继续研究与验证</button><button type="button" aria-pressed={decision === "act"} onClick={() => setDecision("act")}>认定市场机会成立</button></div><p className="pitch-review-result" role="status">{decision === "research" ? "合理的下一步：保留为研究方向，分配 AI 评估、需求和成本验证任务。" : decision === "act" ? "证据还不够：规则背景不能证明需求、成本或制造可行性。先补齐专业验证。" : "此处为教学互动；选择只在当前页面生效。"}</p></div>
        </div>
        <div className="pitch-print-only pitch-print-case">{steps.map((item, index) => <article key={item.label}><span>0{index + 1} / {item.tag}</span><h3>{item.label}</h3><p>{item.body}</p><small>{item.note}</small></article>)}</div>
        <p className="pitch-footnote">来源：欧盟委员会 ESPR 官方说明，查阅于 2026-09-14。该框架需结合具体产品规则解读；本案例不构成合规判定，也不推导特定地区的市场需求。</p>
      </section>

      <section id="team" className="pitch-section">
        <SectionHeading index="03" eyebrow="DIFFERENT EXPERTISE / ONE QUESTION" title="每个学院，都有不可替代的一段。" text="建议首轮 5–8 人，设计牵头。按技能匹配角色，学院名称和实际人数由老师与参与者确认。" />
        <div className="pitch-role-grid">{roles.map((item, index) => <button type="button" key={item.id} aria-pressed={role === index} aria-controls="role-detail" onClick={() => setRole(index)}><span>0{index + 1} / {item.count}</span><h3>{item.area}</h3><strong>{item.question}</strong><p>{item.task}</p><ArrowUpRight size={19} /></button>)}</div>
        <article id="role-detail" className="pitch-role-detail" aria-live="polite"><div><p className="pitch-kicker">第一项可认领任务 / {roles[role].area}</p><h3>{roles[role].first}</h3><span>适合：{roles[role].skills}</span></div><dl><div><dt>交付什么</dt><dd>{roles[role].output}</dd></div><div><dt>同学获得什么</dt><dd>{roles[role].gain}</dd></div></dl></article>
        <div className="pitch-print-only pitch-print-role-list">{roles.map(item => <p key={item.id}><strong>{item.area}：</strong>{item.output}。收获：{item.gain}。</p>)}</div>
        <div className="pitch-team-note"><FileCheck2 size={22} /><p><strong>让每个人的工作可以被看见。</strong>建议以任务负责人、证据记录与贡献日志归档成果；署名、公开范围和课程认定在启动时约定。试点先用协作模板提交，由项目负责人审核入库。</p></div>
      </section>

      <section id="pilot" className="pitch-section">
        <SectionHeading index="04" eyebrow="A SMALL, REVIEWABLE PILOT" title="先用六周，证明值得继续。" text="以下为启动建议：每人每周约 2–3 小时；围绕一个问题完成一轮闭环，最后根据证据决定是否扩大。" />
        <div className="pitch-timeline">{milestones.map(item => <article key={item.week}><span>W{item.week}</span><h3>{item.title}</h3><p>{item.text}</p><strong>{item.result}</strong></article>)}</div>
        <div className="pitch-deliverables"><div><p className="pitch-kicker">建议验收目标</p><h3>交付一份可复核的研究成果。</h3><p>建议形成 12–20 条去重后的证据记录、2 张候选机会卡，以及至少 1 次有记录的验证。数量用于控制试点规模，不作为已取得的成果。</p></div><ul><li><Check size={16} /> 核心判断能回到原始来源</li><li><Check size={16} /> 关键假设包含反证与失效条件</li><li><Check size={16} /> 实验保留方法、结果与样本限制</li><li><Check size={16} /> 每位同学有可识别的贡献与交付</li></ul></div>
        <div className="pitch-stop"><span>阶段出口</span><p>第 2 周若问题仍过宽，收缩到单一任务；第 6 周若证据或协作投入不足，归档经验并暂停扩招。负结果也作为研究成果保留。</p></div>
      </section>

      <section id="ask" className="pitch-section pitch-ask-section">
        <SectionHeading index="05" eyebrow="THE ASK" title="请老师帮忙，把第一组人连接起来。" text="本次优先申请协调支持。先约定一个小规模试点，再根据实际选题讨论材料、实验条件与后续资源。" />
        <div className="pitch-asks"><article><span>01</span><h3>引荐 2–3 个相关方向</h3><p>联系计算机、人工智能、经管三个方向的老师或同学，邀请有兴趣的参与者。</p></article><article><span>02</span><h3>协调一次 30 分钟碰头</h3><p>共同确认选题、角色、时间投入，以及首周可以完成的小任务。</p></article><article><span>03</span><h3>参与两次阶段评议</h3><p>建议第 2 周校准研究问题，第 6 周评审成果；具体安排以老师时间为准。</p></article></div>
        <blockquote>希望老师支持的，是一次让不同专业围绕同一份证据，<br className="pitch-desktop-break" />共同完成研究与验证的机会。</blockquote>
        <div className="pitch-ask-footer"><p><strong>项目负责人承担：</strong>整体组织、模板维护、版本管理与最终审核。<br /><strong>启动时共同确认：</strong>选题、成员、实验条件、署名和成果公开范围。</p><div className="pitch-actions"><a className="pitch-button solid" href="/teacher-brief.md" download><Download size={16} /> 下载共研方案</a><button className="pitch-button" type="button" onClick={() => window.print()}><Printer size={16} /> 打印 / 保存 PDF</button></div></div>
      </section>

      <section id="questions" className="pitch-section pitch-questions">
        <SectionHeading index="06" eyebrow="QUESTIONS WORTH ASKING" title="把值得追问的地方，先说清楚。" text="一个可信的邀请，也需要明确研究边界与当前阶段。" />
        <div className="pitch-faq-grid"><article><h3>和普通信息汇总有什么区别？</h3><p>把资料关联到具体假设、反方证据和行动条件，并保留修改理由。价值需要用试点中的决策记录来检验。</p></article><article><h3>一定要相信“2029 危机”吗？</h3><p>不需要。2029 与危机后 6–12 个月是原项目保留的可证伪情景；团队可以比较多种情景，研究价值来自持续修正。</p></article><article><h3>AI 做什么，人做什么？</h3><p>AI 辅助摘要、分类与关联建议；同学检查原文、反证和专业约束，项目负责人审核，不自动发布正式判断。</p></article><article><h3>现在能直接多人协作吗？</h3><p>当前系统是单所有者版本。首轮采用模板提交与集中审核；多人账号和细分权限属于后续建设项。</p></article><article><h3>能保证论文、竞赛或学分吗？</h3><p>不能预先承诺。先形成可追溯的研究过程与成果，再由相关老师按课程或项目要求判断适用路径。</p></article><article><h3>已经证明有效了吗？</h3><p>目前具备软件原型与展示案例。尚无跨学院试点成效、用户增长或商业收入数据；首轮共研就是验证这一层价值。</p></article></div>
        <div className="pitch-sources"><strong>资料与核验</strong><p><a href={sourceUrl} target="_blank" rel="noreferrer">[1] 欧盟委员会 · ESPR 官方说明 <ArrowUpRight size={12} /></a><span>规则背景与适用边界，非需求证明。</span></p><p><a href="https://www.bls.gov/ooh/arts-and-design/industrial-designers.htm" target="_blank" rel="noreferrer">[2] 美国 BLS · Industrial Designers <ArrowUpRight size={12} /></a><span>职业职责涉及设计、工程与商业协作；不能直接外推中国就业。</span></p><small>公开来源查阅：2026-09-14。功能说明以本项目代码为依据；试点规模、人员与成果数量均为建议。</small></div>
        <footer className="pitch-footer"><span>工业设计前瞻站 / 跨学院共研计划</span><Link href="/">进入私有研究工作台 <ArrowUpRight size={13} /></Link><a href="#pitch-main">返回顶部 ↑</a></footer>
      </section>
    </main>
  </div>;
}
