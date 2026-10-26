# Knowvia 认证界面设计规范

## 1. Visual Theme & Atmosphere

Knowvia 登录/注册界面采用“克制 SaaS + 黑白分屏 + 柔和布料暗纹”的视觉语言，参考 Databuddy 的左右分栏认证卡片：左侧承载品牌叙事，右侧承载清晰、低干扰的表单操作。

关键词：极简、可信、冷静、专注、轻量、现代。

一句话定调：在柔和留白和深色品牌幕布之间，让用户快速、安全地进入 Knowvia。

## 2. Color Palette & Roles

```css
:root {
  --auth-bg: #f6f6f7;
  --auth-bg-rgb: 246, 246, 247;
  --auth-surface: #ffffff;
  --auth-surface-rgb: 255, 255, 255;
  --auth-panel: #111111;
  --auth-panel-rgb: 17, 17, 17;
  --auth-panel-soft: #1a1a1a;
  --auth-panel-soft-rgb: 26, 26, 26;
  --auth-text: #121417;
  --auth-text-rgb: 18, 20, 23;
  --auth-muted: #6f7480;
  --auth-muted-rgb: 111, 116, 128;
  --auth-subtle: #9ca3af;
  --auth-subtle-rgb: 156, 163, 175;
  --auth-border: #e5e7eb;
  --auth-border-rgb: 229, 231, 235;
  --auth-input: #edeff3;
  --auth-input-rgb: 237, 239, 243;
  --auth-primary: #26282d;
  --auth-primary-rgb: 38, 40, 45;
  --auth-primary-hover: #111318;
  --auth-primary-hover-rgb: 17, 19, 24;
  --auth-focus: #2f333b;
  --auth-focus-rgb: 47, 51, 59;
  --auth-danger: #d92d20;
  --auth-danger-rgb: 217, 45, 32;
}
```

角色：背景使用 `--auth-bg`；主卡片使用 `--auth-surface`；左侧品牌区使用 `--auth-panel`；按钮主操作使用 `--auth-primary`；输入框使用浅灰 `--auth-input`。

## 3. Typography Rules

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
```

字体族：`'Noto Sans SC', Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`。

字号层级：

| 用途 | 字号 | 行高 | 字重 |
|---|---:|---:|---:|
| 品牌标题 | 40px | 1.28 | 500 |
| 页面标题 | 28px | 1.35 | 500 |
| 副标题 | 15px | 1.7 | 400 |
| 表单标签 | 14px | 1.5 | 500 |
| 输入文本 | 14px | 1.5 | 400 |
| 辅助文本 | 13px | 1.6 | 400 |

禁止字体：禁止只使用英文字体导致中文系统回退；禁止过度装饰性字体。

## 4. Component Stylings

按钮：
- default：高度 46px，圆角 7px，字体 15px/500。
- hover：背景加深，轻微上移 `translateY(-1px)`。
- active：恢复位置，轻微压缩。
- focus：使用 `box-shadow: 0 0 0 3px rgba(var(--auth-focus-rgb), .14)`。
- disabled：透明度 0.62，不位移。

输入框：
- default：背景 `--auth-input`，无明显阴影。
- hover：背景变亮，边框显现。
- focus：白底 + 深色描边 + focus ring。
- error：边框使用 `--auth-danger`。

卡片：
- 外层认证壳宽度约 1360px，高度约 760px。
- 圆角 18px，1px 边框，轻阴影。
- 左侧和右侧各占 50%。

链接：
- 默认深灰，重点文字使用 `--auth-text`。
- hover 下划线。
- focus 保留可见 outline。

## 5. Layout Principles

桌面端采用居中认证容器：页面背景浅灰，容器左右分栏。左侧黑色品牌面板，右侧白色表单面板。表单最大宽度 470px，居中对齐。

间距梯度：4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 72。

表单密度：第三方按钮区 → 分割线 → 表单字段 → 主按钮 → 辅助链接，所有元素保持垂直节奏一致。

## 6. Depth & Elevation

```css
--auth-shadow-shell: 0 20px 60px rgba(15, 23, 42, 0.08), 0 2px 10px rgba(15, 23, 42, 0.06);
--auth-shadow-button: 0 1px 2px rgba(15, 23, 42, 0.08);
--auth-shadow-focus: 0 0 0 3px rgba(var(--auth-focus-rgb), 0.14);
```

整体深度轻，不使用强烈投影；左侧通过暗纹、微渐变和噪声感营造层次。

## 7. Animation & Interaction

交互档位：L1 精致静态。

实现要求：
- 认证壳入场 `fadeAuthShell`，持续 560ms。
- 左侧文案入场轻微上浮。
- 表单区入场延迟 80ms。
- 按钮 hover 仅轻微位移，不使用夸张动效。
- 支持 `prefers-reduced-motion`，关闭位移与动画。

## 8. Do's and Don'ts

Do：
1. 使用中文文案，品牌名固定为 Knowvia。
2. 保留当前用户名 + 密码登录字段。
3. 第三方登录按钮只作为 UI 占位，后续再接 OAuth。
4. 保持左右分栏比例清晰，表单区域不要过宽。
5. 所有按钮和链接必须有 hover/focus 态。
6. 移动端将左侧品牌区折叠为顶部横幅。
7. 输入框使用低对比浅灰底，focus 时再增强。
8. 注册页和登录页共享同一设计语言。

Don't：
1. 不把登录字段改成邮箱登录。
2. 不在前端写入 OAuth secret 或任何密钥。
3. 不新增真实 OAuth 调用逻辑。
4. 不引入新的第三方 UI 依赖。
5. 不使用大面积彩色渐变破坏黑白克制风格。
6. 不使用粒子背景覆盖参考风格。
7. 不使用 emoji 作为图标。
8. 不让移动端出现横向滚动。

## 9. Responsive Behavior

桌面端 ≥ 1024px：左右双栏，认证壳最大宽度 1360px。

平板端 768px - 1023px：容器宽度 92vw，左侧品牌区宽度 42%，右侧 58%。

移动端 ≤ 767px：改为单列布局，左侧品牌区变成顶部 220px 横幅，表单区 padding 缩小到 28px 22px，第三方按钮纵向排列，触摸目标不小于 44px。
