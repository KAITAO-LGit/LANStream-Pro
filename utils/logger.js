/**
 * 日志工具模块
 * 提供统一的日志记录功能
 */

const winston = require('winston');
const path = require('path');

// 创建日志目录
const logDir = path.join(__dirname, '../logs');
if (!require('fs').existsSync(logDir)) {
    require('fs').mkdirSync(logDir, { recursive: true });
}

// 自定义数据库传输器 - 将日志写入数据库
class DatabaseTransport extends winston.Transport {
    constructor(opts = {}) {
        super(opts);
        this.logBuffer = [];
        this.flushInterval = null;
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        // 将日志信息添加到缓冲区
        const logEntry = {
            level: info.level,
            message: info.message,
            timestamp: info.timestamp || new Date().toISOString(),
            context: info.context || null
        };

        this.logBuffer.push(logEntry);

        // 如果缓冲区已满或接近满，立即刷新
        if (this.logBuffer.length >= 10) {
            this.flushToDatabase();
        }

        callback();
    }

    flushToDatabase() {
        if (this.logBuffer.length === 0) return;

        // 获取待写入的日志并清空缓冲区
        const logsToWrite = [...this.logBuffer];
        this.logBuffer = [];

        // 检查数据库是否可用
        if (!global.db || !global.db.db) {
            console.log('[DatabaseTransport] 数据库不可用，日志未写入数据库:', logsToWrite.length, '条');
            return;
        }

        try {
            // 逐条写入日志（与 database.js 中的方式一致）
            for (const log of logsToWrite) {
                const contextStr = log.context ? JSON.stringify(log.context) : null;
                global.db.db.run(
                    'INSERT INTO system_logs (level, message, context, created_at) VALUES (?, ?, ?, ?)',
                    [log.level, log.message, contextStr, log.timestamp]
                );
            }
        } catch (error) {
            console.error('[DatabaseTransport] 写入数据库失败:', error.message);
        }
    }

    // 启动定期刷新
    startFlushTimer(intervalMs = 5000) {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }
        this.flushInterval = setInterval(() => {
            this.flushToDatabase();
        }, intervalMs);
    }

    // 停止定时器
    stopFlushTimer() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
    }

    // 确保所有日志都被写入
    flush() {
        return new Promise((resolve) => {
            this.flushToDatabase();
            // 给一点时间确保写入完成
            setTimeout(resolve, 100);
        });
    }
}

// 日志格式配置
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (stack) {
            log += `\n${stack}`;
        }
        return log;
    })
);

// 控制台输出格式
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level}]: ${message}`;
    })
);

// 创建数据库传输器实例
const dbTransport = new DatabaseTransport({
    level: 'info',
    name: 'databaseTransport'
});

// 启动数据库传输器的定时刷新
dbTransport.startFlushTimer(5000);

// 创建日志记录器
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'lanstream-pro' },
    transports: [
        // 错误日志文件
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }),
        // 组合日志文件
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5
        }),
        // 数据库传输器
        dbTransport
    ]
});

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }));
}

// 错误处理 - 增强版本
logger.error = function(message, error) {
    // 处理字符串或对象参数
    if (typeof message === 'object') {
        // 如果第一个参数是对象，直接记录
        logger.log('error', JSON.stringify(message));
        return;
    }
    
    if (error instanceof Error) {
        logger.log('error', message, { stack: error.stack });
    } else if (error && typeof error === 'object') {
        // 如果 error 是对象，尝试提取有用信息
        const errorInfo = [];
        if (error.message) errorInfo.push(error.message);
        if (error.stack) errorInfo.push(error.stack);
        if (error.reason) errorInfo.push('Reason: ' + error.reason);
        if (error.promise) errorInfo.push('Promise: ' + error.promise);
        
        if (errorInfo.length > 0) {
            logger.log('error', message + ' - ' + errorInfo.join(' | '));
        } else {
            logger.log('error', message + ' - ' + JSON.stringify(error));
        }
    } else if (error !== undefined && error !== null) {
        // 其他类型的错误参数
        logger.log('error', message + ' - ' + String(error));
    } else {
        logger.log('error', message);
    }
};

// 清理函数 - 确保所有日志都被写入数据库
async function cleanup() {
    console.log('[Logger] 正在清理日志缓冲区...');
    dbTransport.stopFlushTimer();
    await dbTransport.flush();
    console.log('[Logger] 日志缓冲区已清理完成');
}

// 导出 logger 和清理函数
module.exports = { logger, cleanup };

// 处理进程退出事件，确保日志被正确写入
process.on('exit', async () => {
    await cleanup();
});

process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
});
