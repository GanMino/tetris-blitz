# TETRIS BLITZ — 最终证据（V2）

**结论：V2 升级完成，可玩、可验证、线上运行。** 本地 http://127.0.0.1:5188；线上 https://ganmino.github.io/tetris-blitz/。

## V2 变更

### 画面（网络开源素材 + 程序化增强）
- 背景：程序化多层星云（星云云团 + 420 星点 + 中央辉光）
- 音效/BGM：Kenney CC0 采样（13 个 SFX + 8-bit jingle 循环，ogg+mp3 双格式，Safari 兼容；加载失败自动降级 Web Audio 合成）
- 粒子：Kenney CC0 贴图精灵（spark/smoke/star/glow/flare）替代方块粒子
- 字体：Press Start 2P（SIL OFL）应用于 HUD 数字/标题/横幅
- 许可证随仓库分发：public/licenses/（KENNEY-LICENSE.txt、OFL-PressStart2P.txt）

### 道具差异化
5 种道具各有专属 3D 造型（八面体/圆环/尖刺二十面体/五角星/圆角方块）、emoji 图标、专属触发特效（时钟扩散环/绿烟波/橙色冲击波/金色星雨/粉色星爆）。

### 新玩法
- **道具银行**：3 格，落定收集、1/2/3 键或点按触发；满时新道具自动生效。
- **黄金目标行**：20s 首次出现（随机行 8–16），消中 +10s & +500×等级分，18s 后刷新。
- **连锁消行**：BOMB 重设计为底部中心 3×3 爆破 + 逐列重力，坠落的方块凑出满行自动连环消除（连消倍率、每行 +2s）。单元验证：12 满行场景一次爆破连锁清除 9 行。

## 验证证据

### 画布检查（pass-4，声明 11 视口/状态对，check_evidence.py 13 项通过）
| 视口 | 状态 | draw calls | 预算 | 色彩熵 | 错误 |
| --- | --- | --- | --- | --- | --- |
| 桌面 | menu | 21 | 300 ✓ | 2.96 | 0 |
| 桌面 | active-play | 36 | 300 ✓ | 3.89 | 0 |
| 桌面 | powerup（银行+徽记） | 39 | 300 ✓ | 4.14 | 0 |
| 桌面 | danger | 36 | 300 ✓ | 4.59 | 0 |
| 桌面 | gold（黄金行） | 37 | 300 ✓ | 3.93 | 0 |
| 桌面 | gameover-time | 28 | 300 ✓ | 2.74 | 0 |
| 桌面 | paused | 36 | 300 ✓ | 2.63 | 0 |
| 移动 | active-play | 30 | 150 ✓ | 4.01 | 0 |
| 移动 | powerup | 33 | 150 ✓ | 4.56 | 0 |
| 移动 | danger | 30 | 150 ✓ | 4.90 | 0 |
| 移动 | gold | 31 | 150 ✓ | 4.05 | 0 |

### 机器人试玩（bot-playtest.spec.ts）
- 4 行消除 834 分 ✓；道具银行触发（Digit1 → BOMB：占用格数减少、银行 ['bomb','double']→['double']）✓；TIME UP ✓；重开 ✓；0 页面/控制台错误。

### 视觉回归
桌面键盘 + 移动触控真实输入移动活动块，双端通过。

### 线上部署（GitHub Actions → Pages）
- 线上画布检查：desktop active-play 36 calls / mobile powerup 33 calls，零错误。
- 素材 URL 全部 200：bgm.ogg、PressStart2P-Regular.ttf、particle_star.png、KENNEY-LICENSE.txt。

## 命令
```bash
npm run dev            # 本地
npm test               # 3 通过 1 跳过
npm run build && npm run preview
node scripts/inspect-threejs-canvas.mjs --url http://127.0.0.1:5188 --state gold --run-id pass-4
```

## 已知限制
- 移动端横屏可用但棋盘较小（竖屏为第一目标）；无对战/联机。
- 菜单/结算遮罩仍略微压暗背景（熵 2.63–2.96，接近 3.0 参考线，属有意的可读性取舍）。
