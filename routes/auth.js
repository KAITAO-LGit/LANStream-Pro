/**
 * 认证路由
 * 处理用户注册、登录、登出等功能
 */

const express = require('express');
const router = express.Router();
const { SecurityManager } = require('../utils/security');
const { logger } = require('../utils/logger');

const security = new SecurityManager();

// ==================== 验证码 ====================

/**
 * 获取登录验证码
 * GET /api/auth/captcha
 */
router.get('/captcha', async (req, res) => {
    try {
        console.log('[Captcha] 开始生成验证码...');
        const captcha = security.generateCaptcha();
        console.log('[Captcha] 验证码生成成功:', captcha.text);

        // 存储验证码到session（使用cookie）
        res.cookie('captcha_id', captcha.id, {
            httpOnly: true,
            maxAge: 5 * 60 * 1000, // 5分钟
            sameSite: 'lax'
        });

        // 将验证码文本存储在签名cookie中
        res.cookie('captcha_text', captcha.text, {
            httpOnly: true,
            maxAge: 5 * 60 * 1000,
            sameSite: 'lax',
            signed: true
        });

        res.set('Content-Type', 'image/svg+xml');
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.send(captcha.data);
    } catch (error) {
        console.error('[Captcha] 生成验证码失败:', error);
        res.status(500).json({
            success: false,
            error: '生成验证码失败: ' + error.message
        });
    }
});

// ==================== 注册 ====================

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // 验证必填字段
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

        // 检查密码是否泄露
        if (security.checkPasswordBreach(password)) {
            return res.status(400).json({
                success: false,
                error: '密码过于简单，请使用更复杂的密码'
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

        // 哈希密码
        const passwordHash = await security.hashPassword(password);

        // 创建用户
        const user = await global.db.createUser({
            username,
            email: email || null,
            password: passwordHash,
            role: 'user'
        });

        logger.info(`新用户注册成功: ${username}`);

        res.status(201).json({
            success: true,
            message: '注册成功',
            user: security.sanitizeUser(user)
        });
    } catch (error) {
        logger.error('注册失败:', error);
        res.status(500).json({
            success: false,
            error: error.message || '注册失败'
        });
    }
});

// ==================== 登录 ====================

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password, captcha } = req.body;

        // 验证必填字段
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }

        // 验证验证码（如果cookie中存在验证码，且用户传递了验证码参数）
        const storedCaptcha = req.signedCookies.captcha_text;
        if (storedCaptcha && captcha) {
            // 验证码不区分大小写
            if (captcha.toLowerCase() !== storedCaptcha.toLowerCase()) {
                // 清除已使用的验证码
                res.clearCookie('captcha_id');
                res.clearCookie('captcha_text');

                logger.warn(`登录失败 - 验证码错误: ${username}`);
                return res.status(400).json({
                    success: false,
                    error: '验证码错误'
                });
            }

            // 验证成功后清除验证码
            res.clearCookie('captcha_id');
            res.clearCookie('captcha_text');
        }

        // 获取用户
        const user = global.db.getUserByUsername(username);
        if (!user) {
            logger.warn(`登录失败 - 用户不存在: ${username}`);
            
            return res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }

        // 检查用户状态
        const userStatus = user.status || 'active';
        if (userStatus === 'disabled') {
            return res.status(401).json({
                success: false,
                error: '账户已被禁用，请联系管理员',
                code: 'ACCOUNT_DISABLED'
            });
        }
        
        if (userStatus === 'locked') {
            return res.status(401).json({
                success: false,
                error: '账户已被锁定，请联系管理员',
                code: 'ACCOUNT_LOCKED'
            });
        }
        
        if (userStatus === 'suspended') {
            return res.status(401).json({
                success: false,
                error: '账户已被临时停用',
                code: 'ACCOUNT_SUSPENDED'
            });
        }
        
        if (userStatus === 'pending') {
            return res.status(401).json({
                success: false,
                error: '账户待验证，请先完成邮箱验证',
                code: 'ACCOUNT_PENDING'
            });
        }

        // 验证密码
        const isValidPassword = await security.verifyPassword(password, user.password_hash);
        if (!isValidPassword) {
            logger.warn(`登录失败 - 密码错误: ${username}`);
            
            return res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }

        // 生成Token
        const accessToken = security.generateAccessToken(user);
        const refreshToken = security.generateRefreshToken(user);

        // 更新最后登录时间
        global.db.updateLastLogin(user.id);

        // 记录登录日志
        global.db.log('info', `用户登录成功: ${username}`, { userId: user.id });

        logger.info(`用户登录成功: ${username}`);

        res.json({
            success: true,
            message: '登录成功',
            data: {
                user: security.sanitizeUser(user),
                accessToken,
                refreshToken,
                expiresIn: 7200 // 2小时
            }
        });
    } catch (error) {
        logger.error('登录失败:', error);
        res.status(500).json({
            success: false,
            error: '登录失败，请稍后重试'
        });
    }
});

// ==================== 登出 ====================

/**
 * 用户登出
 * POST /api/auth/logout
 */
router.post('/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = security.extractTokenFromHeader(authHeader);

        if (token) {
            // 将Token加入黑名单
            await global.redis.addToBlacklist(token, 'logout');
        }

        res.json({
            success: true,
            message: '登出成功'
        });
    } catch (error) {
        logger.error('登出失败:', error);
        res.status(500).json({
            success: false,
            error: '登出失败'
        });
    }
});

// ==================== Token刷新 ====================

/**
 * 刷新Token
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: '请提供刷新令牌'
            });
        }

        // 验证刷新Token
        const payload = security.verifyToken(refreshToken);
        if (payload.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                error: '无效的刷新令牌'
            });
        }

        // 检查Token是否在黑名单中
        const isBlacklisted = await global.redis.isBlacklisted(refreshToken);
        if (isBlacklisted) {
            return res.status(401).json({
                success: false,
                error: '刷新令牌已失效'
            });
        }

        // 获取用户
        const user = global.db.getUserById(payload.uid);
        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                error: '用户不存在或已被禁用'
            });
        }

        // 生成新的Access Token
        const newAccessToken = security.generateAccessToken(user);

        res.json({
            success: true,
            data: {
                accessToken: newAccessToken,
                expiresIn: 7200
            }
        });
    } catch (error) {
        logger.error('Token刷新失败:', error);
        res.status(401).json({
            success: false,
            error: '令牌刷新失败，请重新登录'
        });
    }
});

// ==================== 获取当前用户信息 ====================

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = security.extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: '未认证'
            });
        }

        // 调试日志
        logger.debug('验证Token...');

        const payload = security.verifyToken(token);
        
        // 确保payload存在且有uid
        if (!payload || !payload.uid) {
            logger.warn('Token解析失败，payload无效:', payload);
            return res.status(401).json({
                success: false,
                error: '无效的Token'
            });
        }

        logger.debug('获取用户信息，uid:', payload.uid);

        const user = global.db.getUserById(payload.uid);

        if (!user) {
            logger.warn('用户不存在，uid:', payload.uid);
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        // 获取用户统计数据 - 添加安全检查
        let history = [], favorites = [], transfers = [];
        try {
            history = global.db.getUserHistory(user.id, 1) || [];
        } catch (e) {
            logger.warn('获取历史记录失败:', e.message);
        }
        try {
            favorites = global.db.getUserFavorites(user.id) || [];
        } catch (e) {
            logger.warn('获取收藏失败:', e.message);
        }
        try {
            transfers = global.db.getUserTransferTasks(user.id, 'processing') || [];
        } catch (e) {
            logger.warn('获取传输任务失败:', e.message);
        }

        res.json({
            success: true,
            data: {
                user: security.sanitizeUser(user),
                stats: {
                    watchedCount: Array.isArray(history) ? history.length : 0,
                    favoritesCount: Array.isArray(favorites) ? favorites.length : 0,
                    activeTransfers: Array.isArray(transfers) ? transfers.length : 0
                }
            }
        });
    } catch (error) {
        logger.error('获取用户信息失败:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            error: '获取用户信息失败'
        });
    }
});

// ==================== 修改密码 ====================

/**
 * 修改密码
 * POST /api/auth/change-password
 */
router.post('/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const authHeader = req.headers.authorization;
        const token = security.extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: '未认证'
            });
        }

        const payload = security.verifyToken(token);
        const user = global.db.getUserById(payload.uid);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        // 验证当前密码
        const isValidPassword = await security.verifyPassword(currentPassword, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: '当前密码错误'
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
        const newPasswordHash = await security.hashPassword(newPassword);

        // 更新密码
        global.db.updatePassword(user.id, newPasswordHash);

        // 生成新的Token（强制重新登录效果）
        const newAccessToken = security.generateAccessToken({ ...user, password_hash: newPasswordHash });

        logger.info(`用户修改密码成功: ${user.username}`);

        res.json({
            success: true,
            message: '密码修改成功',
            data: {
                accessToken: newAccessToken
            }
        });
    } catch (error) {
        logger.error('修改密码失败:', error);
        res.status(500).json({
            success: false,
            error: '修改密码失败'
        });
    }
});

// ==================== 更新用户资料 ====================

/**
 * 更新用户资料
 * PUT /api/auth/profile
 */
router.put('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = security.extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: '未认证'
            });
        }

        const payload = security.verifyToken(token);
        const user = global.db.getUserById(payload.uid);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        const { display_name, email } = req.body;

        // 验证显示名称
        if (display_name !== undefined) {
            if (display_name.length > 30) {
                return res.status(400).json({
                    success: false,
                    error: '显示名称不能超过30个字符'
                });
            }
        }

        // 验证邮箱
        if (email !== undefined && email !== '') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    error: '请输入有效的邮箱地址'
                });
            }
        }

        // 更新用户资料
        global.db.updateUserProfile(user.id, {
            display_name: display_name !== undefined ? display_name : user.display_name,
            email: email !== undefined ? email : user.email
        });

        // 获取更新后的用户信息
        const updatedUser = global.db.getUserById(user.id);

        logger.info(`用户资料更新成功: ${user.username}`);

        res.json({
            success: true,
            message: '资料更新成功',
            data: {
                user: security.sanitizeUser(updatedUser)
            }
        });
    } catch (error) {
        logger.error('更新用户资料失败:', error);
        res.status(500).json({
            success: false,
            error: '更新资料失败'
        });
    }
});

// ==================== 上传头像 ====================

/**
 * 上传用户头像
 * POST /api/auth/avatar
 */
router.post('/avatar', global.avatarUpload.single('avatar'), async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = security.extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: '未认证'
            });
        }

        const payload = security.verifyToken(token);
        const user = global.db.getUserById(payload.uid);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        // 检查是否有文件上传
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: '请选择要上传的头像文件'
            });
        }

        const avatar = req.file;

        // 生成头像URL
        const avatarUrl = `/uploads/avatars/${avatar.filename}`;

        // 更新用户头像
        global.db.updateUserAvatar(user.id, avatarUrl);

        // 删除旧头像（如果不是默认头像）
        const fs = require('fs');
        if (user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
            try {
                const oldPath = path.join(__dirname, '../public', user.avatar_url);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            } catch (e) {
                logger.warn('删除旧头像失败:', e);
            }
        }

        logger.info(`用户头像上传成功: ${user.username}`);

        res.json({
            success: true,
            message: '头像上传成功',
            data: {
                avatar_url: avatarUrl
            }
        });
    } catch (error) {
        logger.error('上传头像失败:', error);
        res.status(500).json({
            success: false,
            error: '上传头像失败'
        });
    }
});

module.exports = router;
