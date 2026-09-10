# TETRIS BLITZ — 进度追踪

## 意图与约束
- V2 升级：网络开源素材优化画面 + 道具差异化视觉 + 新颖玩法改造；重新发布 GitHub Pages。

## 决策
- 素材（全部网络开源、许可证入库 public/licenses/）：Kenney CC0 音效×13 + 8-bit BGM + 粒子贴图×5；Press Start 2P（OFL）；程序化星云背景（NASA/Wikimedia 网络不可达时的可靠性方案）。
- 道具银行：3 格手动触发（1/2/3 + 点按），满时自动生效新道具；道具落定收集。
- 黄金目标行：20s 首现、随机行 8–16、+10s/+500×等级、18s 刷新。
- 连锁消行：BOMB 改为底部中心 3×3 爆破 + 逐列重力 → 满行自动连环消除（原来"整行塌落"永远无法产生新满行，连锁是死代码——部分清除才是连锁来源）。
- 道具视觉：专属 3D 造型（八面体/圆环/尖刺/五角星/方块）+ emoji 图标 + 专属触发特效。

## 已完成
- [x] 素材下载/转换（ogg→mp3 Safari 兼容）/入库（740KB）
- [x] 玩法实现（银行/黄金行/连锁）+ Board 逐列重力 + bombClear 重设计
- [x] BoardView：星云背景、贴图粒子、徽记造型/emoji、金条、powerUpVfx/goldBurst
- [x] AudioSystem：采样加载 + 合成降级 + BGM 循环
- [x] Hud：银行槽 UI、gold 横幅样式；Press Start 2P 字体接入
- [x] 测试：bot 增加银行触发断言；gold 截图状态；全绿（3 通过 1 跳过）
- [x] QA：pass-4 检查 11 视口/状态对零错误；check_evidence.py 13 项通过
- [x] 连锁单元验证：12 满行场景爆破连锁清 9 行
- [x] 线上部署 + 双端画布验证 + 素材 URL 全 200
- [x] git 历史对齐（github.com 间歇性不通 → Git Data API 提交 → 恢复后 fetch+rebase）

## 缺陷
无未解决缺陷。

## 交付物
- 仓库：https://github.com/GanMino/tetris-blitz （main = 63bd59d）
- 在线：https://ganmino.github.io/tetris-blitz/

## V3（Boss 战 + 强化牌）已完成
- [x] Boss 状态机 + 3D 实体 + 血条 + 蓄力预警 + 死亡爆炸；三阶段难度递增
- [x] 垃圾行/洗牌/狂怒攻击（Board.addGarbageRows/shuffleBottomRows，灰色垃圾块渲染）
- [x] 9 种强化牌（Upgrades.ts）+ 选择界面（模拟暂停、1/2/3 键）
- [x] 胜利结算；测试全流程（击杀→选牌→胜利）通过；pass-5 检查 11 对零错误
- [x] 线上部署验证（boss/upgrade 状态，43/30 calls，零错误）
- 提交：674f4d1（Git Data API，github.com 主站间歇性断连）
