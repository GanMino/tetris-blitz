# TETRIS BLITZ — 最终证据

**结论：可玩、可验证、可在桌面与手机运行。** 本地地址 http://127.0.0.1:5188 （`npm run dev`）；生产构建 `npm run build` + `npm run preview`（http://127.0.0.1:4188）。

## 游戏内容

- **限时俄罗斯方块**：10×22 棋盘（顶部 2 行隐藏），120 秒倒计时；每消 1 行 +4 秒；时间耗尽 → TIME UP。
- **方块道具**（5 种，随机附在方块某格上，方块落定即触发，发光宝石徽记+图标提示）：
  - ⏱ TIME+8（加 8 秒）· 🐢 SLOW（12 秒减速）· 💣 BOMB（清底部 2 行）· ⭐ 2X（12 秒双倍分）· 💰 BONUS（+300 分）
  - 出现率 18%，60 秒后升至 26%；每块至多 1 个。
- **难度曲线**：等级随耗时每 30 秒一档（重力 0.9s→0.35s/格）；连消倍率 ×1→×3。
- **移动端**：触控按钮（◀ ▶ ▼ ⟳ ↺ ⏬），safe-area 适配，44px+ 触控目标；竖屏自动适配相机。
- **任天堂/卡普空街机风**：高饱和宝石质感方块（倒角+光泽贴图）、深色街机机柜、霓虹灯带、侧翼面板与顶部招牌（横屏显示）、消行爆发粒子、震屏、红脉冲危险警示、8-bit 合成音效 + chiptune 循环背景乐（可静音，localStorage 记忆）。

## 操作

键盘：←/→ 移动 · ↑/Z 顺时针 · X 逆时针 · ↓ 软降 · 空格 硬降 · P 暂停 · M 静音 · Enter 开始 · R 重开。
触屏：左下 ◀ ▼ ▶，右下 ↺ ⟳ ⏬；顶部 ⏸ 暂停、♪ 静音。

## 验证证据

### 画布检查（inspector，pass-3 + 生产构建）
声明 9 个视口/状态对，全部通过（非空白、无页面/控制台错误、渲染预算内）。`artifacts/evidence.json` 经 director 的 check_evidence.py 校验通过（11 项确认）。

| 视口 | 状态 | draw calls | 预算 | 对比度 | 色彩熵 |
| --- | --- | --- | --- | --- | --- |
| 桌面 1280×720 | menu | 21 | 300 ✓ | — | 3.50 |
| 桌面 | active-play | 36 | 300 ✓ | 128.8 | 5.13 |
| 桌面 | powerup（道具块） | 38 | 300 ✓ | — | 5.32 |
| 桌面 | danger（堆顶+红计时） | 36 | 300 ✓ | — | 5.70 |
| 桌面 | gameover-time | 28 | 300 ✓ | — | 3.85 |
| 桌面 | paused | 36 | 300 ✓ | — | 3.65 |
| 移动 iPhone 13 | active-play | 30 | 150 ✓ | 164.4 | 5.51 |
| 移动 | danger | 30 | 150 ✓ | 174.2 | 6.26 |
| 移动 | gameover-time | 22 | 150 ✓ | 77.2 | 4.11 |

截图与 JSON 报告：`artifacts/canvas-inspection/pass-3/`（桌面+移动）。生产构建（dist，gzip 154 KB）预览检查：`artifacts/canvas-inspection/prod/`（36 calls，零错误）。

### 机器人试玩（tests/bot-playtest.spec.ts，桌面 Chrome）
- 井式剧本：旋转 I 块 → 移到 1 格竖井 → 硬降 → **4 行消除**（分数 0→834，lines=4）。
- 时间归零 → TIME UP 结算面板出现（文案"时间到！"）。
- 点"再来一局" → 分数归零、计时器恢复，正常进入新局。
- 全程 0 页面错误 / 0 控制台错误；软锁窗口 1（≤2 阈值）。

### 视觉回归（tests/visual.spec.ts，桌面 + 移动）
- 真实输入移动活动块：桌面键盘 ←、移动端触控 ◀ 均使 activeX 减小（断言通过）。
- 画布非空白像素校验通过；双视口截图见 test-results 附件。

### 一次性路径验证（诊断脚本，未入库）
- **堆满结束**：连续硬降 7 块 → spawn 受阻 → gameover（stackTop=2，路径正确）。
- **道具触发**：seed 4 出生块带 BONUS → 硬降 → 分数 +308（300 奖励 + 8 落距分），徽记消耗、无错误。

### 测试命令
```bash
npm run dev            # http://127.0.0.1:5188
npm test               # playwright（visual + bot，3 通过 1 跳过）
npm run inspect:canvas # 或直接调 scripts/inspect-threejs-canvas.mjs
npm run build && npm run preview
```

## 已知限制
- 移动端横屏可用但棋盘较小（竖屏为第一目标）。
- 无在线对战/联机；无外部生成素材（全程序化，符合"街机风"路线，未调用 3D/图像/音频生成服务）。
- WebKit 移动端的音频由用户手势解锁；headless 环境无声（预期行为）。

## 设计文档
- 设计简报/核心循环/难度计划：`artifacts/design-brief.md`
- 进度与决策记录：`artifacts/game-progress.md`
