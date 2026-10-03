/**
 * 认证中间件
 * 提供JWT验证、权限检查等功能
 */

const { SecurityManager } = require('../utils/security');
const { logger } = require('../utils/logger');

class AuthMiddleware {
    constructor() {
        this.security = new SecurityManager();
    }

    /**
     * 验证JWT Token
     */
    async verify(req, res, next) {
        try {
            // 从Header获取Token
            const authHeader = req.headers.authorization;
            let token = this.security.extractTokenFromHeader(authHeader);
            
            // 如果Header中没有Token，尝试从Cookie获取
            if (!token && req.cookies && req.cookies.accessToken) {
                token = req.cookies.accessToken;
            }

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: '未提供认证Token',
                    code: 'NO_TOKEN'
                });
            }

            // 检查Token是否在黑名单中（Redis连接失败时跳过检查）
            let isBlacklisted = false;
            try {
                const blacklistResult = global.redis.isBlacklisted(token);
                if (blacklistResult && typeof blacklistResult.then === 'function') {
                    // 如果返回Promise，等待它
                    isBlacklisted = await blacklistResult;
                } else {
                    isBlacklisted = blacklistResult;
                }
                
                if (isBlacklisted) {
                    return res.status(401).json({
                        success: false,
                        error: 'Token已失效，请重新登录',
                        code: 'TOKEN_BLACKLISTED'
                    });
                }
            } catch (redisError) {
                // Redis连接失败时继续验证token，不阻止请求
                logger.warn('Redis连接失败，跳过Token黑名单检查:', redisError.message);
            }

            // 验证Token
            const payload = this.security.verifyToken(token);

            // 检查用户是否存在
            const user = global.db.getUserById(payload.uid);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: '用户不存在',
                    code: 'USER_NOT_FOUND'
                });
            }

            // 检查用户是否激活
            if (!user.is_active) {
                return res.status(401).json({
                    success: false,
                    error: '账户已被禁用',
                    code: 'ACCOUNT_DISABLED'
                });
            }

            // 将用户信息附加到请求对象
            req.user = {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar_url: user.avatar_url
            };
            req.tokenPayload = payload;
            req.token = token;

            // 确保next()只被调用一次
            next();
        } catch (error) {
            logger.error('认证失败:', error);
            
            if (error.message === 'Token已过期') {
                return res.status(401).json({
                    success: false,
                    error: '登录已过期，请重新登录',
                    code: 'TOKEN_EXPIRED'
                });
            }

            return res.status(401).json({
                success: false,
                error: '认证失败',
                code: 'AUTH_FAILED'
            });
        }
    }

    /**
     * 可选认证（不强制要求登录）
     */
    async optional(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            let token = this.security.extractTokenFromHeader(authHeader);
            
            // 如果Header中没有Token，尝试从Cookie获取
            if (!token && req.cookies && req.cookies.accessToken) {
                token = req.cookies.accessToken;
            }

            // 调试日志
            logger.info('Auth optional - Path:', req.path, 'HasHeaderToken:', !!authHeader, 'HasCookieToken:', !!req.cookies?.accessToken, 'TokenLength:', token ? token.length : 0);

            if (token) {
                // 验证Token
                const isBlacklisted = await global.redis.isBlacklisted(token);
                if (!isBlacklisted) {
                    const payload = this.security.verifyToken(token);
                    const user = global.db.getUserById(payload.uid);
                    
                    if (user && user.is_active) {
                        req.user = {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            role: user.role,
                            avatar_url: user.avatar_url
                        };
                        req.tokenPayload = payload;
                        req.token = token;
                        logger.info('Auth optional - User authenticated:', req.user.username);
                    }
                }
            }

            next();
        } catch (error) {
            // 可选认证失败时继续执行
            logger.warn('Auth optional - Auth failed, continuing:', error.message);
            next();
        }
    }

    /**
     * 检查用户角色
     */
    requireRole(...roles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: '请先登录',
                    code: 'NOT_LOGGED_IN'
                });
            }

            if (!roles.includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    error: '权限不足',
                    code: 'INSUFFICIENT_PERMISSION'
                });
            }

            next();
        };
    }

    /**
     * 检查是否是管理员（包含超级管理员）
     */
    requireAdmin(req, res, next) {
        return this.requireRole('superadmin', 'admin')(req, res, next);
    }

    /**
     * 检查是否是版主或更高权限
     */
    requireModerator(req, res, next) {
        return this.requireRole('superadmin', 'admin', 'moderator')(req, res, next);
    }

    /**
     * 检查是否是VIP用户或更高权限
     */
    requireVIP(req, res, next) {
        return this.requireRole('superadmin', 'admin', 'moderator', 'vip')(req, res, next);
    }

    /**
     * 文件访问权限检查
     */
    async checkFileAccess(req, res, next) {
        try {
            const fileId = req.params.id || req.params.fileId;
            if (!fileId) {
                return next();
            }

            const file = global.db.getFileById(fileId);
            if (!file) {
                return res.status(404).json({
                    success: false,
                    error: '文件不存在',
                    code: 'FILE_NOT_FOUND'
                });
            }

            // 管理员和版主可以访问所有文件
            if (['superadmin', 'admin', 'moderator'].includes(req.user.role)) {
                req.file = file;
                return next();
            }

            // 检查文件是否属于用户
            if (file.created_by === req.user.id) {
                req.file = file;
                return next();
            }

            // 检查文件是否是公开的（可以添加公开文件功能）
            // 目前默认所有文件都需要登录才能访问
            req.file = file;
            next();
        } catch (error) {
            logger.error('文件权限检查失败:', error);
            res.status(500).json({
                success: false,
                error: '权限检查失败',
                code: 'PERMISSION_CHECK_FAILED'
            });
        }
    }

    /**
     * 下载权限检查
     */
    async checkDownloadPermission(req, res, next) {
        try {
            const fileId = req.params.id;
            const file = global.db.getFileById(fileId);
            
            if (!file) {
                return res.status(404).json({
                    success: false,
                    error: '文件不存在',
                    code: 'FILE_NOT_FOUND'
                });
            }

            // 管理员总是可以下载
            if (req.user.role === 'admin') {
                req.file = file;
                return next();
            }

            // 检查用户是否有下载权限
            // 可以在这里添加更复杂的权限逻辑
            req.file = file;
            next();
        } catch (error) {
            logger.error('下载权限检查失败:', error);
            res.status(500).json({
                success: false,
                error: '权限检查失败',
                code: 'PERMISSION_CHECK_FAILED'
            });
        }
    }

    /**
     * 上传权限检查
     */
    requireUploadPermission(req, res, next) {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: '请先登录',
                code: 'NOT_LOGGED_IN'
            });
        }

        // 普通用户只能上传到自己的文件夹
        // 管理员可以上传到任意位置
        if (req.user.role !== 'admin' && req.body.parent_id) {
            const folder = global.db.getFileById(req.body.parent_id);
            if (folder && folder.created_by !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: '无权在此文件夹上传文件',
                    code: 'UPLOAD_PERMISSION_DENIED'
                });
            }
        }

        next();
    }

    /**
     * API速率限制中间件
     */
    rateLimit(options = {}) {
        const defaultOptions = {
            windowMs: 60 * 1000, // 1分钟
            max: 60, // 每个IP每分钟最多60次请求
            message: { error: '请求过于频繁，请稍后再试' }
        };

        const opts = { ...defaultOptions, ...options };
        const requests = new Map();

        return (req, res, next) => {
            const ip = req.ip || req.connection.remoteAddress;
            const now = Date.now();
            const windowStart = now - opts.windowMs;

            // 清理旧记录
            for (const [key, timestamps] of requests) {
                requests.set(key, timestamps.filter(t => t > windowStart));
            }

            // 获取当前IP的请求记录
            if (!requests.has(ip)) {
                requests.set(ip, []);
            }

            const ipRequests = requests.get(ip);

            // 检查是否超过限制
            if (ipRequests.length >= opts.max) {
                return res.status(429).json(opts.message);
            }

            // 记录请求
            ipRequests.push(now);

            next();
        };
    }

    /**
     * 请求日志中间件
     */
    requestLogger(req, res, next) {
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            const logData = {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration: `${duration}ms`,
                ip: req.ip,
                user: req.user?.username || 'guest'
            };

            if (res.statusCode >= 400) {
                logger.warn('请求失败:', logData);
            } else {
                logger.info('请求完成:', logData);
            }
        });

        next();
    }

    /**
     * 错误处理中间件
     */
    errorHandler(err, req, res, next) {
        logger.error('请求处理错误:', {
            error: err.message,
            stack: err.stack,
            url: req.originalUrl,
            method: req.method,
            user: req.user?.username
        });

        // 开发环境返回详细错误
        if (process.env.NODE_ENV === 'development') {
            return res.status(500).json({
                success: false,
                error: err.message,
                stack: err.stack
            });
        }

        // 生产环境返回通用错误
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
}

module.exports = { AuthMiddleware };
