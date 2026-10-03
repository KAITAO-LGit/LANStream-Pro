/**
 * 视频流媒体路由
 * 处理视频播放、转码、封面生成等功能
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const config = require('../config');

// 安全导入 ffmpeg - 防止导入时产生未处理的 Promise
let ffmpeg;
try {
    ffmpeg = require('fluent-ffmpeg');
} catch (importErr) {
    logger.error('导入 fluent-ffmpeg 失败:', importErr.message);
    ffmpeg = null;
}

// FFmpeg路径配置 - 延迟初始化
let ffmpegInitialized = false;

function initFFmpeg() {
    if (ffmpegInitialized || !ffmpeg) return;
    
    try {
        const ffmpegPath = path.join(__dirname, '../bin/ffmpeg.exe');
        const ffprobePath = path.join(__dirname, '../bin/ffprobe.exe');
        
        if (fs.existsSync(ffmpegPath)) {
            ffmpeg.setFfmpegPath(ffmpegPath);
        }
        if (fs.existsSync(ffprobePath)) {
            ffmpeg.setFfprobePath(ffprobePath);
        }
        ffmpegInitialized = true;
        logger.info('FFmpeg路径配置成功');
    } catch (ffmpegErr) {
        logger.warn('FFmpeg路径配置失败，视频功能可能受限:', ffmpegErr.message);
        ffmpegInitialized = true; // 标记为已尝试，避免重复尝试
    }
}

// 检查 ffmpeg 是否可用
function checkFFmpegAvailable() {
    return ffmpeg !== null && ffmpegInitialized;
}

// HLS输出目录
const hlsDir = path.join(__dirname, '../uploads/hls');
if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
}

// 缩略图目录
const thumbnailDir = path.join(__dirname, '../uploads/thumbnails');
if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
}

// ==================== 工具函数 ====================

/**
 * 获取视频信息
 */
function getVideoInfo(videoPath) {
    // 确保FFmpeg已初始化
    initFFmpeg();
    
    if (!ffmpeg) {
        return Promise.reject(new Error('FFmpeg模块不可用'));
    }
    
    return new Promise((resolve, reject) => {
        try {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
                    const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');

                    resolve({
                        duration: metadata.format?.duration || 0,
                        size: metadata.format?.size || 0,
                        bitrate: metadata.format?.bit_rate || 0,
                        video: videoStream ? {
                            codec: videoStream.codec_name || 'unknown',
                            width: videoStream.width || 0,
                            height: videoStream.height || 0,
                            aspectRatio: videoStream.display_aspect_ratio || '16:9',
                            frameRate: videoStream.r_frame_rate || '30/1'
                        } : null,
                        audio: audioStream ? {
                            codec: audioStream.codec_name || 'unknown',
                            channels: audioStream.channels || 2,
                            sampleRate: audioStream.sample_rate || 44100
                        } : null
                    });
                } catch (processErr) {
                    reject(new Error(`处理视频元数据失败: ${processErr.message}`));
                }
            });
        } catch (err) {
            reject(new Error(`获取视频信息异常: ${err.message}`));
        }
    });
}

/**
 * 生成视频缩略图
 */
function generateThumbnail(videoPath, fileId) {
    // 确保FFmpeg已初始化
    initFFmpeg();
    
    if (!ffmpeg) {
        return Promise.reject(new Error('FFmpeg模块不可用'));
    }
    
    const thumbnailPath = path.join(thumbnailDir, `${fileId}.jpg`);
    
    return new Promise((resolve, reject) => {
        try {
            // 安全获取配置参数
            const thumbTime = (config.video?.thumbnail?.time) || '00:01:00';
            const thumbWidth = (config.video?.thumbnail?.width) || '320';
            const thumbHeight = (config.video?.thumbnail?.height) || '180';
            
            ffmpeg(videoPath)
                .screenshots({
                    timestamps: [thumbTime],
                    filename: `${fileId}.jpg`,
                    folder: thumbnailDir,
                    size: `${thumbWidth}x${thumbHeight}`
                })
                .on('end', () => {
                    resolve(thumbnailPath);
                })
                .on('error', (err) => {
                    // 如果失败，尝试使用默认时间点
                    try {
                        ffmpeg(videoPath)
                            .screenshots({
                                timestamps: ['0'],
                                filename: `${fileId}.jpg`,
                                folder: thumbnailDir,
                                size: `${thumbWidth}x${thumbHeight}`
                            })
                            .on('end', () => resolve(thumbnailPath))
                            .on('error', (retryErr) => {
                                logger.error('生成缩略图重试失败:', retryErr);
                                reject(retryErr);
                            });
                    } catch (retryExc) {
                        logger.error('重试生成缩略图时异常:', retryExc);
                        reject(retryExc);
                    }
                });
        } catch (err) {
            logger.error('生成缩略图时异常:', err);
            reject(err);
        }
    });
}

/**
 * 生成HLS流
 */
function generateHLS(videoPath, fileId) {
    // 确保FFmpeg已初始化
    initFFmpeg();
    
    if (!ffmpeg) {
        return Promise.reject(new Error('FFmpeg模块不可用'));
    }
    
    // 首先进行同步检查，确保所有操作都在Promise内
    const outputDir = path.join(hlsDir, fileId);
    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment%03d.ts');
    
    return new Promise((resolve, reject) => {
        try {
            // 检查是否已经转码过
            if (fs.existsSync(playlistPath)) {
                // 检查是否需要重新转码（根据文件修改时间）
                try {
                    const videoStat = fs.statSync(videoPath);
                    const playlistStat = fs.statSync(playlistPath);
                    
                    if (playlistStat.mtime > videoStat.mtime) {
                        resolve({ alreadyExists: true });
                        return;
                    }
                } catch (statErr) {
                    logger.warn('检查文件状态失败，继续转码:', statErr.message);
                }
            }

            // 创建输出目录
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // 安全获取配置参数
            const transcodeSettings = config.video?.transcode || {};
            const streamingConfig = config.video?.streaming || {};
            
            ffmpeg(videoPath)
                .outputOptions([
                    '-c:v', transcodeSettings.codec || 'libx264',
                    // 使用 ultrafast preset 加快转码速度
                    '-preset', 'ultrafast',
                    '-crf', transcodeSettings.crf || '23',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-f', 'hls',
                    '-hls_time', streamingConfig.hlsTime || '6',
                    '-hls_list_size', streamingConfig.hlsListSize || '50',
                    '-start_number', '0',
                    // 优化：减少线程数以避免阻塞
                    '-threads', '2',
                    // 优化：使用更小的 GOP 以支持快速搜索
                    '-g', '30',
                    // 优化：减少B帧以加快处理
                    '-bf', '0'
                ])
                .output(segmentPattern)
                .on('start', (commandLine) => {
                    logger.info(`开始转码视频: ${commandLine}`);
                    if (global.redis?.setTranscodeProgress) {
                        global.redis.setTranscodeProgress(fileId, 0).catch(err => {
                            logger.warn('设置转码进度失败:', err.message);
                        });
                    }
                })
                .on('progress', (progress) => {
                    const percent = Math.round(progress.percent || 0);
                    if (global.redis?.setTranscodeProgress) {
                        global.redis.setTranscodeProgress(fileId, percent).catch(err => {
                            logger.warn('更新转码进度失败:', err.message);
                        });
                    }
                    
                    // 通过Socket推送进度
                    if (global.io) {
                        global.io.emit('video:transcodeProgress', {
                            fileId,
                            progress: percent
                        });
                    }
                })
                .on('end', async () => {
                    logger.info(`视频转码完成: ${fileId}`);
                    try {
                        if (global.redis?.clearTranscodeProgress) {
                            await global.redis.clearTranscodeProgress(fileId);
                        }
                    } catch (clearErr) {
                        logger.warn('清除转码进度失败:', clearErr.message);
                    }
                    resolve({ success: true });
                })
                .on('error', async (err) => {
                    logger.error('视频转码失败:', err);
                    try {
                        if (global.redis?.clearTranscodeProgress) {
                            await global.redis.clearTranscodeProgress(fileId);
                        }
                    } catch (clearErr) {
                        logger.warn('清除转码进度失败:', clearErr.message);
                    }
                    reject(err);
                })
                .run();
        } catch (err) {
            logger.error('启动转码失败:', err);
            reject(err);
        }
    });
}

// ==================== 路由 ====================

/**
 * 获取视频信息
 * GET /api/video/:id/info
 */
router.get('/:id/info', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);
        
        if (!file || file.type !== 'video') {
            return res.status(404).json({
                success: false,
                error: '视频不存在'
            });
        }

        // 检查文件是否存在
        if (!fs.existsSync(file.path)) {
            return res.status(404).json({
                success: false,
                error: '视频文件已不存在'
            });
        }

        // 如果没有保存时长信息，重新获取
        let videoInfo = {};
        if (!file.duration) {
            try {
                videoInfo = await getVideoInfo(file.path);
                
                // 更新数据库
                global.db.updateFile(file.id, {
                    duration: videoInfo.duration,
                    size: videoInfo.size
                });
                
                file.duration = videoInfo.duration;
                file.size = videoInfo.size;
            } catch (err) {
                logger.warn('获取视频信息失败:', err);
            }
        } else {
            videoInfo = {
                duration: file.duration,
                size: file.size
            };
        }

        // 生成缩略图
        let thumbnail = file.thumbnail;
        if (!thumbnail) {
            try {
                const thumbPath = await generateThumbnail(file.path, file.id);
                thumbnail = `/thumbnails/${file.id}.jpg`;
                global.db.updateFile(file.id, { thumbnail });
                file.thumbnail = thumbnail;
            } catch (err) {
                logger.warn('生成缩略图失败:', err);
            }
        }

        res.json({
            success: true,
            data: {
                file,
                video: videoInfo,
                thumbnail: thumbnail || '/images/default-video.jpg'
            }
        });
    } catch (error) {
        logger.error('获取视频信息失败:', error);
        res.status(500).json({
            success: false,
            error: '获取视频信息失败'
        });
    }
});

/**
 * 获取视频HLS播放列表
 * GET /api/video/:id/playlist.m3u8
 */
router.get('/:id/playlist.m3u8', async (req, res) => {
    let videoId = req.params.id;
    try {
        const file = global.db.getFileById(videoId);
        
        if (!file || file.type !== 'video') {
            return res.status(404).send('视频不存在');
        }

        if (!fs.existsSync(file.path)) {
            return res.status(404).send('视频文件已不存在');
        }

        const outputDir = path.join(hlsDir, videoId);
        const playlistPath = path.join(outputDir, 'playlist.m3u8');

        // 播放列表不存在，尝试直接流式传输或返回转码占位符
        if (!fs.existsSync(playlistPath)) {
            // 检查是否正在转码中（通过 Redis 进度）
            try {
                const progress = await global.redis.getTranscodeProgress(videoId);
                if (progress > 0 && progress < 100) {
                    // 正在转码中，返回占位符
                    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.send('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-TRANSCODING\n#EXTINF:10,\n转码中...\n#EXT-X-ENDLIST');
                    return;
                }
            } catch (err) {
                logger.warn('检查转码进度失败:', err.message);
            }

            // 检查视频格式，MP4/WebM 格式直接流式传输
            let videoInfo = null;
            let detectedCodec = null;
            
            try {
                videoInfo = await getVideoInfo(file.path);
                detectedCodec = videoInfo?.video?.codec;
            } catch (infoErr) {
                logger.warn('获取视频信息失败:', infoErr.message);
            }
            
            // 如果无法检测编码，尝试使用文件扩展名作为后备
            if (!detectedCodec) {
                const fileName = file.name || '';
                const extension = fileName.split('.').pop().toLowerCase();
                const directPlayableExtensions = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'];
                if (directPlayableExtensions.includes(extension)) {
                    detectedCodec = extension;
                    logger.info(`无法检测视频编码，使用文件扩展名判断格式: ${extension}`);
                }
            }
            
            // 如果是支持的格式，直接传输原始文件
            const directPlayableCodecs = ['mp4', 'webm', 'ogg', 'mov'];
            if (detectedCodec && directPlayableCodecs.includes(detectedCodec.toLowerCase())) {
                logger.info(`直接流式传输 ${detectedCodec.toUpperCase()} 视频: ${videoId}`);
                res.setHeader('Content-Type', file.mime_type || 'video/mp4');
                res.setHeader('Content-Length', file.size);
                const stream = fs.createReadStream(file.path);
                stream.on('error', (err) => {
                    logger.error('视频流错误:', err);
                });
                stream.pipe(res);
                return;
            }

            // 其他格式需要转码，启动转码（异步）
            logger.info(`视频需要转码，格式: ${videoInfo?.video?.codec || '未知'}，启动转码...`);
            try {
                generateHLS(file.path, videoId).catch(err => {
                    logger.error('后台转码失败:', err);
                });
            } catch (genErr) {
                logger.error('启动转码失败:', genErr);
            }

            // 返回转码中提示
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache');
            res.send('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-TRANSCODING=DEST\n#EXT-X-ENDLIST');
            return;
        }

        // 返回HLS播放列表 - 优化传输
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'public, max-age=300'); // 缓存5分钟
        res.setHeader('Connection', 'keep-alive');

        // 使用流式传输播放列表
        const playlist = fs.createReadStream(playlistPath, { highWaterMark: 16 * 1024 });
        playlist.on('error', (err) => {
            logger.error('播放列表读取错误:', err);
            if (!res.headersSent) {
                res.status(500).send('播放列表读取失败');
            }
        });
        playlist.pipe(res);
    } catch (error) {
        logger.error('获取播放列表失败:', error);
        if (!res.headersSent) {
            res.status(500).send('获取播放列表失败');
        }
    }
});

/**
 * 获取转码中占位符播放列表
 * GET /api/video/:id/transcoding.m3u8
 */
router.get('/:id/transcoding.m3u8', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);

        if (!file || file.type !== 'video') {
            return res.status(404).send('视频不存在');
        }

        // 返回转码中提示（使用 EXT-X-TRANSCODING 标签，不引用具体片段）
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.send('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-TRANSCODING=DEST\n#EXT-X-ENDLIST');
    } catch (error) {
        logger.error('获取转码状态失败:', error);
        res.status(500).send('获取转码状态失败');
    }
});

/**
 * 获取HLS视频片段
 * GET /api/video/:id/segment/:name
 * 优化：添加缓存头和更高效的流式传输
 */
router.get('/:id/segment/:name', async (req, res) => {
    try {
        const { id, name } = req.params;
        const segmentPath = path.join(hlsDir, id, name);

        if (!fs.existsSync(segmentPath)) {
            return res.status(404).send('片段不存在');
        }

        // 获取文件信息用于设置正确的Content-Length
        const stats = fs.statSync(segmentPath);

        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存24小时
        res.setHeader('Connection', 'keep-alive');

        // 使用64KB缓冲区优化流式传输
        const stream = fs.createReadStream(segmentPath, { highWaterMark: 64 * 1024 });
        stream.pipe(res);
    } catch (error) {
        logger.error('获取视频片段失败:', error);
        if (!res.headersSent) {
            res.status(500).send('获取视频片段失败');
        }
    }
});

/**
 * 直接流式传输视频
 * GET /api/video/:id/stream
 * 优化：增加分块大小，支持断点续传，优化传输性能
 */
router.get('/:id/stream', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);

        if (!file || file.type !== 'video') {
            // 视频不存在时返回404文本响应（不是JSON）
            return res.status(404).type('text/plain').send('视频不存在');
        }

        if (!fs.existsSync(file.path)) {
            // 视频文件不存在时返回404文本响应
            return res.status(404).type('text/plain').send('视频文件已不存在');
        }

        const { range } = req.headers;
        const videoSize = file.size;
        // 增加分块大小到 50MB 以提高大文件的传输效率
        const CHUNK_SIZE = 50 * 1024 * 1024;

        if (range) {
            // 范围请求优化
            const parts = range.replace(/bytes=/, '').split('-');
            let start = parseInt(parts[0], 10);
            let end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE - 1, videoSize - 1);

            // 确保不超出文件范围
            start = Math.max(0, start);
            end = Math.min(videoSize - 1, end);

            const chunksize = (end - start) + 1;

            const fileStream = fs.createReadStream(file.path, { start, end, highWaterMark: 1024 * 1024 });

            const head = {
                'Content-Range': `bytes ${start}-${end}/${videoSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': file.mime_type || 'video/mp4',
                'Cache-Control': 'public, max-age=3600',
                'Connection': 'keep-alive'
            };

            res.writeHead(206, head);
            fileStream.pipe(res);
        } else {
            // 完整请求 - 使用流式传输
            const head = {
                'Content-Length': videoSize,
                'Content-Type': file.mime_type || 'video/mp4',
                'Cache-Control': 'public, max-age=3600',
                'Connection': 'keep-alive'
            };

            res.writeHead(200, head);
            fs.createReadStream(file.path, { highWaterMark: 1024 * 1024 }).pipe(res);
        }

        // 增加查看次数（异步执行，不阻塞响应）
        setTimeout(() => {
            try {
                global.db.incrementFileCount(req.params.id, 'view_count');
            } catch (e) {
                // 忽略计数错误
            }
        }, 0);

        logger.info(`视频流播放: ${file.name}`);
    } catch (error) {
        logger.error('视频流传输失败:', error);
        // 出错时返回文本响应，不是JSON
        if (!res.headersSent) {
            res.status(500).type('text/plain').send('视频播放失败');
        }
    }
});

/**
 * 获取视频缩略图
 * GET /api/video/:id/thumbnail
 */
router.get('/:id/thumbnail', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);
        
        if (!file || file.type !== 'video') {
            return res.status(404).send('视频不存在');
        }

        // 优先使用已保存的缩略图
        if (file.thumbnail && fs.existsSync(path.join(__dirname, '..', file.thumbnail))) {
            res.setHeader('Content-Type', 'image/jpeg');
            fs.createReadStream(path.join(__dirname, '..', file.thumbnail)).pipe(res);
            return;
        }

        // 生成新的缩略图
        if (fs.existsSync(file.path)) {
            const thumbPath = path.join(thumbnailDir, `${req.params.id}.jpg`);
            
            try {
                await generateThumbnail(file.path, req.params.id);
                
                // 更新数据库
                global.db.updateFile(req.params.id, {
                    thumbnail: `/thumbnails/${req.params.id}.jpg`
                });

                res.setHeader('Content-Type', 'image/jpeg');
                fs.createReadStream(thumbPath).pipe(res);
            } catch (err) {
                logger.error('生成缩略图失败:', err);
                res.redirect('/images/default-video.jpg');
            }
        } else {
            res.redirect('/images/default-video.jpg');
        }
    } catch (error) {
        logger.error('获取缩略图失败:', error);
        res.status(500).send('获取缩略图失败');
    }
});

/**
 * 更新播放进度
 * POST /api/video/:id/progress
 * 此端点需要认证
 */
router.post('/:id/progress', async (req, res) => {
    try {
        // 检查用户是否已认证
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: '请先登录再记录播放进度',
                code: 'NOT_LOGGED_IN'
            });
        }

        const { position, duration, completed } = req.body;

        if (position === undefined) {
            return res.status(400).json({
                success: false,
                error: '请提供播放位置'
            });
        }

        // 记录播放历史
        global.db.addToHistory({
            user_id: req.user.id,
            file_id: req.params.id,
            position,
            progress: duration ? (position / duration) * 100 : 0,
            completed: completed || false
        });

        res.json({
            success: true,
            message: '播放进度已保存'
        });
    } catch (error) {
        logger.error('保存播放进度失败:', error);
        res.status(500).json({
            success: false,
            error: '保存播放进度失败'
        });
    }
});

/**
 * 获取转码进度
 * GET /api/video/:id/transcode-progress
 */
router.get('/:id/transcode-progress', async (req, res) => {
    try {
        const progress = await global.redis.getTranscodeProgress(req.params.id);
        
        res.json({
            success: true,
            data: {
                fileId: req.params.id,
                progress: progress || 0,
                // 只有当进度 > 0 且 < 100 时才认为正在转码
                // 进度为 0 可能是刚启动或已完成转码，不应标记为"正在转码"
                isTranscoding: progress > 0 && progress < 100
            }
        });
    } catch (error) {
        logger.error('获取转码进度失败:', error);
        res.status(500).json({
            success: false,
            error: '获取转码进度失败'
        });
    }
});

/**
 * 收藏视频
 * POST /api/video/:id/favorite
 * 此端点需要认证
 */
router.post('/:id/favorite', async (req, res) => {
    try {
        // 检查用户是否已认证
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: '请先登录再收藏视频',
                code: 'NOT_LOGGED_IN'
            });
        }

        const file = global.db.getFileById(req.params.id);
        
        if (!file || file.type !== 'video') {
            return res.status(404).json({
                success: false,
                error: '视频不存在'
            });
        }

        global.db.addFavorite(req.user.id, req.params.id);

        res.json({
            success: true,
            message: '收藏成功'
        });
    } catch (error) {
        logger.error('收藏视频失败:', error);
        res.status(500).json({
            success: false,
            error: '收藏失败'
        });
    }
});

/**
 * 取消收藏
 * DELETE /api/video/:id/favorite
 * 此端点需要认证
 */
router.delete('/:id/favorite', async (req, res) => {
    try {
        // 检查用户是否已认证
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: '请先登录',
                code: 'NOT_LOGGED_IN'
            });
        }

        global.db.removeFavorite(req.user.id, req.params.id);

        res.json({
            success: true,
            message: '已取消收藏'
        });
    } catch (error) {
        logger.error('取消收藏失败:', error);
        res.status(500).json({
            success: false,
            error: '取消收藏失败'
        });
    }
});

/**
 * 获取用户收藏的视频
 * GET /api/video/favorites/list
 * 此端点需要认证
 */
router.get('/favorites/list', async (req, res) => {
    try {
        // 检查用户是否已认证
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: '请先登录',
                code: 'NOT_LOGGED_IN'
            });
        }

        const favorites = global.db.getUserFavorites(req.user.id);
        const videos = favorites.filter(f => f.type === 'video');

        res.json({
            success: true,
            data: { videos }
        });
    } catch (error) {
        logger.error('获取收藏列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取收藏列表失败'
        });
    }
});

/**
 * 获取最近观看
 * GET /api/video/history/recent
 * 此端点需要认证
 */
router.get('/history/recent', async (req, res) => {
    try {
        // 检查用户是否已认证
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: '请先登录',
                code: 'NOT_LOGGED_IN'
            });
        }

        const history = global.db.getUserHistory(req.user.id, 20);
        const videos = history.filter(h => h.type === 'video');

        res.json({
            success: true,
            data: { videos: history }
        });
    } catch (error) {
        logger.error('获取观看历史失败:', error);
        res.status(500).json({
            success: false,
            error: '获取观看历史失败'
        });
    }
});

/**
 * 获取推荐视频
 * GET /api/video/recommend
 */
router.get('/recommend/list', async (req, res) => {
    try {
        // 获取热门视频
        const videos = global.db.getVideoFiles(12, 0);
        
        // 随机打乱顺序
        const shuffled = videos.sort(() => 0.5 - Math.random());

        res.json({
            success: true,
            data: { videos: shuffled }
        });
    } catch (error) {
        logger.error('获取推荐视频失败:', error);
        res.status(500).json({
            success: false,
            error: '获取推荐视频失败'
        });
    }
});

/**
 * 手动触发转码
 * POST /api/video/:id/transcode
 */
router.post('/:id/transcode', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);
        
        if (!file || file.type !== 'video') {
            return res.status(404).json({
                success: false,
                error: '视频不存在'
            });
        }

        if (!fs.existsSync(file.path)) {
            return res.status(404).json({
                success: false,
                error: '视频文件已不存在'
            });
        }

        // 检查是否已在转码
        const progress = await global.redis.getTranscodeProgress(req.params.id);
        if (progress > 0 && progress < 100) {
            return res.status(400).json({
                success: false,
                error: '视频正在转码中'
            });
        }

        // 启动转码
        try {
            const transcodePromise = generateHLS(file.path, req.params.id);
            transcodePromise
                .then(() => {
                    if (global.io) {
                        global.io.emit('video:transcodeComplete', {
                            fileId: req.params.id
                        });
                    }
                })
                .catch(err => {
                    logger.error('转码失败:', err);
                    if (global.io) {
                        global.io.emit('video:transcodeError', {
                            fileId: req.params.id,
                            error: err.message
                        });
                    }
                });
        } catch (err) {
            logger.error('启动转码失败:', err);
        }

        res.json({
            success: true,
            message: '转码任务已启动'
        });
    } catch (error) {
        logger.error('启动转码失败:', error);
        res.status(500).json({
            success: false,
            error: '启动转码失败'
        });
    }
});

module.exports = router;
