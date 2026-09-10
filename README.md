# TETRIS BLITZ · 限时道具俄罗斯方块

🕹 **[在线试玩](https://ganmino.github.io/tetris-blitz/)**（GitHub Pages，支持手机）

120 秒倒计时 + 方块随机道具 + **Boss 战** + 关卡强化牌的街机风"俄罗斯方块 × 宝石方块"混合玩法。

![游戏截图](artifacts/canvas-inspection/pass-3/desktop-active-play.png)

![道具方块](artifacts/canvas-inspection/pass-3/desktop-powerup.png)

![危险倒计时](artifacts/canvas-inspection/pass-3/desktop-danger.png)

## 玩法

- 👾 **三阶段 Boss 战**：倒计时进入 60 秒时 Boss 现身——**消行即攻击**（1/2/3/4 行 = 10/25/45/70 伤害 × 连消加成，BOMB 直接轰 15+）。击败 Boss → +60 秒 & 大量分数 → 三选一强化牌 → 下一阶段（棋盘堆叠保留！）。击败第 3 个 Boss 即胜利。
  - Boss 会**攻击你的棋盘**：扔垃圾行（底部升起带孔灰块）、洗牌（底部 3 行换列）、狂怒（重力 ×1.5），全部带蓄力预警；HP 过半进入狂暴阶段（攻击更快、垃圾更多）。
  - 3D Boss 实体：阶段配色核心体 + 旋转环 + 巨眼，蓄力脉冲、受击白闪、死亡爆炸。
- 🃏 **肉鸽强化牌**（9 种，每局最多拿 2 张）：时间扩容 / 道具磁铁 / 银行扩容 / 得分狂热 / 连锁大师 / 淘金者 / 稳健开局 / 装甲 / 爆破专家。
- ⏱ **限时冲刺**：消 1 行 +4 秒；时间归零 → TIME UP。
- 💎 **方块道具**：约 18% 的方块带道具（60 秒后升至 26%），道具附在方块某一格上，**落定后收进道具银行**，随时手动触发（键盘 1/2/3 或点按槽位）：

  | 徽记 | 道具 | 效果 |
  | --- | --- | --- |
  | ⏱ | 时间 +8s | 立即增加 8 秒 |
  | 🐢 | 减速 | 12 秒内下落速度大幅降低 |
  | 💥 | 3×3 爆破 | 炸掉堆叠底部中心 3×3 区域，上方方块坠落，可引发连锁 |
  | ⭐ | 双倍得分 | 12 秒内得分 ×2 |
  | 💰 | 加分 | 立即 +300 分 |

- 🏦 **道具银行**：3 格容量，道具落定收集、按键触发——存 BOMB 应急、攒 2X 打爆发；银行满时新道具立即自动生效。
- 🥇 **黄金目标行**：开局 20 秒出现金色目标行；消中该行 +10 秒 & +500×等级分，之后每 18 秒刷新新目标。
- 🔗 **连锁消行**：BOMB 爆破后的逐列重力会让上方方块坠入空洞，凑出的满行自动连环消除（连消倍率递增、每行 +2 秒）。
- 📈 **难度曲线**：等级随耗时每 30 秒一档（LV1→LV4，下落 0.9s/格 → 0.35s/格）。
- 🔥 **连消 COMBO**：连续消行倍率 ×1 → ×1.5 → ×2 → ×2.5 → ×3，断连重置。
- 💀 **两种失败**：时间耗尽（TIME UP）或方块堆到顶（TOPPED OUT），结算画面会告诉你原因。

## 操作

| 动作 | 键盘 | 手机触屏 |
| --- | --- | --- |
| 左右移动 | ← / → | ◀ ▶ |
| 旋转（顺/逆） | ↑ / Z 与 X | ⟳ / ↺ |
| 软降 | ↓ | ▼ |
| 硬降 | 空格 | ⏬ |
| 触发道具（银行 1/2/3） | 1 / 2 / 3 | 点按槽位 |
| 选择强化牌 | 1 / 2 / 3 | 点按卡牌 |
| 暂停 | P / Esc | ⏸ |
| 静音 | M | ♪ |
| 开始 / 重开 | Enter / R | 按钮 |

## 本地运行

```bash
git clone https://github.com/GanMino/tetris-blitz.git
cd tetris-blitz
npm install
npm run dev        # http://127.0.0.1:5188
```

## 测试与验证

```bash
npm test                 # Playwright：视觉回归（桌面+移动）+ 机器人试玩（4 行消除 / 道具银行 / Boss 击杀 / 强化牌 / 胜利 / 时间到 / 重开）
npm run inspect:canvas   # 画布检查器（像素指标 + 渲染预算 + 状态钩子截图）
npm run build            # 生产构建（输出 dist/）
npm run preview          # http://127.0.0.1:4188 预览构建产物
```

QA 证据（画布指标、状态截图、机器人报告）：`artifacts/final-evidence.md`、`artifacts/canvas-inspection/`。

## 技术栈与素材

- **Three.js** + **TypeScript** + **Vite**（脚手架来自 [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills)）
- 程序化美术：宝石质感方块、街机机柜、程序化多层星云背景、逐格道具徽记（八面体/圆环/尖刺/五角星/方块 + emoji 图标）、粒子爆发（贴图精灵）、震屏
- **开源素材**（CC0/OFL，许可证随仓库分发，见 `public/licenses/`）：
  - 音效与 BGM：[Kenney](https://kenney.nl/)（CC0）Interface/Impact Sounds、8-Bit Music Jingles（ogg + mp3 双格式）
  - 粒子贴图：[Kenney](https://kenney.nl/) Particle Pack（CC0）
  - 街机字体：[Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)（SIL OFL 1.1）
  - 音频失败时自动降级为 Web Audio 合成音效
- 静态堆叠按颜色 `InstancedMesh` 渲染（约 30 draw calls）；`lil-gui` 支持 `?debug` 实时调参
- 测试钩子：`window.__THREE_GAME_TEST_HOOKS__`（seed / setState / 暂停截图）+ `__THREE_GAME_DIAGNOSTICS__`

## 目录结构

```
src/
  core/     Loop · Renderer · InputController（键盘+触控统一意图，DAS 自动重复）
  game/     Game（状态机/计分/道具银行/黄金行/连锁）· Board（网格/消行/逐列重力）·
            Pieces（7-bag）· PowerUps · BoardView（3D 场景/徽记/VFX）· constants
  systems/  Hud（DOM UI/银行槽）· AudioSystem（采样音效+BGM，合成降级）· DebugTools
public/     开源素材：audio/（Kenney 音效+BGM）· textures/（Kenney 粒子）· fonts/ · licenses/
tests/      Playwright 视觉回归 + 机器人试玩
scripts/    画布检查器（inspect-threejs-canvas.mjs）
artifacts/  设计简报 · 最终证据 · 检查截图
```

## 部署

推送 `main` 分支即触发 [GitHub Actions](.github/workflows/deploy.yml) 自动构建并发布到 GitHub Pages：

- 站点：https://ganmino.github.io/tetris-blitz/
- Vite `base` 在生产构建下自动设为 `/tetris-blitz/`
