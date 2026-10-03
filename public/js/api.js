/**
 * LANStream Pro - API 通信模块
 * 处理所有后端API请求
 */

class API {
    constructor() {
        this.baseURL = '/api/v1';
        // 使用 getToken 方法获取 token（支持 Cookie 后备）
        this.token = this.getToken();
        this.refreshToken = this.getRefreshToken();
        
        // 请求限流控制
        this.lastRequestTime = 0;
        this.minRequestInterval = 300; // 最小请求间隔300ms
        this.requestQueue = [];
        this.isProcessing = false;
        
        // 服务器状态检测
        this.serverAvailable = true;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3; // 连续失败3次后认为服务器不可用
        
        // 健康检查优化：使用指数退避
        this.lastHealthCheckTime = 0;
        this.healthCheckMinInterval = 5000; // 最小健康检查间隔5秒
        this.healthCheckBackoff = 5000; // 初始退避时间
        this.maxHealthCheckBackoff = 60000; // 最大退避时间60秒
        this.currentHealthCheckBackoff = 5000; // 当前退避时间
        this.serverCheckTimer = null;
    }

    /**
     * 设置认证令牌
     */
    setToken(token) {
        this.token = token;
        // 优先使用 localStorage
        try {
            localStorage.setItem('accessToken', token);
        } catch (e) {
            console.warn('localStorage 不可用，使用 Cookie 作为后备:', e);
        }
        // 同时保存到 Cookie（作为 localStorage 被阻止时的后备方案）
        try {
            document.cookie = `accessToken=${token}; path=/; max-age=${7*24*60*60}`; // 7天过期
        } catch (e) {
            console.warn('Cookie 存储失败:', e);
        }
    }

    setRefreshToken(token) {
        this.refreshToken = token;
        try {
            localStorage.setItem('refreshToken', token);
        } catch (e) {
            console.warn('localStorage 不可用，使用 Cookie 作为后备:', e);
        }
        try {
            document.cookie = `refreshToken=${token}; path=/; max-age=${30*24*60*60}`; // 30天过期
        } catch (e) {
            console.warn('Cookie 存储失败:', e);
        }
    }

    clearToken() {
        this.token = null;
        this.refreshToken = null;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        // 清除 Cookie
        document.cookie = 'accessToken=; path=/; max-age=0';
        document.cookie = 'refreshToken=; path=/; max-age=0';
    }

    /**
     * 获取访问令牌（优先 localStorage，失败则尝试 Cookie）
     */
    getToken() {
        // 优先从 localStorage 获取
        try {
            const token = localStorage.getItem('accessToken');
            if (token) return token;
        } catch (e) {
            console.warn('localStorage 不可用，尝试从 Cookie 获取 accessToken');
        }
        // 从 Cookie 获取
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'accessToken') return value;
            }
        } catch (e) {
            console.warn('Cookie 读取失败:', e);
        }
        return null;
    }

    /**
     * 获取刷新令牌（优先 localStorage，失败则尝试 Cookie）
     */
    getRefreshToken() {
        try {
            const token = localStorage.getItem('refreshToken');
            if (token) return token;
        } catch (e) {
            console.warn('localStorage 不可用，尝试从 Cookie 获取 refreshToken');
        }
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'refreshToken') return value;
            }
        } catch (e) {
            console.warn('Cookie 读取失败:', e);
        }
        return null;
    }

    /**
     * 获取请求头
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }

    /**
     * 通用请求方法（带限流控制）
     */
    async request(method, endpoint, data = null, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const requestOptions = {
            method,
            headers: this.getHeaders()
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestOptions.body = JSON.stringify(data);
        }

        // 创建请求任务
        const requestTask = {
            method,
            url,
            requestOptions,
            data,
            options,
            retries: 0,
            resolve: null,
            reject: null
        };

        return new Promise((resolve, reject) => {
            requestTask.resolve = resolve;
            requestTask.reject = reject;
            this.enqueueRequest(requestTask);
        });
    }

    /**
     * 将请求加入队列
     */
    enqueueRequest(task) {
        this.requestQueue.push(task);
        this.processQueue();
    }

    /**
     * 处理请求队列
     */
    async processQueue() {
        // 如果服务器不可用，暂停处理
        if (!this.serverAvailable) {
            // 检查是否需要延迟健康检查（使用指数退避）
            const now = Date.now();
            const timeSinceLastCheck = now - this.lastHealthCheckTime;
            
            if (timeSinceLastCheck < this.currentHealthCheckBackoff) {
                // 未到检查时间，延迟后重试
                await this.sleep(this.currentHealthCheckBackoff - timeSinceLastCheck);
            }
            
            // 检查服务器是否恢复
            const recovered = await this.checkServerHealth();
            if (!recovered) {
                // 服务器仍然不可用，增加退避时间（指数退避）
                this.currentHealthCheckBackoff = Math.min(
                    this.currentHealthCheckBackoff * 2, 
                    this.maxHealthCheckBackoff
                );
                console.log(`服务器不可用，将在 ${this.currentHealthCheckBackoff/1000}秒后重试检查`);
                this.processQueue();
                return;
            }
            
            // 服务器已恢复
            this.serverAvailable = true;
            this.consecutiveFailures = 0;
            this.currentHealthCheckBackoff = this.healthCheckBackoff; // 重置退避时间
            console.log('服务器已恢复，请求队列继续处理');
        }

        if (this.isProcessing || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.requestQueue.length > 0) {
            const task = this.requestQueue.shift();
            
            try {
                // 等待最小请求间隔
                const now = Date.now();
                const elapsed = now - this.lastRequestTime;
                if (elapsed < this.minRequestInterval) {
                    await this.sleep(this.minRequestInterval - elapsed);
                }
                
                this.lastRequestTime = Date.now();
                const result = await this.executeRequest(task);
                
                // 请求成功，重置失败计数
                this.consecutiveFailures = 0;
                task.resolve(result);
            } catch (error) {
                // 检查是否是限流错误（429）- 这不是服务器不可用，只是请求过于频繁
                const isRateLimitError = error.message && 
                    (error.message.includes('请求过于频繁') || 
                     error.message.includes('Too Many Requests'));
                
                // 限流错误不计入服务器不可用计数
                if (!isRateLimitError) {
                    this.consecutiveFailures++;
                } else {
                    // 限流错误时，只重试一次，不增加失败计数
                    console.warn('请求被限流:', task.url);
                }
                
                // 处理429限流错误，自动重试（带延迟）
                if (isRateLimitError && task.retries < 3) {
                    task.retries++;
                    // 递增延迟：1秒、2秒、4秒
                    const backoffMs = 1000 * Math.pow(2, task.retries - 1);
                    await this.sleep(backoffMs);
                    // 重新加入队列
                    this.requestQueue.unshift(task);
                    continue;
                }
                
                // 限流错误不应该触发服务器不可用状态
                // 只对真正的网络错误或服务器错误认为是不可用
                const isNetworkError = error.name === 'TypeError' && 
                    (error.message.includes('Failed to fetch') || 
                     error.message.includes('NetworkError') ||
                     error.message.includes('ERR_CONNECTION_REFUSED'));
                
                // 如果连续失败多次且不是限流错误，认为服务器不可用
                if (this.consecutiveFailures >= this.maxConsecutiveFailures && !isRateLimitError) {
                    this.serverAvailable = false;
                    
                    // 通知用户服务器可能不可用
                    if (typeof window.showToast === 'function') {
                        window.showToast('服务器连接失败，请检查网络或服务器状态', 'error');
                    }
                    
                    console.warn('服务器可能不可用，暂停请求队列');
                    
                    // 清空队列中的待处理请求（除了关键请求）
                    const criticalEndpoints = ['/auth/me', '/auth/login', '/auth/refresh'];
                    const nonCriticalRequests = this.requestQueue.filter(
                        task => !criticalEndpoints.some(ep => task.url.includes(ep))
                    );
                    
                    // 拒绝所有非关键请求
                    nonCriticalRequests.forEach(req => {
                        req.reject(new Error('服务器不可用'));
                    });
                    
                    // 只保留关键请求
                    this.requestQueue = this.requestQueue.filter(
                        task => criticalEndpoints.some(ep => task.url.includes(ep))
                    );
                    
                    // 停止当前处理
                    this.isProcessing = false;
                    return;
                }
                
                // 如果是限流错误且已重试多次，返回限流信息而不是服务器不可用
                if (isRateLimitError && task.retries >= 3) {
                    task.reject(new Error('请求过于频繁，请稍后再试（已重试多次）'));
                } else {
                    task.reject(error);
                }
            }
        }

        this.isProcessing = false;
    }

    /**
     * 检查服务器健康状态
     * 使用指数退避机制，避免过度请求
     */
    async checkServerHealth() {
        const now = Date.now();
        
        // 检查是否在最小间隔内（防止重复检查）
        if (now - this.lastHealthCheckTime < this.healthCheckMinInterval) {
            return this.serverAvailable; // 使用缓存的状态
        }
        
        this.lastHealthCheckTime = now;
        
        try {
            // 尝试一个轻量级的健康检查请求
            const healthUrl = `${this.baseURL}/system/health`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(healthUrl, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                // 服务器恢复成功，重置退避时间
                this.currentHealthCheckBackoff = this.healthCheckBackoff;
            }
            
            return response.ok;
        } catch (error) {
            console.warn('服务器健康检查失败:', error.message);
            return false;
        }
    }

    /**
     * 执行实际请求
     */
    async executeRequest(task) {
        const { method, url, requestOptions } = task;

        try {
            const response = await fetch(url, requestOptions);
            
            // 检查是否是网络错误响应
            if (!response.ok && response.status === 0) {
                throw new TypeError('NetworkError: 服务器连接失败');
            }
            
            const result = await response.json();

            if (!response.ok) {
                // 处理429限流错误
                if (response.status === 429) {
                    throw new Error(result.error || '请求过于频繁，请稍后再试');
                }

                // 处理401未授权错误（用户未登录或token过期）
                if (response.status === 401) {
                    return {
                        success: false,
                        error: result.error || '未认证',
                        needLogin: true,
                        code: 'UNAUTHORIZED'
                    };
                }
                
                // 处理Token过期
                if (result.code === 'TOKEN_EXPIRED' && this.refreshToken) {
                    const refreshed = await this.refreshAccessToken();
                    if (refreshed) {
                        // 重试原请求
                        return this.request(method, task.url, task.data, task.options);
                    }
                }
                
                throw new Error(result.error || '请求失败');
            }

            return result;
        } catch (error) {
            // 如果是网络错误，标记服务器不可用
            if (error.name === 'TypeError' && 
                (error.message.includes('Failed to fetch') || 
                 error.message.includes('NetworkError') ||
                 error.message.includes('AbortError'))) {
                console.error('网络请求失败:', error.message);
                throw new TypeError('服务器连接失败，请检查网络连接');
            }
            console.error(`API Error [${method} ${url}]:`, error);
            throw error;
        }
    }

    /**
     * 延迟工具函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * GET 请求
     */
    async get(endpoint) {
        return this.request('GET', endpoint);
    }

    /**
     * POST 请求
     */
    async post(endpoint, data) {
        return this.request('POST', endpoint, data);
    }

    /**
     * PUT 请求
     */
    async put(endpoint, data) {
        return this.request('PUT', endpoint, data);
    }

    /**
     * DELETE 请求
     */
    async delete(endpoint) {
        return this.request('DELETE', endpoint);
    }

    /**
     * 刷新访问令牌
     */
    async refreshAccessToken() {
        try {
            const response = await fetch(`${this.baseURL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            const result = await response.json();

            if (result.success) {
                this.setToken(result.data.accessToken);
                return true;
            }

            this.clearToken();
            return false;
        } catch (error) {
            this.clearToken();
            return false;
        }
    }

    // ==================== 认证相关 ====================

    /**
     * 获取验证码
     */
    async getCaptcha() {
        const response = await fetch(`${this.baseURL}/auth/captcha`);
        if (!response.ok) {
            throw new Error('获取验证码失败');
        }
        return response.blob();
    }

    /**
     * 用户注册
     */
    async register(username, password, email) {
        return this.post('/auth/register', {
            username,
            password,
            email
        });
    }

    /**
     * 用户登录
     */
    async login(username, password, captcha) {
        const result = await this.post('/auth/login', {
            username,
            password,
            captcha
        });

        if (result.success) {
            this.setToken(result.data.accessToken);
            this.setRefreshToken(result.data.refreshToken);
        }

        return result;
    }

    /**
     * 用户登出
     */
    async logout() {
        const result = await this.post('/auth/logout', {});
        this.clearToken();
        return result;
    }

    /**
     * 获取当前用户信息
     */
    async getCurrentUser() {
        return this.get('/auth/me');
    }

    /**
     * 修改密码
     */
    async changePassword(currentPassword, newPassword) {
        return this.post('/auth/change-password', {
            currentPassword,
            newPassword
        });
    }

    /**
     * 获取用户资料
     */
    async getUserProfile() {
        return this.get('/auth/me');
    }

    /**
     * 更新用户资料
     */
    async updateProfile(data) {
        return this.put('/auth/profile', data);
    }

    /**
     * 上传头像
     */
    async uploadAvatar(file) {
        const formData = new FormData();
        formData.append('avatar', file);

        const response = await fetch(`${this.baseURL}/auth/avatar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || '上传失败');
        }

        return result;
    }

    // ==================== 文件相关 ====================

    /**
     * 获取文件列表
     */
    async getFiles(options = {}) {
        const params = new URLSearchParams();
        if (options.folderId) params.append('folderId', options.folderId);
        if (options.type) params.append('type', options.type);
        if (options.search) params.append('search', options.search);
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);
        if (options.sort) params.append('sort', options.sort);
        if (options.order) params.append('order', options.order);

        return this.get(`/files/list?${params.toString()}`);
    }

    /**
     * 获取视频列表
     */
    async getVideos(options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);

        return this.get(`/files/videos?${params.toString()}`);
    }

    /**
     * 获取文件详情
     */
    async getFile(fileId) {
        return this.get(`/files/${fileId}`);
    }

    /**
     * 获取视频详情（兼容播放器）
     * 优先使用 /api/video/:id/info 获取详细信息
     */
    async getVideo(videoId) {
        try {
            // 优先获取视频详细信息（包含时长、分辨率等）
            const response = await this.get(`/video/${videoId}/info`);
            if (response.success) {
                return {
                    success: true,
                    data: {
                        file: response.data.file,
                        video: response.data.video,
                        thumbnail: response.data.thumbnail
                    }
                };
            }
        } catch (e) {
            console.warn('获取视频详细信息失败，尝试获取基本信息');
        }
        
        // 回退到获取基本信息
        return this.get(`/files/${videoId}`);
    }

    /**
     * 创建文件夹
     */
    async createFolder(name, parentId) {
        return this.post('/files/folder', { name, parentId });
    }

    /**
     * 上传文件
     */
    async uploadFile(file, parentId, onProgress) {
        const formData = new FormData();
        formData.append('file', file);
        if (parentId) formData.append('parentId', parentId);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const progress = Math.round((e.loaded / e.total) * 100);
                    onProgress(progress);
                }
            });

            xhr.addEventListener('load', () => {
                try {
                    const result = JSON.parse(xhr.responseText);
                    if (result.success) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error));
                    }
                } catch (e) {
                    reject(e);
                }
            });

            xhr.addEventListener('error', () => reject(new Error('上传失败')));
            xhr.addEventListener('abort', () => reject(new Error('上传取消')));

            xhr.open('POST', `${this.baseURL}/files/upload`);
            if (this.token) {
                xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
            }
            xhr.send(formData);
        });
    }

    /**
     * 注册本地视频文件（不复制，只记录路径）
     * POST /api/admin/local-video
     */
    async registerLocalVideo(filePath, name, description) {
        return this.post('/admin/local-video', { filePath, name, description });
    }

    /**
     * 验证本地文件路径
     * POST /api/admin/validate-path
     */
    async validateLocalPath(filePath) {
        return this.post('/admin/validate-path', { filePath });
    }

    /**
     * 获取支持的视频格式列表
     * GET /api/admin/video-formats
     */
    async getVideoFormats() {
        return this.get('/admin/video-formats');
    }

    /**
     * 扫描本地文件夹查找视频文件
     * POST /api/admin/scan-folder
     */
    async scanLocalFolder(folderPath, extensions, recursively = true) {
        return this.post('/admin/scan-folder', {
            folderPath,
            extensions,
            recursively
        });
    }

    /**
     * 批量注册本地视频
     * POST /api/admin/batch-register
     */
    async batchRegisterLocalVideos(files) {
        return this.post('/admin/batch-register', { files });
    }

    /**
     * 注册本地文件（非视频）
     * POST /api/admin/local-file
     */
    async registerLocalFile(filePath, name, description) {
        return this.post('/admin/local-file', { filePath, name, description });
    }

    /**
     * 批量注册本地文件
     * POST /api/admin/batch-register-files
     */
    async batchRegisterLocalFiles(files) {
        return this.post('/admin/batch-register-files', { files });
    }

    /**
     * 扫描 uploads 文件夹
     * POST /api/files/scan
     */
    async scanUploadsFolder() {
        return this.post('/files/scan');
    }

    /**
     * 下载文件
     */
    downloadFile(fileId, fileName) {
        const link = document.createElement('a');
        link.href = `${this.baseURL}/files/${fileId}/download`;
        link.setAttribute('download', fileName);
        if (this.token) {
            link.setAttribute('data-token', this.token);
        }
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * 重命名文件
     */
    async renameFile(fileId, newName) {
        return this.post(`/files/${fileId}/rename`, { newName });
    }

    /**
     * 移动文件
     */
    async moveFile(fileId, targetFolderId) {
        return this.post(`/files/${fileId}/move`, { targetFolderId });
    }

    /**
     * 删除文件
     */
    async deleteFile(fileId) {
        return this.delete(`/files/${fileId}`);
    }

    /**
     * 批量删除文件
     */
    async batchDelete(fileIds) {
        return this.post('/files/batch-delete', { fileIds });
    }

    /**
     * 搜索文件
     */
    async searchFiles(keyword, type, limit) {
        const params = new URLSearchParams();
        params.append('keyword', keyword);
        if (type) params.append('type', type);
        if (limit) params.append('limit', limit);

        return this.get(`/files/search/query?${params.toString()}`);
    }

    /**
     * 获取文件统计
     */
    async getFileStats() {
        return this.get('/files/stats/summary');
    }

    /**
     * 获取传输任务列表
     */
    async getTransferTasks(status) {
        const params = status ? `?status=${status}` : '';
        return this.get(`/files/transfers/list${params}`);
    }

    // ==================== 视频相关 ====================

    /**
     * 获取视频信息
     */
    async getVideoInfo(videoId) {
        return this.get(`/video/${videoId}/info`);
    }

    /**
     * 获取视频播放地址（异步版本，支持自动刷新token）
     * 确保token作为URL参数传递，以便视频播放器可以访问
     */
    async getVideoStreamURL(videoId) {
        // 如果没有token，直接返回URL（允许匿名访问）
        if (!this.token) {
            return `${this.baseURL}/video/${videoId}/stream`;
        }

        // 尝试检查token是否有效
        try {
            const response = await fetch(`${this.baseURL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.status === 401) {
                // Token过期，尝试刷新
                const refreshed = await this.refreshAccessToken();
                if (!refreshed) {
                    // 刷新失败，清除token并允许匿名访问
                    this.clearToken();
                    return `${this.baseURL}/video/${videoId}/stream`;
                }
                // Token已刷新，重新获取token
                this.token = localStorage.getItem('accessToken');
            }
        } catch (error) {
            // 网络错误或其他问题，我们仍然尝试使用token
            // 如果token无效，服务器会返回401，但视频端点现在允许匿名访问
        }

        // 返回带token参数的URL，这样视频播放器可以直接访问
        return `${this.baseURL}/video/${videoId}/stream?token=${encodeURIComponent(this.token)}`;
    }

    /**
     * 异步获取视频流URL（推荐使用此方法）
     */
    async getVideoStreamUrl(videoId) {
        return this.getVideoStreamURL(videoId);
    }

    /**
     * 获取视频HLS播放列表
     * 自动添加token参数以支持认证
     * 使用 getToken() 动态获取，确保能获取到最新的 token（支持 Cookie 后备）
     */
    getVideoHLSURL(videoId) {
        // 使用 getToken() 动态获取，支持 localStorage 被阻止时的 Cookie 后备
        const token = this.getToken();
        if (token) {
            return `${this.baseURL}/video/${videoId}/playlist.m3u8?token=${encodeURIComponent(token)}`;
        }
        return `${this.baseURL}/video/${videoId}/playlist.m3u8`;
    }

    /**
     * 获取视频转码进度
     */
    async getTranscodeProgress(videoId) {
        return this.get(`/video/${videoId}/transcode-progress`);
    }

    /**
     * 获取视频缩略图
     * 自动添加token参数以支持认证
     */
    getVideoThumbnailURL(videoId) {
        if (this.token) {
            return `${this.baseURL}/video/${videoId}/thumbnail?token=${encodeURIComponent(this.token)}`;
        }
        return `${this.baseURL}/video/${videoId}/thumbnail`;
    }

    /**
     * 获取视频缩略图（小写别名）
     */
    getVideoThumbnailUrl(videoId) {
        return this.getVideoThumbnailURL(videoId);
    }

    /**
     * 更新播放进度
     */
    async updateProgress(videoId, position, duration, completed) {
        return this.post(`/video/${videoId}/progress`, {
            position,
            duration,
            completed
        });
    }

    /**
     * 收藏视频
     */
    async favoriteVideo(videoId) {
        return this.post(`/video/${videoId}/favorite`);
    }

    /**
     * 取消收藏
     */
    async unfavoriteVideo(videoId) {
        return this.delete(`/video/${videoId}/favorite`);
    }

    /**
     * 获取收藏列表
     */
    async getFavorites() {
        return this.get('/video/favorites/list');
    }

    /**
     * 获取最近观看
     */
    async getRecentVideos() {
        return this.get('/video/history/recent');
    }

    /**
     * 获取推荐视频
     */
    async getRecommendedVideos() {
        return this.get('/video/recommend/list');
    }

    /**
     * 手动触发转码
     */
    async startTranscode(videoId) {
        return this.post(`/video/${videoId}/transcode`);
    }

    /**
     * 获取转码进度
     */
    async getTranscodeProgress(videoId) {
        return this.get(`/video/${videoId}/transcode-progress`);
    }

    // ==================== 系统相关 ====================

    /**
     * 获取系统概览
     */
    async getSystemOverview() {
        return this.get('/system/overview');
    }

    /**
     * 获取实时状态
     */
    async getRealtimeStatus() {
        return this.get('/system/realtime');
    }

    /**
     * 获取连接用户（在线用户）
     */
    async getConnectedUsers() {
        return this.get('/system/users');
    }

    /**
     * 获取系统用户列表
     */
    async getSystemUsers() {
        return this.get('/system/users');
    }

    /**
     * 获取系统日志
     */
    async getSystemLogs(level, limit) {
        const params = new URLSearchParams();
        if (level) params.append('level', level);
        if (limit) params.append('limit', limit);
        return this.get(`/system/logs?${params.toString()}`);
    }

    /**
     * 获取转码任务状态
     */
    async getTranscodeTasks() {
        return this.get('/system/transcode-tasks');
    }

    /**
     * 获取系统配置
     */
    async getSystemConfig() {
        return this.get('/system/config');
    }

    /**
     * 获取系统健康状态
     */
    async getHealthStatus() {
        return this.get('/system/health');
    }

    // ==================== 管理相关 ====================

    /**
     * 获取管理仪表盘数据
     */
    async getAdminDashboard() {
        return this.get('/admin/dashboard');
    }

    /**
     * 获取所有用户
     */
    async getAllUsers(options = {}) {
        const params = new URLSearchParams();
        if (options.page) params.append('page', options.page);
        if (options.limit) params.append('limit', options.limit);
        if (options.search) params.append('search', options.search);
        if (options.role) params.append('role', options.role);
        return this.get(`/admin/users?${params.toString()}`);
    }

    /**
     * 获取用户详情
     */
    async getUser(userId) {
        return this.get(`/admin/users/${userId}`);
    }

    /**
     * 创建用户
     */
    async createUser(userData) {
        return this.post('/admin/users', userData);
    }

    /**
     * 更新用户
     */
    async updateUser(userId, userData) {
        return this.put(`/admin/users/${userId}`, userData);
    }

    /**
     * 重置用户密码
     */
    async resetUserPassword(userId, newPassword) {
        return this.post(`/admin/users/${userId}/reset-password`, { newPassword });
    }

    /**
     * 删除用户
     */
    async deleteUser(userId) {
        return this.delete(`/admin/users/${userId}`);
    }

    /**
     * 获取系统配置
     */
    async getAdminConfig() {
        return this.get('/admin/config');
    }

    /**
     * 更新系统配置
     */
    async updateAdminConfig(config) {
        return this.put('/admin/config', config);
    }

    /**
     * 获取文件统计
     */
    async getAdminFileStats() {
        return this.get('/admin/files/stats');
    }

    /**
     * 获取大文件列表
     */
    async getLargeFiles(limit) {
        return this.get(`/admin/files/large?limit=${limit || 20}`);
    }

    /**
     * 清理无效文件
     */
    async cleanupFiles() {
        return this.post('/admin/files/cleanup');
    }

    /**
     * 获取所有传输任务
     */
    async getAllTransfers() {
        return this.get('/admin/transfers');
    }
}

// 导出API实例
window.api = new API();
