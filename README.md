# 决策树的可视化墓园 · Decision Tree Cemetery

> 一个让你把"选择"与"可能的未来"变成一棵可交互树的纯前端应用。
> 输入你在犹豫的决策，点击节点让它自动分叉，再加上情感倾向标签——它最终会长成一张属于你自己的"命运地图"。

![status](https://img.shields.io/badge/stack-HTML%2FCSS%2FJS-blue)
![d3](https://img.shields.io/badge/visualize-D3.js-ffb300)
![host](https://img.shields.io/badge/host-GitHub%20Pages-green)

---

## ✦ 功能一览

| 模块 | 说明 |
| --- | --- |
| 种下一颗种子 | 输入一段决策文本（例如"要不要换工作？"），它会成为整棵树的根 |
| AI 风格分支 | 点击节点 / 按「展开」自动生成 3~5 个后续选择，并带描述与情感标签 |
| D3 树形图 | 节点可拖动、画布可缩放/平移、双击展开折叠 |
| 情感调色板 | 积极（光明）· 中性（迷雾）· 消极（阴影）—— 视觉与统计面板同步 |
| 走一条路 | 让 AI 从根节点一路生长出 5~8 层路径，生成故事弹窗 |
| 手写节点 | 手动输入节点标题 + 描述 + 情感倾向 |
| 双主题切换 | 墓园暗金 / 灯塔明亮，一键切换，偏好自动保存 |
| 时间旅行 · 快照 | 任意时刻保存当前树的版本，一键恢复 |
| 足迹历史 | 记录每个点击过的节点，可回溯跳转 |
| 情绪风标 | 控制 AI 分支生成的情感偏好（随机 / 偏光明 / 偏阴影 / 平衡） |
| 导出 | PNG 截图 / JSON 数据备份 / 再次导入继续生长 |

---

## ✦ 文件结构

```
trar_AI/
├── index.html              主页面骨架（顶栏 · 三栏布局 · 弹窗）
├── styles.css              两套主题（墓园/灯塔）、节点/连线、动画（呼吸/心跳/流光/出生）
├── branch-generator.js     AI 风格分支生成：文本模板 + 情感分布 + 路径挑选
├── tree-visualizer.js      D3 树布局 + 交互（拖动/缩放/折叠/高亮/导出）
├── app.js                  应用层：主题切换、历史、快照、弹窗、事件串起来
└── README.md
```

> 项目无构建流程、无 npm 依赖。`d3.v7.min.js` 通过 CDN 加载，因此只要浏览器能上网，页面即可工作。

---

## ✦ 本地预览

任选一种方式启动本地 HTTP 服务（直接双击 `index.html` 也可以，但部分浏览器会限制 localStorage 与跨域脚本 CDN）：

```powershell
# 方式 1：Python（推荐，零安装其他依赖）
cd d:\Trae\trar_AI
python -m http.server 8000
# 浏览器打开 http://localhost:8000/index.html
```

```bash
# 方式 2：Node.js
npx serve .
```

```powershell
# 方式 3：PHP
php -S localhost:8000
```

---

## ✦ 部署到 GitHub Pages（让所有人通过浏览器访问）

### 第一步 · 在 GitHub 创建仓库

1. 登录 <https://github.com>
2. 右上角「+」→ `New repository`
3. 填入 Repository name（例如 `decision-tree-cemetery`），Public，勾选 *Add a README* 时**不要**打勾
4. 点击 `Create repository`
5. 你会得到一个类似 `https://github.com/你的用户名/decision-tree-cemetery.git` 的地址

### 第二步 · 推送本地代码

回到刚才的终端（PowerShell / Git Bash）：

```powershell
cd d:\Trae\trar_AI
# 1) 设置你自己的身份（只需要一次）
git config user.name "Your Name"
git config user.email "you@example.com"

# 2) 关联远端（把 URL 替换成你刚才创建的仓库地址）
git remote add origin https://github.com/你的用户名/decision-tree-cemetery.git

# 3) 首次推送（如果默认分支名是 main，使用 master 的情况少见）
git branch -M main
git push -u origin main
```

> 推送时 GitHub 会要求登录。若 HTTPS 方式要求密码，请在 GitHub 设置页创建 **Personal Access Token**（勾选 `repo` 权限），并用它代替密码。

### 第三步 · 启用 GitHub Pages

1. 打开仓库页面 → `Settings` → 左侧 `Pages`
2. Source 选 `Deploy from a branch`
3. Branch 选 `main` + `/ (root)`，点击 **Save**
4. 等待 1~2 分钟，页面顶部会出现绿色链接，形如：

   ```
   https://你的用户名.github.io/decision-tree-cemetery/
   ```

5. 打开链接，把"决策树"送给你的朋友！

> 如果之后更新了代码，只需再次 `git add . && git commit -m "update" && git push`，GitHub Pages 会自动重新部署。

---

## ✦ 键盘快捷键

| 键 | 动作 |
| --- | --- |
| `Space` | 展开当前选中的节点 |
| `N` | 种下一棵新树（使用左侧输入框中的文字） |
| `W` | "走一条路"：AI 自动生长一条 5~8 层路径并生成故事 |
| `0` | 画布居中到根节点 |
| `Esc` | 关闭高亮 / 关闭弹窗 / 关闭右键菜单 |

---

## ✦ 数据持久化说明

- **足迹 / 当前树 / 主题 / 情绪风标** 全部保存在浏览器的 `localStorage` 中（key：`cemetery-tree-v1`、`cemetery-snapshots-v1`、`cemetery-history-v1`、`cemetery-theme-v1`、`cemetery-mood-v1`）。
- 这意味着同一台电脑/同一浏览器会自动续接你上次的决策树；换设备/换浏览器不会同步（跨设备同步请用 JSON 导出功能）。
- 无任何第三方分析脚本，不向外部发送数据。

---

## ✦ 已知兼容

- Chrome / Edge / Firefox / Safari 最近两年的版本（需要支持 ES6 / SVG / localStorage）。
- 移动端浏览器也可以访问，但拖动节点在触屏上体验略弱，建议使用桌面端。

---

## ✦ License

MIT — 随意使用、修改、二次分发。如果你把它用在有趣的事上，欢迎告诉我！
