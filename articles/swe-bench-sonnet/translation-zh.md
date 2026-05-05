# 用 Claude 3.5 Sonnet 刷新 SWE-bench Verified 记录

发布于 2025 年 1 月 6 日

SWE-bench 是一个 AI 评估基准，用于评估模型完成真实软件工程任务的能力。

我们的最新模型——升级版 [Claude 3.5 Sonnet](https://www.anthropic.com/news/3-5-models-and-computer-use) 在软件工程评估 SWE-bench Verified 上取得了 49% 的成绩，超越了此前 45% 的最优模型。这篇文章介绍了我们围绕模型构建的"Agent"（智能体），旨在帮助开发者充分发挥 Claude 3.5 Sonnet 的性能。

[SWE-bench](https://www.swebench.com/) 是一个 AI 评估基准，用于评估模型完成真实软件工程任务的能力。具体而言，它测试模型能否解决来自热门开源 Python 仓库的 GitHub issue。基准中的每个任务都会为 AI 模型提供一个已配置好的 Python 环境和仓库的 checkout（本地工作副本），版本为 issue 修复前的那一刻。然后模型需要理解、修改并测试代码，最终提交其解决方案。

每个解决方案都会与关闭原始 GitHub issue 的 PR（Pull Request）中的真实单元测试进行对比评分。这测试了 AI 模型是否能达到与原始人类 PR 作者相同的功能。

SWE-bench 不仅仅评估孤立的 AI 模型，而是评估整个"Agent"系统。在此语境下，"Agent"指的是 AI 模型与其周围软件脚手架（scaffolding）的组合。脚手架负责生成输入模型的提示词、解析模型输出以执行操作，以及管理交互循环——将模型上一步操作的结果纳入下一步提示词中。即使使用相同的底层 AI 模型，不同脚手架下 Agent 在 SWE-bench 上的表现也可能差异巨大。

大型语言模型（Large Language Model）的编码能力还有许多其他基准，但 SWE-bench 之所以越来越受欢迎，原因如下：

1. 它使用来自真实项目的工程任务，而非竞赛或面试风格的问题；
2. 它尚未饱和——还有很大的提升空间。目前没有模型在 SWE-bench Verified 上突破 50%（尽管升级版 Claude 3.5 Sonnet 在撰写本文时达到了 49%）；
3. 它评估的是整个"Agent"，而非孤立的模型。开源开发者和初创公司已经在优化脚手架以大幅提升同一模型的性能方面取得了巨大成功。

需要注意的是，原始 SWE-bench 数据集包含一些在没有 GitHub issue 之外的额外上下文（例如关于特定错误消息返回值）的情况下无法解决的任务。[SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) 是 SWE-bench 的一个 500 题子集，经过人工审核确保可解，因此提供了编码 Agent 性能最清晰的衡量标准。这就是本文将引用的基准。

## 达到业界最优

### 工具使用 Agent

我们在为升级版 Claude 3.5 Sonnet 创建优化 Agent 脚手架时的设计哲学是：**将尽可能多的控制权交给语言模型本身，并保持脚手架最小化**。该 Agent 包含一个提示词、一个用于执行 bash 命令的 Bash 工具，以及一个用于查看和编辑文件及目录的编辑工具。我们持续采样直到模型判定自己完成，或超出其 200k 上下文长度。这个脚手架允许模型运用自己的判断力来解决问题，而非被硬编码到特定的模式或工作流中。

提示词概述了建议的解题方法，但对于这个任务来说并不算过长或过于详细。模型可以自由选择如何从一个步骤推进到下一个步骤，而不是有严格且离散的转换。如果你对 token 不敏感，显式鼓励模型生成长回复可能会有帮助。

以下代码展示了我们 Agent 脚手架中的提示词：

```
<uploaded_files>
{location}
</uploaded_files>
I've uploaded a python code repository in the directory {location} (not in /tmp/inputs). Consider the following PR description:

<pr_description>
{pr_description}
</pr_description>

Can you help me implement the necessary changes to the repository so that the requirements specified in the <pr_description> are met?
I've already taken care of all changes to any of the test files described in the <pr_description>. This means you DON'T have to modify the testing logic or any of the tests in any way!

Your task is to make the minimal changes to non-tests files in the {location} directory to ensure the <pr_description> is satisfied.

Follow these steps to resolve the issue:
1. As a first step, it might be a good idea to explore the repo to familiarize yourself with its structure.
2. Create a script to reproduce the error and execute it with `python <filename.py>` using the BashTool, to confirm the error
3. Edit the sourcecode of the repo to resolve the issue
4. Rerun your reproduce script and confirm that the error is fixed!
5. Think about edgecases and make sure your fix handles them as well

Your thinking should be thorough and so it's fine if it's very long.
```

模型的第一个工具执行 Bash 命令。其 schema 很简单，只接收要运行的命令。然而，工具描述的权重更大——它包含了给模型的更详细指示，包括输入转义、无互联网访问，以及如何在后台运行命令。

接下来展示 Bash 工具的规格说明：

```json
{
   "name": "bash",
   "description": "Run commands in a bash shell\n* When invoking this tool, the contents of the \"command\" parameter does NOT need to be XML-escaped.\n* You don't have access to the internet via this tool.\n* You do have access to a mirror of common linux and python packages via apt and pip.\n* State is persistent across command calls and discussions with the user.\n* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.\n* Please avoid commands that may produce a very large amount of output.\n* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background.",
   "input_schema": {
       "type": "object",
       "properties": {
           "command": {
               "type": "string",
               "description": "The bash command to run."
           }
       },
       "required": ["command"]
   }
}
```

模型的第二个工具（编辑工具）要复杂得多，包含了模型查看、创建和编辑文件所需的一切。同样，我们的工具描述包含了关于如何使用该工具的详细信息。

我们在各类 Agent 任务的工具描述和规格上投入了大量精力。我们通过测试来发现模型可能误解规格的各种方式或使用工具时可能遇到的陷阱，然后修改描述来预防这些问题。我们相信，为模型设计工具接口应该获得与为人类设计工具接口同等程度的关注。

以下代码展示了编辑工具的描述：

```json
{
   "name": "str_replace_editor",
   "description": "Custom editing tool for viewing, creating and editing files\n* State is persistent across command calls and discussions with the user\n* If `path` is a file, `view` displays the result of applying `cat -n`. If `path` is a directory, `view` lists non-hidden files and directories up to 2 levels deep\n* The `create` command cannot be used if the specified `path` already exists as a file\n* If a `command` generates a long output, it will be truncated and marked with `<response clipped>` \n* The `undo_edit` command will revert the last edit made to the file at `path`\n\nNotes for using the `str_replace` command:\n* The `old_str` parameter should match EXACTLY one or more consecutive lines from the original file. Be mindful of whitespaces!\n* If the `old_str` parameter is not unique in the file, the replacement will not be performed. Make sure to include enough context in `old_str` to make it unique\n* The `new_str` parameter should contain the edited lines that should replace the `old_str`",
   "input_schema": {
       "type": "object",
       "properties": {
           "command": {
               "type": "string",
               "enum": ["view", "create", "str_replace", "insert", "undo_edit"],
               "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`, `undo_edit`."
           },
           "file_text": {
               "description": "Required parameter of `create` command, with the content of the file to be created.",
               "type": "string"
           },
           "insert_line": {
               "description": "Required parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`.",
               "type": "integer"
           },
           "new_str": {
               "description": "Required parameter of `str_replace` command containing the new string. Required parameter of `insert` command containing the string to insert.",
               "type": "string"
           },
           "old_str": {
               "description": "Required parameter of `str_replace` command containing the string in `path` to replace.",
               "type": "string"
           },
           "path": {
               "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`.",
               "type": "string"
           },
           "view_range": {
               "description": "Optional parameter of `view` command when `path` points to a file. If none is given, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file.",
               "items": {
                   "type": "integer"
               },
               "type": "array"
           }
       },
       "required": ["command", "path"]
   }
}
```

我们提升性能的一种方式是"防错化"工具。例如，有时模型会在 Agent 离开根目录后搞混相对文件路径。为了防止这种情况，我们直接让工具始终要求绝对路径。

我们试验了几种不同的指定文件编辑策略，字符串替换（string replacement）方式的可靠性最高——模型在给定文件中指定要替换的 `old_str` 和 `new_str`。只有当 `old_str` 恰好有一个匹配时，替换才会执行。如果匹配多于或少于一个，模型会看到相应的错误消息以供重试。

## 结果

总体而言，升级版 Claude 3.5 Sonnet 展现出比我们此前模型及此前最优模型更强的推理、编码和数学能力。它还展现了改进的 agentic 能力：工具和脚手架帮助将这些提升的能力发挥到极致。

| 模型 | SWE-bench Verified 分数 |
|------|------------------------|
| Claude 3.5 Sonnet（新版） | 49% |
| 此前 SOTA | 45% |
| Claude 3.5 Sonnet（旧版） | 33% |
| Claude 3 Opus | 22% |

*部分模型在 SWE-bench Verified 上的分数，均使用此 Agent 脚手架。*

## Agent 行为示例

在运行基准测试时，我们使用 [SWE-Agent](https://swe-agent.com/) 框架作为 Agent 代码的基础。在下面的日志中，我们将 Agent 的文本输出、工具调用和工具响应渲染为 THOUGHT（思考）、ACTION（行动）和 OBSERVATION（观察），尽管我们并未将模型约束为固定的顺序。

下面的代码块将逐步展示 Sonnet 3.5 解决 SWE-bench 问题的典型过程。

在第一个代码块中，你可以看到给模型的部分初始提示词，其中 `{pr_description}` 已填入 SWE-bench 任务的真实值。重要的是，该任务包含复现问题的步骤，这为模型提供了有价值的调查起点。

```
<uploaded_files>
/repo
</uploaded_files>
I've uploaded a python code repository in the directory /repo (not in /tmp/inputs). Consider the following PR description:

<pr_description>
linear_model.RidgeClassifierCV's Parameter store_cv_values issue
#### Description
Parameter store_cv_values error on sklearn.linear_model.RidgeClassifierCV

#### Steps/Code to Reproduce
import numpy as np
from sklearn import linear_model as lm

#test database
n = 100
x = np.random.randn(n, 30)
y = np.random.normal(size = n)

rr = lm.RidgeClassifierCV(alphas = np.arange(0.1, 1000, 0.1), normalize = True,
                                             store_cv_values = True).fit(x, y)

#### Expected Results
Expected to get the usual ridge regression model output, keeping the cross validation predictions as attribute.

#### Actual Results
TypeError: __init__() got an unexpected keyword argument 'store_cv_values'

lm.RidgeClassifierCV actually has no parameter store_cv_values, even though some attributes depends on it.
</pr_description>
```

模型做出响应，首先使用编辑工具查看仓库结构。你可以在 THOUGHT 和 ACTION 下看到模型的文本输出和工具调用参数，在 OBSERVATION 下看到工具输出的部分内容：

```
THOUGHT:
I'll help you implement the changes to satisfy the PR description. Let's follow the steps you outlined.

1. First, let's explore the repo structure:
ACTION (str_replace_editor):
command:
view

path:
/repo

OBSERVATION:
Here's the files and directories up to 2 levels deep in /repo, excluding hidden items:
/repo
/repo/PULL_REQUEST_TEMPLATE.md
/repo/ISSUE_TEMPLATE.md
/repo/sklearn
/repo/sklearn/decomposition
/repo/sklearn/kernel_ridge.py
/repo/sklearn/model_selection
/repo/sklearn/covariance
/repo/sklearn/cluster
/repo/sklearn/base.py
/repo/sklearn/dummy.py
/repo/sklearn/naive_bayes.py
...
```

现在模型对仓库结构有了更好的理解，它使用编辑工具创建一个新脚本来复现问题并测试修复：

```
THOUGHT:
Based on the repository structure, we'll need to modify the Ridge Classifier in the `sklearn/linear_model` directory.

Let's create a script to reproduce the error:
ACTION (str_replace_editor):
command:
create

path:
/repo/reproduce_error.py

file_text:
import numpy as np
from sklearn import linear_model as lm

#test database
n = 100
x = np.random.randn(n, 30)
y = np.random.normal(size = n)

rr = lm.RidgeClassifierCV(alphas=np.arange(0.1, 1000, 0.1), normalize=True,
                             store_cv_values=True).fit(x, y)

OBSERVATION:
File created successfully at: /repo/reproduce_error.py
```

模型随后使用 Bash 工具执行其编写的脚本，并成功复现了任务中的问题：

```
THOUGHT:
Let's verify that we can reproduce the error:
ACTION (bash):
command:
python3 /repo/reproduce_error.py

OBSERVATION:
Traceback (most recent call last):
  File "/repo/reproduce_error.py", line 10, in <module>
    store_cv_values=True).fit(x, y)
TypeError: __init__() got an unexpected keyword argument 'store_cv_values'
```

此后，模型使用编辑工具修改仓库中的源代码，并重新运行脚本以验证修改是否解决了问题：

```
THOUGHT:
The error is reproducible. Looking at the code, I can see that the issue is that while the `RidgeClassifierCV` class inherits from `_BaseRidgeCV`, it fails to pass the `store_cv_values` parameter from its constructor through to the base class constructor.

Let's fix this:
ACTION (str_replace_editor):
command:
str_replace

path:
/repo/sklearn/linear_model/ridge.py

old_str:
    def __init__(self, alphas=(0.1, 1.0, 10.0), fit_intercept=True,
                 normalize=False, scoring=None, cv=None, class_weight=None):
        super(RidgeClassifierCV, self).__init__(
            alphas=alphas, fit_intercept=fit_intercept, normalize=normalize,
            scoring=scoring, cv=cv)
        self.class_weight = class_weight

new_str:
    def __init__(self, alphas=(0.1, 1.0, 10.0), fit_intercept=True,
                 normalize=False, scoring=None, cv=None, class_weight=None,
                 store_cv_values=False):
        super(RidgeClassifierCV, self).__init__(
            alphas=alphas, fit_intercept=fit_intercept, normalize=normalize,
            scoring=scoring, cv=cv, store_cv_values=store_cv_values)
        self.class_weight = class_weight
```

在这个特定例子中，模型经过 12 步后判定可以提交。任务的测试随后成功运行，验证了模型的解决方案确实解决了问题。有些任务在模型提交方案前需要超过 100 轮交互；在其他情况下，模型会持续尝试直到用尽上下文。

通过对比升级版 Claude 3.5 Sonnet 与旧模型的尝试记录，升级版 3.5 Sonnet 更频繁地自我纠错。它还展现出尝试多种不同解决方案的能力，而非在同一个错误上反复打转。

## 挑战

SWE-bench Verified 是一个强大的评估工具，但运行起来也比简单的单轮评估更复杂。以下是我们面临的一些挑战——其他 AI 开发者可能也会遇到。

1. **运行时长与高 token 成本。** 上面的例子是一个在 12 步内成功完成的案例。然而，许多成功的运行需要数百轮交互模型才能解决，且消耗超过 10 万 token。升级版 Claude 3.5 Sonnet 非常坚韧：只要有足够时间，它通常能找到解决问题的方法，但代价可能很高；
2. **评分问题。** 在检查失败的任务时，我们发现有些情况下模型行为正确，但存在环境配置问题或安装补丁被重复应用的情况。解决这些系统问题对于准确评估 AI Agent 的性能至关重要。
3. **隐藏测试。** 由于模型无法看到评分所依据的测试，它常常"认为"自己已经成功，而实际上任务失败了。其中一些失败是因为模型在错误的抽象层次上解决了问题（贴了个创可贴而非深层重构）。另一些失败则感觉不太公平：它们确实解决了问题，但与原始任务的单元测试不匹配。
4. **多模态。** 尽管升级版 Claude 3.5 Sonnet 拥有出色的视觉和多模态能力，我们并未实现让它查看文件系统上保存的文件或 URL 引用文件的功能。这使得调试某些任务（尤其是来自 Matplotlib 的任务）特别困难，也容易导致模型幻觉。这无疑是开发者可以改进的低垂之果——SWE-bench 也已推出了[专注于多模态任务的新评估](https://www.swebench.com/multimodal.html)。我们期待看到开发者在近期用 Claude 在此评估上取得更高分数。

升级版 Claude 3.5 Sonnet 以 49% 的成绩在 SWE-bench Verified 上刷新记录，超越了此前 45% 的最优成绩，而仅使用了一个简单的提示词和两个通用工具。我们确信，基于新版 Claude 3.5 Sonnet 进行开发的开发者将很快找到新的、更好的方法来提升 SWE-bench 分数，超越我们在此初步展示的成果。

## 致谢

Erik Schluntz 优化了 SWE-bench Agent 并撰写了本文。Simon Biggs、Dawn Drain 和 Eric Christiansen 协助实现了基准测试。Shauna Kravec、Dawn Drain、Felipe Rosso、Nova DasSarma、Ven Chandrasekaran 及许多其他人为训练 Claude 3.5 Sonnet 在 agentic 编码方面的卓越表现做出了贡献。
