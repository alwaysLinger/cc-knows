# 通过 MCP 执行代码：构建更高效的智能体

发布于 2025年11月4日

直接工具调用会为每个定义和结果消耗上下文。智能体通过编写代码来调用工具可以更好地扩展。以下是它如何与 MCP 配合工作的原理。

[模型上下文协议（MCP）](https://modelcontextprotocol.io/)是连接 AI 智能体与外部系统的开放标准。传统上，将智能体连接到工具和数据需要为每对组合开发自定义集成，这造成了碎片化和重复工作，使得真正互联的系统难以扩展。MCP 提供了一种通用协议——开发者只需在智能体中实现一次 MCP，即可解锁整个集成生态系统。

自 2024 年 11 月发布 MCP 以来，采用速度非常快：社区已构建了数千个 [MCP 服务器](https://github.com/modelcontextprotocol/servers)，所有主流编程语言都有可用的 [SDK](https://modelcontextprotocol.io/docs/sdk)，业界已将 MCP 作为连接智能体与工具和数据的事实标准。

如今，开发者通常构建能够访问数十个 MCP 服务器上数百甚至数千个工具的智能体。然而，随着连接工具数量的增长，预先加载所有工具定义以及将中间结果传入上下文窗口会拖慢智能体并增加成本。

在这篇博客中，我们将探讨代码执行（code execution）如何使智能体更高效地与 MCP 服务器交互，在处理更多工具的同时使用更少的 token。

## 过多的工具消耗使智能体效率降低

随着 MCP 使用的扩展，有两种常见模式会增加智能体的成本和延迟：

1. 工具定义过载上下文窗口；
2. 中间工具结果消耗额外的 token。

### 1. 工具定义过载上下文窗口

大多数 MCP 客户端预先将所有工具定义直接加载到上下文中，使用直接工具调用语法将它们暴露给模型。这些工具定义可能如下所示：

```
gdrive.getDocument
     Description: Retrieves a document from Google Drive
     Parameters:
                documentId (required, string): The ID of the document to retrieve
                fields (optional, string): Specific fields to return
     Returns: Document object with title, body content, metadata, permissions, etc.
```

```
salesforce.updateRecord
    Description: Updates a record in Salesforce
    Parameters:
               objectType (required, string): Type of Salesforce object (Lead, Contact, Account, etc.)
               recordId (required, string): The ID of the record to update
               data (required, object): Fields to update with their new values
     Returns: Updated record object with confirmation
```

工具描述占用更多上下文窗口空间，增加了响应时间和成本。在智能体连接数千个工具的情况下，它们在读取请求之前就需要处理数十万 token。

### 2. 中间工具结果消耗额外的 token

大多数 MCP 客户端允许模型直接调用 MCP 工具。例如，你可能会问智能体："从 Google Drive 下载我的会议记录并将其附加到 Salesforce 线索上。"

模型会进行如下调用：

```
TOOL CALL: gdrive.getDocument(documentId: "abc123")
        → returns "Discussed Q4 goals...\n[full transcript text]"
           (loaded into model context)

TOOL CALL: salesforce.updateRecord(
            objectType: "SalesMeeting",
            recordId: "00Q5f000001abcXYZ",
            data: { "Notes": "Discussed Q4 goals...\n[full transcript text written out]" }
        )
        (model needs to write entire transcript into context again)
```

每个中间结果都必须流经模型。在这个例子中，完整的通话记录流经了两次。对于一场2小时的销售会议，这可能意味着额外处理 50,000 个 token。更大的文档甚至可能超出上下文窗口限制，导致工作流中断。

在处理大型文档或复杂数据结构时，模型在工具调用之间复制数据时更容易出错。

![MCP 客户端如何与 MCP 服务器和 LLM 协作的示意图。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F9ecf165020005c09a22a9472cee6309555485619-1920x1080.png&w=3840&q=75)

MCP 客户端将工具定义加载到模型的上下文窗口中，并编排一个消息循环，其中每个工具调用和结果在操作之间流经模型。

## 通过 MCP 执行代码提升上下文效率

随着代码执行环境在智能体中变得越来越普遍，一种解决方案是将 MCP 服务器呈现为代码 API 而非直接工具调用。然后智能体可以编写代码来与 MCP 服务器交互。这种方法同时解决了两个挑战：智能体可以只加载需要的工具，并在执行环境中处理数据，然后再将结果返回给模型。

有多种实现方式。一种方法是从已连接的 MCP 服务器生成所有可用工具的文件树。以下是使用 TypeScript 的实现：

```
servers
├── google-drive
│   ├── getDocument.ts
│   ├── ... (other tools)
│   └── index.ts
├── salesforce
│   ├── updateRecord.ts
│   ├── ... (other tools)
│   └── index.ts
└── ... (other servers)
```

然后每个工具对应一个文件，类似于：

```typescript
// ./servers/google-drive/getDocument.ts
import { callMCPTool } from "../../../client.js";

interface GetDocumentInput {
  documentId: string;
}

interface GetDocumentResponse {
  content: string;
}

/* Read a document from Google Drive */
export async function getDocument(input: GetDocumentInput): Promise<GetDocumentResponse> {
  return callMCPTool<GetDocumentResponse>('google_drive__get_document', input);
}
```

我们上面 Google Drive 到 Salesforce 的示例就变成了以下代码：

```typescript
// Read transcript from Google Docs and add to Salesforce prospect
import * as gdrive from './servers/google-drive';
import * as salesforce from './servers/salesforce';

const transcript = (await gdrive.getDocument({ documentId: 'abc123' })).content;
await salesforce.updateRecord({
  objectType: 'SalesMeeting',
  recordId: '00Q5f000001abcXYZ',
  data: { Notes: transcript }
});
```

智能体通过浏览文件系统来发现工具：列出 `./servers/` 目录以找到可用的服务器（如 `google-drive` 和 `salesforce`），然后读取它需要的特定工具文件（如 `getDocument.ts` 和 `updateRecord.ts`）来了解每个工具的接口。这让智能体只加载当前任务所需的定义。这将 token 用量从 150,000 减少到 2,000——节省了 98.7% 的时间和成本。

Cloudflare [发表了类似的发现](https://blog.cloudflare.com/code-mode/)，将代码执行与 MCP 称为"代码模式（Code Mode）"。核心洞见是相同的：LLM 擅长编写代码，开发者应该利用这一优势来构建更高效地与 MCP 服务器交互的智能体。

## 通过 MCP 执行代码的优势

代码执行与 MCP 使智能体能够更高效地使用上下文：按需加载工具、在数据到达模型之前进行过滤，以及在单个步骤中执行复杂逻辑。使用这种方法还有安全性和状态管理方面的优势。

### 渐进式披露（Progressive Disclosure）

模型非常擅长导航文件系统。将工具呈现为文件系统上的代码，允许模型按需读取工具定义，而不是预先读取所有定义。

另一种方式是，可以在服务器上添加 `search_tools` 工具来查找相关定义。例如，当使用上面假设的 Salesforce 服务器时，智能体搜索"salesforce"并只加载当前任务所需的工具。在 `search_tools` 工具中包含一个详细级别参数，允许智能体选择所需的详细程度（如仅名称、名称和描述、或带有 schema 的完整定义），也有助于智能体节省上下文并高效地找到工具。

### 上下文高效的工具结果

处理大型数据集时，智能体可以在代码中过滤和转换结果后再返回。考虑获取一个 10,000 行的电子表格：

```typescript
// Without code execution - all rows flow through context
TOOL CALL: gdrive.getSheet(sheetId: 'abc123')
        → returns 10,000 rows in context to filter manually

// With code execution - filter in the execution environment
const allRows = await gdrive.getSheet({ sheetId: 'abc123' });
const pendingOrders = allRows.filter(row =>
  row["Status"] === 'pending'
);
console.log(`Found ${pendingOrders.length} pending orders`);
console.log(pendingOrders.slice(0, 5)); // Only log first 5 for review
```

智能体看到 5 行而不是 10,000 行。类似的模式也适用于聚合、跨多个数据源的连接、或提取特定字段——所有这些都不会使上下文窗口膨胀。

#### 更强大且上下文高效的控制流

循环、条件判断和错误处理可以用熟悉的代码模式完成，而无需链接单个工具调用。例如，如果你需要在 Slack 中等待部署通知，智能体可以编写：

```typescript
let found = false;
while (!found) {
  const messages = await slack.getChannelHistory({ channel: 'C123456' });
  found = messages.some(m => m.text.includes('deployment complete'));
  if (!found) await new Promise(r => setTimeout(r, 5000));
}
console.log('Deployment notification received');
```

这种方法比在智能体循环中交替发送 MCP 工具调用和休眠命令更高效。

此外，能够写出并执行条件树还节省了"首 token 时间（time to first token）"延迟：无需等待模型评估 if 语句，智能体可以让代码执行环境来完成这一工作。

### 隐私保护操作

当智能体使用代码执行与 MCP 交互时，中间结果默认留在执行环境中。这样，智能体只能看到你显式记录或返回的内容，意味着你不希望与模型共享的数据可以在工作流中流转，而永远不会进入模型的上下文。

对于更敏感的工作负载，智能体工具套件可以自动对敏感数据进行令牌化（tokenization）。例如，假设你需要将电子表格中的客户联系信息导入 Salesforce。智能体编写：

```typescript
const sheet = await gdrive.getSheet({ sheetId: 'abc123' });
for (const row of sheet.rows) {
  await salesforce.updateRecord({
    objectType: 'Lead',
    recordId: row.salesforceId,
    data: {
      Email: row.email,
      Phone: row.phone,
      Name: row.name
    }
  });
}
console.log(`Updated ${sheet.rows.length} leads`);
```

MCP 客户端拦截数据并在其到达模型之前对 PII（个人身份信息）进行令牌化：

```typescript
// What the agent would see, if it logged the sheet.rows:
[
  { salesforceId: '00Q...', email: '[EMAIL_1]', phone: '[PHONE_1]', name: '[NAME_1]' },
  { salesforceId: '00Q...', email: '[EMAIL_2]', phone: '[PHONE_2]', name: '[NAME_2]' },
  ...
]
```

然后，当数据在另一个 MCP 工具调用中共享时，通过在 MCP 客户端中查找来反向令牌化。真实的电子邮件地址、电话号码和姓名从 Google Sheets 流向 Salesforce，但从不经过模型。这防止了智能体意外记录或处理敏感数据。你还可以利用这一点来定义确定性的安全规则，选择数据可以从哪里流向哪里。

### 状态持久化与技能（Skills）

代码执行配合文件系统访问，允许智能体跨操作维护状态。智能体可以将中间结果写入文件，使其能够恢复工作并跟踪进度：

```typescript
const leads = await salesforce.query({
  query: 'SELECT Id, Email FROM Lead LIMIT 1000'
});
const csvData = leads.map(l => `${l.Id},${l.Email}`).join('\n');
await fs.writeFile('./workspace/leads.csv', csvData);

// Later execution picks up where it left off
const saved = await fs.readFile('./workspace/leads.csv', 'utf-8');
```

智能体还可以将自身代码持久化为可复用函数。一旦智能体为某个任务开发了可用的代码，它可以保存该实现以供将来使用：

```typescript
// In ./skills/save-sheet-as-csv.ts
import * as gdrive from './servers/google-drive';
export async function saveSheetAsCsv(sheetId: string) {
  const data = await gdrive.getSheet({ sheetId });
  const csv = data.map(row => row.join(',')).join('\n');
  await fs.writeFile(`./workspace/sheet-${sheetId}.csv`, csv);
  return `./workspace/sheet-${sheetId}.csv`;
}

// Later, in any agent execution:
import { saveSheetAsCsv } from './skills/save-sheet-as-csv';
const csvPath = await saveSheetAsCsv('abc123');
```

这与[技能（Skills）](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)的概念紧密相关——技能是可复用的指令、脚本和资源文件夹，供模型在专门任务上提升性能。向这些保存的函数添加 SKILL.md 文件可以创建结构化的技能，供模型参考和使用。随着时间的推移，这允许你的智能体构建高阶能力的工具箱，不断进化其高效工作所需的脚手架。

需要注意的是，代码执行也引入了自身的复杂性。运行智能体生成的代码需要一个安全的执行环境，包括适当的[沙箱（sandboxing）](https://www.anthropic.com/engineering/claude-code-sandboxing)、资源限制和监控。这些基础设施要求增加了运维开销和安全考量，而直接工具调用则无需这些。代码执行的好处——降低 token 成本、减少延迟、改善工具组合——应与这些实现成本进行权衡。

## 总结

MCP 为智能体连接众多工具和系统提供了基础协议。然而，一旦连接了过多的服务器，工具定义和结果可能会消耗过多的 token，降低智能体效率。

虽然这里的许多问题感觉上是新出现的——上下文管理、工具组合、状态持久化——但它们在软件工程中都有已知的解决方案。代码执行将这些成熟的模式应用于智能体，让它们使用熟悉的编程结构与 MCP 服务器更高效地交互。如果你实现了这种方法，我们鼓励你与 [MCP 社区](https://modelcontextprotocol.io/community/communication)分享你的发现。

### 致谢

_本文由 Adam Jones 和 Conor Kelly 撰写。感谢 Jeremy Fox、Jerome Swannack、Stuart Ritchie、Molly Vorwerck、Matt Samuels 和 Maggie Vo 对本文初稿的反馈。_
