/**
 * 数据库管理器
 * 使用 sql.js（纯 JavaScript，无需编译）
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbPath = null;
        this.SQL = null;
    }

    /**
     * 初始化数据库
     */
    async initialize() {
        try {
            // 确保数据目录存在
            const dataDir = path.join(__dirname, '../data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.dbPath = path.join(dataDir, 'lanstream.db');

            // 初始化 sql.js
            this.SQL = await initSqlJs();

            // 加载或创建数据库
            if (fs.existsSync(this.dbPath)) {
                const buffer = fs.readFileSync(this.dbPath);
                this.db = new this.SQL.Database(buffer);
                logger.info(`✅ SQLite数据库已加载: ${this.dbPath}`);
            } else {
                this.db = new this.SQL.Database();
                logger.info('✅ 新SQLite数据库已创建');
            }

            // 启用 WAL 模式以提高并发性能
            this.db.run('PRAGMA journal_mode=WAL');
            this.db.run('PRAGMA synchronous=NORMAL');
            this.db.run('PRAGMA cache_size=-64000'); // 64MB 缓存
            this.db.run('PRAGMA temp_store=MEMORY');
            this.db.run('PRAGMA mmap_size=268435456'); // 256MB 内存映射

            // 创建表结构
            this.createTables();

            // 执行数据库迁移
            this.runMigrations();

            // 初始化种子数据
            this.seedData();

            // 启动自动保存定时器
            this.startAutoSave();

            logger.info('✅ 数据库初始化成功');
        } catch (error) {
            logger.error('数据库初始化失败:', error);
            throw error;
        }
    }

    /**
     * 启动自动保存定时器
     */
    startAutoSave() {
        // 每30秒自动保存一次，而不是每次操作都保存
        this.autoSaveTimer = setInterval(() => {
            this.save();
        }, 30000);
    }

    /**
     * 保存数据库到文件
     */
    save() {
        if (this.db) {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        }
    }

    /**
     * 执行SQL查询（查询操作）
     * 使用优化的查询方法，支持批量操作
     */
    query(sql, params = []) {
        try {
            const stmt = this.db.prepare(sql);
            if (params.length > 0) {
                stmt.bind(params);
            }

            const results = [];
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        } catch (error) {
            logger.error('查询失败:', { sql, error: error.message });
            throw error;
        }
    }

    /**
     * 执行SQL语句（插入、更新、删除）
     * 优化：移除每次操作后的同步保存，改用定时器自动保存
     */
    run(sql, params = []) {
        try {
            this.db.run(sql, params);
            return { changes: this.db.getRowsModified() };
        } catch (error) {
            logger.error('执行失败:', { sql, error: error.message });
            throw error;
        }
    }

    /**
     * 获取单条记录
     */
    get(sql, params = []) {
        const results = this.query(sql, params);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * 创建数据库表
     */
    createTables() {
        const statements = [
            // 用户表
            `CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                display_name TEXT,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                avatar_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                is_active INTEGER DEFAULT 1
            )`,

            // 文件表
            `CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                type TEXT NOT NULL,
                mime_type TEXT,
                size INTEGER DEFAULT 0,
                duration REAL,
                thumbnail TEXT,
                description TEXT,
                tags TEXT,
                view_count INTEGER DEFAULT 0,
                download_count INTEGER DEFAULT 0,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_deleted INTEGER DEFAULT 0
            )`,

            // 播放历史表
            `CREATE TABLE IF NOT EXISTS playback_history (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                file_id TEXT NOT NULL,
                progress REAL DEFAULT 0,
                last_position INTEGER DEFAULT 0,
                completed INTEGER DEFAULT 0,
                watched_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 收藏表
            `CREATE TABLE IF NOT EXISTS favorites (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                file_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, file_id)
            )`,

            // 传输任务表
            `CREATE TABLE IF NOT EXISTS transfer_tasks (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                file_id TEXT,
                type TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                progress REAL DEFAULT 0,
                speed REAL DEFAULT 0,
                error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            )`,

            // 系统配置表
            `CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT,
                description TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 系统日志表
            `CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                context TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 索引 - 优化查询性能
            `CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id)`,
            `CREATE INDEX IF NOT EXISTS idx_files_type ON files(type)`,
            `CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at)`,
            `CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)`,
            `CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)`,
            `CREATE INDEX IF NOT EXISTS idx_playback_history_user ON playback_history(user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_playback_history_file ON playback_history(file_id)`,
            `CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_transfer_tasks_user ON transfer_tasks(user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)`,
            `CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at)`
        ];

        for (const sql of statements) {
            try {
                this.db.run(sql);
            } catch (error) {
                // 忽略重复创建错误
                if (!error.message.includes('already exists')) {
                    logger.warn('创建表/索引警告:', error.message);
                }
            }
        }

        this.save();
        logger.info('✅ 数据库表结构已创建');
    }

    /**
     * 数据库迁移（处理现有数据库的字段变更）
     */
    runMigrations() {
        try {
            // 检查 users 表是否有 display_name 字段
            const columns = this.query("PRAGMA table_info(users)");
            const hasDisplayName = columns.some(col => col.name === 'display_name');

            if (!hasDisplayName) {
                this.db.run("ALTER TABLE users ADD COLUMN display_name TEXT");
                logger.info('✅ 数据库迁移：添加 display_name 字段');
            }

            // 检查是否有 status 字段
            const hasStatus = columns.some(col => col.name === 'status');
            
            if (!hasStatus) {
                this.db.run("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
                logger.info('✅ 数据库迁移：添加 status 字段');
                
                // 将现有的 is_active=0 的用户设置为 disabled 状态
                this.db.run("UPDATE users SET status = 'disabled' WHERE is_active = 0");
                logger.info('✅ 数据库迁移：更新现有禁用用户状态');
            }

            // 检查是否有其他需要的迁移
            this.save();
            logger.info('✅ 数据库迁移检查完成');
        } catch (error) {
            logger.warn('数据库迁移警告:', error.message);
        }
    }

    /**
     * 初始化种子数据
     */
    seedData() {
        try {
            const userCount = this.get('SELECT COUNT(*) as count FROM users')?.count || 0;

            if (userCount === 0) {
                logger.info('📦 正在初始化种子数据...');

                // 插入默认配置
                const configs = [
                    { key: 'site_name', value: 'LANStream Pro', description: '站点名称' },
                    { key: 'max_upload_size', value: '5368709120', description: '最大上传文件大小(字节)' },
                    { key: 'allow_registration', value: 'true', description: '是否允许用户注册' },
                    { key: 'maintenance_mode', value: 'false', description: '维护模式' }
                ];

                for (const config of configs) {
                    this.run(
                        'INSERT OR IGNORE INTO system_config (key, value, description) VALUES (?, ?, ?)',
                        [config.key, config.value, config.description]
                    );
                }

                logger.info('✅ 种子数据初始化完成');
            }
        } catch (error) {
            logger.warn('种子数据初始化跳过:', error.message);
        }
    }

    // ==================== 用户操作 ====================

    /**
     * 创建用户
     */
    async createUser(userData) {
        const id = uuidv4();
        const status = userData.status || 'active';
        // is_active 根据 status 设置：active/pending 为 1，其他为 0
        const isActive = ['active', 'pending'].includes(status) ? 1 : 0;
        
        try {
            this.run(`
                INSERT INTO users (id, username, display_name, email, password_hash, role, avatar_url, status, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, 
                userData.username, 
                userData.display_name || null, 
                userData.email || null, 
                userData.password, 
                userData.role || 'user', 
                userData.avatar_url || null,
                status,
                isActive
            ]);
            return { id, ...userData, status };
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                throw new Error('用户名已存在');
            }
            throw error;
        }
    }

    /**
     * 根据用户名获取用户
     */
    getUserByUsername(username) {
        return this.get('SELECT * FROM users WHERE username = ?', [username]);
    }

    /**
     * 根据ID获取用户
     */
    getUserById(id) {
        return this.get('SELECT * FROM users WHERE id = ?', [id]);
    }

    /**
     * 获取所有用户
     */
    getAllUsers(limit = 100, offset = 0) {
        return this.query(`
            SELECT id, username, email, role, status, created_at, last_login
            FROM users
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
    }

    /**
     * 获取用户总数
     */
    getUserCount() {
        const result = this.query('SELECT COUNT(*) as count FROM users');
        return result[0]?.count || 0;
    }

    /**
     * 更新用户最后登录时间
     */
    updateLastLogin(userId) {
        this.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [userId]);
    }

    /**
     * 更新用户信息
     */
    updateUser(userId, data) {
        const allowedFields = ['email', 'avatar_url', 'role', 'is_active', 'status'];
        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                if (key === 'is_active') {
                    updates.push(`${key} = ?`);
                    values.push(value ? 1 : 0);
                } else {
                    updates.push(`${key} = ?`);
                    values.push(value);
                }
            }
        }

        if (updates.length === 0) return false;

        values.push(userId);
        this.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
        return true;
    }

    /**
     * 彻底删除用户（不可恢复）
     */
    deleteUser(userId) {
        this.run('DELETE FROM users WHERE id = ?', [userId]);
        return true;
    }

    /**
     * 更新用户密码
     */
    updatePassword(userId, newPasswordHash) {
        this.run('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, userId]);
        return true;
    }

    /**
     * 更新用户资料（显示名称和邮箱）
     */
    updateUserProfile(userId, data) {
        const { display_name, email } = data;
        this.run('UPDATE users SET display_name = ?, email = ? WHERE id = ?', [display_name || null, email || null, userId]);
        return true;
    }

    /**
     * 更新用户头像
     */
    updateUserAvatar(userId, avatarUrl) {
        this.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);
        return true;
    }

    // ==================== 文件操作 ====================

    /**
     * 创建文件记录
     */
    createFile(fileData) {
        const id = uuidv4();
        this.run(`
            INSERT INTO files (id, parent_id, name, path, type, mime_type, size, thumbnail, description, tags, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, fileData.parent_id || null, fileData.name, fileData.path, fileData.type, fileData.mime_type || null, fileData.size || 0, fileData.thumbnail || null, fileData.description || null, fileData.tags || null, fileData.created_by || null]);
        return this.getFileById(id);
    }

    /**
     * 检查文件是否已存在（通过路径）
     */
    fileExistsByPath(filePath) {
        const result = this.get('SELECT id FROM files WHERE path = ?', [filePath]);
        return !!result;
    }

    /**
     * 获取文件/文件夹详情
     */
    getFileById(id) {
        return this.get('SELECT * FROM files WHERE id = ? AND is_deleted = 0', [id]);
    }

    /**
     * 获取文件夹内容
     */
    getFolderContents(folderId = null, options = {}) {
        const { type, search, limit = 100, offset = 0, sort = 'name', order = 'ASC' } = options;

        let sql = 'SELECT * FROM files WHERE is_deleted = 0 AND parent_id ';
        const params = [];

        if (folderId) {
            sql += '= ?';
            params.push(folderId);
        } else {
            sql += 'IS NULL';
        }

        if (type && type !== 'all') {
            sql += ' AND type = ?';
            params.push(type);
        }

        if (search) {
            sql += ' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        const validSorts = ['name', 'size', 'created_at', 'view_count', 'download_count'];
        const sortField = validSorts.includes(sort) ? sort : 'name';
        const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        sql += ` ORDER BY type DESC, ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        return this.query(sql, params);
    }

    /**
     * 获取视频文件列表
     */
    getVideoFiles(limit = 50, offset = 0) {
        return this.query(`
            SELECT id, name, path, type, mime_type, size, thumbnail, duration,
                   view_count, download_count, created_at
            FROM files
            WHERE type = 'video' AND is_deleted = 0
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
    }

    /**
     * 更新文件信息
     */
    updateFile(fileId, data) {
        const allowedFields = ['name', 'description', 'tags', 'thumbnail', 'parent_id'];
        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (updates.length === 0) return false;

        updates.push('updated_at = datetime("now")');
        values.push(fileId);

        this.run(`UPDATE files SET ${updates.join(', ')} WHERE id = ?`, values);
        return true;
    }

    /**
     * 删除文件（硬删除，不可恢复）
     * 同时删除数据库记录和物理文件
     */
    deleteFile(fileId) {
        // 获取文件信息
        const file = this.getFileById(fileId);
        if (!file) {
            return false;
        }

        // 如果是文件夹，递归删除内容
        if (file.type === 'folder') {
            const contents = this.getFolderContents(fileId);
            for (const item of contents) {
                this.deleteFile(item.id);
            }
        }

        // 删除物理文件（如果存在）
        if (file.type !== 'folder' && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
                logger.info(`物理文件已删除: ${file.path}`);
            } catch (error) {
                logger.warn(`删除物理文件失败: ${file.path}`, error.message);
            }
        }

        // 删除数据库记录
        this.run('DELETE FROM files WHERE id = ?', [fileId]);
        return true;
    }

    /**
     * 批量删除文件（硬删除，不可恢复）
     */
    deleteFiles(fileIds) {
        for (const id of fileIds) {
            this.run('DELETE FROM files WHERE id = ?', [id]);
        }
        return fileIds.length;
    }

    /**
     * 增加文件下载/观看次数
     */
    incrementFileCount(fileId, field = 'view_count') {
        this.run(`UPDATE files SET ${field} = ${field} + 1 WHERE id = ?`, [fileId]);
    }

    // ==================== 播放历史操作 ====================

    /**
     * 记录播放历史
     */
    addToHistory(historyData) {
        const id = uuidv4();

        // 检查是否已存在记录
        const existing = this.get(`
            SELECT id FROM playback_history WHERE user_id = ? AND file_id = ?
        `, [historyData.user_id, historyData.file_id]);

        if (existing) {
            this.run(`
                UPDATE playback_history
                SET progress = ?, last_position = ?, completed = ?, watched_at = datetime("now")
                WHERE user_id = ? AND file_id = ?
            `, [historyData.progress, historyData.position, historyData.completed ? 1 : 0, historyData.user_id, historyData.file_id]);
            return existing.id;
        }

        this.run(`
            INSERT INTO playback_history (id, user_id, file_id, progress, last_position, completed)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, historyData.user_id, historyData.file_id, historyData.progress, historyData.position, historyData.completed ? 1 : 0]);
        return id;
    }

    /**
     * 获取用户播放历史
     */
    getUserHistory(userId, limit = 20) {
        return this.query(`
            SELECT ph.*, f.name as file_name, f.thumbnail, f.duration, f.type
            FROM playback_history ph
            JOIN files f ON ph.file_id = f.id
            WHERE ph.user_id = ?
            ORDER BY ph.watched_at DESC
            LIMIT ?
        `, [userId, limit]);
    }

    // ==================== 收藏操作 ====================

    /**
     * 添加收藏
     */
    addFavorite(userId, fileId) {
        const id = uuidv4();
        try {
            this.run(`INSERT OR IGNORE INTO favorites (id, user_id, file_id) VALUES (?, ?, ?)`, [id, userId, fileId]);
            return id;
        } catch {
            return null;
        }
    }

    /**
     * 取消收藏
     */
    removeFavorite(userId, fileId) {
        const result = this.run('DELETE FROM favorites WHERE user_id = ? AND file_id = ?', [userId, fileId]);
        return result.changes > 0;
    }

    /**
     * 获取用户收藏
     */
    getUserFavorites(userId) {
        return this.query(`
            SELECT f.*, fav.created_at as favorited_at
            FROM favorites fav
            JOIN files f ON fav.file_id = f.id
            WHERE fav.user_id = ?
            ORDER BY fav.created_at DESC
        `, [userId]);
    }

    // ==================== 传输任务操作 ====================

    /**
     * 创建传输任务
     */
    createTransferTask(taskData) {
        const id = uuidv4();
        this.run(`
            INSERT INTO transfer_tasks (id, user_id, file_id, type, status)
            VALUES (?, ?, ?, ?, 'pending')
        `, [id, taskData.user_id, taskData.file_id || null, taskData.type]);
        return this.getTransferTask(id);
    }

    /**
     * 获取传输任务
     */
    getTransferTask(taskId) {
        return this.get('SELECT * FROM transfer_tasks WHERE id = ?', [taskId]);
    }

    /**
     * 获取用户传输任务
     */
    getUserTransferTasks(userId, status = null) {
        let sql = 'SELECT * FROM transfer_tasks WHERE user_id = ?';
        const params = [userId];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }

        sql += ' ORDER BY created_at DESC LIMIT 50';

        return this.query(sql, params);
    }

    /**
     * 更新传输任务
     */
    updateTransferTask(taskId, data) {
        const allowedFields = ['status', 'progress', 'speed', 'error'];
        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (data.status === 'completed') {
            updates.push('completed_at = datetime("now")');
        }

        if (updates.length === 0) return false;

        values.push(taskId);
        this.run(`UPDATE transfer_tasks SET ${updates.join(', ')} WHERE id = ?`, values);
        return true;
    }

    // ==================== 系统配置操作 ====================

    /**
     * 获取配置值
     */
    getConfig(key) {
        const result = this.get('SELECT value FROM system_config WHERE key = ?', [key]);
        return result ? result.value : null;
    }

    /**
     * 设置配置值
     */
    setConfig(key, value, description = null) {
        this.run(`
            INSERT OR REPLACE INTO system_config (key, value, description, updated_at)
            VALUES (?, ?, ?, datetime("now"))
        `, [key, value, description]);
    }

    /**
     * 获取所有配置
     */
    getAllConfig() {
        const configs = this.query('SELECT * FROM system_config');
        const result = {};
        for (const config of configs) {
            result[config.key] = config.value;
        }
        return result;
    }

    // ==================== 统计操作 ====================

    /**
     * 获取文件统计
     */
    getFileStats() {
        return this.query(`
            SELECT
                type,
                COUNT(*) as count,
                SUM(size) as total_size
            FROM files
            WHERE is_deleted = 0
            GROUP BY type
        `);
    }

    /**
     * 获取用户统计
     */
    getUserStats() {
        const total = this.get('SELECT COUNT(*) as count FROM users')?.count || 0;
        const active = this.get('SELECT COUNT(*) as count FROM users WHERE is_active = 1')?.count || 0;
        // 统计所有管理员角色
        const admins = this.get("SELECT COUNT(*) as count FROM users WHERE role IN ('superadmin', 'admin', 'moderator')")?.count || 0;
        const superadmins = this.get("SELECT COUNT(*) as count FROM users WHERE role = 'superadmin'")?.count || 0;
        return { total, active, admins, superadmins };
    }

    /**
     * 获取系统日志
     */
    getSystemLogs(level = null, limit = 100) {
        let sql = 'SELECT * FROM system_logs';
        const params = [];

        if (level) {
            sql += ' WHERE level = ?';
            params.push(level);
        }

        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        return this.query(sql, params);
    }

    /**
     * 记录系统日志
     */
    log(level, message, context = null) {
        this.run(`
            INSERT INTO system_logs (level, message, context) VALUES (?, ?, ?)
        `, [level, message, context ? JSON.stringify(context) : null]);
    }

    /**
     * 关闭数据库连接
     * 优化：确保保存并清理资源
     */
    async close() {
        try {
            // 停止自动保存定时器
            if (this.autoSaveTimer) {
                clearInterval(this.autoSaveTimer);
            }

            // 保存最终数据
            if (this.db) {
                this.save();

                // 关闭数据库
                this.db.close();
                this.db = null;
                logger.info('✅ SQLite数据库连接已关闭');
            }
        } catch (error) {
            logger.error('关闭数据库失败:', error);
        }
    }
}

module.exports = { DatabaseManager };
