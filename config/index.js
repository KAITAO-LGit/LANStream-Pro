/**
 * LANStream Pro - 配置文件
 * 
 * 本地开发环境配置
 */

module.exports = {
    // 应用配置
    app: {
        name: 'LANStream Pro',
        version: '0.1.0',
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    },

    // 数据库配置
    database: {
        // SQLite配置
        sqlite: {
            path: './data/lanstream.db',
            enableWAL: true
        },
        // Redis配置
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || '',
            db: process.env.REDIS_DB || 0
        }
    },

    // 安全配置
    security: {
        jwt: {
            secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
            expiresIn: '2h',
            refreshExpiresIn: '7d'
        },
        bcrypt: {
            saltRounds: 12
        },
        password: {
            minLength: 6,
            requireUppercase: true,
            requireLowercase: true,
            requireNumber: true,
            requireSpecial: false
        },
        login: {
            maxAttempts: 5,
            lockoutDuration: 15 * 60 * 1000, // 15分钟
            captchaRequired: true
        }
    },

    // 文件上传配置
    upload: {
        maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
        chunkSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: [
            'video/mp4', 'video/x-matroska', 'video/webm', 'video/avi',
            'video/mkv', 'video/flv', 'video/mov', 'video/3gp',
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'audio/mpeg', 'audio/wav', 'audio/ogg',
            'application/pdf',
            'application/zip', 'application/x-rar-compressed'
        ],
        storagePath: './uploads'
    },

    // 视频处理配置
    video: {
        transcode: {
            enabled: true,
            codec: 'h264',
            preset: 'medium',
            crf: 23,
            resolution: '1920x1080',
            bitrate: '5000k'
        },
        streaming: {
            protocol: 'hls',
            hlsTime: 10,
            hlsListSize: 100,
            segmentDuration: 10
        },
        thumbnail: {
            width: 320,
            height: 180,
            time: '00:01:00'
        }
    },

    // 日志配置
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        maxFiles: 5,
        maxSize: '10m',
        format: 'json'
    },

    // 网络配置
    network: {
        interface: 'all',
        corsOrigin: '*'
    },

    // 功能开关
    features: {
        userRegistration: true,
        videoTranscoding: true,
        filePreview: true,
        downloadAccelerator: true,
        autoThumbnail: true
    }
};
