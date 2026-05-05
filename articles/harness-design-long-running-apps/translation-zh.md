# 长时运行应用开发中的 Harness 设计

发布于 2026 年 3 月 24 日

Harness（测试框架/脚手架）设计是智能体编码前沿性能的关键。以下是我们如何推动 Claude 在前端设计和长时运行自主软件工程中走得更远。

_作者：Prithvi Rajasekaran，[Labs](https://www.anthropic.com/news/introducing-anthropic-labs) 团队成员。_

过去几个月，我一直在研究两个相互关联的问题：让 Claude 产出高质量的前端设计，以及让它在无人干预的情况下构建完整应用。这项工作源于早期在[前端设计技能](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)和[长时运行编码智能体 harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) 上的努力——我和同事们通过提示工程和 harness 设计将 Claude 的性能显著提升至基线之上——但两者最终都触及了天花板。

为了突破，我寻求了跨越两个截然不同领域的新型 AI 工程方法：一个由主观品味定义，另一个由可验证的正确性和可用性定义。受[生成对抗网络](https://en.wikipedia.org/wiki/Generative_adversarial_network)（Generative Adversarial Networks，GAN）启发，我设计了一个包含**生成器**（generator）和**评估器**（evaluator）智能体的多智能体结构。构建一个能可靠评分——且有品位——的评估器，意味着首先要开发一套标准，将"这个设计好不好？"这类主观判断转化为具体的、可评分的条款。

随后，我将这些技术应用于长时运行自主编码，延续了早期 harness 工作的两个经验：将构建分解为可管理的块，以及使用结构化工件（artifacts）在会话间传递上下文。最终结果是一个三智能体架构——规划器、生成器和评估器——能在长达数小时的自主编码会话中产出丰富的全栈应用。

## 朴素实现为何不足

我们此前已表明，harness 设计对长时运行智能体编码的有效性有重大影响。在早期的[实验](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)中，我们使用初始化智能体将产品规格分解为任务列表，编码智能体逐一实现功能，然后通过交接工件在会话间传递上下文。更广泛的开发者社区也得出了类似洞察，例如"[Ralph Wiggum](https://ghuntley.com/ralph/)"方法使用钩子或脚本让智能体保持持续迭代循环。

但一些问题仍然持续存在。对于更复杂的任务，智能体随时间推移仍容易偏离正轨。在分解这个问题时，我们观察到执行此类任务的智能体有两个常见失败模式。

第一个是模型在冗长任务中随上下文窗口填满而逐渐丧失连贯性（参见我们关于[上下文工程](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)的文章）。一些模型还表现出"上下文焦虑"（context anxiety），即当接近它们认为的上下文限制时，开始过早收尾工作。上下文重置——完全清除上下文窗口并启动新智能体，结合结构化交接传递前一个智能体的状态和下一步——解决了这两个问题。

这与压缩（compaction）不同。压缩是将对话早期部分就地摘要，使同一智能体能在缩短的历史上继续工作。压缩虽保留了连续性，但不给智能体一个干净起点，这意味着上下文焦虑仍可能持续。重置提供干净起点，代价是交接工件必须有足够状态让下一个智能体顺利接手。在早期测试中，我们发现 Claude Sonnet 4.5 表现出强烈的上下文焦虑，仅靠压缩不足以实现良好的长任务性能，因此上下文重置成为 harness 设计的必要组成部分。这解决了核心问题，但增加了每次 harness 运行的编排复杂度、token 开销和延迟。

第二个问题是我们之前未涉及的：自我评估。当被要求评估自己产出的工作时，智能体倾向于自信地赞美——即使对人类观察者来说质量明显平庸。这个问题在设计等主观任务中尤为突出，因为不存在相当于可验证软件测试的二元检查。布局是否精致还是平庸是一个判断题，而智能体在给自己的工作打分时可靠地偏向正面。

然而，即使在有可验证结果的任务上，智能体有时仍表现出阻碍其完成任务的糟糕判断。将做工作的智能体与评判工作的智能体分离，是解决此问题的有力杠杆。分离本身并不立即消除宽容倾向；评估器仍是一个倾向于对 LLM 生成输出慷慨的 LLM。但调优一个独立的评估器使其持怀疑态度，远比让生成器批判自身工作更可行，而一旦外部反馈存在，生成器就有了可具体迭代的目标。

## 前端设计：让主观质量可评分

我首先在前端设计上进行实验，那里自我评估问题最为明显。在没有任何干预的情况下，Claude 通常倾向于安全、可预测的布局——技术功能上可行但视觉上平平无奇。

两个洞察塑造了我为前端设计构建的 harness。第一，虽然美学不能完全简化为分数——个人品味总有差异——但可以通过编码设计原则和偏好的评分标准来改进。"这个设计美不美？"难以一致地回答，但"这是否遵循了我们的好设计原则？"给了 Claude 可具体评分的依据。第二，通过将前端生成与前端评分分离，我们可以创建驱动生成器产出更强输出的反馈循环。

基于此，我编写了四项评分标准，并同时放入生成器和评估器智能体的提示中：

- **设计质量**：设计是否像一个整体而非零件集合？此处的优秀表现意味着色彩、排版、布局、图像和其他细节组合创造了独特的氛围和身份。
- **原创性**：是否有定制决策的证据，还是模板布局、库默认值和 AI 生成模式？人类设计师应能识别出深思熟虑的创意选择。未经修改的库存组件——或 AI 生成的标志如白色卡片上的紫色渐变——在此项不合格。
- **工艺**：技术执行：排版层次、间距一致性、色彩和谐、对比度。这是能力检查而非创意检查。大多数合理实现默认表现良好；不合格意味着基础功破损。
- **功能性**：独立于美学的可用性。用户能否理解界面功能、找到主要操作、无需猜测地完成任务？

我强调了设计质量和原创性，而非工艺和功能性。Claude 默认在工艺和功能性上已表现良好，所需的技术能力往往自然具备。但在设计和原创性上，Claude 常产出平淡无奇的结果。评分标准明确惩罚高度通用的"AI 劣质输出"（AI slop）模式，通过加重设计和原创性的权重推动模型向更多美学冒险的方向发展。

我使用带有详细评分分解的少样本（few-shot）示例校准评估器。这确保了评估器的判断与我的偏好对齐，并减少了跨迭代的分数漂移。

我在 [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) 上构建了循环，这使编排变得直观。生成器智能体首先根据用户提示创建 HTML/CSS/JS 前端。我给评估器提供了 Playwright MCP，使其可以在评分每项标准并撰写详细评论之前直接与实时页面交互。实践中，评估器会自行导航页面，截图并仔细研究实现后再产出评估。反馈回流至生成器作为下一轮迭代的输入。我每次生成运行 5 到 15 轮迭代，每轮迭代通常推动生成器朝更有特色的方向发展，因为它在响应评估器的评论。由于评估器主动导航页面而非对静态截图评分，每个周期需要真实的挂钟时间。完整运行可长达 4 小时。我还指示生成器在每次评估后做战略决策：如果分数趋势良好则精炼当前方向，如果方法不奏效则转向完全不同的美学。

跨多次运行，评估器的评估在迭代中改善后趋于平台期，仍有提升空间。有些生成增量精炼，有些在迭代间出现剧烈的美学转向。

评分标准的措辞以我未完全预料的方式引导了生成器。包含"最佳设计应达到博物馆水准"之类的短语推动设计走向特定的视觉收敛，表明与标准关联的提示语直接塑造了输出的特征。

虽然分数通常随迭代提高，但模式并非总是整洁线性的。后期实现整体倾向于更好，但我经常发现更喜欢中间迭代而非最后一个。实现复杂度也倾向于跨轮次增加，生成器在响应评估器反馈时追求更雄心勃勃的解决方案。即便在第一次迭代中，输出也明显优于完全没有提示的基线，表明评分标准及关联语言本身就引导模型远离了通用默认值，然后评估器反馈才带来进一步精炼。

在一个引人注目的例子中，我提示模型为一家荷兰艺术博物馆创建网站。到第九次迭代时，它产出了一个干净、暗色主题的虚构博物馆着陆页。页面视觉精致但基本符合我的预期。然后，在第十个周期，它完全放弃了该方法，将网站重新想象为空间体验：一个用 CSS 透视渲染的棋盘地板 3D 房间，画作以自由形式挂在墙上，画廊房间之间通过门洞导航而非滚动或点击。这是我在单次生成中从未见过的创造性飞跃。

## 扩展至全栈编码

带着这些发现，我将这种受 GAN 启发的模式应用于全栈开发。生成器-评估器循环自然映射到软件开发生命周期，其中代码审查和 QA 承担与设计评估器相同的结构性角色。

### 架构

在我们早期的[长时运行 harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) 中，我们通过初始化智能体、逐一实现功能的编码智能体和会话间上下文重置解决了多会话连贯编码问题。上下文重置是关键解锁：harness 使用 Sonnet 4.5，该模型表现出前述的"上下文焦虑"倾向。创建一个在上下文重置间良好运作的 harness 是保持模型在任务上的关键。Opus 4.5 在很大程度上自行消除了该行为，因此我能够从此 harness 中完全移除上下文重置。智能体作为一次连续会话运行整个构建过程，由 [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) 的自动压缩处理上下文增长。

在这项工作中，我在原始 harness 基础上构建了三智能体系统，每个智能体解决我在先前运行中观察到的特定差距。系统包含以下智能体角色：

**规划器（Planner）**：我们之前的长时运行 harness 要求用户预先提供详细规格。我想自动化这一步，因此创建了一个规划器智能体，接收简单的 1-4 句提示并将其扩展为完整产品规格。我提示它在范围上雄心勃勃，聚焦于产品语境和高层技术设计而非详细技术实现。这种强调源于一个担忧：如果规划器试图预先指定粒度过细的技术细节且出错，规格中的错误将级联传导至下游实现。限制智能体在待交付物上并让它们在工作中自行摸索路径似乎更明智。我还要求规划器寻找将 AI 功能编织进产品规格的机会。（参见底部附录中的示例。）

**生成器（Generator）**：早期 harness 中逐一功能的方法在范围管理上效果良好。我在此应用了类似模型，指示生成器以冲刺（sprint）方式工作，每次从规格中选取一个功能。每个冲刺使用 React、Vite、FastAPI 和 SQLite（后来是 PostgreSQL）技术栈实现应用，生成器被指示在每个冲刺结束时自我评估工作后再交接给 QA。它还配备 git 进行版本控制。

**评估器（Evaluator）**：早期 harness 的应用看起来令人印象深刻，但实际使用时仍有真实 bug。为捕获这些问题，评估器使用 Playwright MCP 像用户一样点击运行中的应用，测试 UI 功能、API 端点和数据库状态。然后根据发现的 bug 和一组基于前端实验适配的标准对每个冲刺评分，此处覆盖产品深度、功能性、视觉设计和代码质量。每项标准设硬阈值，任一不达标则冲刺失败，生成器获得关于问题所在的详细反馈。

每个冲刺前，生成器和评估器协商冲刺合约（sprint contract）：在任何代码编写之前就那块工作的"完成"标准达成一致。这之所以存在，是因为产品规格有意保持高层级，我想要一个步骤来弥合用户故事与可测试实现之间的差距。生成器提出它将构建什么以及如何验证成功，评估器审核该提案以确保生成器在构建正确的东西。双方迭代直到达成一致。

通信通过文件处理：一个智能体写文件，另一个智能体读取后在该文件内或通过新文件响应，由前一个智能体再读取。生成器然后根据商定的合约构建，再将工作交接给 QA。这使工作忠实于规格，而不会过早过度指定实现细节。

### 运行 harness

在第一版 harness 中，我使用 Claude Opus 4.5，将用户提示同时运行于完整 harness 和单智能体系统以作比较。我使用 Opus 4.5，因为这是我开始这些实验时最好的编码模型。

我写了以下提示来生成一个复古视频游戏制作器：

> Create a 2D retro game maker with features including a level editor, sprite editor, entity behaviors, and a playable test mode.

下表展示了 harness 类型、运行时长和总费用。

| Harness | 时长 | 费用 |
|---------|------|------|
| 单智能体 | 20 分钟 | $9 |
| 完整 harness | 6 小时 | $200 |

harness 贵了 20 倍以上，但输出质量的差异立竿见影。

我期望一个可以构建关卡及其组成部分（精灵、实体、瓦片布局）然后点击播放来实际游玩的界面。我先打开了单智能体运行的输出，初始应用似乎符合这些预期。

然而，当我点击深入时，问题开始浮现。布局浪费空间，固定高度面板使大部分视口空置。工作流僵化。尝试填充关卡时提示我首先创建精灵和实体，但 UI 中没有任何内容引导我朝那个顺序进行。更重要的是，实际游戏是坏的。我的实体出现在屏幕上，但没有任何输入响应。深入代码发现，实体定义和游戏运行时之间的连接断裂，表面上没有指示问题出在哪里。

评估完单智能体运行后，我将注意力转向 harness 运行。这次运行从相同的一行提示开始，但规划器步骤将提示扩展为跨 10 个冲刺的 16 功能规格。它远超单智能体尝试的范围。除了核心编辑器和播放模式外，规格还要求精灵动画系统、行为模板、音效和音乐、AI 辅助精灵生成器和关卡设计器，以及带可分享链接的游戏导出。我给规划器访问了我们的[前端设计技能](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)，它阅读并用它为应用创建了视觉设计语言作为规格的一部分。对于每个冲刺，生成器和评估器协商一个合约，定义冲刺的具体实现细节和可测试的验证完成的行为。

应用立即显示出比单智能体运行更多的精致和流畅。画布使用了全视口，面板尺寸合理，界面有一致的视觉身份，跟踪了规格中的设计方向。我在单智能体运行中看到的一些笨拙之处确实仍然存在——工作流仍未清楚表明你应在尝试填充关卡之前构建精灵和实体，我不得不通过摸索来发现这一点。这更像是基础模型产品直觉上的差距，而非 harness 设计要解决的问题，尽管它确实暗示了 harness 内的定向迭代可以进一步改善输出质量的地方。

通过各编辑器工作时，新运行相比单智能体的优势变得更加明显。精灵编辑器更丰富、功能更全，工具面板更干净，拾色器更好，缩放控件更易用。

因为我要求规划器在规格中编织 AI 功能，应用还内置了 Claude 集成，让我可以通过提示生成游戏的不同部分。这显著加快了工作流。

最大的差异在播放模式。我实际上能够移动我的实体并游玩游戏。物理有些粗糙——我的角色跳上平台但最终与平台重叠，直觉上感觉不对——但核心功能可以工作，而单智能体运行未能做到。在移动了一会儿后，我确实遇到了 AI 游戏关卡构建的一些限制。有一堵大墙我跳不过去，所以我卡住了。这表明还有一些常识改进和边缘情况可以让 harness 进一步完善应用。

通读日志，评估器显然使实现与规格保持一致。每个冲刺，它逐一检查冲刺合约的测试标准，通过 Playwright 操作运行中的应用，对任何偏离预期行为的问题提交 bug。合约是细粒度的——仅 Sprint 3 就有 27 项标准覆盖关卡编辑器——评估器的发现足够具体，无需额外调查即可采取行动。下表展示了评估器识别的几个问题示例：

| 合约标准 | 评估器发现 |
|---------|-----------|
| 矩形填充工具允许点击拖拽以选中瓦片填充矩形区域 | 失败——工具仅在拖拽起点/终点放置瓦片，而非填充区域。`fillRectangle` 函数存在但未在 mouseUp 上正确触发。 |
| 用户可以选择并删除已放置的实体生成点 | 失败——`LevelEditor.tsx:892` 处的 Delete 键处理器要求 `selection` 和 `selectedEntityId` 同时设置，但点击实体仅设置 `selectedEntityId`。条件应为 `selection \|\| (selectedEntityId && activeLayer === 'entity')`。 |
| 用户可以通过 API 重新排序动画帧 | 失败——`PUT /frames/reorder` 路由定义在 `/{frame_id}` 路由之后。FastAPI 将 'reorder' 匹配为 frame_id 整数并返回 422："unable to parse string as an integer." |

让评估器达到这个水平需要付出努力。开箱即用时，Claude 是一个糟糕的 QA 智能体。在早期运行中，我看着它识别出合理的问题，然后说服自己这些不是大问题并批准了工作。它也倾向于浅层测试而非探测边缘情况，因此更微妙的 bug 常常漏网。调优循环是阅读评估器的日志，找到其判断与我不一致的例子，并更新 QA 提示来解决这些问题。经过几轮这样的开发循环，评估器才以我认为合理的方式评分。即便如此，harness 输出仍显示了模型 QA 能力的局限：小布局问题、某些地方感觉不直观的交互、以及评估器未充分测试的更深嵌套功能中的未发现 bug。显然还有更多验证空间可以通过进一步调优来捕获。但与单智能体运行——应用的核心功能根本无法工作——相比，提升是显而易见的。

### 迭代 harness

第一组 harness 结果令人鼓舞，但也显得笨重、缓慢和昂贵。合乎逻辑的下一步是找到简化 harness 而不降低性能的方法。这部分是常识，部分是一项更一般原则的体现：harness 中的每个组件都编码了一个关于模型无法独自完成某事的假设，这些假设值得压力测试——既因为它们可能不正确，也因为它们可能随模型改进而迅速过时。我们的博客文章[构建有效的智能体](https://www.anthropic.com/research/building-effective-agents)将底层思路框架为"找到尽可能最简单的解决方案，仅在需要时才增加复杂性"，这是任何维护智能体 harness 的人一致看到的模式。

在第一次简化的尝试中，我大幅削减了 harness 并尝试了一些创意新想法，但未能复制原始版本的性能。也很难判断 harness 设计的哪些部分实际上是承载性能的，以及以什么方式。基于那次经验，我转向了更系统的方法，一次移除一个组件并审查其对最终结果的影响。

在我进行这些迭代周期的同时，我们也发布了 Opus 4.6，这为减少 harness 复杂度提供了进一步动机。有充分理由预期 4.6 比 4.5 需要更少的脚手架。根据我们的[发布博客：](https://www.anthropic.com/news/claude-opus-4-6)"[Opus 4.6] 计划更周密，维持智能体任务更久，在更大的代码库中更可靠地运作，并具有更好的代码审查和调试技能来捕获自身错误。"它在长上下文检索方面也有大幅提升。这些都是 harness 一直被构建来补充的能力。

#### 移除冲刺构造

我首先完全移除了冲刺构造。冲刺结构帮助将工作分解为模型可连贯处理的块。鉴于 Opus 4.6 的改进，有充分理由相信模型可以原生处理工作而无需这种分解。

我保留了规划器和评估器，因为各自继续增加明显价值。没有规划器，生成器范围不足：给定原始提示，它会不先规格化工作就开始构建，最终创建的功能丰富的应用不如规划器所做。

移除冲刺构造后，我将评估器改为在运行结束时单次评审而非每个冲刺评分。由于模型能力更强，评估器在某些运行中的承载作用发生了变化，其有用性取决于任务相对于模型可独立可靠完成之处的位置。在 4.5 上，那个边界很近：我们的构建处于生成器可独立做好的边缘，评估器在整个构建中捕获了有意义的问题。在 4.6 上，模型的原始能力增加，边界外推。过去需要评估器检查才能连贯实现的任务现在常在生成器独立处理好的范围内，对于该边界内的任务，评估器成为不必要的开销。但对于构建中仍处于生成器能力边缘的部分，评估器继续提供真实提升。

实际含义是评估器不是固定的"是或否"决策。当任务超出当前模型可靠独立完成的范围时，它值得花费那个成本。

在结构简化的同时，我还添加了提示来改进 harness 如何将 AI 功能构建到每个应用中，具体是让生成器构建一个适当的智能体，可以通过工具驱动应用自身的功能。这需要真正的迭代，因为相关知识足够新近，Claude 的训练数据覆盖薄弱。但经过足够的调优，生成器能正确构建智能体了。

#### 更新 harness 的结果

为测试更新后的 harness，我使用以下提示生成一个数字音频工作站（DAW），一个用于作曲、录制和混音的音乐制作程序：

> Build a fully featured DAW in the browser using the Web Audio API.

运行仍然漫长且昂贵，大约 4 小时和 124 美元的 token 费用。

| 智能体与阶段 | 时长 | 费用 |
|-------------|------|------|
| 规划器 | 4.7 分钟 | $0.46 |
| 构建（第 1 轮） | 2 小时 7 分钟 | $71.08 |
| QA（第 1 轮） | 8.8 分钟 | $3.24 |
| 构建（第 2 轮） | 1 小时 2 分钟 | $36.89 |
| QA（第 2 轮） | 6.8 分钟 | $3.09 |
| 构建（第 3 轮） | 10.9 分钟 | $5.88 |
| QA（第 3 轮） | 9.6 分钟 | $4.06 |
| **V2 Harness 合计** | **3 小时 50 分钟** | **$124.70** |

大部分时间用于构建器，它在没有 Opus 4.5 所需的冲刺分解的情况下连贯运行了超过两小时。

与之前的 harness 一样，规划器将一行提示扩展为完整规格。从日志中我可以看到生成器模型在应用规划和智能体设计方面做得很好，连接了智能体，并在交接给 QA 之前进行了测试。

话虽如此，QA 智能体仍捕获了真实的差距。在其首轮反馈中，它指出：

> 这是一个强应用，具有出色的设计保真度、可靠的 AI 智能体和良好的后端。主要失败点是功能完整性——虽然应用看起来令人印象深刻且 AI 集成运作良好，但几个核心 DAW 功能仅是展示层而缺乏交互深度：音轨无法在时间轴上拖拽/移动，没有乐器 UI 面板（合成器旋钮、鼓垫），也没有可视化效果编辑器（EQ 曲线、压缩器表）。这些不是边缘情况——它们是使 DAW 可用的核心交互，规格明确要求了它们。

在其第二轮反馈中，它再次捕获了几个功能差距：

> 剩余差距：
> - 音频录制仍仅为桩代码（按钮切换但没有麦克风捕获）
> - 音轨边缘拖拽缩放和音轨拆分未实现
> - 效果可视化是数字滑块，不是图形化的（没有 EQ 曲线）

生成器在无人监督时仍容易遗漏细节或将功能留为桩代码，QA 在捕获这些最后一英里问题让生成器修复方面仍增加了价值。

根据提示，我期望一个可以创建旋律、和弦和鼓模式，将它们编排成歌曲，并在此过程中获得集成智能体帮助的程序。最终应用具备功能性音乐制作程序的所有核心部分：在浏览器中运行的排列视图、混音器和传输控制。除此之外，我能够完全通过提示拼出一个短歌曲片段：智能体设置了速度和调性，铺了一条旋律，构建了鼓轨，调整了混音器电平，并添加了混响。歌曲创作的核心原语都存在，智能体可以自主驱动它们，使用工具端到端地创建简单的制作。

## 接下来是什么

随着模型持续改进，我们大致可以预期它们能够工作更长时间，处理更复杂的任务。在某些情况下，这意味着模型周围的脚手架随时间推移重要性降低，开发者可以等待下一个模型看看某些问题自行解决。另一方面，模型越强，开发能实现超出模型基线能力的复杂任务的 harness 空间就越大。

考虑到这一点，这项工作中有几个教训值得传承。始终对构建目标模型进行实验、阅读其在真实问题上的轨迹、并调优其性能以实现期望结果，这是良好的实践。在更复杂的任务上工作时，分解任务并对问题的各个方面应用专门智能体有时还有提升空间。当新模型发布时，重新审视 harness、剥离不再承载性能的组件并添加实现以前不可能的新能力的组件，通常是良好实践。

从这项工作中，我的信念是有趣的 harness 组合空间不会随模型改进而缩小。相反，它会迁移，AI 工程师的有趣工作是持续找到下一个新颖组合。

## 致谢

特别感谢 Mike Krieger、Michael Agaby、Justin Young、Jeremy Hadfield、David Hershey、Julius Tarng、Xiaoyi Zhang、Barry Zhang、Orowa Sidker、Michael Tingley、Ibrahim Madha、Martina Long 和 Canyon Robbins 对此项工作的贡献。

同时感谢 Jake Eaton、Alyssa Leonard 和 Stef Sequeira 帮助塑造此文。

## 附录

规划器智能体生成的示例计划。

```
RetroForge - 2D Retro Game Maker

Overview
RetroForge is a web-based creative studio for designing and building 2D retro-style video games. It combines the nostalgic charm of classic 8-bit and 16-bit game aesthetics with modern, intuitive editing tools—enabling anyone from hobbyist creators to indie developers to bring their game ideas to life without writing traditional code.

The platform provides four integrated creative modules: a tile-based Level Editor for designing game worlds, a pixel-art Sprite Editor for crafting visual assets, a visual Entity Behavior system for defining game logic, and an instant Playable Test Mode for real-time gameplay testing. By weaving AI assistance throughout (powered by Claude), RetroForge accelerates the creative process—helping users generate sprites, design levels, and configure behaviors through natural language interaction.

RetroForge targets creators who love retro gaming aesthetics but want modern conveniences. Whether recreating the platformers, RPGs, or action games of their childhood, or inventing entirely new experiences within retro constraints, users can prototype rapidly, iterate visually, and share their creations with others.

Features
1. Project Dashboard & Management
The Project Dashboard is the home base for all creative work in RetroForge. Users need a clear, organized way to manage their game projects—creating new ones, returning to works-in-progress, and understanding what each project contains at a glance.

User Stories: As a user, I want to:

- Create a new game project with a name and description, so that I can begin designing my game
- See all my existing projects displayed as visual cards showing the project name, last modified date, and a thumbnail preview, so that I can quickly find and continue my work
- Open any project to enter the full game editor workspace, so that I can work on my game
- Delete projects I no longer need, with a confirmation dialog to prevent accidents, so that I can keep my workspace organized
- Duplicate an existing project as a starting point for a new game, so that I can reuse my previous work

Project Data Model: Each project contains:

Project metadata (name, description, created/modified timestamps)
Canvas settings (resolution: e.g., 256x224, 320x240, or 160x144)
Tile size configuration (8x8, 16x16, or 32x32 pixels)
Color palette selection
All associated sprites, tilesets, levels, and entity definitions

...
```
