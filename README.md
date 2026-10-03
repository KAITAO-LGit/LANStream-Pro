LANStream Pro - 现代化局域网媒体服务器

LANStream Pro 是一个专为家庭和小型组织设计的现代化局域网媒体服务器系统，提供视频播放、文件管理、用户认证和系统监控的一站式解决方案。它采用现代UI设计，结合高性能架构，让您的媒体管理变得简单高效。

🌟 核心优势

🎬 专业级视频播放系统
- ✅ 支持多种视频格式：MP4、MKV、WebM、AVI、FLV、MOV、3GP
- ✅ HLS 流媒体转码：自动适配不同设备，流畅播放
- ✅ 智能缩略图生成：为视频自动生成高质量缩略图
- ✅ Plyr 视频播放器集成：现代化播放体验，支持进度记录

📁 智能文件管理系统
- ✅ 拖拽上传：直观便捷的文件上传体验
- ✅ 智能分类存储：自动按类型分类存储（视频、音频、图片、文档等）
- ✅ 强大搜索功能：快速定位所需文件
- ✅ 批量操作：支持批量上传、下载、压缩/解压

👥 安全可靠的用户系统
- ✅ JWT Token 认证：安全的会话管理
- ✅ 自动续期 Refresh Token：提升用户体验
- ✅ 智能登录保护：失败锁定、验证码、密码强度验证
- ✅ 精细权限管理：从超级管理员到普通用户，角色分级管控

📊 实时系统监控
- ✅ CPU/内存/磁盘实时监控：全面掌握系统状态
- ✅ NVIDIA GPU 监控：显存、温度、占用率一目了然
- ✅ Socket.IO 实时推送：数据更新即时呈现

🛠 技术亮点
技术栈   优势   应用
Node.js 18+   现代、高性能运行环境   主服务运行

Express 4.21.0   轻量级、高效 Web 框架   API 路由处理

Redis + SQLite   双数据库架构，性能与可靠性兼得   缓存 + 数据持久化

Plyr 3.7.8   现代化视频播放器   视频播放体验

Socket.IO   实时通信能力   系统监控数据推送

📦 项目结构

```
LANStream-Pro/
├── .gitignore               # Git 忽略规则
├── LICENSE                  # MIT 开源许可证
├── README.md                # 项目文档
├── package.json             # Node.js 依赖与脚本配置
├── package-lock.json        # 依赖版本锁定文件
├── requirements.txt         # Python 依赖配置
├── server.js                # 主服务器入口
├── build.js                 # 打包构建脚本
├── create-admin.js          # 管理员账号创建工具
├── check-db.js              # 数据库完整性检查工具
├── check-db-readonly.js     # 数据库只读检查工具
├── check-videos.js          # 视频文件扫描工具
│
├── bin/                     # 二进制文件（需自行下载 FFmpeg）
│
├── config/                  # 配置文件
│   ├── index.js             # 主配置（端口、数据库、JWT等）
│   └── roles.js             # 角色权限配置
│
├── middleware/              # 中间件
│   └── auth.js              # JWT 认证中间件
│
├── routes/                  # API 路由层
│   ├── auth.js              # 认证路由（登录/注册/令牌刷新）
│   ├── files.js             # 文件管理路由（上传/下载/搜索）
│   ├── video.js             # 视频播放路由（HLS转码/进度记录）
│   ├── system.js            # 系统监控路由（CPU/内存/GPU）
│   └── admin.js             # 管理员路由（用户/权限管理）
│
├── utils/                   # 工具模块
│   ├── database.js          # SQLite 数据库管理
│   ├── redis.js             # Redis 缓存管理
│   ├── security.js          # 安全工具（密码哈希/令牌）
│   ├── logger.js            # 日志管理（Winston）
│   ├── system_monitor.py    # 系统监控脚本（Python）
│   └── gpu_monitor.py       # NVIDIA GPU 监控脚本（Python）
│
├── public/                  # 前端静态资源
│   ├── index.html           # 主页面
│   ├── admin.html           # 管理后台
│   ├── admin.html.backup    # 管理后台备份
│   ├── player.html          # 视频播放器页面
│   ├── profile.html         # 用户中心页面
│   ├── test.html            # 功能测试页面
│   │
│   ├── css/                 # 样式文件
│   │   ├── style.css        # 主样式
│   │   ├── login.css        # 登录页样式
│   │   ├── dashboard.css    # 仪表板样式
│   │   ├── video.css        # 视频页样式
│   │   ├── video-player.css # 播放器样式
│   │   ├── admin.css        # 管理后台样式
│   │   ├── profile.css      # 个人中心样式
│   │   └── file-manager.css # 文件管理器样式
│   │
│   └── js/                  # 前端脚本
│       ├── app.js           # 主应用逻辑
│       ├── api.js           # API 调用封装
│       ├── auth.js          # 认证模块
│       ├── admin.js         # 管理后台脚本
│       ├── profile.js       # 个人中心脚本
│       ├── transcoding-checker.js   # 转码状态检查器
│       └── playvideo-override.js    # 播放器覆盖逻辑
│
├── data/                    # 数据存储（运行时生成，已忽略）
├── logs/                    # 日志文件（运行时生成，已忽略）
└── uploads/                 # 上传文件目录（运行时生成，已忽略）
    ├── videos/              # 视频文件
    ├── audio/               # 音频文件
    ├── images/              # 图片文件
    ├── documents/           # 文档文件
    ├── archives/            # 压缩文件
    ├── thumbnails/          # 缩略图
    ├── hls/                 # HLS 转码片段
    └── files/               # 普通文件
```

🚀 快速开始

1️⃣ 环境准备
- Node.js v18+（推荐使用 Node.js 18 LTS）
- Python 3.8+（用于系统监控脚本）
- Redis（可选，作为缓存层）
- FFmpeg（需自行下载，放入 bin/ 目录）

安装依赖
npm install

运行项目（开发模式）
npm run dev

3️⃣ 访问应用
- 打开浏览器访问 http://localhost:3000
- 默认管理员账号：xxxxx / xxxxxxxx

💡 为什么选择 LANStream Pro？
特点   传统方案   LANStream Pro
易用性   复杂配置   一键安装，开箱即用

性能   低效处理   Redis + SQLite 双数据库优化

安全性   基础认证   JWT + Refresh Token + 智能保护

体验   简陋界面   现代化UI

扩展性   有限   完整的模块化架构

🌐 项目愿景

"让局域网媒体管理更简单" —— LANStream Pro

LANStream Pro 不仅是一个媒体服务器，更是您家庭或小型组织的数字媒体中心。我们致力于提供简单、安全、高效的媒体管理体验，让您的视频和文件管理变得轻松愉快。

📌 项目文档

- 快速安装指南
- API 参考
- 安全机制详解


📜 许可证

LANStream Pro 采用 MIT 许可证。详情请见 LICENSE 文件。
