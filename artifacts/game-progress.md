# TETRIS BLITZ — 进度追踪

## 意图与约束
- 限时（120s 起）俄罗斯方块，方块附带随机道具（锁定时激活），移动端可玩（触控）。
- 视觉参考任天堂/卡普空街机：高饱和宝石质感、街机机柜氛围、霓虹点缀。
- 全程序化美术 + Web Audio 合成音频（无外部生成服务）。
- 技术栈：Three.js + Vite + TS；保留脚手架测试钩子契约。

## 决策
- 棋盘 10×22（行号向下递增；行 0-1 隐藏出生区；行 21 底）；7-bag；透视相机 fit-to-viewport。
- 道具 5 种：TIME+8 / SLOW / BOMB(清底2行) / 2X / BONUS+300；出生 18%（60s 后 26%），锁定时激活。
- 下一块预览与全部 HUD 用 DOM；棋盘+机柜装饰（横屏侧翼/招牌）在 3D 场景。
- 静态堆叠按颜色 InstancedMesh；活动块/幽灵/动画用独立网格池。
- 消行 +4s/行；等级 30s 一档加速（0.9→0.35s）；连消 ×1→×3 封顶。
- 部分锁出策略：允许锁在隐藏区，新块出生受阻才判负（现代规则）。

## 已完成
- [x] 设计简报 artifacts/design-brief.md
- [x] 核心玩法 + 图形 + 音频 + UI + 触控全部实现
- [x] 修复：重力方向颠倒（下落=+y）、出生点 y=0、非 playing 阶段按键不响应、倒计时归零不结束、stackTopVisible 方向、collapse 压缩算法、雾效距离、badge 纹理每帧泄漏、backPanel z-fight、音频调度后台补排保护
- [x] 画布检查 9 视口/状态对全通过（pass-3，桌面+移动，预算内零错误）
- [x] Playwright：visual（桌面+移动真实输入）+ bot（4 行消除 834 分、TIME UP、重开）3 通过
- [x] 一次性验证：堆满结束路径、道具触发路径（seed4 BONUS +308）
- [x] 生产构建 + preview 检查（36 calls 零错误）
- [x] 证据清单 artifacts/evidence.json 通过 check_evidence.py（11 项）
- [x] 最终证据 artifacts/final-evidence.md
- [x] 独立评审：子代理超时（>10 分钟未产出），已中断；改为负责人自查高风险点（音频调度器补排循环→加保护），修复后全套测试复跑通过

## 缺陷
无未解决缺陷。

## 交付物
`/Users/mingan/Desktop/work/学习/tetris-blitz/`（npm run dev → http://127.0.0.1:5188）
