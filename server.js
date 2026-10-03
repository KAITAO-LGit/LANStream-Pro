/**
 * LANStream Pro - 局域网视频播放和文件管理系统
 * 主服务器入口文件
 * 
 * 功能特性:
 * - 现代Web界面，仿腾讯视频/芒果视频风格
 * - 视频流媒体播放（HLS转码）
 * - 文件管理系统
 * - 用户认证与权限管理
 * - 服务器状态实时监控
 * - Redis + SQLite 双数据库架构
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const morgan = require('morgan');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const { spawn, exec } = require('child_process');

// ==================== Multer 文件上传配置（必须在路由加载前定义） ====================

// 创建上传目录
const uploadDirs = [
    path.join(__dirname, 'public/uploads/avatars'),
    path.join(__dirname, 'public/uploads/files')
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// 头像上传配置
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/uploads/avatars'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `avatar_${uniqueSuffix}${ext}`);
    }
});

global.avatarUpload = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件格式'));
        }
    }
});

// 文件上传配置
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/uploads/files'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `file_${uniqueSuffix}${ext}`);
    }
});

global.fileUpload = multer({
    storage: fileStorage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB
        files: 10 // 最多10个文件
    },
    // 优化：使用更高效的临时文件处理
    preservePath: false
});

// 导入自定义模块
const { logger, cleanup } = require('./utils/logger');
const { DatabaseManager } = require('./utils/database');
const { RedisManager } = require('./utils/redis');
const { AuthMiddleware } = require('./middleware/auth');
const { SecurityManager } = require('./utils/security');

// 导入路由
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const videoRoutes = require('./routes/video');
const systemRoutes = require('./routes/system');
const adminRoutes = require('./routes/admin');

// 导入配置
const config = require('./config');

const authMiddleware = new AuthMiddleware();

const app = express();
const server = http.createServer(app, {
    // 优化HTTP服务器配置
    maxConnections: 1000,
    timeout: 30000, // 30秒超时
    keepAliveTimeout: 5000, // 5秒keep-alive
    headersTimeout: 10000 // 10秒headers超时
});

// 优化Express JSON解析
app.use(express.json({
    limit: '50mb',
    // 优化JSON解析性能
    reviver: null,
    strict: true
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Socket.IO 配置（用于实时通信）
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    // 传输优化
    transports: ['websocket', 'polling'],
    // 允许长连接
    pingTimeout: 60000,
    pingInterval: 25000,
    // 连接超时设置
    connectTimeout: 10000,
    // 启用压缩（如果客户端支持）
    perMessageDeflate: {
        threshold: 1024
    },
    // 启用Socket.IO客户端文件服务
    serveClient: true
});

// ==================== 全局变量 ====================
global.appRoot = path.resolve(__dirname);
global.io = io;
global.connectedUsers = new Map();

// ==================== 中间件配置 ====================

// 解析JSON请求体
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cookie 解析（用于验证码签名）
app.use(cookieParser('lanstream-secret-key-2024'));

// 请求日志
app.use(morgan('combined', {
    stream: {
        write: (message) => logger.info(message.trim())
    }
}));

// Gzip 压缩中间件 - 显著减少传输数据量
app.use(compression({
    level: 6, // 压缩级别 1-9，6是平衡速度和压缩率的最佳选择
    threshold: 1024, // 只压缩大于1KB的响应
    filter: (req, res) => {
        // 不压缩图片和其他已经压缩的格式
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// 静态文件服务 - 添加缓存和压缩优化
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // 缓存1天
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // 为不同类型的文件设置不同的缓存策略
        if (filePath.match(/\.(js|css)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1天
        } else if (filePath.match(/\.(html|json)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1小时
        } else if (filePath.match(/\.(jpg|jpeg|png|gif|ico|svg|woff|woff2)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=604800'); // 7天
        }
    }
}));

// 专门提供 Socket.IO 客户端库
try {
    const socketIoPath = require.resolve('socket.io');
    const socketIoClientPath = path.join(socketIoPath, '..', 'client-dist', 'socket.io.min.js');
    
    if (fs.existsSync(socketIoClientPath)) {
        app.get('/socket.io/socket.io.min.js', (req, res) => {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.sendFile(socketIoClientPath);
        });
        logger.info('✅ Socket.IO 客户端库路由已添加');
    }
} catch (e) {
    logger.warn('⚠️ 无法找到 Socket.IO 客户端库:', e.message);
}

// 模板引擎配置
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'public'));

// ==================== OpenHardwareMonitor 控制 ====================

let hardwareMonitorProcess = null;

/**
 * 启动 OpenHardwareMonitor
 */
function startHardwareMonitor() {
    // 只在 Windows 平台上启动
    if (process.platform !== 'win32') {
        logger.info('ℹ️ OpenHardwareMonitor 仅支持 Windows 平台，跳过启动');
        return;
    }

    const ohwmPath = path.join(__dirname, 'OpenHardwareMonitor', 'OpenHardwareMonitor.exe');

    // 检查文件是否存在
    if (!fs.existsSync(ohwmPath)) {
        logger.warn('⚠️ OpenHardwareMonitor 不存在，跳过启动:', ohwmPath);
        return;
    }

    try {
        // 启动 OpenHardwareMonitor（隐藏窗口运行）
        hardwareMonitorProcess = spawn(ohwmPath, [], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });

        // 让进程脱离父进程管理
        hardwareMonitorProcess.unref();

        logger.info('✅ OpenHardwareMonitor 已启动（硬件监控）');
    } catch (error) {
        logger.error('❌ 启动 OpenHardwareMonitor 失败:', error.message);
    }
}

/**
 * 关闭 OpenHardwareMonitor
 */
function stopHardwareMonitor() {
    if (!hardwareMonitorProcess && process.platform !== 'win32') {
        return;
    }

    try {
        if (hardwareMonitorProcess) {
            // 方法1：通过进程对象关闭
            try {
                hardwareMonitorProcess.kill('SIGTERM');
                logger.info('✅ OpenHardwareMonitor 已关闭（通过进程句柄）');
            } catch (e) {
                // 忽略错误
            }
            hardwareMonitorProcess = null;
        }

        // 方法2：通过命令行查找并关闭所有 OpenHardwareMonitor 实例
        if (process.platform === 'win32') {
            try {
                exec('taskkill /F /IM OpenHardwareMonitor.exe /T', 
                    { encoding: 'utf8', windowsHide: true }, 
                    (error, stdout, stderr) => {
                        if (!error) {
                            logger.info('✅ OpenHardwareMonitor 进程已关闭');
                        }
                    }
                );
            } catch (e) {
                // 忽略关闭错误
            }
        }
    } catch (error) {
        logger.warn('⚠️ 关闭 OpenHardwareMonitor 时出错:', error.message);
    }
}

// ==================== 初始化数据库 ====================

async function initializeDatabases() {
    try {
        // 初始化SQLite数据库
        const dbManager = new DatabaseManager();
        await dbManager.initialize();
        global.db = dbManager;

        // 初始化Redis
        const redisManager = new RedisManager();
        await redisManager.initialize();
        global.redis = redisManager;

        logger.info('✅ 数据库初始化成功');
    } catch (error) {
        logger.error('❌ 数据库初始化失败:', error);
        process.exit(1);
    }
}

// ==================== 安全中间件 ====================

// CSRF保护（生产环境启用）
if (process.env.NODE_ENV === 'production') {
    app.use(csrf());
}

// 请求频率限制 - 主要限制突变操作（修改数据的请求）
const rateLimit = require('express-rate-limit');

// 突变操作限制（登录、注册、修改数据等）- 严格限制
const mutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 50, // 限制50个请求
    message: { error: '请求过于频繁，请稍后再试' },
    keyGenerator: (req) => req.ip + ':' + req.path // 按IP和路径区分
});

// 读取操作限制 - 宽松限制
const readLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 500, // 限制500个请求
    message: { error: '请求过于频繁，请稍后再试' },
    keyGenerator: (req) => req.ip
});

// 系统监控端点特殊处理 - 不限制（因为是只读操作且需要实时性）
const systemMonitorLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 60, // 每分钟60次，即每秒1次
    message: { error: '请求过于频繁，请稍后再试' },
    keyGenerator: (req) => req.ip
});

// 应用突变操作限制到需要严格限制的路径
app.use('/api/v1/auth/login', mutationLimiter);
app.use('/api/v1/auth/register', mutationLimiter);
app.use('/api/v1/auth/refresh', mutationLimiter);
app.use('/api/v1/files/upload', mutationLimiter);
app.use('/api/v1/admin/', mutationLimiter);

// 应用读取操作限制到普通API路径
app.use('/api/v1/files', readLimiter);
app.use('/api/v1/video', readLimiter);

// 系统监控端点使用专用限制器（更宽松）- 无需认证
app.use('/api/v1/system/realtime', systemMonitorLimiter);
app.use('/api/v1/system/overview', systemMonitorLimiter);
app.use('/api/v1/system/detailed', systemMonitorLimiter);

// 系统监控路由特殊处理 - 无需认证
app.use('/api/v1/system', (req, res, next) => {
    const path = req.path;
    
    // 无需认证的监控端点
    const publicMonitorEndpoints = [
        /^\/health$/,
        /^\/realtime$/,
        /^\/overview$/,
        /^\/detailed$/,
        /^\/diagnostic$/
    ];
    
    const isPublicMonitor = publicMonitorEndpoints.some(pattern => pattern.test(path));
    
    if (isPublicMonitor) {
        // 标记为已通过监控认证检查
        req.monitorAuthBypass = true;
    }
    
    next();
});

// ==================== 路由配置 ====================

// 视频流端点特殊处理 - 必须在所有其他中间件之前
// 这个中间件处理 /api/v1/video/* 请求，对于公开端点直接跳过认证
app.use('/api/v1/video', (req, res, next) => {
    const path = req.path;
    

    // 允许匿名访问的端点
    const publicEndpoints = [
        /^\/[a-f0-9-]+\/stream$/,
        /^\/[a-f0-9-]+\/playlist\.m3u8$/,
        /^\/[a-f0-9-]+\/thumbnail$/,
        /^\/[a-f0-9-]+\/info$/,
        /^\/[a-f0-9-]+\/transcode-progress$/,
        /^\/[a-f0-9-]+\/segment\//,
        /^\/[a-f0-9-]+\/segment$/,
        /^\/[a-f0-9-]+\/transcoding\.m3u8$/  // 转码中占位符
    ];

    const isPublicEndpoint = publicEndpoints.some(pattern => pattern.test(path));

    if (isPublicEndpoint) {
        // 标记这个请求已经通过视频认证检查
        req.videoAuthBypass = true;
        next();
        return;
    }

    // 其他视频端点需要认证（如收藏、进度记录等）
    authMiddleware.verify(req, res, next);
});

// 认证路由（无需认证中间件）
app.use('/api/v1/auth', authRoutes);

// 系统健康检查路由（无需认证）
app.use('/api/v1/system/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'LANStream Pro'
    });
});

// 系统诊断路由（无需认证）- 用于调试系统信息读取问题
app.use('/api/v1/system/diagnostic', (req, res) => {
    const { execSync } = require('child_process');
    const os = require('os');
    
    const diagnostic = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptime: process.uptime(),
        cpus: os.cpus().length,
        totalMemory: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        cpuModel: os.cpus()[0]?.model || 'Unknown',
        timestamp: new Date().toISOString()
    };
    
    // Windows 平台测试 WMI 查询
    if (process.platform === 'win32') {
        try {
            // 测试 CPU 查询
            const cpuTest = execSync(
                'powershell -Command "$p = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { Write-Output ($p.Name); Write-Output $p.CurrentClockSpeed } else { Write-Output FAILED }"',
                { encoding: 'utf8', timeout: 3000, windowsHide: true }
            );
            const lines = cpuTest.trim().split('\r\n').filter(l => l.trim());
            diagnostic.cpuWmiTest = {
                name: lines[0] || 'Unknown',
                speed: lines[1] || 'Unknown'
            };
        } catch (e) {
            diagnostic.cpuWmiTest = 'ERROR: ' + e.message;
        }
        
        try {
            // 测试 GPU 查询
            const gpuTest = execSync(
                'powershell -Command "Get-CimInstance -ClassName Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress"',
                { encoding: 'utf8', timeout: 3000, windowsHide: true }
            );
            diagnostic.gpuWmiTest = gpuTest.trim();
        } catch (e) {
            diagnostic.gpuWmiTest = 'ERROR: ' + e.message;
        }
        
        try {
            // 测试磁盘查询
            const diskTest = execSync(
                'powershell -Command "Get-CimInstance -ClassName Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object Name, Size, FreeSpace | ConvertTo-Json -Compress"',
                { encoding: 'utf8', timeout: 3000, windowsHide: true }
            );
            diagnostic.diskWmiTest = diskTest.trim();
        } catch (e) {
            diagnostic.diskWmiTest = 'ERROR: ' + e.message;
        }
    }
    
    res.json(diagnostic);
});

// 应用认证中间件到 /api/v1/ 下其他所有路由
app.use('/api/v1/', (req, res, next) => {
    const path = req.path;

    // 排除认证路由
    if (path.startsWith('/auth/')) {
        next();
        return;
    }

    // 排除视频端点
    // 使用 req.videoAuthBypass 标记来确定是否已经通过视频认证
    if (path.startsWith('/video/') || req.videoAuthBypass) {
        next();
        return;
    }

    // 排除系统健康检查
    if (path === '/system/health') {
        next();
        return;
    }
    
    // 排除系统监控端点（已标记为无需认证）
    if (req.monitorAuthBypass) {
        next();
        return;
    }

    // 其他所有端点需要认证
    authMiddleware.verify(req, res, next);
});

// 文件管理路由
app.use('/api/v1/files', fileRoutes);

// 视频流媒体路由 - 挂载在 /api/v1/video
// 这里的路由接收已经通过认证检查的请求（公开端点）或需要认证的请求
app.use('/api/v1/video', videoRoutes);

// 系统监控路由
app.use('/api/v1/system', systemRoutes);

// 管理员路由
app.use('/api/v1/admin', adminRoutes);

// SPA路由支持（前端路由）
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 管理员专用路由 - 独立管理界面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 其他前端路由都指向 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== Socket.IO 实时通信 ====================

io.on('connection', (socket) => {
    logger.info(`🔌 新客户端连接: ${socket.id}`);

    // 用户登录
    socket.on('user:login', async (data) => {
        const { userId, username } = data;
        
        // 检查用户状态
        const user = global.db.getUserById(userId);
        if (!user) {
            logger.warn(`🚫 用户 ${username} (${userId}) 被禁止登录：用户不存在`);
            socket.emit('user:blocked', { message: '账户不存在' });
            socket.disconnect();
            return;
        }
        
        // 检查用户状态（支持新的status字段和旧的is_active字段）
        const userStatus = user.status || (user.is_active ? 'active' : 'disabled');
        const blockedStatuses = ['disabled', 'locked', 'suspended'];
        
        if (blockedStatuses.includes(userStatus)) {
            const messages = {
                'disabled': '账户已被禁用，请联系管理员',
                'locked': '账户已被锁定，请联系管理员',
                'suspended': '账户已被临时停用'
            };
            logger.warn(`🚫 用户 ${username} (${userId}) 被禁止登录：状态为 ${userStatus}`);
            socket.emit('user:blocked', { message: messages[userStatus] || '账户状态异常' });
            socket.disconnect();
            return;
        }
        
        // 清理该用户的旧连接（防止同一用户多标签页重复登录）
        let removedOldConnections = false;
        for (const [socketId, connData] of global.connectedUsers.entries()) {
            if (connData.userId === userId) {
                // 断开旧连接
                if (connData.socket && connData.socket.id) {
                    connData.socket.disconnect();
                    logger.debug(`🔌 断开用户 ${username} 的旧连接: ${socketId}`);
                }
                global.connectedUsers.delete(socketId);
                removedOldConnections = true;
            }
        }
        
        // 将用户角色存储到socket对象
        socket.userRole = user.role;
        
        global.connectedUsers.set(socket.id, { userId, username, role: user.role, socket });
        logger.info(`👤 用户 ${username} (${user.role}) 已登录${removedOldConnections ? '（已清理旧连接）' : ''}`);
        
        // 确认登录成功
        socket.emit('user:login:ack', { success: true });
        
        // 广播给管理员
        io.to('admin').emit('user:online', { 
            userId, 
            username, 
            count: global.connectedUsers.size 
        });
    });

    // 订阅服务器状态
    socket.on('subscribe:stats', () => {
        socket.join('stats');
        logger.debug(`客户端 ${socket.id} 订阅了服务器状态`);
    });

    // 订阅管理员通知
    socket.on('subscribe:admin', () => {
        // 超级管理员和管理员都可以接收管理员通知
        if (socket.userRole === 'superadmin' || socket.userRole === 'admin') {
            socket.join('admin');
        }
    });

    // 用户主动登出（而不是断开连接）
    socket.on('user:logout', (data) => {
        const { userId, username } = data;
        // 检查是否是当前 socket 的用户
        const existingUser = global.connectedUsers.get(socket.id);
        if (existingUser && existingUser.userId === userId) {
            global.connectedUsers.delete(socket.id);
            logger.info(`👤 用户 ${username} 已主动登出`);

            // 广播给管理员
            io.to('admin').emit('user:offline', {
                userId,
                username,
                count: global.connectedUsers.size
            });
        }
    });

    // 文件传输进度
    socket.on('file:uploadProgress', (data) => {
        io.to('admin').emit('system:uploadProgress', data);
    });

    // 断开连接
    socket.on('disconnect', () => {
        const user = global.connectedUsers.get(socket.id);
        if (user) {
            logger.info(`👤 用户 ${user.username} 已断开连接`);
            global.connectedUsers.delete(socket.id);
            
            io.to('admin').emit('user:offline', {
                userId: user.userId,
                username: user.username,
                count: global.connectedUsers.size
            });
        }
        logger.debug(`🔌 客户端断开: ${socket.id}`);
    });
});

// ==================== 服务器状态监控 ====================

function startSystemMonitor() {
    // 优化：减少监控频率以降低CPU开销
    // 使用动态调整的间隔
    let monitorInterval = 2000;
    let consecutiveErrors = 0;

    setInterval(async () => {
        try {
            const stats = {
                cpu: await getCPUUsage(),
                memory: getMemoryUsage(),
                disk: getDiskUsage(),
                network: getNetworkStats(),
                uptime: process.uptime(),
                activeConnections: global.connectedUsers.size,
                timestamp: Date.now()
            };

            // 缓存到Redis（错误时不阻塞）
            global.redis.set('system:stats', JSON.stringify(stats), 60).catch(() => {});

            // 通过Socket推送
            io.to('stats').emit('system:stats', stats);

            // 成功时恢复正常间隔
            consecutiveErrors = 0;
            monitorInterval = 2000;

        } catch (error) {
            logger.error('系统监控错误:', error);
            consecutiveErrors++;

            // 连续错误时增加间隔
            if (consecutiveErrors >= 3) {
                monitorInterval = 5000; // 错误时降级到5秒
            }
        }
    }, monitorInterval);
}

function getCPUUsage() {
    // 使用更高效的CPU使用率计算方法
    // 直接返回当前进程信息，不使用定时器延迟
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
        for (const type in cpu.times) {
            totalTick += cpu.times[type];
            if (type === 'idle') {
                totalIdle += cpu.times.idle;
            }
        }
    }

    // 返回估计的CPU使用率（基于所有CPU核心的平均值）
    const usage = 100 - (totalIdle / totalTick * 100);
    return Promise.resolve(Math.min(100, Math.max(0, usage)));
}

function getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
        total: (total / 1024 / 1024 / 1024).toFixed(2), // GB
        used: (used / 1024 / 1024 / 1024).toFixed(2),
        free: (free / 1024 / 1024 / 1024).toFixed(2),
        percent: ((used / total) * 100).toFixed(1)
    };
}

function getDiskUsage() {
    const drive = process.cwd().split(path.sep)[0] + path.sep;
    try {
        // 使用更高效的磁盘信息获取方法
        if (process.platform === 'win32') {
            // Windows平台优先使用 WMI 查询（比 PowerShell 更高效）
            try {
                const { execSync } = require('child_process');
                // 使用更简洁的 WMI 查询
                const wmiOutput = execSync(
                    `powershell -Command "Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3' | Where-Object {$_.Name -eq '${drive}'} | Select-Object Name, Size, FreeSpace | ConvertTo-Json -Compress"`,
                    { encoding: 'utf8', timeout: 3000, windowsHide: true }
                );

                if (wmiOutput && wmiOutput.trim()) {
                    const driveData = JSON.parse(wmiOutput);
                    const total = parseInt(driveData.Size) || 0;
                    const free = parseInt(driveData.FreeSpace) || 0;
                    const used = total - free;

                    if (total > 0) {
                        return {
                            drive,
                            total: (total / 1024 / 1024 / 1024).toFixed(2),
                            used: (used / 1024 / 1024 / 1024).toFixed(2),
                            free: (free / 1024 / 1024 / 1024).toFixed(2),
                            percent: ((used / total) * 100).toFixed(1)
                        };
                    }
                }
            } catch (e) {
                // WMI失败时尝试使用 fs 模块获取基本统计信息
                logger.debug('WMI获取磁盘信息失败，尝试备用方法:', e.message);
            }

            // 备用方法：使用 fs.statfs（需要 Node.js 18+ 或模拟）
            try {
                if (typeof fs.statfsSync === 'function') {
                    const stats = fs.statfsSync(drive);
                    const total = stats.total;
                    const free = stats.available;
                    const used = total - free;
                    return {
                        drive,
                        total: (total / 1024 / 1024 / 1024).toFixed(2),
                        used: (used / 1024 / 1024 / 1024).toFixed(2),
                        free: (free / 1024 / 1024 / 1024).toFixed(2),
                        percent: ((used / total) * 100).toFixed(1)
                    };
                }
            } catch (backupError) {
                logger.debug('备用磁盘获取方法也失败:', backupError.message);
            }

            // 最终备用：返回基本响应避免错误
            return { drive, error: '无法获取磁盘信息' };
        } else {
            // Linux/macOS 平台
            const stats = fs.statfsSync(drive);
            const total = stats.total;
            const free = stats.available;
            const used = total - free;
            return {
                drive,
                total: (total / 1024 / 1024 / 1024).toFixed(2),
                used: (used / 1024 / 1024 / 1024).toFixed(2),
                free: (free / 1024 / 1024 / 1024).toFixed(2),
                percent: ((used / total) * 100).toFixed(1)
            };
        }
    } catch (e) {
        // 完全失败时返回基本响应
        logger.error('获取磁盘信息失败:', e.message);
        return { drive, error: '无法获取磁盘信息' };
    }
}

function getNetworkStats() {
    const interfaces = os.networkInterfaces();
    let localIP = '未知';
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIP = iface.address;
                break;
            }
        }
    }
    
    return {
        localIP,
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch()
    };
}

// ==================== 创建默认管理员 ====================

async function createDefaultAdmin() {
    try {
        const security = new SecurityManager();
        const defaultAdmin = await global.db.getUserByUsername('admin');
        
        if (!defaultAdmin) {
            const hashedPassword = await security.hashPassword('admin123');
            await global.db.createUser({
                username: 'admin',
                password: hashedPassword,
                role: 'superadmin',
                email: 'admin@lanstream.local'
            });
            logger.info('✅ 默认超级管理员账户已创建 (admin/admin123)');
        } else if (defaultAdmin.role !== 'superadmin') {
            // 将现有admin升级为superadmin
            global.db.updateUser(defaultAdmin.id, { role: 'superadmin' });
            logger.info('✅ 现有管理员已升级为超级管理员');
        }
    } catch (error) {
        logger.error('创建默认管理员失败:', error);
    }
}

// ==================== 启动服务器 ====================

async function startServer() {
    try {
        // 初始化数据库
        await initializeDatabases();

        // 创建默认管理员
        await createDefaultAdmin();

        // 启动系统监控
        startSystemMonitor();

        // 启动 OpenHardwareMonitor（硬件监控）
        startHardwareMonitor();

        // 获取本地IP
        const interfaces = os.networkInterfaces();
        let localIP = 'localhost';
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIP = iface.address;
                    break;
                }
            }
        }

        const PORT = config.port || 3000;
        
        server.listen(PORT, () => {
            logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 LANStream Pro v${config.version} 服务器已启动               ║
║                                                           ║
║   📡 访问地址:                                             ║
║      - 用户界面: http://localhost:${PORT}                    ║
║      - 管理后台: http://localhost:${PORT}/admin              ║
║      - 局域网:   http://${localIP}:${PORT}                    ║
║                                                           ║
║   👤 默认超级管理员: admin / admin123                       ║
║                                                           ║
║   📖 文档: http://localhost:${PORT}/docs                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
            `);
        });

        // 优雅关闭
        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);

    } catch (error) {
        logger.error('服务器启动失败:', error);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    logger.info('🛑 正在关闭服务器...');

    try {
        // 关闭 OpenHardwareMonitor
        stopHardwareMonitor();

        // 确保日志缓冲区中的所有日志都写入数据库
        // 必须在关闭数据库之前调用
        if (typeof cleanup === 'function') {
            await cleanup();
        }

        // 强制断开所有 Socket.IO 连接
        if (global.io) {
            try {
                global.io.engine.close();
            } catch (e) {
                // 忽略关闭错误
            }
        }

        // 关闭数据库连接
        if (global.db) {
            await global.db.close();
        }

        // 关闭Redis连接
        if (global.redis) {
            await global.redis.close();
        }

        // 强制关闭 HTTP 服务器
        server.close(() => {
            logger.info('✅ 服务器已安全关闭');
            process.exit(0);
        });

        // 强制退出（防止挂起）
        setTimeout(() => {
            logger.info('⚠️ 强制关闭服务器');
            process.exit(1);
        }, 3000);
    } catch (error) {
        logger.error('关闭服务器时出错:', error);
        process.exit(1);
    }
}

// ==================== 全局错误处理 ====================

// 捕获未处理的 Promise 拒绝 - 使用同步输出确保错误信息不丢失
process.on('unhandledRejection', (reason, promise) => {
    try {
        // 安全地将reason转换为字符串，避免再次抛出
        let reasonStr;
        if (reason === null) {
            reasonStr = 'null';
        } else if (reason === undefined) {
            reasonStr = 'undefined';
        } else if (typeof reason === 'string') {
            reasonStr = reason;
        } else if (reason instanceof Error) {
            reasonStr = reason.message;
        } else if (typeof reason === 'object') {
            // 检查是否是Promise对象
            if (reason.$$typeof === 'undefined' && typeof reason.then === 'function') {
                reasonStr = 'Promise对象未正确await';
            } else {
                try {
                    reasonStr = JSON.stringify(reason);
                } catch (e) {
                    reasonStr = String(reason);
                }
            }
        } else {
            reasonStr = String(reason);
        }
        
        const stackStr = reason?.stack || '无堆栈信息';
        const promiseStr = promise?.toString()?.substring(0, 100) || 'unknown';
        
        // 使用 console.error 确保错误信息被立即输出
        console.error('========================================');
        console.error('🚨 未处理的 Promise 拒绝');
        console.error('========================================');
        console.error('错误信息:', reasonStr);
        console.error('堆栈跟踪:', stackStr);
        console.error('Promise:', promiseStr);
        console.error('========================================');
        
        // 同时使用 logger 记录
        logger.error('未处理的 Promise 拒绝 - 错误:', reasonStr);
        logger.error('堆栈:', stackStr);
        logger.error('Promise:', promiseStr);
    } catch (e) {
        console.error('处理未处理Promise拒绝时出错:', e.message);
    }
});

// 捕获未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('========================================');
    console.error('🚨 未捕获的异常');
    console.error('========================================');
    console.error('错误信息:', error.message);
    console.error('堆栈跟踪:', error.stack);
    console.error('========================================');
    
    logger.error('未捕获的异常:', error.message);
    logger.error('堆栈:', error.stack);
    
    // 尝试优雅关闭
    gracefulShutdown();
});

// 处理 Promise rejection 警告（Node.js 15+）
process.on('rejectionHandled', (promise) => {
    const promiseStr = promise?.toString()?.substring(0, 100) || 'unknown';
    console.warn('⚠️ Promise rejection 已被处理:', promiseStr);
    logger.warn('Promise rejection 已被处理:', promiseStr);
});

// 处理多个 unhandledRejection 监听器
let rejectionCount = 0;
const maxRejectionsBeforeExit = 10;

process.on('unhandledRejection', (reason) => {
    rejectionCount++;
    console.warn(`⚠️ Promise 拒绝计数: ${rejectionCount}/${maxRejectionsBeforeExit}`);
    
    if (rejectionCount >= maxRejectionsBeforeExit) {
        console.error('🚨 检测到过多的未处理 Promise 拒绝，正在关闭服务器...');
        logger.error(`检测到过多的未处理 Promise 拒绝 (${rejectionCount}次)，正在关闭服务器...`);
        gracefulShutdown();
    }
});

// Express 错误处理中间件
app.use((err, req, res, next) => {
    logger.error('请求处理错误:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl
    });
    
    // 避免在生产环境暴露内部错误
    const isDev = process.env.NODE_ENV !== 'production';
    
    res.status(err.status || 500).json({
        success: false,
        error: isDev ? err.message : '服务器内部错误',
        ...(isDev && { stack: err.stack })
    });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: '请求的资源不存在'
    });
});

// 启动服务器
startServer();

// 导出app供测试使用
module.exports = { app, server, io };
