/**
 * 管理员路由
 * 提供用户管理、系统配置等管理员功能
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { SecurityManager } = require('../utils/security');
const { logger } = require('../utils/logger');
const config = require('../config');

const security = new SecurityManager();

// ==================== 中间件 ====================

// 所有路由都需要管理员权限（包含超级管理员）
router.use(async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: '请先登录'
        });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({
            success: false,
            error: '权限不足，仅管理员可访问'
        });
    }

    next();
});

// ==================== 用户管理 ====================

/**
 * 获取所有用户列表
 * GET /api/admin/users
 */
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 20, search, role, status } = req.query;
        const offset = (page - 1) * limit;

        // 先获取用户数据
        let users = global.db.getAllUsers(limit + 1, offset);
        
        // 如果有搜索条件，进行过滤
        if (search) {
            users = users.filter(u => 
                u.username.toLowerCase().includes(search.toLowerCase()) ||
                (u.display_name && u.display_name.toLowerCase().includes(search.toLowerCase())) ||
                (u.email && u.email.toLowerCase().includes(search.toLowerCase()))
            );
        }

        // 如果有角色过滤
        if (role && role !== 'all') {
            users = users.filter(u => u.role === role);
        }

        // 如果有状态过滤
        if (status && status !== 'all') {
            users = users.filter(u => u.status === status);
        }

        // 检查是否还有更多
        const hasMore = users.length > limit;
        if (hasMore) {
            users = users.slice(0, limit);
        }

        // 统计总数 - 使用数据库统计避免全量查询
        let total;
        if (search || (role && role !== 'all') || (status && status !== 'all')) {
            // 有筛选条件时，统计已加载的数据作为近似值（避免全量查询）
            const allLoadedUsers = global.db.getAllUsers(10000, 0);
            let filteredUsers = allLoadedUsers;
            
            if (search) {
                filteredUsers = filteredUsers.filter(u => 
                    u.username.toLowerCase().includes(search.toLowerCase()) ||
                    (u.display_name && u.display_name.toLowerCase().includes(search.toLowerCase())) ||
                    (u.email && u.email.toLowerCase().includes(search.toLowerCase()))
                );
            }
            
            if (role && role !== 'all') {
                filteredUsers = filteredUsers.filter(u => u.role === role);
            }
            
            if (status && status !== 'all') {
                filteredUsers = filteredUsers.filter(u => u.status === status);
            }
            
            total = filteredUsers.length;
        } else {
            // 无筛选条件时使用优化后的统计函数
            total = global.db.getUserCount();
        }

        res.json({
            success: true,
            data: {
                users: users.map(u => security.sanitizeUser(u)),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    hasMore
                }
            }
        });
    } catch (error) {
        logger.error('获取用户列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取用户列表失败'
        });
    }
});

/**
 * 获取用户详情
 * GET /api/admin/users/:id
 */
router.get('/users/:id', async (req, res) => {
    try {
        const user = global.db.getUserById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        // 获取用户统计数据
        const history = global.db.getUserHistory(user.id, 10);
        const favorites = global.db.getUserFavorites(user.id);
        const transfers = global.db.getUserTransferTasks(user.id);

        res.json({
            success: true,
            data: {
                user: security.sanitizeUser(user),
                stats: {
                    watchedCount: history.length,
                    favoritesCount: favorites.length,
                    totalTransfers: transfers.length,
                    uploadCount: transfers.filter(t => t.type === 'upload').length,
                    downloadCount: transfers.filter(t => t.type === 'download').length
                },
                recentHistory: history
            }
        });
    } catch (error) {
        logger.error('获取用户详情失败:', error);
        res.status(500).json({
            success: false,
            error: '获取用户详情失败'
        });
    }
});

/**
 * 创建用户
 * POST /api/admin/users
 */
router.post('/users', async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }

        // 验证用户名格式
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
            return res.status(400).json({
                success: false,
                error: '用户名必须为3-20个字母、数字或下划线'
            });
        }

        // 验证密码强度
        const passwordValidation = security.validatePasswordStrength(password);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: '密码不符合要求',
                details: passwordValidation.errors
            });
        }

        // 检查用户名是否已存在
        const existingUser = global.db.getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: '用户名已存在'
            });
        }

        // 验证角色
        const validRoles = ['superadmin', 'admin', 'moderator', 'vip', 'user'];
        // 只有超级管理员可以创建超级管理员
        const requestingSuperadmin = role === 'superadmin';
        const isSuperadmin = req.user.role === 'superadmin';
        
        let userRole;
        if (requestingSuperadmin && !isSuperadmin) {
            // 非超级管理员不能创建超级管理员
            userRole = 'admin';
        } else {
            userRole = validRoles.includes(role) ? role : 'user';
        }

        // 哈希密码
        const passwordHash = await security.hashPassword(password);

        // 创建用户
        const user = await global.db.createUser({
            username,
            email: email || null,
            password: passwordHash,
            role: userRole
        });

        logger.info(`管理员 ${req.user.username} 创建新用户: ${username}`);

        res.status(201).json({
            success: true,
            message: '用户创建成功',
            data: { user: security.sanitizeUser(user) }
        });
    } catch (error) {
        logger.error('创建用户失败:', error);
        res.status(500).json({
            success: false,
            error: error.message || '创建用户失败'
        });
    }
});

/**
 * 更新用户信息
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', async (req, res) => {
    try {
        const { email, role, status } = req.body;

        const user = global.db.getUserById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        // 超级管理员不能给自己降级或修改状态
        const isModifyingSelf = req.params.id === req.user.id;
        if (isModifyingSelf && req.user.role === 'superadmin') {
            // 检查是否要修改角色（降级）
            if (role !== undefined && role !== 'superadmin') {
                return res.status(400).json({
                    success: false,
                    error: '超级管理员不能给自己降级'
                });
            }
            // 检查是否要修改状态
            if (status !== undefined && status !== user.status) {
                return res.status(400).json({
                    success: false,
                    error: '超级管理员不能修改自己的账户状态'
                });
            }
        } else {
            // 非超级管理员不能修改自己的状态
            if (isModifyingSelf && status !== undefined && status !== user.status) {
                return res.status(400).json({
                    success: false,
                    error: '不能修改自己的账户状态'
                });
            }
        }

        // 更新用户
        const updates = {};
        if (email !== undefined) updates.email = email;
        
        // 角色更新逻辑
        if (role !== undefined) {
            const validRoles = ['superadmin', 'admin', 'moderator', 'vip', 'user'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    success: false,
                    error: '无效的角色类型'
                });
            }
            
            // 只有超级管理员可以设置其他用户为超级管理员
            if (role === 'superadmin' && req.user.role !== 'superadmin') {
                return res.status(403).json({
                    success: false,
                    error: '只有超级管理员可以创建超级管理员'
                });
            }
            
            // 不能修改其他超级管理员的角色（除非自己是超级管理员）
            if (user.role === 'superadmin' && !isModifyingSelf && req.user.role !== 'superadmin') {
                return res.status(403).json({
                    success: false,
                    error: '不能修改超级管理员的角色'
                });
            }
            
            updates.role = role;
        }
        
        // 状态更新逻辑
        if (status !== undefined) {
            const validStatuses = ['active', 'pending', 'locked', 'suspended', 'disabled'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: '无效的状态类型'
                });
            }
            updates.status = status;
            
            // 如果禁用用户，立即断开其WebSocket连接
            if (status === 'disabled') {
                // 查找该用户的所有活跃连接
                for (const [socketId, connectedUser] of global.connectedUsers) {
                    if (connectedUser.userId === req.params.id) {
                        const socket = connectedUser.socket;
                        if (socket) {
                            socket.emit('user:blocked', { message: '账户已被管理员禁用' });
                            socket.disconnect();
                        }
                        global.connectedUsers.delete(socketId);
                        logger.info(`👤 用户 ${user.username} 的连接已因账户禁用而被断开`);
                    }
                }
            }
            
            // 如果用户状态变为锁定或停用，也需要断开连接
            if (status === 'locked' || status === 'suspended') {
                for (const [socketId, connectedUser] of global.connectedUsers) {
                    if (connectedUser.userId === req.params.id) {
                        const socket = connectedUser.socket;
                        const statusMessages = {
                            'locked': '账户已被锁定，请联系管理员',
                            'suspended': '账户已被临时停用'
                        };
                        if (socket) {
                            socket.emit('user:blocked', { message: statusMessages[status] });
                            socket.disconnect();
                        }
                        global.connectedUsers.delete(socketId);
                        logger.info(`👤 用户 ${user.username} 的连接已因状态变为 ${status} 而被断开`);
                    }
                }
            }
        }

        global.db.updateUser(req.params.id, updates);

        // 广播用户状态更新事件给管理员，刷新用户列表
        io.to('admin').emit('user:updated', {
            userId: req.params.id,
            username: user.username,
            status: updates.status
        });

        logger.info(`管理员 ${req.user.username} 更新用户 ${user.username} 的信息`);

        res.json({
            success: true,
            message: '用户信息已更新'
        });
        
        if (is_active !== undefined) {
            const newStatus = is_active ? 1 : 0;
            updates.is_active = newStatus;
            
            // 如果禁用用户，立即断开其WebSocket连接
            if (newStatus === 0) {
                // 查找该用户的所有活跃连接
                for (const [socketId, connectedUser] of global.connectedUsers) {
                    if (connectedUser.userId === req.params.id) {
                        const socket = connectedUser.socket;
                        if (socket) {
                            socket.emit('user:blocked', { message: '账户已被管理员禁用' });
                            socket.disconnect();
                        }
                        global.connectedUsers.delete(socketId);
                        logger.info(`👤 用户 ${user.username} 的连接已因账户禁用而被断开`);
                    }
                }
            }
        }

        global.db.updateUser(req.params.id, updates);

        // 广播用户状态更新事件给管理员，刷新用户列表
        io.to('admin').emit('user:updated', {
            userId: req.params.id,
            username: user.username,
            is_active: updates.is_active
        });

        logger.info(`管理员 ${req.user.username} 更新用户 ${user.username} 的信息`);

        res.json({
            success: true,
            message: '用户信息已更新'
        });
    } catch (error) {
        logger.error('更新用户失败:', error);
        res.status(500).json({
            success: false,
            error: '更新用户失败'
        });
    }
});

/**
 * 重置用户密码
 * POST /api/admin/users/:id/reset-password
 */
router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const { newPassword } = req.body;

        const user = global.db.getUserById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        // 验证新密码强度
        const passwordValidation = security.validatePasswordStrength(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: '新密码不符合要求',
                details: passwordValidation.errors
            });
        }

        // 哈希新密码
        const passwordHash = await security.hashPassword(newPassword);

        // 更新密码
        global.db.updatePassword(req.params.id, passwordHash);

        logger.info(`管理员 ${req.user.username} 重置了用户 ${user.username} 的密码`);

        res.json({
            success: true,
            message: '密码已重置'
        });
    } catch (error) {
        logger.error('重置密码失败:', error);
        res.status(500).json({
            success: false,
            error: '重置密码失败'
        });
    }
});

/**
 * 删除用户
 * DELETE /api/admin/users/:id
 */
router.delete('/users/:id', async (req, res) => {
    try {
        const user = global.db.getUserById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        // 不能删除自己
        if (req.params.id === req.user.id) {
            return res.status(400).json({
                success: false,
                error: '不能删除自己的账户'
            });
        }

        // 不能删除超级管理员（保证系统中至少保留一个超级管理员）
        if (user.role === 'superadmin') {
            return res.status(400).json({
                success: false,
                error: '不能删除超级管理员账户'
            });
        }

        // 彻底删除用户
        global.db.deleteUser(req.params.id);

        // 查找该用户的所有活跃连接并断开
        for (const [socketId, connectedUser] of global.connectedUsers) {
            if (connectedUser.userId === req.params.id) {
                const socket = connectedUser.socket;
                if (socket) {
                    socket.emit('user:blocked', { message: '账户已被管理员删除' });
                    socket.disconnect();
                }
                global.connectedUsers.delete(socketId);
                logger.info(`👤 用户 ${user.username} 的连接已因账户删除而被断开`);
            }
        }

        // 广播用户删除事件给管理员
        io.to('admin').emit('user:deleted', {
            userId: req.params.id,
            username: user.username
        });

        logger.info(`管理员 ${req.user.username} 彻底删除了用户 ${user.username}`);

        res.json({
            success: true,
            message: '用户已彻底删除'
        });
    } catch (error) {
        logger.error('删除用户失败:', error);
        res.status(500).json({
            success: false,
            error: '操作失败'
        });
    }
});

// ==================== 系统配置 ====================

/**
 * 获取系统配置
 * GET /api/admin/config
 */
router.get('/config', async (req, res) => {
    try {
        const dbConfig = global.db.getAllConfig();

        // 格式化配置，返回前端期望的格式
        const configData = {
            port: parseInt(dbConfig.server_port) || 3000,
            upload_limit: parseInt(dbConfig.max_upload_size) || 500,
            session_timeout: parseInt(dbConfig.session_timeout) || 120,
            enable_captcha: dbConfig.enable_captcha !== 'false',
            site_name: dbConfig.site_name || 'LANStream Pro',
            allow_registration: dbConfig.allow_registration !== 'false'
        };

        res.json({
            success: true,
            data: configData
        });
    } catch (error) {
        logger.error('获取系统配置失败:', error);
        res.status(500).json({
            success: false,
            error: '获取配置失败'
        });
    }
});

/**
 * 更新系统配置
 * PUT /api/admin/config
 */
router.put('/config', async (req, res) => {
    try {
        const { port, upload_limit, session_timeout, enable_captcha, site_name, allow_registration } = req.body;

        // 更新各项配置
        if (port && port >= 1 && port <= 65535) {
            global.db.setConfig('server_port', port.toString(), '服务器端口');
        }
        if (upload_limit && upload_limit >= 1 && upload_limit <= 2000) {
            global.db.setConfig('max_upload_size', upload_limit.toString(), '最大上传文件大小(MB)');
        }
        if (session_timeout && session_timeout >= 5 && session_timeout <= 10080) {
            global.db.setConfig('session_timeout', session_timeout.toString(), '会话超时时间(分钟)');
        }
        global.db.setConfig('enable_captcha', enable_captcha ? 'true' : 'false', '启用验证码');
        if (site_name) {
            global.db.setConfig('site_name', site_name, '站点名称');
        }
        global.db.setConfig('allow_registration', allow_registration ? 'true' : 'false', '允许注册');

        logger.info(`管理员 ${req.user.username} 更新了系统配置`);

        res.json({
            success: true,
            message: '配置已更新'
        });
    } catch (error) {
        logger.error('更新配置失败:', error);
        res.status(500).json({
            success: false,
            error: '更新配置失败'
        });
    }
});

// ==================== 统计报表 ====================

/**
 * 获取管理仪表盘数据
 * GET /api/admin/dashboard
 */
router.get('/dashboard', async (req, res) => {
    try {
        const [fileStats, userStats] = await Promise.all([
            global.db.getFileStats(),
            global.db.getUserStats()
        ]);

        // 获取在线用户
        const onlineUsers = getConnectedUsersInfo();

        // 计算存储统计
        let totalStorage = 0;
        let videoCount = 0;
        let imageCount = 0;

        for (const stat of fileStats) {
            totalStorage += stat.total_size;
            if (stat.type === 'video') videoCount = stat.count;
            if (stat.type === 'image') imageCount = stat.count;
        }

        // 获取最近活动
        const recentLogs = global.db.getSystemLogs(null, 20);

        res.json({
            success: true,
            data: {
                overview: {
                    totalUsers: userStats.total,
                    activeUsers: userStats.active,
                    totalAdmins: userStats.admins,
                    superAdmins: userStats.superadmins || 0,
                    totalFiles: fileStats.reduce((sum, s) => sum + s.count, 0),
                    totalStorage: (totalStorage / 1024 / 1024 / 1024).toFixed(2),
                    videoCount,
                    imageCount
                },
                online: {
                    count: onlineUsers.length,
                    users: onlineUsers
                },
                recentLogs: recentLogs.map(log => ({
                    level: log.level,
                    message: log.message,
                    createdAt: log.created_at
                }))
            }
        });
    } catch (error) {
        logger.error('获取仪表盘数据失败:', error);
        res.status(500).json({
            success: false,
            error: '获取数据失败'
        });
    }
});

/**
 * 获取在线用户信息
 */
function getConnectedUsersInfo() {
    const users = [];
    for (const [socketId, data] of global.connectedUsers) {
        users.push({
            socketId,
            username: data.username,
            userId: data.userId,
            connectedAt: data.connectedAt
        });
    }
    return users;
}

// ==================== 文件管理 ====================

/**
 * 获取所有文件统计
 * GET /api/admin/files/stats
 */
router.get('/files/stats', async (req, res) => {
    try {
        const stats = global.db.getFileStats();

        res.json({
            success: true,
            data: {
                stats: stats.map(s => ({
                    type: s.type,
                    count: s.count,
                    totalSize: (s.total_size / 1024 / 1024 / 1024).toFixed(2)
                }))
            }
        });
    } catch (error) {
        logger.error('获取文件统计失败:', error);
        res.status(500).json({
            success: false,
            error: '获取统计失败'
        });
    }
});

/**
 * 获取大文件列表
 * GET /api/admin/files/large
 */
router.get('/files/large', async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const videos = global.db.getVideoFiles(100, 0);
        const largeFiles = videos
            .filter(v => v.size > 1024 * 1024 * 1024) // 大于1GB
            .sort((a, b) => b.size - a.size)
            .slice(0, parseInt(limit))
            .map(v => ({
                id: v.id,
                name: v.name,
                size: (v.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                thumbnail: v.thumbnail,
                createdAt: v.created_at
            }));

        res.json({
            success: true,
            data: { files: largeFiles }
        });
    } catch (error) {
        logger.error('获取大文件列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取列表失败'
        });
    }
});

/**
 * 清理无效文件
 * POST /api/admin/files/cleanup
 */
router.post('/files/cleanup', async (req, res) => {
    try {
        // 获取所有文件记录
        const allFiles = global.db.getFolderContents(null, {
            type: 'all',
            limit: 10000,
            offset: 0
        });

        let removedCount = 0;
        const missingFiles = [];

        for (const file of allFiles) {
            if (file.type !== 'folder' && !fs.existsSync(file.path)) {
                // 文件不存在，标记为删除
                global.db.deleteFile(file.id);
                removedCount++;
                missingFiles.push(file.name);
            }
        }

        logger.info(`管理员 ${req.user.username} 清理了 ${removedCount} 个无效文件`);

        res.json({
            success: true,
            message: `清理完成，移除了 ${removedCount} 个无效文件`,
            data: { removedCount, missingFiles }
        });
    } catch (error) {
        logger.error('清理文件失败:', error);
        res.status(500).json({
            success: false,
            error: '清理失败'
        });
    }
});

// ==================== 系统操作 ====================

/**
 * 记录系统日志
 * POST /api/admin/logs
 */
router.post('/logs', async (req, res) => {
    try {
        const { level, message, context } = req.body;

        if (!level || !message) {
            return res.status(400).json({
                success: false,
                error: '日志级别和消息不能为空'
            });
        }

        global.db.log(level, message, context);

        res.json({
            success: true,
            message: '日志已记录'
        });
    } catch (error) {
        logger.error('记录日志失败:', error);
        res.status(500).json({
            success: false,
            error: '记录失败'
        });
    }
});

/**
 * 获取所有传输任务
 * GET /api/admin/transfers
 */
router.get('/transfers', async (req, res) => {
    try {
        // 获取所有用户近期的传输任务
        const users = global.db.getAllUsers(1000, 0);
        let allTasks = [];

        for (const user of users) {
            const tasks = global.db.getUserTransferTasks(user.id);
            allTasks = allTasks.concat(tasks.map(t => ({
                ...t,
                username: user.username
            })));
        }

        // 按时间排序
        allTasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({
            success: true,
            data: {
                tasks: allTasks.slice(0, 100),
                count: allTasks.length
            }
        });
    } catch (error) {
        logger.error('获取传输任务失败:', error);
        res.status(500).json({
            success: false,
            error: '获取失败'
        });
    }
});

// ==================== 本地文件管理 ====================

/**
 * 注册本地视频文件（不复制，只记录路径）
 * POST /api/admin/local-video
 */
router.post('/local-video', async (req, res) => {
    // 在try块外部定义变量，确保catch块可以访问
    let filePath = undefined;
    
    try {
        // 调试日志
        logger.debug('收到本地视频注册请求:', {
            body: req.body,
            contentType: req.get('Content-Type')
        });

        // 确保请求体存在
        if (!req.body) {
            logger.warn('请求体为空');
            return res.status(400).json({
                success: false,
                error: '请求体为空，请确保Content-Type为application/json'
            });
        }

        // 提取参数
        const body = req.body || {};
        filePath = body.filePath;
        const name = body.name;
        const description = body.description;

        // 调试日志
        logger.debug('解析请求参数:', { filePath, name, description });

        // 验证必填参数
        if (!filePath) {
            logger.warn('filePath参数缺失');
            return res.status(400).json({
                success: false,
                error: '请提供文件路径'
            });
        }

        // 安全检查：验证文件路径
        // 检查路径是否包含不允许的字符
        const dangerousPatterns = ['..', '\\0', '$', '`'];
        for (const pattern of dangerousPatterns) {
            if (filePath.includes(pattern)) {
                return res.status(400).json({
                    success: false,
                    error: '文件路径包含非法字符'
                });
            }
        }

        // 检查文件是否存在
        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: '文件不存在，请检查路径是否正确'
            });
        }

        // 获取文件信息
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        // 检查是否是视频文件
        const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v'];
        const ext = path.extname(filePath).toLowerCase();
        
        if (!videoExtensions.includes(ext)) {
            return res.status(400).json({
                success: false,
                error: `不支持的文件格式: ${ext}，支持的格式: ${videoExtensions.join(', ')}`
            });
        }

        // 获取文件名作为默认名称
        const fileName = name || path.basename(filePath, ext);
        const fileId = require('uuid').v4();

        // 简化处理：暂不获取视频信息，留空让后续需要时再获取
        const duration = 0;
        const width = 0;
        const height = 0;

        // 生成缩略图 - 使用默认图片，不调用 ffmpeg
        const thumbnailDir = path.join(__dirname, '../uploads/thumbnails');
        if (!fs.existsSync(thumbnailDir)) {
            fs.mkdirSync(thumbnailDir, { recursive: true });
        }

        // 使用默认缩略图，不生成
        let thumbnail = null;

        // 创建文件记录（type 为 'video'，isLocalRef 为 true）
        // 确保 path 是字符串
        const safePath = String(filePath || '');
        const fileRecord = {
            id: fileId,
            name: String(fileName || '未命名'),
            path: safePath,
            type: 'video',
            mime_type: getMimeType(ext) || 'video/mp4',
            size: Number(fileSize) || 0,
            duration: Number(duration) || 0,
            thumbnail: thumbnail || null,
            description: String(description || ''),
            is_local_ref: true,
            view_count: 0,
            download_count: 0,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        logger.debug('准备创建文件记录:', fileRecord);
        global.db.createFile(fileRecord);

        logger.info(`本地视频已注册: ${fileName} (${filePath})`);

        res.json({
            success: true,
            data: {
                file: fileRecord,
                message: '本地视频注册成功'
            }
        });
    } catch (error) {
        logger.error('注册本地视频失败:', {
            message: error.message,
            stack: error.stack,
            filePath: filePath || 'undefined'
        });
        // 改进错误处理：只有当错误真正与路径格式相关时才返回该错误
        const pathFormatErrors = ['路径格式不正确', '非法字符', 'illegal character'];
        const isPathFormatError = pathFormatErrors.some(msg => error.message?.includes(msg));
        
        if (isPathFormatError) {
            res.status(400).json({
                success: false,
                error: '文件路径处理失败，请检查路径格式'
            });
        } else {
            res.status(500).json({
                success: false,
                error: '注册失败: ' + (error.message || '未知错误')
            });
        }
    }
});

/**
 * 注册本地文件（非视频）
 * POST /api/admin/local-file
 */
router.post('/local-file', async (req, res) => {
    let filePath = undefined;
    
    try {
        logger.debug('收到本地文件注册请求:', {
            body: req.body,
            contentType: req.get('Content-Type')
        });

        // 确保请求体存在
        if (!req.body) {
            return res.status(400).json({
                success: false,
                error: '请求体为空，请确保Content-Type为application/json'
            });
        }

        // 提取参数
        const body = req.body || {};
        filePath = body.filePath;
        const name = body.name;
        const description = body.description;

        // 验证必填参数
        if (!filePath) {
            return res.status(400).json({
                success: false,
                error: '请提供文件路径'
            });
        }

        // 安全检查：验证文件路径
        const dangerousPatterns = ['..', '\\0', '$', '`'];
        for (const pattern of dangerousPatterns) {
            if (filePath.includes(pattern)) {
                return res.status(400).json({
                    success: false,
                    error: '文件路径包含非法字符'
                });
            }
        }

        // 检查文件是否存在
        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: '文件不存在，请检查路径是否正确'
            });
        }

        // 获取文件信息
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        // 获取文件扩展名和类型
        const ext = path.extname(filePath).toLowerCase();
        const fileName = name || path.basename(filePath);
        const fileId = require('uuid').v4();

        // 根据扩展名确定文件类型
        const fileType = getFileType(ext);
        
        // 生成缩略图（仅对图片类型）
        let thumbnail = null;
        if (fileType === 'image') {
            const thumbnailDir = path.join(__dirname, '../uploads/thumbnails');
            if (!fs.existsSync(thumbnailDir)) {
                fs.mkdirSync(thumbnailDir, { recursive: true });
            }
            // 图片使用默认缩略图
            thumbnail = null;
        }

        // 创建文件记录
        const safePath = String(filePath || '');
        const fileRecord = {
            id: fileId,
            name: String(fileName || '未命名'),
            path: safePath,
            type: fileType,
            mime_type: getMimeType(ext) || 'application/octet-stream',
            size: Number(fileSize) || 0,
            duration: 0,  // 非视频文件没有时长
            thumbnail: thumbnail || null,
            description: String(description || ''),
            is_local_ref: true,
            view_count: 0,
            download_count: 0,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        logger.debug('准备创建本地文件记录:', fileRecord);
        global.db.createFile(fileRecord);

        logger.info(`本地文件已注册: ${fileName} (${filePath})`);

        res.json({
            success: true,
            data: {
                file: fileRecord,
                message: '本地文件注册成功'
            }
        });
    } catch (error) {
        logger.error('注册本地文件失败:', {
            message: error.message,
            stack: error.stack,
            filePath: filePath || 'undefined'
        });
        
        res.status(500).json({
            success: false,
            error: '注册失败: ' + (error.message || '未知错误')
        });
    }
});

/**
 * 根据扩展名获取文件类型
 */
function getFileType(ext) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'];
    const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'];
    const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v'];
    const documentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv'];
    const archiveExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz'];

    if (imageExtensions.includes(ext)) return 'image';
    if (audioExtensions.includes(ext)) return 'audio';
    if (videoExtensions.includes(ext)) return 'video';
    if (documentExtensions.includes(ext)) return 'document';
    if (archiveExtensions.includes(ext)) return 'archive';
    return 'other';
}

/**
 * 验证本地文件路径
 * POST /api/admin/validate-path
 */
router.post('/validate-path', async (req, res) => {
    try {
        const { filePath } = req.body;

        if (!filePath) {
            return res.status(400).json({
                success: false,
                error: '请提供文件路径'
            });
        }

        const fs = require('fs');
        const path = require('path');

        // 安全检查
        const dangerousPatterns = ['..', '\\0'];
        for (const pattern of dangerousPatterns) {
            if (filePath.includes(pattern)) {
                return res.status(400).json({
                    success: false,
                    error: '文件路径包含非法字符',
                    valid: false
                });
            }
        }

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: '文件不存在',
                valid: false,
                exists: false
            });
        }

        const stats = fs.statSync(filePath);

        // 检查是否是文件
        if (!stats.isFile()) {
            return res.status(400).json({
                success: false,
                error: '路径不是文件',
                valid: false
            });
        }

        // 检查文件大小
        const fileSize = stats.size;
        const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
        if (fileSize > maxSize) {
            return res.status(400).json({
                success: false,
                error: '文件大小超过限制（最大10GB）',
                valid: false
            });
        }

        // 检查文件格式
        const ext = path.extname(filePath).toLowerCase();
        const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v'];
        
        if (!videoExtensions.includes(ext)) {
            return res.status(400).json({
                success: false,
                error: `不支持的文件格式: ${ext}`,
                valid: false,
                supportedFormats: videoExtensions
            });
        }

        // 跳过视频信息获取以避免 ffmpeg 问题
        // 如果需要详细信息，可以在注册时获取
        const duration = 0;
        const width = 0;
        const height = 0;

        res.json({
            success: true,
            valid: true,
            data: {
                exists: true,
                fileName: path.basename(filePath),
                fileSize: fileSize,
                formattedSize: formatFileSize(fileSize),
                duration: duration,
                width: width,
                height: height,
                format: ext.replace('.', '')
            }
        });
    } catch (error) {
        logger.error('验证文件路径失败:', error);
        res.status(500).json({
            success: false,
            error: '验证失败',
            valid: false
        });
    }
});

/**
 * 获取支持的视频格式列表
 * GET /api/admin/video-formats
 */
router.get('/video-formats', (req, res) => {
    const formats = [
        { extension: '.mp4', mimeType: 'video/mp4', name: 'MP4', description: '最常用的视频格式' },
        { extension: '.webm', mimeType: 'video/webm', name: 'WebM', description: 'Google支持的开放格式' },
        { extension: '.mkv', mimeType: 'video/x-matroska', name: 'MKV', description: '多媒体容器格式' },
        { extension: '.avi', mimeType: 'video/x-msvideo', name: 'AVI', description: '微软视频格式' },
        { extension: '.mov', mimeType: 'video/quicktime', name: 'MOV', description: 'Apple QuickTime' },
        { extension: '.flv', mimeType: 'video/x-flv', name: 'FLV', description: 'Flash视频格式' },
        { extension: '.wmv', mimeType: 'video/x-ms-wmv', name: 'WMV', description: 'Windows Media Video' },
        { extension: '.m4v', mimeType: 'video/x-m4v', name: 'M4V', description: 'Apple M4V格式' }
    ];

    res.json({
        success: true,
        data: { formats }
    });
});

// 辅助函数：获取 MIME 类型
function getMimeType(ext) {
    const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.flv': 'video/x-flv',
        '.wmv': 'video/x-ms-wmv',
        '.m4v': 'video/x-m4v'
    };
    return mimeTypes[ext.toLowerCase()] || 'video/mp4';
}

// 辅助函数：格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;
