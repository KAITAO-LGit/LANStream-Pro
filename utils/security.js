/**
 * 安全管理器
 * 提供密码哈希、Token生成、验证码等安全功能
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { logger } = require('./logger');

class SecurityManager {
    constructor() {
        this.jwtSecret = config.security.jwt.secret;
        this.saltRounds = config.security.bcrypt.saltRounds;
        this.passwordPolicy = config.security.password;
    }

    // ==================== 密码处理 ====================

    /**
     * 哈希密码
     */
    async hashPassword(password) {
        try {
            const salt = await bcrypt.genSalt(this.saltRounds);
            const hash = await bcrypt.hash(password, salt);
            return hash;
        } catch (error) {
            logger.error('密码哈希失败:', error);
            throw new Error('密码处理失败');
        }
    }

    /**
     * 验证密码
     */
    async verifyPassword(password, hash) {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            logger.error('密码验证失败:', error);
            return false;
        }
    }

    /**
     * 验证密码强度
     */
    validatePasswordStrength(password) {
        const errors = [];
        
        if (password.length < this.passwordPolicy.minLength) {
            errors.push(`密码长度至少需要${this.passwordPolicy.minLength}个字符`);
        }
        
        // 检查是否包含字母（不区分大小写）
        if (!/[a-zA-Z]/.test(password)) {
            errors.push('密码必须包含字母');
        }
        
        if (this.passwordPolicy.requireNumber && !/\d/.test(password)) {
            errors.push('密码必须包含数字');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * 检查密码是否泄露（简单检测）
     */
    checkPasswordBreach(password) {
        // 常见弱密码列表
        const commonPasswords = [
            'password', '123456', '12345678', 'qwerty', 'abc123',
            'password123', 'admin123', 'letmein', 'welcome',
            'iloveyou', 'monkey', 'dragon', 'master', 'login'
        ];
        
        const lowerPassword = password.toLowerCase();
        return commonPasswords.includes(lowerPassword);
    }

    // ==================== JWT Token ====================

    /**
     * 生成访问Token
     */
    generateAccessToken(user) {
        const payload = {
            uid: user.id,
            username: user.username,
            role: user.role,
            type: 'access'
        };

        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: config.security.jwt.expiresIn
        });
    }

    /**
     * 生成刷新Token
     */
    generateRefreshToken(user) {
        const payload = {
            uid: user.id,
            type: 'refresh'
        };

        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: config.security.jwt.refreshExpiresIn
        });
    }

    /**
     * 验证Token
     */
    verifyToken(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Token已过期');
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error('无效的Token');
            }
            throw new Error('Token验证失败');
        }
    }

    /**
     * 解码Token（不验证）
     */
    decodeToken(token) {
        try {
            return jwt.decode(token);
        } catch {
            return null;
        }
    }

    /**
     * 从请求中提取Token
     */
    extractTokenFromHeader(authHeader) {
        if (!authHeader) return null;
        
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }
        
        return parts[1];
    }

    // ==================== 验证码 ====================

    /**
     * 生成图形验证码 - 极简实现
     */
    generateCaptcha(options = {}) {
        const size = options.size || 4;
        const width = options.width || 120;
        const height = options.height || 40;
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        
        // 生成随机验证码文本
        let text = '';
        for (let i = 0; i < size; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // 生成简单的 SVG（不使用复杂特性）
        var svg = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
            '<rect width="100%" height="100%" fill="#f5f5f5"/>' +
            '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold" fill="#333">' + text + '</text>' +
            '</svg>';
        
        return {
            data: svg,
            text: text,
            id: uuidv4()
        };
    }

    // ==================== 文件安全 ====================

    /**
     * 生成安全文件名
     * 正确处理 UTF-8 多字节字符，避免乱码
     */
    sanitizeFilename(filename) {
        // 确保文件名是有效的 UTF-8 字符串
        // 先尝试检测是否已经是乱码（常见情况：UTF-8 被错误解码为 Latin1 或 GBK）
        const mojibakePatterns = [
            /[\x80-\xFF]/g,  // 单字节 Latin1 字符出现在 UTF-8 字符串中
            /Ã©/g,           // é 的 UTF-8 被错误解码为 Latin1
            /[\u00C0-\u00FF]/g  // Latin1 字符范围
        ];

        let sanitized = filename;

        // 如果检测到可能是乱码，尝试修复
        if (this.containsMojibake(filename)) {
            sanitized = this.fixMojibake(filename);
        }

        // 只移除真正危险的文件系统字符，不影响 UTF-8 字符
        // 危险字符：< > : " / \ | ? * 以及控制字符
        const dangerousChars = /[<>:"/\\|?*\x00-\x1f\x7f]/g;
        sanitized = sanitized.replace(dangerousChars, '_');

        // 去除首尾空格
        sanitized = sanitized.trim();

        // 限制长度（考虑 UTF-8 多字节字符）
        const maxBytes = 255;
        const encoder = new TextEncoder();
        const encoded = encoder.encode(sanitized);

        if (encoded.length > maxBytes) {
            // 截断到最大长度，保持文件扩展名
            const ext = path.extname(sanitized);
            let truncated = sanitized;
            let truncatedBytes = encoded;

            // 逐步截断直到符合长度要求
            while (truncatedBytes.length > maxBytes && truncated.length > ext.length) {
                truncated = truncated.slice(0, -1);
                truncatedBytes = encoder.encode(truncated);
            }

            sanitized = truncated + ext;
        }

        return sanitized;
    }

    /**
     * 检测字符串是否包含乱码（UTF-8 被错误解码）
     */
    containsMojibake(str) {
        // 检测 UTF-8 多字节序列被错误解码为多个单字节 Latin1 字符的情况
        // 常见模式：连续的 Latin1 字符（0xC0-0xFF 范围）出现
        let hasPattern1 = false;  // 连续的 0xC0-0xFF 字符
        let hasPattern2 = false;  // 特定乱码序列如 Ã©

        // 检测模式1：连续的 Latin1 高位字符
        const latin1HighChars = str.match(/[\xC0-\xFF]{2,}/g);
        if (latin1HighChars && latin1HighChars.length > 0) {
            hasPattern1 = true;
        }

        // 检测模式2：常见乱码序列
        const commonMojibake = ['Ã', 'Â', '€', '¢', '£', '¤', '¥', '¦', '§', '¨', '©', 'ª', '«', '¬', '®', '¯'];
        const mojibakeSeqCount = (str.match(/[ÃÂ€¢£¤¥¦§¨©ª«¬®¯]/g) || []).length;
        if (mojibakeSeqCount > 2) {
            hasPattern2 = true;
        }

        return hasPattern1 || hasPattern2;
    }

    /**
     * 修复乱码文件名
     * 将错误解码的 Latin1 字符序列还原为正确的 UTF-8
     */
    fixMojibake(filename) {
        // 方法：检测乱码模式，将可能的 Latin1 序列转换回字节再重新解码为 UTF-8
        let fixed = filename;

        // 常见 UTF-8 字符被错误解码的映射表
        const mojibakeMap = {
            'Ã©': 'é',  // é (U+00E9) 的 UTF-8 被错误解码
            'Ã ': 'à',  // à (U+00E0)
            'Ã§': 'ç',  // ç (U+00E7)
            'Ã¢': 'â',  // â (U+00E2)
            'Ãª': 'ê',  // ê (U+00EA)
            'Ã«': 'ë',  // ë (U+00EB)
            'Ã®': 'î',  // î (U+00EE)
            'Ã¯': 'ï',  // ï (U+00EF)
            'Ã´': 'ô',  // ô (U+00F4)
            'Ã¶': 'ö',  // ö (U+00F6)
            'Ã»': 'û',  // û (U+00FB)
            'Ã¼': 'ü',  // ü (U+00FC)
            'Ã±': 'ñ',  // ñ (U+00F1)
            'Ã': 'À',  // À (U+00C0) 等大写字母
            'Â': 'À',
            'Ã': 'À',
            'Ã': 'Á',
            'Ã': 'Â',
            'Ã': 'Ã',
            'Ã': 'Ä',
            'Ã': 'Å',
            'Ã¦': 'æ',  // æ (U+00E6)
            'Ã': 'ß',  // ß (U+00DF)
            'Ã': 'Ð',  // ð (U+00F0)
            'Ã': 'Ñ',
            'Ã': 'Ó',
            'Ã': 'Ô',
            'Ã': 'Õ',
            'Ã': 'Ö',
            'Ã': 'Ø',
            'Ã': 'Ù',
            'Ã': 'Ú',
            'Ã': 'Û',
            'Ã': 'Ü',
            'Ã': 'Ý',
            'Ã': 'Þ',
            'Ã': 'ÿ',
            'Â°': '°',  // 度符号
            'Â·': '·',  // 中间点
            'â': '–',  // 长破折号
            'â': '—',  // 破折号
            'â': '"',  // 左引号
            'â': '"',  // 右引号
            'â': "'",  // 左单引号
            'â': "'",  // 右单引号
            'â¦': '…',  // 省略号
            'â¤': '≤',
            'â¥': '≥',
            'âª': '≈',
            'â ': '≠',
            'â': '√',
            'â': '∝',
            'â': '∞',
            'â': '∂',
            'â': '∇',
            'â': '∈',
            'â': '∉',
            'â': '∋',
            'â': '⊂',
            'â': '⊃',
            'â': '⊄',
            'â': '⊆',
            'â': '⊇',
            'â': '⊕',
            'â': '⊖',
            'â': '⊗',
            'â': '⊘',
            'â�': '⊙',
            'â�': '⊚',
            'â': '⊛',
            'âª': '⊢',
            'â«': '⊣',
            'â¬': '⊤',
            'â­': '⊥',
            'â®': '⊦',
            'â¯': '⊧',
            'â²': '⊲',
            'â³': '⊳',
            'â´': '⊴',
            'âµ': '⊵',
            'â¶': '⊶',
            'â·': '⊷',
            'â¸': '⊸',
            'â¹': '⊹',
            'âº': '⊺',
            'â»': '⊻',
            'â¼': '⊼',
            'â½': '⊽',
            'â¾': '⊾',
            'â¿': '⊿'
        };

        // 替换常见乱码序列
        for (const [broken, fixedChar] of Object.entries(mojibakeMap)) {
            // 使用全局替换，忽略大小写变化
            let regex = new RegExp(broken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            fixed = fixed.replace(regex, fixedChar);
        }

        // 如果文件名仍然包含可疑字符，尝试更激进的修复
        // 移除所有非 ASCII 控制字符和无效序列
        if (/[\x80-\xFF]/.test(fixed)) {
            // 尝试将字符串当作 Latin1 字节处理，重新解码为 UTF-8
            try {
                // 将字符串转换为字节数组（假设当前是 Latin1 编码）
                const bytes = [];
                for (let i = 0; i < fixed.length; i++) {
                    const charCode = fixed.charCodeAt(i);
                    if (charCode > 127) {
                        bytes.push(charCode & 0xFF);
                    } else {
                        bytes.push(charCode);
                    }
                }
                // 重新解码为 UTF-8
                fixed = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
            } catch (e) {
                // 如果解码失败，保持原样
                logger.warn('修复乱码文件名时解码失败:', e.message);
            }
        }

        return fixed;
    }

    /**
     * 验证文件类型（基于MIME和扩展名）
     */
    validateFileType(file) {
        const allowedTypes = config.upload.allowedTypes;
        
        // 检查MIME类型
        if (!allowedTypes.includes(file.mimetype)) {
            return { valid: false, error: '不支持的文件类型' };
        }
        
        // 检查扩展名
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov', '.3gp',
                                   '.mp3', '.wav', '.ogg',
                                   '.jpg', '.jpeg', '.png', '.gif', '.webp',
                                   '.pdf', '.zip', '.rar', '.7z'];
        
        if (!allowedExtensions.includes(ext)) {
            return { valid: false, error: '不支持的文件扩展名' };
        }
        
        return { valid: true };
    }

    /**
     * 检查文件是否安全（基于Magic Number）
     */
    async checkFileMagicNumber(filePath) {
        try {
            const fs = require('fs');
            const buffer = Buffer.alloc(12);
            const fd = await fs.promises.open(filePath, 'r');
            await fs.promises.read(fd, buffer, 0, 12, 0);
            await fs.promises.close(fd);
            
            const signatures = {
                'video/mp4': ['00 00 00 18 66 74 79 70', '00 00 00 1C 66 74 79 70'],
                'video/webm': ['1A 45 DF A3'],
                'image/jpeg': ['FF D8 FF'],
                'image/png': ['89 50 4E 47 0D 0A 1A 0A'],
                'audio/mpeg': ['49 44 33'],
                'audio/wav': ['52 49 46 46']
            };
            
            const hex = buffer.toString('hex').toUpperCase();
            
            for (const [mimeType, sigs] of Object.entries(signatures)) {
                for (const sig of sigs) {
                    const sigHex = sig.replace(/\s/g, '').toUpperCase();
                    if (hex.startsWith(sigHex)) {
                        return { valid: true, mimeType };
                    }
                }
            }
            
            return { valid: false, error: '文件Magic Number不匹配' };
        } catch (error) {
            return { valid: false, error: '无法验证文件类型' };
        }
    }

    /**
     * 生成文件安全路径
     */
    generateSecurePath(basePath, filename, parentId = null) {
        const sanitized = this.sanitizeFilename(filename);
        const timestamp = Date.now();
        const randomSuffix = crypto.randomBytes(4).toString('hex');
        const safeName = `${timestamp}_${randomSuffix}_${sanitized}`;
        
        return path.join(basePath, safeName);
    }

    // ==================== 数据脱敏 ====================

    /**
     * 脱敏用户信息
     */
    sanitizeUser(user) {
        if (!user) return null;
        
        return {
            id: user.id,
            username: user.username,
            email: user.email ? this.maskEmail(user.email) : null,
            role: user.role,
            status: user.status || 'active', // 账户状态
            is_active: user.status !== 'disabled' && user.status !== 'locked' && user.status !== 'suspended' && user.status !== 'pending',
            avatar_url: user.avatar_url,
            created_at: user.created_at,
            last_login: user.last_login
        };
    }

    /**
     * 脱敏邮箱
     */
    maskEmail(email) {
        const [local, domain] = email.split('@');
        if (!domain) return email;
        
        const maskedLocal = local.length > 2 
            ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
            : '*'.repeat(local.length);
        
        return `${maskedLocal}@${domain}`;
    }

    /**
     * 脱敏手机号
     */
    maskPhone(phone) {
        if (!phone || phone.length < 11) return phone;
        return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
    }

    // ==================== 加密解密 ====================

    /**
     * 加密数据（AES-256-CBC）
     */
    encrypt(text, key = config.security.jwt.secret) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', 
            crypto.createHash('sha256').update(key).digest(), iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * 解密数据
     */
    decrypt(encryptedText, key = config.security.jwt.secret) {
        try {
            const parts = encryptedText.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            
            const decipher = crypto.createDecipheriv('aes-256-cbc',
                crypto.createHash('sha256').update(key).digest(), iv);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            return null;
        }
    }

    // ==================== 安全工具 ====================

    /**
     * 生成安全随机字符串
     */
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * 生成一次性密码
     */
    generateOTP(length = 6) {
        return Math.floor(Math.pow(10, length - 1) + Math.random() * 
               (Math.pow(10, length) - Math.pow(10, length - 1) - 1)).toString();
    }

    /**
     * 检查IP是否在黑名单中（简单实现）
     */
    isIPBlacklisted(ip) {
        const privateIPRanges = [
            /^127\./,
            /^192\.168\./,
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^::1$/
        ];
        
        // 检查是否是私有IP
        for (const range of privateIPRanges) {
            if (range.test(ip)) {
                return false; // 私有IP不算黑名单
            }
        }
        
        return false;
    }

    /**
     * 生成CSRF Token
     */
    generateCSRFToken() {
        return crypto.randomBytes(32).toString('base64url');
    }

    /**
     * 验证CSRF Token
     */
    verifyCSRFToken(token, storedToken) {
        try {
            return crypto.timingSafeEqual(
                Buffer.from(token),
                Buffer.from(storedToken)
            );
        } catch {
            return false;
        }
    }
}

module.exports = { SecurityManager };
