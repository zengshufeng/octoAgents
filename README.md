# OctoAgents

Vue 3 + TypeScript + Vite 项目，集成 Vue Router、Pinia、ESLint、Prettier 与 Three.js。

## 技术栈

- **Vue 3** — 组合式 API + `<script setup>`
- **TypeScript** — 全量类型 + `vue-tsc` 类型检查
- **Vite** — 开发服务器与构建
- **Vue Router** — 路由
- **Pinia** — 状态管理
- **Three.js** — 3D 渲染
- **ESLint + Prettier** — 代码规范与格式化

## 环境要求

- Node.js `^22.18.0 || >=24.12.0`

## 常用命令

```bash
npm install         # 安装依赖
npm run dev         # 启动开发服务器
npm run build       # 类型检查 + 生产构建
npm run preview     # 预览构建产物
npm run type-check  # 仅类型检查
npm run lint        # 检查并修复代码规范
npm run format      # 格式化 src/
```

## 目录结构

```text
octoAgents/
├── index.html
├── vite.config.ts        # Vite 配置（含 @ -> src 别名）
├── tsconfig*.json        # TypeScript 配置（project references）
├── eslint.config.js      # ESLint flat config
├── .prettierrc.json      # Prettier 配置
├── public/
│   └── favicon.svg
└── src/
    ├── main.ts           # 入口：挂载 Pinia + Router
    ├── App.vue           # 根组件 + 顶部导航
    ├── assets/           # 全局样式
    ├── components/
    │   └── ThreeScene.vue   # Three.js 旋转立方体示例
    ├── router/
    │   └── index.ts      # 路由配置
    ├── stores/
    │   └── counter.ts    # Pinia store 示例
    └── views/            # 页面
        ├── HomeView.vue
        ├── SceneView.vue # 3D 场景
        └── AboutView.vue
```

## 路由

| 路径      | 页面                       |
| --------- | -------------------------- |
| `/`       | 首页（Pinia 计数器示例）   |
| `/scene`  | Three.js 3D 场景           |
| `/about`  | 关于                       |
