/**
 * Redis管理器
 * 提供Redis缓存和会话管理功能
 */

const { createClient } = require('redis');
const { logger } = require('./logger');

class RedisManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    /**
     * 初始化Redis连接
     * 优化：添加连接池和性能配置
     */
    async initialize() {
        try {
            const config = require('../config');
            const redisConfig = config.database.redis;

            this.client = createClient({
                socket: {
                    host: redisConfig.host,
                    port: redisConfig.port,
                    // 连接超时
                    connectTimeout: 5000,
                    // 禁用Nagle算法以减少延迟
                    noDelay: true,
                    // 保持连接活跃
                    keepAlive: 10000
                },
                password: redisConfig.password || undefined,
                database: redisConfig.db || 0,
                // 性能优化
                commandQueue: true,
                enableReadyCheck: true,
                maxRetriesPerRequest: 3
            });

            // 连接事件监听
            this.client.on('error', (err) => {
                logger.debug('Redis连接错误(忽略):', err.message);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                logger.info('✅ Redis客户端已连接');
                this.isConnected = true;
            });

            this.client.on('ready', () => {
                this.isConnected = true;
                logger.info('✅ Redis就绪');
            });

            this.client.on('reconnecting', () => {
                logger.info('🔄 Redis重新连接中...');
            });

            await this.client.connect();
            this.isConnected = true;

            // 测试连接
            await this.client.ping();
            logger.info('✅ Redis连接测试成功');

            // 优化：预热常用连接
            this.warmUp();

        } catch (error) {
            logger.warn('⚠️ Redis连接失败，将使用内存缓存作为后备:', error.message);
            this.isConnected = false;
            // 创建内存后备方案
            this.memoryCache = new Map();
            // 断开客户端连接，避免持续重连
            if (this.client) {
                try {
                    await this.client.disconnect();
                } catch (e) {
                    // 忽略断开错误
                }
                this.client = null;
            }
        }
    }

    /**
     * 预热连接
     */
    async warmUp() {
        try {
            // 预热连接，执行一个简单的PING
            await this.client.ping();
            // 预加载系统配置到缓存
            const configs = await global.db.getAllConfig();
            for (const [key, value] of Object.entries(configs)) {
                await this.set(`config:${key}`, value, 3600);
            }
            logger.info('✅ Redis连接预热完成');
        } catch (error) {
            logger.warn('Redis预热失败:', error.message);
        }
    }

    /**
     * 设置键值（带过期时间）
     */
    async set(key, value, expirationSeconds = null) {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

        if (this.isConnected && this.client) {
            if (expirationSeconds) {
                await this.client.setEx(key, expirationSeconds, stringValue);
            } else {
                await this.client.set(key, stringValue);
            }
        } else {
            // 内存后备
            this.memoryCache.set(key, {
                value: stringValue,
                expire: expirationSeconds ? Date.now() + expirationSeconds * 1000 : null
            });
        }
    }

    /**
     * 获取值
     */
    async get(key) {
        if (this.isConnected && this.client) {
            const value = await this.client.get(key);
            if (value === null) return null;
            
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        } else {
            // 内存后备
            const cached = this.memoryCache.get(key);
            if (!cached) return null;
            
            if (cached.expire && Date.now() > cached.expire) {
                this.memoryCache.delete(key);
                return null;
            }
            
            try {
                return JSON.parse(cached.value);
            } catch {
                return cached.value;
            }
        }
    }

    /**
     * 删除键
     */
    async del(key) {
        if (this.isConnected && this.client) {
            await this.client.del(key);
        } else {
            this.memoryCache.delete(key);
        }
    }

    /**
     * 检查键是否存在
     */
    async exists(key) {
        if (this.isConnected && this.client) {
            return await this.client.exists(key) === 1;
        } else {
            const cached = this.memoryCache.get(key);
            if (!cached) return false;
            if (cached.expire && Date.now() > cached.expire) {
                this.memoryCache.delete(key);
                return false;
            }
            return true;
        }
    }

    /**
     * 设置过期时间
     */
    async expire(key, seconds) {
        if (this.isConnected && this.client) {
            await this.client.expire(key, seconds);
        } else {
            const cached = this.memoryCache.get(key);
            if (cached) {
                cached.expire = Date.now() + seconds * 1000;
            }
        }
    }

    /**
     * 获取剩余过期时间
     */
    async ttl(key) {
        if (this.isConnected && this.client) {
            return await this.client.ttl(key);
        } else {
            const cached = this.memoryCache.get(key);
            if (!cached) return -2;
            if (!cached.expire) return -1;
            return Math.max(0, Math.floor((cached.expire - Date.now()) / 1000));
        }
    }

    // ==================== 哈希操作 ====================

    /**
     * 设置哈希字段
     */
    async hset(key, field, value) {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

        if (this.isConnected && this.client) {
            await this.client.hSet(key, field, stringValue);
        } else {
            if (!this.memoryCache.has(key)) {
                this.memoryCache.set(key, { type: 'hash', data: new Map() });
            }
            const hash = this.memoryCache.get(key);
            hash.data.set(field, stringValue);
        }
    }

    /**
     * 获取哈希字段
     */
    async hget(key, field) {
        if (this.isConnected && this.client) {
            const value = await this.client.hGet(key, field);
            if (value === null) return null;
            
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        } else {
            const hash = this.memoryCache.get(key);
            if (!hash || !hash.data) return null;
            const value = hash.data.get(field);
            if (!value) return null;
            
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
    }

    /**
     * 获取整个哈希
     */
    async hgetall(key) {
        if (this.isConnected && this.client) {
            const result = await this.client.hGetAll(key);
            // 尝试解析JSON值
            const parsed = {};
            for (const [field, value] of Object.entries(result)) {
                try {
                    parsed[field] = JSON.parse(value);
                } catch {
                    parsed[field] = value;
                }
            }
            return parsed;
        } else {
            const hash = this.memoryCache.get(key);
            if (!hash || !hash.data) return {};
            const result = {};
            for (const [field, value] of hash.data.entries()) {
                try {
                    result[field] = JSON.parse(value);
                } catch {
                    result[field] = value;
                }
            }
            return result;
        }
    }

    /**
     * 删除哈希字段
     */
    async hdel(key, field) {
        if (this.isConnected && this.client) {
            await this.client.hDel(key, field);
        } else {
            const hash = this.memoryCache.get(key);
            if (hash && hash.data) {
                hash.data.delete(field);
            }
        }
    }

    // ==================== 列表操作 ====================

    /**
     * 向列表左侧添加元素
     */
    async lpush(key, value) {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

        if (this.isConnected && this.client) {
            await this.client.lPush(key, stringValue);
        } else {
            if (!this.memoryCache.has(key)) {
                this.memoryCache.set(key, { type: 'list', data: [] });
            }
            const list = this.memoryCache.get(key);
            list.data.unshift(stringValue);
        }
    }

    /**
     * 获取列表范围
     */
    async lrange(key, start, stop) {
        if (this.isConnected && this.client) {
            const values = await this.client.lRange(key, start, stop);
            return values.map(v => {
                try {
                    return JSON.parse(v);
                } catch {
                    return v;
                }
            });
        } else {
            const list = this.memoryCache.get(key);
            if (!list || !list.data) return [];
            const data = list.data.slice(start, stop === -1 ? undefined : stop + 1);
            return data.map(v => {
                try {
                    return JSON.parse(v);
                } catch {
                    return v;
                }
            });
        }
    }

    // ==================== 集合操作 ====================

    /**
     * 添加集合成员
     */
    async sadd(key, value) {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

        if (this.isConnected && this.client) {
            await this.client.sAdd(key, stringValue);
        } else {
            if (!this.memoryCache.has(key)) {
                this.memoryCache.set(key, { type: 'set', data: new Set() });
            }
            const set = this.memoryCache.get(key);
            set.data.add(stringValue);
        }
    }

    /**
     * 获取集合成员
     */
    async smembers(key) {
        if (this.isConnected && this.client) {
            const values = await this.client.sMembers(key);
            return values.map(v => {
                try {
                    return JSON.parse(v);
                } catch {
                    return v;
                }
            });
        } else {
            const set = this.memoryCache.get(key);
            if (!set || !set.data) return [];
            return Array.from(set.data).map(v => {
                try {
                    return JSON.parse(v);
                } catch {
                    return v;
                }
            });
        }
    }

    /**
     * 检查是否是集合成员
     */
    async sismember(key, value) {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

        if (this.isConnected && this.client) {
            return await this.client.sIsMember(key, stringValue);
        } else {
            const set = this.memoryCache.get(key);
            if (!set || !set.data) return false;
            return set.data.has(stringValue);
        }
    }

    // ==================== 认证相关方法 ====================

    /**
     * 将Token加入黑名单
     */
    async addToBlacklist(token, reason = 'logout') {
        const payload = this.decodeToken(token);
        if (payload && payload.exp) {
            const ttl = payload.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
                await this.set(`blacklist:${token}`, { reason, timestamp: Date.now() }, ttl);
            }
        }
    }

    /**
     * 检查Token是否在黑名单中
     */
    async isBlacklisted(token) {
        return await this.exists(`blacklist:${token}`);
    }

    /**
     * 存储登录失败次数
     */
    async incrementLoginAttempts(ip) {
        const key = `login_attempts:${ip}`;
        const attempts = await this.incr(key);
        await this.expire(key, 15 * 60); // 15分钟过期
        return attempts;
    }

    /**
     * 重置登录失败次数
     */
    async resetLoginAttempts(ip) {
        await this.del(`login_attempts:${ip}`);
    }

    /**
     * 获取登录失败次数
     */
    async getLoginAttempts(ip) {
        const attempts = await this.get(`login_attempts:${ip}`);
        return attempts || 0;
    }

    /**
     * 锁定IP
     */
    async lockIP(ip, durationSeconds = 900) {
        await this.set(`ip_locked:${ip}`, '1', durationSeconds);
    }

    /**
     * 检查IP是否被锁定
     */
    async isIPLocked(ip) {
        return await this.exists(`ip_locked:${ip}`);
    }

    /**
     * 存储验证码
     */
    async setCaptcha(captchaId, value, expirationSeconds = 300) {
        await this.set(`captcha:${captchaId}`, value, expirationSeconds);
    }

    /**
     * 验证验证码
     */
    async verifyCaptcha(captchaId, value) {
        const stored = await this.get(`captcha:${captchaId}`);
        if (!stored) return false;
        
        const isValid = stored.toLowerCase() === value.toLowerCase();
        // 验证后立即删除
        await this.del(`captcha:${captchaId}`);
        return isValid;
    }

    /**
     * 存储会话
     */
    async setSession(sessionId, data, expirationSeconds = 3600) {
        await this.set(`session:${sessionId}`, data, expirationSeconds);
    }

    /**
     * 获取会话
     */
    async getSession(sessionId) {
        return await this.get(`session:${sessionId}`);
    }

    /**
     * 删除会话
     */
    async deleteSession(sessionId) {
        await this.del(`session:${sessionId}`);
    }

    /**
     * 存储转码进度
     */
    async setTranscodeProgress(fileId, progress) {
        await this.hset('transcode_progress', fileId, progress);
    }

    /**
     * 获取转码进度
     */
    async getTranscodeProgress(fileId) {
        return await this.hget('transcode_progress', fileId);
    }

    /**
     * 清除转码进度
     */
    async clearTranscodeProgress(fileId) {
        await this.hdel('transcode_progress', fileId);
    }

    /**
     * 获取所有转码进度
     */
    async getAllTranscodeProgress() {
        return await this.hgetall('transcode_progress');
    }

    // ==================== 工具方法 ====================

    /**
     * 简单Token解码（不验证签名）
     */
    decodeToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = Buffer.from(parts[1], 'base64').toString('utf8');
            return JSON.parse(payload);
        } catch {
            return null;
        }
    }

    /**
     * 递增
     */
    async incr(key) {
        if (this.isConnected && this.client) {
            return await this.client.incr(key);
        } else {
            const current = this.memoryCache.get(key) || 0;
            const newValue = current + 1;
            this.memoryCache.set(key, newValue);
            return newValue;
        }
    }

    /**
     * 递减
     */
    async decr(key) {
        if (this.isConnected && this.client) {
            return await this.client.decr(key);
        } else {
            const current = this.memoryCache.get(key) || 0;
            const newValue = current - 1;
            this.memoryCache.set(key, newValue);
            return newValue;
        }
    }

    /**
     * 批量获取
     */
    async mget(keys) {
        if (this.isConnected && this.client) {
            const values = await this.client.mGet(keys);
            return values.map(v => {
                if (v === null) return null;
                try {
                    return JSON.parse(v);
                } catch {
                    return v;
                }
            });
        } else {
            return keys.map(key => this.memoryCache.get(key)?.value);
        }
    }

    /**
     * 关闭连接
     */
    async close() {
        if (this.client) {
            await this.client.quit();
            logger.info('✅ Redis连接已关闭');
        }
        this.isConnected = false;
    }
}

module.exports = { RedisManager };
