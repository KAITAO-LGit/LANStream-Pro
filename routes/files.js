/**
 * 文件管理路由
 * 处理文件上传、下载、删除、浏览等功能
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { SecurityManager } = require('../utils/security');
const { logger } = require('../utils/logger');
const config = require('../config');

const security = new SecurityManager();

// ==================== 文件上传配置 ====================

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 分类存储目录
const categoryDirs = {
    video: path.join(uploadDir, 'videos'),
    audio: path.join(uploadDir, 'audio'),
    image: path.join(uploadDir, 'images'),
    document: path.join(uploadDir, 'documents'),
    archive: path.join(uploadDir, 'archives'),
    other: path.join(uploadDir, 'others'),
    thumbnail: path.join(uploadDir, 'thumbnails')
};

for (const dir of Object.values(categoryDirs)) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Multer配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let category = 'other';
        
        if (file.mimetype.startsWith('video/')) {
            category = 'video';
        } else if (file.mimetype.startsWith('audio/')) {
            category = 'audio';
        } else if (file.mimetype.startsWith('image/')) {
            category = 'image';
        } else if (file.mimetype.includes('pdf') || file.mimetype.includes('document')) {
            category = 'document';
        } else if (file.mimetype.includes('zip') || file.mimetype.includes('rar')) {
            category = 'archive';
        }
        
        cb(null, categoryDirs[category]);
    },
    filename: (req, file, cb) => {
        const sanitized = security.sanitizeFilename(file.originalname);
        const uniqueName = `${uuidv4()}_${sanitized}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: config.upload.maxFileSize
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = config.upload.allowedTypes;
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件类型'), false);
        }
    }
});

// ==================== 工具函数 ====================

/**
 * 获取文件类型分类
 */
function getFileCategory(filename, mimeType) {
    const ext = path.extname(filename).toLowerCase();
    const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov', '.3gp', '.wmv'];
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz'];

    if (videoExts.includes(ext) || mimeType.startsWith('video/')) return 'video';
    if (audioExts.includes(ext) || mimeType.startsWith('audio/')) return 'audio';
    if (imageExts.includes(ext) || mimeType.startsWith('image/')) return 'image';
    if (docExts.includes(ext) || mimeType.includes('document') || mimeType === 'application/pdf') return 'document';
    if (archiveExts.includes(ext) || mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
    
    return 'other';
}

/**
 * 获取文件MIME类型
 */
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.avi': 'video/avi',
        '.flv': 'video/x-flv',
        '.mov': 'video/quicktime',
        '.3gp': 'video/3gpp',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * 检测文件名编码并修复乱码
 * @param {string} filename - 原始文件名
 * @returns {object} - { name: 修复后的文件名, isRepaired: 是否修复过 }
 */
function detectAndFixFilenameEncoding(filename) {
    const security = new SecurityManager();
    
    // 检测是否包含乱码
    if (security.containsMojibake(filename)) {
        const repaired = security.fixMojibake(filename);
        // 再次清理危险字符
        const sanitized = security.sanitizeFilename(repaired);
        logger.info(`文件名编码修复: "${filename}" -> "${sanitized}"`);
        return { name: sanitized, isRepaired: true };
    }
    
    // 直接清理文件名
    const sanitized = security.sanitizeFilename(filename);
    return { name: sanitized, isRepaired: false };
}

// ==================== 路由 ====================

/**
 * 获取文件列表
 * GET /api/files/list
 */
router.get('/list', async (req, res) => {
    try {
        const { folderId, type, search, limit, offset, sort, order } = req.query;
        
        const files = global.db.getFolderContents(folderId || null, {
            type: type || 'all',
            search: search || null,
            limit: parseInt(limit) || 100,
            offset: parseInt(offset) || 0,
            sort: sort || 'name',
            order: order || 'ASC'
        });

        // 获取总数
        const allFiles = global.db.getFolderContents(folderId || null, {
            type: type || 'all',
            search: search || null,
            limit: 10000,
            offset: 0
        });

        res.json({
            success: true,
            data: {
                files,
                total: allFiles.length,
                limit: parseInt(limit) || 100,
                offset: parseInt(offset) || 0
            }
        });
    } catch (error) {
        logger.error('获取文件列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取文件列表失败'
        });
    }
});

/**
 * 获取视频文件列表
 * GET /api/files/videos
 */
router.get('/videos', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const videos = global.db.getVideoFiles(
            parseInt(limit),
            parseInt(offset)
        );

        // 获取视频统计
        const stats = global.db.getFileStats();
        const videoStats = stats.find(s => s.type === 'video');

        res.json({
            success: true,
            data: {
                videos,
                total: videoStats?.count || 0,
                totalSize: videoStats?.total_size || 0
            }
        });
    } catch (error) {
        logger.error('获取视频列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取视频列表失败'
        });
    }
});

/**
 * 获取文件详情
 * GET /api/files/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);
        
        if (!file) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }

        // 增加查看次数
        global.db.incrementFileCount(req.params.id, 'view_count');

        res.json({
            success: true,
            data: { file }
        });
    } catch (error) {
        logger.error('获取文件详情失败:', error);
        res.status(500).json({
            success: false,
            error: '获取文件详情失败'
        });
    }
});

/**
 * 查看文件
 * GET /api/files/:id/view
 */
router.get('/:id/view', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);
        
        if (!file) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }

        if (file.type === 'folder') {
            return res.status(400).json({
                success: false,
                error: '不支持查看文件夹'
            });
        }

        // 检查文件是否存在
        if (!fs.existsSync(file.path)) {
            return res.status(404).json({
                success: false,
                error: '文件已不存在'
            });
        }

        // 增加查看次数
        global.db.incrementFileCount(req.params.id, 'view_count');

        // 设置响应头，直接在浏览器中显示文件内容
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', file.size);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000');

        // 创建读取流并返回文件内容
        const fileStream = fs.createReadStream(file.path);
        fileStream.pipe(res);
    } catch (error) {
        logger.error('查看文件失败:', error);
        res.status(500).json({
            success: false,
            error: '查看文件失败'
        });
    }
});

/**
 * 在服务器端打开文件
 * POST /api/files/:id/open
 */
router.post('/:id/open', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);
        
        if (!file) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }

        if (file.type === 'folder') {
            // 对于文件夹，打开文件资源管理器并定位到该文件夹
            const platform = process.platform;
            let command;
            
            if (platform === 'win32') {
                command = `explorer /select,"${file.path}"`;
            } else if (platform === 'darwin') {
                command = `open "${file.path}"`;
            } else {
                command = `xdg-open "${file.path}"`;
            }
            
            exec(command, (error) => {
                if (error) {
                    logger.error('打开文件夹失败:', error);
                    return res.status(500).json({
                        success: false,
                        error: '打开文件夹失败: ' + error.message
                    });
                }
                res.json({
                    success: true,
                    message: '已在文件资源管理器中打开文件夹'
                });
            });
            return;
        }

        // 检查文件是否存在
        if (!fs.existsSync(file.path)) {
            return res.status(404).json({
                success: false,
                error: '文件已不存在'
            });
        }

        // 使用系统默认程序打开文件
        const platform = process.platform;
        let command;
        
        if (platform === 'win32') {
            // Windows 使用 start 命令
            command = `start "" "${file.path}"`;
        } else if (platform === 'darwin') {
            // macOS 使用 open 命令
            command = `open "${file.path}"`;
        } else {
            // Linux/其他使用 xdg-open
            command = `xdg-open "${file.path}"`;
        }
        
        logger.info(`服务器端打开文件: ${command}`);
        
        exec(command, { encoding: 'buffer' }, (error) => {
            if (error) {
                logger.error('打开文件失败:', error);
                return res.status(500).json({
                    success: false,
                    error: '打开文件失败: ' + error.message
                });
            }
            res.json({
                success: true,
                message: '已在服务器端用默认程序打开文件'
            });
        });
    } catch (error) {
        logger.error('打开文件失败:', error);
        res.status(500).json({
            success: false,
            error: '打开文件失败'
        });
    }
});

/**
 * 创建文件夹
 * POST /api/files/folder
 */
router.post('/folder', async (req, res) => {
    try {
        const { name, parentId } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: '文件夹名称不能为空'
            });
        }

        // 检查父文件夹是否存在
        if (parentId) {
            const parent = global.db.getFileById(parentId);
            if (!parent) {
                return res.status(404).json({
                    success: false,
                    error: '父文件夹不存在'
                });
            }
        }

        // 创建文件夹
        const folderPath = path.join(
            parentId ? global.db.getFileById(parentId)?.path : uploadDir,
            security.sanitizeFilename(name)
        );

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const file = global.db.createFile({
            name,
            path: folderPath,
            type: 'folder',
            parent_id: parentId,
            created_by: req.user.id
        });

        logger.info(`创建文件夹成功: ${name}`);

        res.status(201).json({
            success: true,
            message: '文件夹创建成功',
            data: { file }
        });
    } catch (error) {
        logger.error('创建文件夹失败:', error);
        res.status(500).json({
            success: false,
            error: error.message || '创建文件夹失败'
        });
    }
});

/**
 * 上传文件
 * POST /api/files/upload
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: '请选择要上传的文件'
            });
        }

        const { parentId, description, tags } = req.body;
        const file = req.file;

        // 检测并修复文件名编码
        const { name: fileName, isRepaired } = detectAndFixFilenameEncoding(file.originalname);

        // 检查父文件夹是否存在
        if (parentId) {
            const parent = global.db.getFileById(parentId);
            if (!parent || parent.type !== 'folder') {
                return res.status(404).json({
                    success: false,
                    error: '目标文件夹不存在'
                });
            }
        }

        // 确定文件类型
        const fileType = getFileCategory(fileName, file.mimetype);
        const mimeType = getMimeType(fileName);

        // 创建文件记录（使用修复后的文件名）
        const fileRecord = global.db.createFile({
            name: fileName,  // 使用修复后的文件名
            path: file.path,
            type: fileType,
            mime_type: mimeType,
            size: file.size,
            parent_id: parentId || null,
            description: description || null,
            tags: tags || null,
            created_by: req.user.id
        });

        // 创建传输任务记录
        const task = global.db.createTransferTask({
            user_id: req.user.id,
            file_id: fileRecord.id,
            type: 'upload'
        });
        global.db.updateTransferTask(task.id, { status: 'completed', progress: 100 });

        // 通过Socket通知管理员
        if (global.io) {
            global.io.to('admin').emit('file:uploaded', {
                userId: req.user.id,
                username: req.user.username,
                file: fileRecord
            });
        }

        const logMsg = isRepaired 
            ? `文件上传成功（文件名已修复）: ${fileName} (${(file.size / 1024 / 1024).toFixed(2)}MB)`
            : `文件上传成功: ${fileName} (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
        logger.info(logMsg);

        res.status(201).json({
            success: true,
            message: '文件上传成功',
            data: {
                file: fileRecord,
                task,
                filenameRepaired: isRepaired
            }
        });
    } catch (error) {
        logger.error('文件上传失败:', error);
        res.status(500).json({
            success: false,
            error: error.message || '文件上传失败'
        });
    }
}, (err, req, res, next) => {
    // Multer错误处理
    res.status(400).json({
        success: false,
        error: err.message || '文件上传失败'
    });
});

/**
 * 批量上传文件
 * POST /api/files/upload-multiple
 */
router.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: '请选择要上传的文件'
            });
        }

        const { parentId } = req.body;
        const uploadedFiles = [];

        for (const file of req.files) {
            // 检测并修复文件名编码
            const { name: fileName, isRepaired } = detectAndFixFilenameEncoding(file.originalname);
            
            const fileType = getFileCategory(fileName, file.mimetype);
            const mimeType = getMimeType(fileName);

            const fileRecord = global.db.createFile({
                name: fileName,  // 使用修复后的文件名
                path: file.path,
                type: fileType,
                mime_type: mimeType,
                size: file.size,
                parent_id: parentId || null,
                created_by: req.user.id
            });

            uploadedFiles.push({
                ...fileRecord,
                _filenameRepaired: isRepaired
            });
        }

        res.status(201).json({
            success: true,
            message: `成功上传 ${uploadedFiles.length} 个文件`,
            data: { files: uploadedFiles }
        });
    } catch (error) {
        logger.error('批量上传失败:', error);
        res.status(500).json({
            success: false,
            error: '批量上传失败'
        });
    }
});

/**
 * 下载文件
 * GET /api/files/:id/download
 */
router.get('/:id/download', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);
        
        if (!file) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }

        if (file.type === 'folder') {
            return res.status(400).json({
                success: false,
                error: '不支持下载文件夹'
            });
        }

        // 检查文件是否存在
        if (!fs.existsSync(file.path)) {
            return res.status(404).json({
                success: false,
                error: '文件已不存在'
            });
        }

        // 增加下载次数
        global.db.incrementFileCount(req.params.id, 'download_count');

        // 设置响应头
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', file.size);

        // 创建读取流
        const fileStream = fs.createReadStream(file.path);
        fileStream.pipe(res);

        // 记录下载
        const task = global.db.createTransferTask({
            user_id: req.user.id,
            file_id: file.id,
            type: 'download'
        });

        logger.info(`文件下载: ${file.name}`);
    } catch (error) {
        logger.error('文件下载失败:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: '文件下载失败'
            });
        }
    }
});

/**
 * 重命名文件
 * POST /api/files/:id/rename
 */
router.post('/:id/rename', async (req, res) => {
    try {
        const { newName } = req.body;
        
        if (!newName) {
            return res.status(400).json({
                success: false,
                error: '新名称不能为空'
            });
        }

        const file = global.db.getFileById(req.params.id);
        
        if (!file) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }

        const sanitizedName = security.sanitizeFilename(newName);
        
        // 更新文件名
        global.db.updateFile(req.params.id, { name: sanitizedName });

        // 如果是文件夹，同时重命名物理目录
        if (file.type === 'folder' && fs.existsSync(file.path)) {
            const newPath = path.join(path.dirname(file.path), sanitizedName);
            fs.renameSync(file.path, newPath);
            global.db.updateFile(req.params.id, { path: newPath });
        }

        res.json({
            success: true,
            message: '重命名成功',
            data: { newName: sanitizedName }
        });
    } catch (error) {
        logger.error('重命名失败:', error);
        res.status(500).json({
            success: false,
            error: '重命名失败'
        });
    }
});

/**
 * 移动文件
 * POST /api/files/:id/move
 */
router.post('/:id/move', async (req, res) => {
    try {
        const { targetFolderId } = req.body;
        
        const file = global.db.getFileById(req.params.id);
        if (!file) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }

        let targetPath;
        
        if (targetFolderId) {
            const targetFolder = global.db.getFileById(targetFolderId);
            if (!targetFolder || targetFolder.type !== 'folder') {
                return res.status(404).json({
                    success: false,
                    error: '目标文件夹不存在'
                });
            }
            targetPath = targetFolder.path;
        } else {
            targetPath = uploadDir;
        }

        // 移动文件
        const newPath = path.join(targetPath, path.basename(file.path));
        
        if (file.type === 'folder') {
            if (fs.existsSync(file.path)) {
                fs.renameSync(file.path, newPath);
            }
        } else {
            if (fs.existsSync(file.path)) {
                fs.renameSync(file.path, newPath);
            }
        }

        // 更新数据库
        global.db.updateFile(req.params.id, {
            parent_id: targetFolderId || null,
            path: newPath
        });

        res.json({
            success: true,
            message: '移动成功',
            data: { newPath }
        });
    } catch (error) {
        logger.error('移动文件失败:', error);
        res.status(500).json({
            success: false,
            error: '移动文件失败'
        });
    }
});

/**
 * 删除文件/视频
 * DELETE /api/files/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const file = global.db.getFileById(req.params.id);

        if (!file) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }

        // 硬删除 - 从数据库和文件系统中移除
        global.db.deleteFile(req.params.id);

        // 通过Socket通知
        if (global.io) {
            global.io.to('admin').emit('file:deleted', {
                fileId: req.params.id,
                fileName: file.name
            });
        }

        logger.info(`文件删除: ${file.name}`);

        res.json({
            success: true,
            message: '删除成功'
        });
    } catch (error) {
        logger.error('删除文件失败:', error);
        res.status(500).json({
            success: false,
            error: '删除文件失败'
        });
    }
});

/**
 * 批量删除文件
 * POST /api/files/batch-delete
 */
router.post('/batch-delete', async (req, res) => {
    try {
        const { fileIds } = req.body;
        
        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: '请选择要删除的文件'
            });
        }

        const deletedCount = global.db.deleteFiles(fileIds);

        logger.info(`批量删除文件: ${deletedCount} 个文件`);

        res.json({
            success: true,
            message: `成功删除 ${deletedCount} 个文件`
        });
    } catch (error) {
        logger.error('批量删除失败:', error);
        res.status(500).json({
            success: false,
            error: '批量删除失败'
        });
    }
});

/**
 * 搜索文件
 * GET /api/files/search
 */
router.get('/search/query', async (req, res) => {
    try {
        const { keyword, type, limit = 50 } = req.query;
        
        if (!keyword) {
            return res.status(400).json({
                success: false,
                error: '请提供搜索关键词'
            });
        }

        const files = global.db.getFolderContents(null, {
            type: type || 'all',
            search: keyword,
            limit: parseInt(limit),
            offset: 0
        });

        res.json({
            success: true,
            data: {
                files,
                total: files.length,
                keyword
            }
        });
    } catch (error) {
        logger.error('搜索文件失败:', error);
        res.status(500).json({
            success: false,
            error: '搜索文件失败'
        });
    }
});

/**
 * 获取传输任务列表
 * GET /api/files/transfers
 */
router.get('/transfers/list', async (req, res) => {
    try {
        const { status } = req.query;
        
        const tasks = global.db.getUserTransferTasks(req.user.id, status || null);

        res.json({
            success: true,
            data: { tasks }
        });
    } catch (error) {
        logger.error('获取传输任务失败:', error);
        res.status(500).json({
            success: false,
            error: '获取传输任务失败'
        });
    }
});

/**
 * 获取文件统计信息
 * GET /api/files/stats
 */
router.get('/stats/summary', async (req, res) => {
    try {
        const fileStats = global.db.getFileStats();
        
        // 格式化统计
        const stats = {
            total: 0,
            totalSize: 0,
            byType: {}
        };

        for (const stat of fileStats) {
            stats.byType[stat.type] = {
                count: stat.count,
                size: (stat.total_size / 1024 / 1024 / 1024).toFixed(2) // GB
            };
            stats.total += stat.count;
            stats.totalSize += stat.total_size;
        }

        stats.totalSize = (stats.totalSize / 1024 / 1024 / 1024).toFixed(2); // GB

        res.json({
            success: true,
            data: { stats }
        });
    } catch (error) {
        logger.error('获取文件统计失败:', error);
        res.status(500).json({
            success: false,
            error: '获取文件统计失败'
        });
    }
});

// ==================== 文件夹扫描 ====================

// 文件类型映射
const mimeTypeMap = {
    'video': ['mp4', 'mkv', 'webm', 'avi', 'flv', 'mov', '3gp', 'wmv', 'rmvb', 'mpeg', 'mpg', 'm4v', 'ts', 'm2ts'],
    'audio': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a', 'ape'],
    'image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'],
    'document': ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv'],
    'archive': ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
};

/**
 * 获取文件类型
 */
function getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    
    for (const [type, extensions] of Object.entries(mimeTypeMap)) {
        if (extensions.includes(ext)) {
            return type;
        }
    }
    
    return 'other';
}

/**
 * 递归扫描文件夹
 */
function scanDirectory(dir, baseDir, results = []) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                // 跳过隐藏目录、系统目录和HLS输出目录
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'hls') {
                    continue;
                }
                scanDirectory(fullPath, baseDir, results);
            } else if (entry.isFile()) {
                // 跳过隐藏文件和系统文件
                if (entry.name.startsWith('.') || entry.name === 'Thumbs.db') {
                    continue;
                }
                
                const stats = fs.statSync(fullPath);
                results.push({
                    name: entry.name,
                    path: fullPath,
                    relativePath: path.relative(baseDir, fullPath),
                    type: getFileType(fullPath),
                    size: stats.size,
                    mtime: stats.mtime
                });
            }
        }
    } catch (error) {
        logger.error('扫描目录失败:', error);
    }
    
    return results;
}

/**
 * 扫描 uploads 文件夹并导入文件
 * POST /api/files/scan
 */
router.post('/scan', async (req, res) => {
    try {
        logger.info('开始扫描 uploads 文件夹...');
        
        // 扫描 uploads 目录
        const files = scanDirectory(uploadDir, uploadDir);
        
        let added = 0;
        let skipped = 0;
        let errors = [];
        
        for (const file of files) {
            try {
                // 检查文件是否已存在
                if (global.db.fileExistsByPath(file.path)) {
                    skipped++;
                    continue;
                }
                
                // 创建文件记录
                global.db.createFile({
                    name: file.name,
                    path: file.path,
                    type: file.type,
                    mime_type: null,
                    size: file.size,
                    thumbnail: null,
                    description: `自动扫描导入: ${file.relativePath}`,
                    tags: 'auto-scan',
                    created_by: req.user?.id || null
                });
                
                added++;
            } catch (error) {
                errors.push({ file: file.name, error: error.message });
            }
        }
        
        logger.info(`扫描完成: 新增 ${added} 个文件, 跳过 ${skipped} 个重复文件`);
        
        res.json({
            success: true,
            message: `扫描完成: 新增 ${added} 个文件`,
            data: {
                total: files.length,
                added,
                skipped,
                errors: errors.length
            }
        });
    } catch (error) {
        logger.error('扫描 uploads 文件夹失败:', error);
        res.status(500).json({
            success: false,
            error: '扫描失败: ' + error.message
        });
    }
});

module.exports = router;
