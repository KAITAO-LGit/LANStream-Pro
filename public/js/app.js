/**
 * LANStream Pro - 主应用程序
 * 处理页面导航、数据加载和用户交互
 */

class App {
    constructor() {
        this.currentPage = 'home';
        this.currentFolderId = null;
        this.viewMode = 'grid';
        this.players = {};
        
        this.init();
    }

    /**
     * 初始化应用
     */
    init() {
        this.bindNavigation();
        this.bindEvents();
    }

    /**
     * 绑定导航事件
     */
    bindNavigation() {
        // 侧边栏导航
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigateTo(page);
            });
        });

        // 首页横幅导航
        document.querySelectorAll('.view-all').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const href = btn.getAttribute('href');
                const page = href.replace('#', '');
                this.navigateTo(page);
            });
        });

        // 用户下拉菜单导航
        document.querySelectorAll('.dropdown-menu a[href^="#"]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('href').replace('#', '');
                this.navigateTo(page);
                
                // 隐藏下拉菜单
                const dropdown = document.getElementById('user-dropdown');
                if (dropdown) {
                    dropdown.classList.remove('active');
                }
            });
        });

        // 点击用户头像打开下拉菜单
        const userDropdown = document.getElementById('user-dropdown');
        if (userDropdown) {
            userDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('active');
            });

            // 点击其他地方关闭下拉菜单
            document.addEventListener('click', (e) => {
                if (!userDropdown.contains(e.target)) {
                    userDropdown.classList.remove('active');
                }
            });
        }

        // 侧边栏用户信息点击打开个人资料
        const sidebarUserInfo = document.getElementById('sidebar-user-info');
        if (sidebarUserInfo) {
            sidebarUserInfo.style.cursor = 'pointer';
            sidebarUserInfo.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo('profile');
            });
        }
    }

    /**
     * 绑定通用事件
     */
    bindEvents() {
        // 侧边栏折叠
        const toggleBtn = document.getElementById('toggle-sidebar');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('open');
            });
        }

        // 刷新按钮
        const refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshCurrentPage();
            });
        }

        // 搜索框
        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const keyword = e.target.value.trim();
                    if (keyword) {
                        this.search(keyword);
                    }
                }
            });
        }

        // 文件管理视图切换
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.viewMode = btn.dataset.view;
                this.renderFileList();
            });
        });

        // 传输任务标签
        document.querySelectorAll('.transfer-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.transfer-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadTransfers(tab.dataset.tab);
            });
        });
    }

    /**
     * 导航到指定页面
     */
    navigateTo(page) {
        // 安全处理：确保page是字符串，不是Promise或对象
        if (page === null || page === undefined) {
            console.warn('navigateTo: page参数为空');
            return;
        }
        
        // 如果是Promise对象，记录警告并返回
        if (typeof page === 'object' && typeof page.then === 'function') {
            console.warn('navigateTo: 检测到Promise对象作为page参数，这是不正确的用法');
            return;
        }
        
        // 转换为字符串以确保安全
        const pageStr = String(page);
        
        // 隐藏所有页面
        document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
        
        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageStr);
        });

        // 显示目标页面
        const targetPage = document.getElementById(`page-${pageStr}`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = pageStr;
            this.loadPageData(pageStr);
        }

        // 关闭侧边栏（移动端）
        document.getElementById('sidebar').classList.remove('open');
    }

    /**
     * 刷新当前页面数据
     */
    refreshCurrentPage() {
        this.loadPageData(this.currentPage);
    }

    /**
     * 加载页面数据
     */
    async loadPageData(page) {
        switch (page) {
            case 'home':
                await this.loadHomeData();
                break;
            case 'videos':
                await this.loadVideos();
                break;
            case 'files':
                await this.loadFiles();
                break;
            case 'transfers':
                await this.loadTransfers();
                break;
            case 'profile':
                await this.loadProfilePage();
                break;
        }
    }

    /**
     * 加载首页数据
     */
    async loadHomeData() {
        authManager.showLoading('加载数据中...');
        
        try {
            // 并行加载数据
            const [recentResult, recommendResult] = await Promise.all([
                api.getRecentVideos(),
                api.getRecommendedVideos()
            ]);

            // 渲染最近观看
            if (recentResult.success) {
                this.renderVideoList('recent-videos', recentResult.data.videos || []);
            }

            // 渲染推荐视频
            if (recommendResult.success) {
                this.renderVideoList('recommended-videos', recommendResult.data.videos || []);
            }

            // 加载横幅
            this.loadBanner();
            
        } catch (error) {
            console.error('加载首页数据失败:', error);
            authManager.showNotification('加载数据失败', 'error');
        } finally {
            authManager.hideLoading();
        }
    }

    /**
     * 加载横幅
     */
    async loadBanner() {
        const bannerSlides = document.getElementById('banner-slides');
        if (!bannerSlides) return;

        try {
            const result = await api.getVideos({ limit: 5 });
            
            if (result.success && result.data.videos.length > 0) {
                const videos = result.data.videos.slice(0, 5);
                
                bannerSlides.innerHTML = videos.map((video, index) => `
                    <div class="banner-slide ${index === 0 ? 'active' : ''}" data-id="${video.id}">
                        <img src="${video.thumbnail || '/images/default-video.jpg'}" alt="${video.name}">
                        <div class="banner-content">
                            <h2 class="banner-title">${video.name}</h2>
                            <p class="banner-desc">${video.description || '点击观看视频'}</p>
                        </div>
                    </div>
                `).join('');

                // 绑定点击事件
                bannerSlides.querySelectorAll('.banner-slide').forEach(slide => {
                    slide.addEventListener('click', () => {
                        this.openVideoPlayer(slide.dataset.id);
                    });
                });

                // 自动轮播
                this.startBannerRotation();
            } else {
                bannerSlides.innerHTML = `
                    <div class="banner-slide active">
                        <img src="/images/default-banner.jpg" alt="欢迎">
                        <div class="banner-content">
                            <h2 class="banner-title">欢迎使用 LANStream Pro</h2>
                            <p class="banner-desc">上传视频开始您的媒体之旅</p>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('加载横幅失败:', error);
        }
    }

    /**
     * 横幅自动轮播
     */
    startBannerRotation() {
        const slides = document.querySelectorAll('.banner-slide');
        if (slides.length === 0) return;
        
        let currentIndex = 0;
        
        setInterval(() => {
            slides[currentIndex].classList.remove('active');
            currentIndex = (currentIndex + 1) % slides.length;
            slides[currentIndex].classList.add('active');
        }, 5000);
    }

    /**
     * 渲染视频列表
     */
    renderVideoList(containerId, videos) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (videos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-video"></i>
                    <h3>暂无视频</h3>
                    <p>上传视频即可在这里显示</p>
                </div>
            `;
            return;
        }

        container.innerHTML = videos.map(video => this.createVideoCard(video)).join('');
        
        // 绑定点击事件
        container.querySelectorAll('.video-card').forEach(card => {
            card.addEventListener('click', () => {
                this.openVideoPlayer(card.dataset.id);
            });
        });
    }

    /**
     * 创建视频卡片HTML
     */
    createVideoCard(video) {
        const duration = video.duration ? this.formatDuration(video.duration) : '--:--';
        const thumbnail = video.thumbnail || '/images/default-video.jpg';
        
        return `
            <div class="video-card" data-id="${video.id}">
                <div class="video-cover">
                    <img src="${thumbnail}" alt="${video.name}" loading="lazy">
                    <span class="duration">${duration}</span>
                    <div class="video-play-btn">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
                <div class="video-info">
                    <h3 class="video-title">${video.name}</h3>
                    <div class="video-meta">
                        <span><i class="fas fa-eye"></i> ${video.view_count || 0}</span>
                        <span><i class="fas fa-download"></i> ${video.download_count || 0}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 加载视频列表
     */
    async loadVideos() {
        authManager.showLoading('加载视频...');
        
        try {
            const result = await api.getVideos({ limit: 50 });
            
            if (result.success) {
                this.renderVideoList('all-videos', result.data.videos || []);
            }
        } catch (error) {
            console.error('加载视频列表失败:', error);
            authManager.showNotification('加载视频列表失败', 'error');
        } finally {
            authManager.hideLoading();
        }
    }

    /**
     * 打开视频播放器
     */
    async openVideoPlayer(videoId) {
        const modal = document.getElementById('video-player-modal');
        const videoElement = document.getElementById('main-video-player');
        const titleElement = document.getElementById('video-title');
        const descElement = document.getElementById('video-description');
        
        modal.classList.add('active');
        
        // 获取视频信息
        const result = await api.getVideoInfo(videoId);
        if (result.success) {
            const video = result.data.file;
            titleElement.textContent = video.name;
            descElement.textContent = video.description || '暂无描述';
            
            // 设置视频源（异步获取URL）
            const videoUrl = await api.getVideoStreamURL(videoId);
            videoElement.src = videoUrl;
            
            // 初始化播放器
            if (this.players.main) {
                this.players.main.destroy();
            }
            this.players.main = new Plyr(videoElement, {
                controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen']
            });
            
            // 保存播放进度
            videoElement.addEventListener('timeupdate', () => {
                const progress = (videoElement.currentTime / videoElement.duration) * 100;
                localStorage.setItem(`video_progress_${videoId}`, videoElement.currentTime);
            });
            
            videoElement.addEventListener('ended', () => {
                api.updateProgress(videoId, videoElement.duration, videoElement.duration, true);
            });
            
            // 恢复播放进度
            const savedProgress = localStorage.getItem(`video_progress_${videoId}`);
            if (savedProgress) {
                videoElement.currentTime = parseFloat(savedProgress);
            }
            
            // 增加观看次数
            api.getFile(videoId);
        }
        
        // 收藏按钮
        const favoriteBtn = document.getElementById('btn-favorite');
        favoriteBtn.onclick = () => {
            api.favoriteVideo(videoId).then(result => {
                if (result.success) {
                    favoriteBtn.classList.add('favorited');
                    favoriteBtn.innerHTML = '<i class="fas fa-heart"></i> 已收藏';
                    authManager.showNotification('收藏成功', 'success');
                }
            });
        };
        
        // 下载按钮
        const downloadBtn = document.getElementById('btn-download-video');
        downloadBtn.onclick = () => {
            api.getFile(videoId).then(result => {
                if (result.success) {
                    const file = result.data.file;
                    api.downloadFile(videoId, file.name);
                }
            });
        };
    }

    /**
     * 关闭视频播放器
     */
    closeVideoPlayer() {
        const modal = document.getElementById('video-player-modal');
        const videoElement = document.getElementById('main-video-player');
        
        modal.classList.remove('active');
        videoElement.pause();
        videoElement.src = '';
        
        if (this.players.main) {
            this.players.main.destroy();
            this.players.main = null;
        }
    }

    /**
     * 加载文件列表
     */
    async loadFiles() {
        authManager.showLoading('加载文件...');
        
        try {
            const result = await api.getFiles({ folderId: this.currentFolderId });
            
            if (result.success) {
                this.renderFileList(result.data.files || []);
                this.updateBreadcrumb(result.data.files);
            }
        } catch (error) {
            console.error('加载文件列表失败:', error);
            authManager.showNotification('加载文件列表失败', 'error');
        } finally {
            authManager.hideLoading();
        }
    }

    /**
     * 渲染文件列表
     */
    renderFileList(files) {
        const container = document.getElementById('file-content');
        if (!container) return;

        if (files.length === 0) {
            container.innerHTML = `
                <div class="file-empty">
                    <i class="fas fa-folder-open"></i>
                    <h3>文件夹为空</h3>
                    <p>上传文件或创建文件夹</p>
                </div>
            `;
            return;
        }

        if (this.viewMode === 'grid') {
            container.innerHTML = `<div class="file-grid-view">${files.map(file => this.createGridItem(file)).join('')}</div>`;
        } else {
            container.innerHTML = `<div class="file-list-view">${files.map(file => this.createListItem(file)).join('')}</div>`;
        }

        // 绑定事件
        container.querySelectorAll('.file-grid-item, .file-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const fileId = item.dataset.id;
                const fileType = item.dataset.type;
                
                if (fileType === 'folder') {
                    this.currentFolderId = fileId;
                    this.loadFiles();
                } else if (fileType === 'video') {
                    this.openVideoPlayer(fileId);
                } else if (fileType === 'image') {
                    this.showImagePreview(fileId);
                } else {
                    this.downloadFile(fileId);
                }
            });
            
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                // 简单的右键菜单实现
                const menu = document.getElementById('context-menu');
                if (menu) {
                    menu.style.display = 'block';
                    menu.style.left = `${e.pageX}px`;
                    menu.style.top = `${e.pageY}px`;
                    menu.dataset.fileId = item.dataset.id;
                    menu.dataset.fileType = item.dataset.type;
                }
            });
        });
    }

    /**
     * 隐藏上下文菜单
     */
    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) {
            menu.style.display = 'none';
        }
    }

    /**
     * 创建网格项
     */
    createGridItem(file) {
        const iconClass = this.getFileIcon(file.type);
        
        return `
            <div class="file-grid-item ${file.type}" data-id="${file.id}" data-type="${file.type}">
                ${file.thumbnail && file.type === 'image' 
                    ? `<img src="${file.thumbnail}" class="file-thumb" alt="${file.name}">`
                    : `<div class="file-icon"><i class="fas ${iconClass}"></i></div>`
                }
                <span class="file-name">${file.name}</span>
                <span class="file-size">${this.formatFileSize(file.size)}</span>
            </div>
        `;
    }

    /**
     * 创建列表项
     */
    createListItem(file) {
        const iconClass = this.getFileIcon(file.type);
        
        return `
            <div class="file-list-item ${file.type}" data-id="${file.id}" data-type="${file.type}">
                <span class="file-icon"><i class="fas ${iconClass}"></i></span>
                <span class="file-name">${file.name}</span>
                <span class="file-size">${this.formatFileSize(file.size)}</span>
                <span class="file-date">${this.formatDate(file.created_at)}</span>
                <div class="file-actions">
                    <button class="btn-action-icon" onclick="event.stopPropagation(); app.downloadFile('${file.id}')">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 获取文件图标
     */
    getFileIcon(type) {
        const icons = {
            folder: 'fa-folder',
            video: 'fa-film',
            audio: 'fa-music',
            image: 'fa-image',
            document: 'fa-file-alt',
            archive: 'fa-file-archive',
            other: 'fa-file'
        };
        return icons[type] || icons.other;
    }

    /**
     * 更新面包屑导航
     */
    updateBreadcrumb(files) {
        const breadcrumb = document.getElementById('file-breadcrumb');
        if (!breadcrumb) return;

        let html = `<a href="#" data-folder-id="">根目录</a>`;
        
        if (this.currentFolderId) {
            const currentFile = files.find(f => f.id === this.currentFolderId);
            if (currentFile) {
                html += `<span>/</span><span class="current">${currentFile.name}</span>`;
            }
        }
        
        breadcrumb.innerHTML = html;
        
        // 绑定点击事件
        breadcrumb.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentFolderId = link.dataset.folderId || null;
                this.loadFiles();
            });
        });
    }

    /**
     * 下载文件
     */
    downloadFile(fileId) {
        api.getFile(fileId).then(result => {
            if (result.success) {
                const file = result.data.file;
                api.downloadFile(fileId, file.name);
            }
        });
    }

    /**
     * 加载个人资料页面
     */
    async loadProfilePage() {
        try {
            const result = await api.getUserProfile();
            
            if (result.success) {
                const user = result.data.user;
                this.renderProfilePage(user);
                this.bindProfileEvents(user);
            } else {
                authManager.showNotification('加载用户资料失败', 'error');
            }
        } catch (error) {
            console.error('加载个人资料失败:', error);
            authManager.showNotification('加载用户资料失败', 'error');
        }
    }

    /**
     * 渲染个人资料页面
     */
    renderProfilePage(user) {
        // 生成头像首字母和颜色
        const initials = this.getInitials(user.display_name || user.username);
        const gradient = this.getAvatarGradient(user.username);
        
        // 设置头像
        const avatarDisplay = document.getElementById('profile-avatar-display');
        if (avatarDisplay) {
            avatarDisplay.innerHTML = `<span class="avatar-initials">${initials}</span>`;
            avatarDisplay.style.background = gradient;
        }

        // 设置用户名
        const usernameEl = document.getElementById('profile-username');
        if (usernameEl) usernameEl.textContent = user.username;

        // 设置显示名称
        const displayNameEl = document.getElementById('profile-display-name');
        if (displayNameEl) displayNameEl.textContent = user.display_name || '未设置';

        // 设置邮箱
        const emailEl = document.getElementById('profile-email');
        if (emailEl) emailEl.textContent = user.email || '未设置';

        // 设置角色
        const roleEl = document.getElementById('profile-role');
        if (roleEl) {
            const roleText = user.role === 'admin' ? '管理员' : '普通用户';
            const roleClass = user.role === 'admin' ? 'admin' : 'user';
            roleEl.innerHTML = `<span class="role-badge ${roleClass}">${roleText}</span>`;
        }

        // 更新侧边栏和顶部用户信息
        this.updateUserInfo(user);
    }

    /**
     * 绑定个人资料页面事件
     */
    bindProfileEvents(user) {
        // 头像上传
        const avatarWrapper = document.getElementById('profile-avatar-wrapper');
        const avatarInput = document.getElementById('profile-avatar-input');

        if (avatarWrapper && avatarInput) {
            avatarWrapper.addEventListener('click', () => avatarInput.click());

            avatarInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // 验证文件
                const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                if (!allowedTypes.includes(file.type)) {
                    authManager.showNotification('请选择 JPG、PNG、GIF 或 WebP 格式的图片', 'error');
                    return;
                }
                if (file.size > 2 * 1024 * 1024) {
                    authManager.showNotification('图片大小不能超过 2MB', 'error');
                    return;
                }

                try {
                    authManager.showLoading('正在上传头像...');
                    const result = await api.uploadAvatar(file);

                    if (result.success) {
                        // 更新本地显示
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const avatarDisplay = document.getElementById('profile-avatar-display');
                            if (avatarDisplay) {
                                avatarDisplay.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                            }
                        };
                        reader.readAsDataURL(file);

                        authManager.showNotification('头像上传成功', 'success');
                    } else {
                        authManager.showNotification(result.error || '头像上传失败', 'error');
                    }
                } catch (error) {
                    console.error('头像上传失败:', error);
                    authManager.showNotification('头像上传失败', 'error');
                } finally {
                    authManager.hideLoading();
                    avatarInput.value = '';
                }
            });
        }

        // 密码显示/隐藏切换
        const togglePasswords = document.querySelectorAll('.toggle-password');
        togglePasswords.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const targetId = toggle.dataset.target;
                const input = document.getElementById(targetId);
                if (input) {
                    if (input.type === 'password') {
                        input.type = 'text';
                        toggle.classList.remove('fa-eye');
                        toggle.classList.add('fa-eye-slash');
                    } else {
                        input.type = 'password';
                        toggle.classList.remove('fa-eye-slash');
                        toggle.classList.add('fa-eye');
                    }
                }
            });
        });

        // 密码强度检测
        const newPasswordInput = document.getElementById('profile-new-password');
        const confirmPasswordInput = document.getElementById('profile-confirm-password');
        const strengthIndicator = document.getElementById('password-strength');
        const matchIndicator = document.getElementById('password-match');

        if (newPasswordInput && strengthIndicator) {
            newPasswordInput.addEventListener('input', () => {
                const password = newPasswordInput.value;
let strength = 0;

                if (password.length >= 8) strength++;
                if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
                if (/\d/.test(password)) strength++;
                if (/[^a-zA-Z0-9]/.test(password)) strength++;

                strengthIndicator.className = 'password-strength';
                if (password.length > 0) {
                    if (strength <= 1) {
                        strengthIndicator.classList.add('weak');
                    } else if (strength <= 2) {
                        strengthIndicator.classList.add('medium');
                    } else {
                        strengthIndicator.classList.add('strong');
                    }
                }
            });
        }

        if (confirmPasswordInput && matchIndicator) {
            confirmPasswordInput.addEventListener('input', () => {
                const newPassword = newPasswordInput.value;
                const confirmPassword = confirmPasswordInput.value;

                matchIndicator.className = 'password-match';
                if (confirmPassword.length > 0) {
                    if (newPassword === confirmPassword) {
                        matchIndicator.classList.add('match');
                        matchIndicator.innerHTML = '<i class="fas fa-check-circle"></i> 密码匹配';
                    } else {
                        matchIndicator.classList.add('mismatch');
                        matchIndicator.innerHTML = '<i class="fas fa-times-circle"></i> 密码不匹配';
                    }
                }
            });
        }

        // 密码修改表单
        const passwordForm = document.getElementById('profile-password-form');
        if (passwordForm) {
            passwordForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const currentPassword = document.getElementById('profile-current-password').value;
                const newPassword = document.getElementById('profile-new-password').value;
                const confirmPassword = document.getElementById('profile-confirm-password').value;

                if (!currentPassword || !newPassword || !confirmPassword) {
                    authManager.showNotification('请填写所有密码字段', 'error');
                    return;
                }
                if (newPassword.length < 8) {
                    authManager.showNotification('新密码长度至少为8位', 'error');
                    return;
                }
                if (newPassword !== confirmPassword) {
                    authManager.showNotification('两次输入的密码不一致', 'error');
                    return;
                }
                if (currentPassword === newPassword) {
                    authManager.showNotification('新密码不能与当前密码相同', 'error');
                    return;
                }

                try {
                    authManager.showLoading('正在修改密码...');
                    const result = await api.changePassword(currentPassword, newPassword);

                    if (result.success) {
                        authManager.showNotification('密码修改成功', 'success');
                        passwordForm.reset();
                        // 重置密码强度指示器
                        if (strengthIndicator) {
                            strengthIndicator.className = 'password-strength';
                        }
                        if (matchIndicator) {
                            matchIndicator.className = 'password-match';
                            matchIndicator.innerHTML = '';
                        }
                    } else {
                        authManager.showNotification(result.error || '密码修改失败', 'error');
                    }
                } catch (error) {
                    console.error('密码修改失败:', error);
                    authManager.showNotification('密码修改失败，请检查当前密码是否正确', 'error');
                } finally {
                    authManager.hideLoading();
                }
            });

            // 表单重置事件
            passwordForm.addEventListener('reset', () => {
                // 重置密码强度指示器
                if (strengthIndicator) {
                    strengthIndicator.className = 'password-strength';
                }
                if (matchIndicator) {
                    matchIndicator.className = 'password-match';
                    matchIndicator.innerHTML = '';
                }
            });
        }

        // 编辑资料按钮
        const editBtn = document.getElementById('profile-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                // 进入编辑模式
                this.enterEditMode(user);
            });
        }

        // 保存资料按钮
        const saveBtn = document.getElementById('btn-save-profile');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveProfile(user);
            });
        }

        // 取消编辑按钮
        const cancelBtn = document.getElementById('btn-cancel-edit');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.cancelEditMode(user);
            });
        }
    }

    /**
     * 进入编辑模式
     */
    enterEditMode(user) {
        // 保存原始用户数据（用于取消时恢复）
        this.originalUserData = {
            display_name: user.display_name || '',
            email: user.email || ''
        };

        // 显示输入框，隐藏显示值
        const displayFields = ['username', 'display_name', 'email'];
        displayFields.forEach(field => {
            const displayEl = document.getElementById(`profile-${field}`);
            const inputEl = document.getElementById(`input-${field}`);

            if (displayEl && inputEl) {
                displayEl.style.display = 'none';
                inputEl.style.display = 'block';
                inputEl.value = field === 'username' ? user[field] : (user[field] || '');
            }
        });

        // 用户名不允许编辑
        const usernameInput = document.getElementById('input-username');
        if (usernameInput) {
            usernameInput.disabled = true;
        }

        // 显示保存/取消按钮，隐藏编辑按钮
        document.getElementById('profile-edit-btn').style.display = 'none';
        document.getElementById('edit-actions').style.display = 'flex';
    }

    /**
     * 取消编辑模式
     */
    cancelEditMode(user) {
        // 使用保存的原始数据恢复输入框
        if (this.originalUserData) {
            document.getElementById('input-display_name').value = this.originalUserData.display_name;
            document.getElementById('input-email').value = this.originalUserData.email;
        }

        // 恢复显示值
        this.refreshProfileDisplay(user);

        // 显示显示值，隐藏输入框
        const displayFields = ['username', 'display_name', 'email'];
        displayFields.forEach(field => {
            const displayEl = document.getElementById(`profile-${field}`);
            const inputEl = document.getElementById(`input-${field}`);

            if (displayEl && inputEl) {
                displayEl.style.display = 'block';
                inputEl.style.display = 'none';
            }
        });

        // 显示编辑按钮，隐藏保存/取消按钮
        document.getElementById('profile-edit-btn').style.display = 'inline-flex';
        document.getElementById('edit-actions').style.display = 'none';
    }

    /**
     * 保存用户资料
     */
    async saveProfile(user) {
        const displayName = document.getElementById('input-display_name').value.trim();
        const email = document.getElementById('input-email').value.trim();

        // 检查是否有修改
        const hasChanges = displayName !== (user.display_name || '') || email !== (user.email || '');
        if (!hasChanges) {
            // 没有修改，直接退出编辑模式
            this.cancelEditMode(user);
            return;
        }

        // 验证邮箱格式
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            authManager.showNotification('请输入有效的邮箱地址', 'error');
            return;
        }

        // 验证显示名称长度
        if (displayName.length > 30) {
            authManager.showNotification('显示名称不能超过30个字符', 'error');
            return;
        }

        try {
            authManager.showLoading('正在保存资料...');

            const result = await api.updateProfile({
                display_name: displayName,
                email: email
            });

            if (result.success) {
                const updatedUser = result.data.user;

                // 显示成功消息
                authManager.showNotification('资料更新成功', 'success');

                // 1. 更新本地用户状态（全局同步）
                if (authManager.user) {
                    authManager.user.display_name = updatedUser.display_name;
                    authManager.user.email = updatedUser.email;
                }

                // 2. 刷新页面显示
                this.refreshProfileDisplay(updatedUser);

                // 3. 更新侧边栏和顶部用户信息
                this.updateUserInfo(updatedUser);

                // 4. 更新输入框的值（以便取消时能正确恢复）
                document.getElementById('input-display_name').value = updatedUser.display_name || '';
                document.getElementById('input-email').value = updatedUser.email || '';

                // 5. 退出编辑模式
                document.getElementById('profile-edit-btn').style.display = 'inline-flex';
                document.getElementById('edit-actions').style.display = 'none';

                // 显示输入框，隐藏显示值
                const displayFields = ['username', 'display_name', 'email'];
                displayFields.forEach(field => {
                    const displayEl = document.getElementById(`profile-${field}`);
                    const inputEl = document.getElementById(`input-${field}`);

                    if (displayEl && inputEl) {
                        displayEl.style.display = 'block';
                        inputEl.style.display = 'none';
                    }
                });

                // 6. 同步头像首字母（如果显示名称改变）
                this.updateAvatarInitials(updatedUser);

            } else {
                authManager.showNotification(result.error || '保存失败', 'error');
            }
        } catch (error) {
            console.error('保存资料失败:', error);
            authManager.showNotification('保存资料失败，请检查网络连接', 'error');
        } finally {
            authManager.hideLoading();
        }
    }

    /**
     * 更新头像首字母（当显示名称改变时）
     */
    updateAvatarInitials(user) {
        const initials = this.getInitials(user.display_name || user.username);
        const gradient = this.getAvatarGradient(user.username);

        // 更新侧边栏用户头像
        const sidebarAvatar = document.getElementById('sidebar-user-avatar');
        if (sidebarAvatar) {
            sidebarAvatar.innerHTML = `<span style="font-size:24px;color:#fff;">${initials}</span>`;
            sidebarAvatar.style.background = gradient;
        }

        // 更新顶部用户头像
        const headerAvatar = document.getElementById('header-user-avatar');
        if (headerAvatar) {
            headerAvatar.innerHTML = `<span style="font-size:14px;color:#fff;">${initials}</span>`;
            headerAvatar.style.background = gradient;
        }

        // 更新个人资料页面头像
        const profileAvatarDisplay = document.getElementById('profile-avatar-display');
        if (profileAvatarDisplay && !user.avatar_url) {
            profileAvatarDisplay.innerHTML = `<span class="avatar-initials">${initials}</span>`;
            profileAvatarDisplay.style.background = gradient;
        }
    }

    /**
     * 刷新资料页面显示
     */
    refreshProfileDisplay(user) {
        // 更新用户名（不显示，因为不能编辑）
        const usernameEl = document.getElementById('profile-username');
        if (usernameEl) usernameEl.textContent = user.username;

        // 更新显示名称
        const displayNameEl = document.getElementById('profile-display-name');
        if (displayNameEl) displayNameEl.textContent = user.display_name || '未设置';

        // 更新邮箱
        const emailEl = document.getElementById('profile-email');
        if (emailEl) emailEl.textContent = user.email || '未设置';

        // 更新角色
        const roleEl = document.getElementById('profile-role');
        if (roleEl) {
            const roleText = user.role === 'admin' ? '管理员' : '普通用户';
            roleEl.textContent = roleText;
        }
    }

    /**
     * 获取名字首字母
     */
    getInitials(name) {
        if (!name) return '?';
        const cleanedName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
        if (/^[a-zA-Z]/.test(cleanedName)) {
            return cleanedName.charAt(0).toUpperCase();
        }
        if (/^[\u4e00-\u9fa5]/.test(cleanedName)) {
            return cleanedName.charAt(0);
        }
        return cleanedName.charAt(0).toUpperCase();
    }

    /**
     * 获取头像渐变色
     */
    getAvatarGradient(username) {
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
        ];

        let hash = 0;
        for (let i = 0; i < (username || '').length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    /**
     * 更新用户信息显示
     */
    updateUserInfo(user) {
        const initials = this.getInitials(user.display_name || user.username);
        const gradient = this.getAvatarGradient(user.username);

        // 更新侧边栏用户头像
        const sidebarAvatar = document.querySelector('#sidebar .user-avatar');
        if (sidebarAvatar) {
            sidebarAvatar.innerHTML = `<span style="font-size:24px;color:#fff;">${initials}</span>`;
            sidebarAvatar.style.background = gradient;
        }

        // 更新侧边栏用户名
        const sidebarUsername = document.getElementById('sidebar-username');
        if (sidebarUsername) {
            sidebarUsername.textContent = user.display_name || user.username;
        }

        // 更新顶部用户头像
        const headerAvatar = document.querySelector('#user-dropdown .user-avatar-small');
        if (headerAvatar) {
            headerAvatar.innerHTML = `<span style="font-size:14px;color:#fff;">${initials}</span>`;
            headerAvatar.style.background = gradient;
        }

        // 更新顶部用户名
        const headerUsername = document.getElementById('header-username');
        if (headerUsername) {
            headerUsername.textContent = user.display_name || user.username;
        }
    }

    /**
     * 加载传输任务
     */
    async loadTransfers(status = null) {
        try {
            const result = await api.getTransferTasks(status);
            
            if (result.success) {
                this.renderTransferList(result.data.tasks || []);
            }
        } catch (error) {
            console.error('加载传输任务失败:', error);
        }
    }

    /**
     * 渲染传输列表
     */
    renderTransferList(tasks) {
        const container = document.getElementById('transfer-list');
        if (!container) return;

        if (tasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exchange-alt"></i>
                    <h3>暂无传输任务</h3>
                    <p>上传或下载文件将显示在这里</p>
                </div>
            `;
            return;
        }

        container.innerHTML = tasks.map(task => `
            <div class="transfer-item">
                <div class="transfer-icon ${task.type}">
                    <i class="fas fa-${task.type === 'upload' ? 'cloud-upload-alt' : 'cloud-download-alt'}"></i>
                </div>
                <div class="transfer-info">
                    <div class="transfer-name">${task.file_id || '未知文件'}</div>
                    <div class="transfer-meta">${this.formatDate(task.created_at)}</div>
                </div>
                <div class="transfer-progress">
                    <div class="progress-bar">
                        <div class="progress" style="width: ${task.progress}%"></div>
                    </div>
                </div>
                <div class="transfer-status ${task.status}">${this.getStatusText(task.status)}</div>
            </div>
        `).join('');
    }

    /**
     * 获取状态文本
     */
    getStatusText(status) {
        const texts = {
            pending: '等待中',
            processing: '进行中',
            completed: '已完成',
            failed: '失败',
            cancelled: '已取消'
        };
        return texts[status] || status;
    }

    /**
     * 获取类型名称
     */
    getTypeName(type) {
        const names = {
            folder: '文件夹',
            video: '视频',
            audio: '音频',
            image: '图片',
            document: '文档',
            archive: '压缩包',
            other: '其他'
        };
        return names[type] || type;
    }

    /**
     * 搜索
     */
    async search(keyword) {
        this.navigateTo('files');
        
        try {
            const result = await api.searchFiles(keyword);
            if (result.success) {
                this.renderFileList(result.data.files || []);
            }
        } catch (error) {
            console.error('搜索失败:', error);
        }
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化时间
     */
    formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * 格式化日期
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN');
    }
}

// 初始化应用
window.app = new App();

// 绑定关闭视频播放器事件
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-video-player');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => window.app.closeVideoPlayer());
    }

    // 点击背景关闭模态框
    const videoModal = document.getElementById('video-player-modal');
    if (videoModal) {
        videoModal.addEventListener('click', (e) => {
            if (e.target === videoModal) {
                window.app.closeVideoPlayer();
            }
        });
    }

    // 点击任意位置隐藏上下文菜单
    document.addEventListener('click', () => {
        window.app.hideContextMenu();
    });

    // 上下文菜单项点击事件
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileId = contextMenu.dataset.fileId;
                const action = item.dataset.action;
                if (action === 'open' && window.app.openVideoPlayer) {
                    window.app.openVideoPlayer(fileId);
                } else if (action === 'download' && window.app.downloadFile) {
                    window.app.downloadFile(fileId);
                }
                window.app.hideContextMenu();
            });
        });
    }
});
