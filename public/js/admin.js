/**
 * 服务器管理页面脚本
 * 处理系统监控、用户管理、视频管理、系统设置等功能
 */

// DOM 元素
const elements = {
    // 登录相关
    loginOverlay: null,
    loginForm: null,
    loginUsername: null,
    loginPassword: null,
    loginCaptcha: null,
    loginCaptchaGroup: null,
    loginCaptchaImg: null,
    loginRemember: null,
    loginBtn: null,
    loginError: null,

    // 顶部用户信息
    headerAvatar: null,
    headerUsername: null,

    // 页面导航
    navItems: null,
    pageContents: null,

    // 监控相关
    cpuUsage: null,
    cpuCores: null,
    cpuTemp: null,
    cpuPower: null,
    cpuGauge: null,
    cpuGaugeFill: null,
    cpuGaugeValue: null,
    cpuStatus: null,
    cpuChart: null,

    gpuUsage: null,
    gpuTemp: null,
    gpuName: null,
    gpuGauge: null,
    gpuGaugeFill: null,
    gpuGaugeValue: null,
    gpuStatus: null,
    gpuChart: null,

    memoryUsed: null,
    memoryTotal: null,
    memoryPercent: null,
    memoryGauge: null,
    memoryGaugeFill: null,
    memoryGaugeValue: null,
    memoryStatus: null,
    memoryChart: null,

    diskUsed: null,
    diskTotal: null,
    diskPercent: null,
    diskGauge: null,
    diskGaugeFill: null,
    diskGaugeValue: null,
    diskStatus: null,
    diskChart: null,

    onlineCount: null,
    onlineUsersList: null,

    // 系统信息
    serverName: null,
    serverVersion: null,
    serverUptime: null,
    currentTime: null,
    osInfo: null,
    localIP: null,
    totalFiles: null,

    // 用户管理
    usersTableBody: null,
    addUserBtn: null,

    // 视频管理
    videoGrid: null,
    videoTotalCount: null,
    videoTotalSize: null,
    videoTodayCount: null,
    uploadVideoBtn: null,
    refreshVideosBtn: null,
    scanUploadsBtn: null,

    // 文件管理
    filesTableBody: null,
    totalFilesCount: null,
    totalVideosCount: null,
    totalStorageSize: null,
    storageUsagePercent: null,
    uploadFileBtn: null,
    cleanupFilesBtn: null,

    // 系统设置
    serverPort: null,
    uploadLimit: null,
    sessionTimeout: null,
    enableCaptcha: null,
    saveSettingsBtn: null,

    // 系统日志
    logContainer: null,
    logLevel: null,
    refreshLogsBtn: null,

    // 用户模态框
    userModal: null,
    userModalTitle: null,
    closeUserModal: null,
    cancelUserBtn: null,
    saveUserBtn: null,
    userForm: null,
    editUserId: null,
    newUsername: null,
    newDisplayName: null,
    newEmail: null,
    newPassword: null,
    newRole: null,

    // 上传模态框
    uploadModal: null,
    closeUploadModal: null,
    uploadDropzone: null,
    fileInput: null,
    uploadProgress: null,
    uploadProgressBar: null,
    uploadProgressText: null,

    // 本地视频添加模态框
    localVideoModal: null,
    closeLocalVideoModal: null,
    localVideoPath: null,
    localVideoFileInput: null,
    localVideoFolderInput: null,
    localVideoDropzone: null,
    validateLocalPathBtn: null,
    saveLocalVideoBtn: null,
    localVideoStatus: null,
    localVideoPreview: null,
    browsePathBtn: null,
    browseFolderBtn: null,

    // 批量添加模态框
    batchAddModal: null,
    closeBatchAddModal: null,
    batchFileList: null,
    batchAddProgress: null,
    batchAddProgressBar: null,
    batchAddProgressText: null,
    clearBatchListBtn: null,
    startBatchAddBtn: null,

    // 文件夹扫描模态框
    folderScanModal: null,
    closeFolderScanModal: null,
    scanFolderPath: null,
    scanFolderInput: null,
    scanExtensions: null,
    scanRecursively: null,
    scanStatus: null,
    scanResults: null,
    startScanBtn: null,

    // 退出登录
    logoutBtn: null
};

// 当前用户数据
let currentUser = null;

// 系统状态定时器
let statusInterval = null;
let uptimeInterval = null; // 运行时间更新定时器
let serverStartTimestamp = null; // 服务器启动时间戳

// 认证检查状态
let authCheckCompleted = false;

// 登录遮罩层首次显示标志（用于控制initLoginClearButtons的清空逻辑）
let loginOverlayFirstShown = false;

// 视频模态框状态
let selectedVideoFiles = [];
let currentVideoTab = 'single';

// WebSocket 连接状态
let socket = null;
let socketConnected = false;

// 图表数据 - 使用数组存储时间序列数据
const chartData = {
    cpu: [],
    gpu: [],
    memory: [],
    disk: [],
    maxPoints: 20,
    initialized: false  // 标记是否已初始化
};

// 当前页面缓存
const pageCache = {
    videos: { data: null, timestamp: 0 },
    users: { data: null, timestamp: 0 },
    files: { data: null, timestamp: 0 },
    logs: { data: null, timestamp: 0 }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Admin] DOMContentLoaded 事件触发');
    initElements();
    bindLoginEvents();
    initLoginClearButtons();

    // 延迟200ms检查，确保authManager有足够时间初始化
    setTimeout(() => {
        console.log('[Admin] 开始检查认证状态');
        // 如果authManager已经完成用户加载且是管理员或超级管理员，直接显示管理界面
        if (window.authManager && window.authManager.user && 
            (window.authManager.user.role === 'admin' || window.authManager.user.role === 'superadmin')) {
            console.log('[Admin] 检测到已登录管理员用户:', window.authManager.user.username);
            currentUser = window.authManager.user;
            showAdminInterface();
        } else {
            // 否则检查认证状态
            console.log('[Admin] 未检测到管理员用户，检查认证状态...');
            checkAuthAndShowAdmin();
        }
    }, 200);
});

/**
 * 初始化元素引用
 */
function initElements() {
    // 登录相关元素
    elements.loginOverlay = document.getElementById('adminLoginOverlay');
    elements.loginForm = document.getElementById('adminLoginForm');
    elements.loginUsername = document.getElementById('adminUsername');
    elements.loginPassword = document.getElementById('adminPassword');
    elements.loginCaptcha = document.getElementById('adminCaptcha');
    elements.loginCaptchaGroup = document.getElementById('captchaGroup');
    elements.loginCaptchaImg = document.getElementById('adminCaptchaImg');
    elements.loginRemember = document.getElementById('adminRemember');
    elements.loginBtn = document.getElementById('adminLoginBtn');
    elements.loginError = document.getElementById('adminLoginError');

    // 顶部用户信息
    elements.headerAvatar = document.getElementById('headerAvatar');
    elements.headerUsername = document.getElementById('headerUsername');

    // 页面导航
    elements.navItems = document.querySelectorAll('.nav-item');
    elements.pageContents = document.querySelectorAll('.page-content');

    // CPU监控
    elements.cpuUsage = document.getElementById('cpuUsage');
    elements.cpuCores = document.getElementById('cpuCores');
    elements.cpuTemp = document.getElementById('cpuTemp');
    elements.cpuPower = document.getElementById('cpuPower');
    elements.cpuModel = document.getElementById('cpuModel');
    elements.cpuGauge = document.getElementById('cpuGauge');
    elements.cpuGaugeFill = document.getElementById('cpuGaugeFill');
    elements.cpuGaugeValue = document.getElementById('cpuGaugeValue');
    elements.cpuStatus = document.getElementById('cpuStatus');
    elements.cpuChart = document.getElementById('cpuChart');

    // GPU监控
    elements.gpuUsage = document.getElementById('gpuUsage');
    elements.gpuTemp = document.getElementById('gpuTemp');
    elements.gpuName = document.getElementById('gpuName');
    elements.gpuMemory = document.getElementById('gpuMemory');
    elements.gpuPower = document.getElementById('gpuPower');
    elements.gpuGauge = document.getElementById('gpuGauge');
    elements.gpuGaugeFill = document.getElementById('gpuGaugeFill');
    elements.gpuGaugeValue = document.getElementById('gpuGaugeValue');
    elements.gpuStatus = document.getElementById('gpuStatus');
    elements.gpuChart = document.getElementById('gpuChart');

    // 内存监控
    elements.memoryUsed = document.getElementById('memoryUsed');
    elements.memoryTotal = document.getElementById('memoryTotal');
    elements.memoryPercent = document.getElementById('memoryPercent');
    elements.memoryGauge = document.getElementById('memoryGauge');
    elements.memoryGaugeFill = document.getElementById('memoryGaugeFill');
    elements.memoryGaugeValue = document.getElementById('memoryGaugeValue');
    elements.memoryStatus = document.getElementById('memoryStatus');
    elements.memoryChart = document.getElementById('memoryChart');

    // 硬盘监控
    elements.diskUsed = document.getElementById('diskUsed');
    elements.diskTotal = document.getElementById('diskTotal');
    elements.diskPercent = document.getElementById('diskPercent');
    elements.diskGauge = document.getElementById('diskGauge');
    elements.diskGaugeFill = document.getElementById('diskGaugeFill');
    elements.diskGaugeValue = document.getElementById('diskGaugeValue');
    elements.diskStatus = document.getElementById('diskStatus');
    elements.diskChart = document.getElementById('diskChart');

    // 在线用户
    elements.onlineCount = document.getElementById('onlineCount');
    elements.onlineUsersList = document.getElementById('onlineUsersList');

    // 系统信息
    elements.serverName = document.getElementById('serverName');
    elements.serverVersion = document.getElementById('serverVersion');
    elements.serverUptime = document.getElementById('serverUptime');
    elements.currentTime = document.getElementById('currentTime');
    elements.osInfo = document.getElementById('osInfo');
    elements.localIP = document.getElementById('localIP');
    elements.totalFiles = document.getElementById('totalFiles');

    // 用户管理
    elements.usersTableBody = document.getElementById('usersTableBody');
    elements.addUserBtn = document.getElementById('addUserBtn');

    // 视频管理
    elements.videoGrid = document.getElementById('videoGrid');
    elements.videoTotalCount = document.getElementById('videoTotalCount');
    elements.videoTotalSize = document.getElementById('videoTotalSize');
    elements.videoTodayCount = document.getElementById('videoTodayCount');
    elements.uploadVideoBtn = document.getElementById('uploadVideoBtn');
    elements.refreshVideosBtn = document.getElementById('refreshVideosBtn');
    elements.scanUploadsBtn = document.getElementById('scanUploadsBtn');

    // 文件管理
    elements.filesTableBody = document.getElementById('filesTableBody');
    elements.totalFilesCount = document.getElementById('totalFilesCount');
    elements.totalVideosCount = document.getElementById('totalVideosCount');
    elements.totalStorageSize = document.getElementById('totalStorageSize');
    elements.storageUsagePercent = document.getElementById('storageUsagePercent');
    elements.uploadFileBtn = document.getElementById('uploadFileBtn');
    elements.cleanupFilesBtn = document.getElementById('cleanupFilesBtn');

    // 系统设置
    elements.serverPort = document.getElementById('serverPort');
    elements.uploadLimit = document.getElementById('uploadLimit');
    elements.sessionTimeout = document.getElementById('sessionTimeout');
    elements.enableCaptcha = document.getElementById('enableCaptcha');
    elements.saveSettingsBtn = document.getElementById('saveSettingsBtn');

    // 系统日志
    elements.logContainer = document.getElementById('logContainer');
    elements.logLevel = document.getElementById('logLevel');
    elements.refreshLogsBtn = document.getElementById('refreshLogsBtn');

    // 用户模态框
    elements.userModal = document.getElementById('userModal');
    elements.userModalTitle = document.getElementById('userModalTitle');
    elements.closeUserModal = document.getElementById('closeUserModal');
    elements.cancelUserBtn = document.getElementById('cancelUserBtn');
    elements.saveUserBtn = document.getElementById('saveUserBtn');
    elements.userForm = document.getElementById('userForm');
    elements.editUserId = document.getElementById('editUserId');
    elements.newUsername = document.getElementById('newUsername');
    elements.newDisplayName = document.getElementById('newDisplayName');
    elements.newEmail = document.getElementById('newEmail');
    elements.newPassword = document.getElementById('newPassword');
    elements.newRole = document.getElementById('newRole');

    // 上传模态框
    elements.uploadModal = document.getElementById('uploadModal');
    elements.closeUploadModal = document.getElementById('closeUploadModal');
    elements.uploadDropzone = document.getElementById('uploadDropzone');
    elements.fileInput = document.getElementById('fileInput');
    elements.uploadProgress = document.getElementById('uploadProgress');
    elements.uploadProgressBar = document.getElementById('uploadProgressBar');
    elements.uploadProgressText = document.getElementById('uploadProgressText');

    // 本地视频添加模态框
    elements.localVideoModal = document.getElementById('localVideoModal');
    elements.closeLocalVideoModal = document.getElementById('closeLocalVideoModal');
    elements.saveLocalVideoBtn = document.getElementById('saveLocalVideoBtn');
    elements.localVideoStatus = document.getElementById('localVideoStatus');
    
    // 单个文件选择
    elements.singleVideoDropzone = document.getElementById('singleVideoDropzone');
    elements.singleVideoInput = document.getElementById('singleVideoInput');
    elements.localVideoName = document.getElementById('localVideoName');
    elements.localVideoDescription = document.getElementById('localVideoDescription');
    
    // 批量选择
    elements.batchVideoDropzone = document.getElementById('batchVideoDropzone');
    elements.batchVideoInput = document.getElementById('batchVideoInput');
    elements.selectedFilesList = document.getElementById('selectedFilesList');
    elements.selectedCount = document.getElementById('selectedCount');
    elements.clearSelectedBtn = document.getElementById('clearSelectedBtn');
    elements.batchNamePrefix = document.getElementById('batchNamePrefix');
    elements.batchDescription = document.getElementById('batchDescription');
    
    // 文件夹扫描
    elements.folderDropzone = document.getElementById('folderDropzone');
    elements.folderInput = document.getElementById('folderInput');
    elements.folderPreview = document.getElementById('folderPreview');
    elements.folderPath = document.getElementById('folderPath');
    elements.foundVideos = document.getElementById('foundVideos');
    elements.estimatedSize = document.getElementById('estimatedSize');
    elements.recursiveScan = document.getElementById('recursiveScan');
    elements.videoListPreview = document.getElementById('videoListPreview');
    elements.cancelLocalVideoBtn = document.getElementById('cancelLocalVideoBtn');

    // 批量添加模态框
    elements.batchAddModal = document.getElementById('batchAddModal');
    elements.closeBatchAddModal = document.getElementById('closeBatchAddModal');
    elements.batchFileList = document.getElementById('batchFileList');
    elements.batchAddProgress = document.getElementById('batchAddProgress');
    elements.batchAddProgressBar = document.getElementById('batchAddProgressBar');
    elements.batchAddProgressText = document.getElementById('batchAddProgressText');
    elements.clearBatchListBtn = document.getElementById('clearBatchListBtn');
    elements.startBatchAddBtn = document.getElementById('startBatchAddBtn');

    // 文件夹扫描模态框
    elements.folderScanModal = document.getElementById('folderScanModal');
    elements.closeFolderScanModal = document.getElementById('closeFolderScanModal');
    elements.scanFolderPath = document.getElementById('scanFolderPath');
    elements.scanFolderInput = document.getElementById('scanFolderInput');
    elements.scanExtensions = document.getElementById('scanExtensions');
    elements.scanRecursively = document.getElementById('scanRecursively');
    elements.scanStatus = document.getElementById('scanStatus');
    elements.scanResults = document.getElementById('scanResults');
    elements.startScanBtn = document.getElementById('startScanBtn');

    elements.logoutBtn = document.getElementById('logoutBtn');
}

/**
 * 绑定登录相关事件
 */
function bindLoginEvents() {
    const loginForm = document.getElementById('adminLoginForm');
    const loginBtn = document.getElementById('adminLoginBtn');
    const captchaImg = document.getElementById('adminCaptchaImg');

    if (loginForm) {
        // 阻止表单默认提交行为
        loginForm.onsubmit = function() { return false; };
    }

    // 验证码图片点击
    if (captchaImg) {
        captchaImg.style.cursor = 'pointer';
        captchaImg.onclick = refreshCaptcha;
    }

    // 登录按钮点击事件
    if (loginBtn) {
        loginBtn.onclick = handleAdminLoginClick;
    }

    // 输入框回车登录
    const usernameInput = document.getElementById('adminUsername');
    const passwordInput = document.getElementById('adminPassword');

    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                passwordInput ? passwordInput.focus() : handleAdminLoginClick();
            }
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleAdminLoginClick();
            }
        });
    }
}

/**
 * 自动填充保存的用户名和密码
 */
function autoFillCredentials() {
    const savedUsername = localStorage.getItem('rememberUsername');
    const savedPassword = localStorage.getItem('rememberPassword');
    const savedRemember = localStorage.getItem('rememberMe');

    console.log('[Admin] autoFillCredentials 执行:', {
        savedRemember: savedRemember,
        savedUsername: savedUsername ? savedUsername.substring(0, 3) + '...' : null,
        hasPassword: !!savedPassword
    });

    if (savedRemember === 'true' && savedUsername) {
        const usernameInput = document.getElementById('adminUsername');
        const passwordInput = document.getElementById('adminPassword');
        const rememberInput = document.getElementById('adminRemember');

        if (usernameInput) {
            usernameInput.value = savedUsername || '';
            // 触发input事件更新has-content类状态
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (passwordInput && savedPassword) {
            passwordInput.value = savedPassword;
            // 触发input事件更新has-content类状态
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (rememberInput) rememberInput.checked = true;

        console.log('[Admin] 已自动填充保存的用户名和密码');
    } else {
        console.log('[Admin] 没有保存的凭据或未勾选记住我，不填充');
    }
}

/**
 * 检查认证状态并显示管理界面
 */
async function checkAuthAndShowAdmin() {
    // 防止重复检查
    if (authCheckCompleted) {
        return;
    }

    // 如果authManager已完成用户加载且是管理员或超级管理员，直接使用
    if (window.authManager && window.authManager.user) {
        if (window.authManager.user.role === 'admin' || window.authManager.user.role === 'superadmin') {
            currentUser = window.authManager.user;
            showAdminInterface();
            authCheckCompleted = true;
        } else {
            showLoginRequired('您没有管理员权限');
        }
        return;
    }

    authCheckCompleted = true;

    try {
        const response = await api.getCurrentUser();

        // 处理未登录状态（401错误）
        if (!response.success) {
            if (response.needLogin || response.code === 'UNAUTHORIZED' || response.error === '未认证') {
                showLoginForm();
                return;
            }
            // 其他错误也显示登录表单
            showLoginForm();
            return;
        }

        if (response.data && response.data.user) {
            currentUser = response.data.user;

            if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin') {
                showLoginRequired('您没有管理员权限');
                return;
            }

            showAdminInterface();
        } else {
            showLoginForm();
        }
    } catch (error) {
        console.error('检查认证状态失败:', error);
        showLoginForm();
    }
}

/**
 * 显示登录表单
 */
function showLoginForm() {
    const loginOverlay = document.getElementById('adminLoginOverlay');
    const appContainer = document.getElementById('adminAppContainer');

    if (loginOverlay) {
        loginOverlay.classList.remove('hidden');
        loginOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #f5f9fc 0%, #e8f1f8 50%, #dce9f3 100%); display: flex; align-items: center; justify-content: center; z-index: 9999;';
    }

    if (appContainer) {
        appContainer.style.display = 'none';
    }

    // 标记登录遮罩层已显示
    loginOverlayFirstShown = true;

    // 如果选择了记住我且有保存的凭据，填充用户名和密码
    // 这个逻辑在每次显示登录表单时都会执行（登录后、退出后等）
    const savedRemember = localStorage.getItem('rememberMe');
    const savedUsername = localStorage.getItem('rememberUsername');
    const savedPassword = localStorage.getItem('rememberPassword');

    setTimeout(() => {
        const usernameInput = document.getElementById('adminUsername');
        const passwordInput = document.getElementById('adminPassword');
        const rememberInput = document.getElementById('adminRemember');

        if (savedRemember === 'true' && savedUsername && usernameInput) {
            usernameInput.value = savedUsername;
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));

            if (passwordInput && savedPassword) {
                passwordInput.value = savedPassword;
                passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            if (rememberInput) rememberInput.checked = true;
            console.log('[Admin] 已自动填充保存的用户名和密码:', savedUsername);
        }
    }, 50);

    console.log('[Admin] 显示登录表单');
}

/**
 * 显示管理员权限不足
 */
function showLoginRequired(message) {
    if (elements.loginError) {
        elements.loginError.textContent = message;
        elements.loginError.style.display = 'block';
    }

    const loginOverlay = document.getElementById('adminLoginOverlay');
    const appContainer = document.getElementById('adminAppContainer');

    if (loginOverlay) {
        loginOverlay.classList.remove('hidden');
    }
    if (appContainer) {
        appContainer.style.display = 'none';
    }

    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
}

/**
 * 显示管理界面
 */
function showAdminInterface() {
    console.log('[Admin] showAdminInterface() 被调用');
    const loginOverlay = document.getElementById('adminLoginOverlay');
    const appContainer = document.getElementById('adminAppContainer');

    if (loginOverlay) {
        // 使用内联样式完全控制显示
        loginOverlay.style.cssText = 'display: none !important;';
        console.log('[Admin] 隐藏登录遮罩层');
    }
    if (appContainer) {
        appContainer.style.display = 'flex';
        console.log('[Admin] 显示管理界面');
    }

    bindEvents();

    // 初始化服务器管理为active状态
    navigateToPage('server');

    loadUserInfo();

    console.log('[Admin] 开始加载数据...');

    // 立即并行加载必要的数据
    loadSystemOverview();

    // 系统状态使用防抖加载，避免初始加载拥堵
    setTimeout(() => {
        loadSystemStatus().catch(err => console.warn('[Admin] 初始状态加载失败:', err.message));
    }, 1000);

    // 立即刷新在线用户列表（登录后当前用户应该被计入）
    loadOnlineUsers();

    // 渐进式延迟加载（使用请求队列控制器）
    const loadQueue = {
        pending: new Map(),
        maxConcurrent: 2, // 最大并发数，避免过多请求同时进行
        activeCount: 0,

        // 添加请求到队列
        async add(name, fn, timeout = 15000) {
            // 等待直到有可用槽位
            while (this.activeCount >= this.maxConcurrent) {
                await this.wait(200);
            }

            this.activeCount++;

            // 设置超时
            const timeoutId = setTimeout(() => {
                if (this.pending.has(name)) {
                    console.warn(`[Performance] 请求超时已取消: ${name}`);
                    this.pending.delete(name);
                }
            }, timeout);

            this.pending.set(name, timeoutId);

            try {
                await fn();
                console.log(`[Performance] 完成: ${name}`);
            } catch (error) {
                console.error(`[Performance] 失败: ${name}`, error.message);
            } finally {
                clearTimeout(timeoutId);
                this.pending.delete(name);
                this.activeCount--;
            }
        },

        wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        // 取消所有待处理请求（页面切换时使用）
        cancelAll() {
            this.pending.forEach((timeoutId, name) => {
                clearTimeout(timeoutId);
                console.log(`[Performance] 已取消: ${name}`);
            });
            this.pending.clear();
        }
    };

    // 使用请求队列渐进式加载
    // 延迟更分散，给每个请求足够时间完成
    loadQueue.add('用户列表', () => loadUsers(), 20000).catch(() => {});
    loadQueue.add('视频列表', () => loadVideos(), 20000).catch(() => {});
    loadQueue.add('文件统计', () => loadFileStats(), 20000).catch(() => {});
    loadQueue.add('系统设置', () => loadSettings(), 20000).catch(() => {});
    loadQueue.add('系统日志', () => loadLogs(), 20000).catch(() => {});

    // 初始化图表
    initCharts();

    // 启动实时状态更新（优化至每秒2.5次，保证流畅度）
    statusInterval = setInterval(() => {
        // 页面可见时才更新
        if (!document.hidden && document.visibilityState === 'visible') {
            // 使用单例模式防止重复请求
            if (!loadSystemStatus.running) {
                loadSystemStatus()
                    .catch(err => console.warn('[Admin] 状态更新失败:', err.message));
            }
        }
    }, 400); // 每400ms刷新一次（每秒2.5次）

    // 建立 WebSocket 连接并通知用户在线（带超时保护）
    setTimeout(() => {
        try {
            connectWebSocket();
        } catch (error) {
            console.error('[Admin] WebSocket连接失败:', error);
        }
    }, 2000); // 延迟2秒建立WebSocket，让其他请求先完成
}

/**
 * 建立 WebSocket 连接
 * 用于实时在线用户统计
 * 优化版本：添加超时保护和连接状态监控
 */
function connectWebSocket() {
    // 避免重复连接
    if (socket && socketConnected) {
        console.log('[WebSocket] 连接已存在，跳过重复连接');
        return;
    }

    // 检查 Socket.IO 是否已加载
    if (typeof io === 'undefined') {
        console.warn('[WebSocket] Socket.IO 未加载，跳过连接');
        return;
    }

    // 如果有旧连接，先断开
    if (socket) {
        try {
            socket.disconnect();
        } catch (e) {
            // 忽略断开错误
        }
        socket = null;
    }

    try {
        // 建立 WebSocket 连接（优化重连策略）
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 3,  // 减少重试次数
            reconnectionDelay: 2000,  // 增加重试间隔
            reconnectionDelayMax: 5000,
            timeout: 10000,  // 连接超时10秒
            autoConnect: true
        });

        // 连接超时保护
        const connectionTimeout = setTimeout(() => {
            if (!socketConnected) {
                console.warn('[WebSocket] 连接超时，尝试断开');
                try {
                    socket.disconnect();
                } catch (e) {}
                socketConnected = false;
            }
        }, 10000);

        socket.on('connect', () => {
            clearTimeout(connectionTimeout);
            console.log('[WebSocket] 连接已建立:', socket.id);
            socketConnected = true;

            // 如果有当前用户，发送登录事件
            if (currentUser && currentUser.id && currentUser.username) {
                socket.emit('user:login', {
                    userId: currentUser.id,
                    username: currentUser.username
                });
                console.log('[WebSocket] 已发送用户登录事件:', currentUser.username);

                // 等待用户登录确认后再订阅管理员通知
                socket.once('user:login:ack', () => {
                    socket.emit('subscribe:admin');
                    console.log('[WebSocket] 已订阅管理员通知');
                });

                // 设置超时，防止登录确认事件丢失
                setTimeout(() => {
                    if (socket && socket.connected) {
                        socket.emit('subscribe:admin');
                    }
                }, 1000);
            } else {
                socket.emit('subscribe:stats');
            }
        });

        socket.on('disconnect', (reason) => {
            clearTimeout(connectionTimeout);
            console.log('[WebSocket] 连接断开:', reason);
            socketConnected = false;

            // 如果是非主动断开的，尝试重连（由Socket.IO自动处理）
            if (reason !== 'io client disconnect') {
                console.log('[WebSocket] 等待自动重连...');
            }
        });

        socket.on('connect_error', (error) => {
            clearTimeout(connectionTimeout);
            console.warn('[WebSocket] 连接错误:', error.message);
        });

        // 处理账户被禁用事件（管理员自己被禁用）
        socket.on('user:blocked', (data) => {
            console.warn('[WebSocket] 账户被禁用:', data);
            disconnectWebSocket();

            // 清除本地登录状态
            localStorage.removeItem('adminAccessToken');
            localStorage.removeItem('adminRefreshToken');
            currentUser = null;

            // 显示提示并跳转登录页
            alert(data?.message || '账户已被禁用，请联系管理员');
            window.location.href = '/admin.html';
        });

        // 监听用户上线事件（实时更新在线用户数）
        socket.on('user:online', (data) => {
            console.log('[WebSocket] 用户上线:', data);
            const onlineCountEl = document.getElementById('onlineCount');
            if (onlineCountEl) {
                onlineCountEl.textContent = data.count || 0;
            }
            // 刷新在线用户列表
            loadOnlineUsers();
        });

        // 监听用户下线事件
        socket.on('user:offline', (data) => {
            console.log('[WebSocket] 用户下线:', data);
            const onlineCountEl = document.getElementById('onlineCount');
            if (onlineCountEl) {
                onlineCountEl.textContent = data.count || 0;
            }
            // 刷新在线用户列表
            loadOnlineUsers();
        });

        // 监听用户状态变化事件（刷新用户管理列表）
        socket.on('user:updated', (data) => {
            console.log('[WebSocket] 用户状态已更新:', data);
            // 清除用户列表缓存并强制刷新
            pageCache.users.timestamp = 0;
            loadUsers(true);
        });

        // 监听用户删除事件（彻底删除后刷新列表）
        socket.on('user:deleted', (data) => {
            console.log('[WebSocket] 用户已删除:', data);
            // 清除用户列表缓存并强制刷新
            pageCache.users.timestamp = 0;
            loadUsers(true);
            showToast(`用户 ${data.username} 已被删除`, 'info');
        });

        console.log('[WebSocket] 正在建立连接...');
    } catch (error) {
        console.error('[WebSocket] 建立连接失败:', error);
    }
}

/**
 * 断开 WebSocket 连接
 */
function disconnectWebSocket() {
    if (socket) {
        // 发送用户下线事件
        if (currentUser && currentUser.id) {
            socket.emit('user:logout', {
                userId: currentUser.id,
                username: currentUser.username
            });
        }

        socket.disconnect();
        socket = null;
        socketConnected = false;
        console.log('[WebSocket] 连接已断开');
    }
}

/**
 * 处理管理员登录按钮点击
 */
function handleAdminLoginClick() {
    const usernameInput = document.getElementById('adminUsername');
    const passwordInput = document.getElementById('adminPassword');
    const captchaInput = document.getElementById('adminCaptcha');
    const rememberInput = document.getElementById('adminRemember');

    if (!usernameInput || !passwordInput) {
        showLoginError('页面加载中，请稍候...');
        return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const captcha = captchaInput ? captchaInput.value.trim() : '';
    const remember = rememberInput ? rememberInput.checked : false;

    if (!username) {
        showLoginError('请输入用户名');
        usernameInput.focus();
        return;
    }

    if (!password) {
        showLoginError('请输入密码');
        passwordInput.focus();
        return;
    }

    // 禁用按钮 - 使用class控制状态，避免innerHTML重绘
    const loginBtn = document.getElementById('adminLoginBtn');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.classList.add('loading');
        const btnText = loginBtn.querySelector('span');
        if (btnText) btnText.textContent = '登录中...';
    }

    hideLoginError();

    // 调用登录API
    api.login(username, password, captcha || undefined)
        .then(response => {
            if (response.success) {
                const user = response.data.user;

                if (user.role !== 'admin' && user.role !== 'superadmin') {
                    showLoginError('您没有管理员权限');
                    restoreLoginButton();
                    return;
                }

                // 如果选择了"记住我"，保存用户名和密码
                if (remember) {
                    console.log('[Admin] 登录成功，保存用户名和密码:', {
                        username: username,
                        remember: remember
                    });
                    localStorage.setItem('rememberUsername', username);
                    localStorage.setItem('rememberPassword', password);
                    localStorage.setItem('rememberMe', 'true');
                } else {
                    // 清除已保存的账号密码
                    localStorage.removeItem('rememberUsername');
                    localStorage.removeItem('rememberPassword');
                    localStorage.removeItem('rememberMe');
                }

                showAdminInterface();
                showToast('登录成功，欢迎回来！', 'success');
            } else {
                showLoginError(response.error || '用户名或密码错误');
                // 刷新验证码（如果显示）
                const captchaGroup = document.getElementById('captchaGroup');
                if (captchaGroup && captchaGroup.style.display !== 'none') {
                    refreshCaptcha();
                }
                restoreLoginButton();
            }
        })
        .catch(error => {
            console.error('登录错误:', error);
            showLoginError('登录失败，请检查网络连接或服务器状态');
            restoreLoginButton();
        });
}

/**
 * 恢复登录按钮状态
 */
function restoreLoginButton() {
    const loginBtn = document.getElementById('adminLoginBtn');
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.classList.remove('loading');
        const btnText = loginBtn.querySelector('span');
        if (btnText) btnText.textContent = '登录管理后台';
    }
}

/**
 * 刷新验证码
 */
function refreshCaptcha() {
    const captchaImg = document.getElementById('adminCaptchaImg');
    if (captchaImg) {
        captchaImg.src = `/api/v1/auth/captcha?t=${Date.now()}`;
    }
}

/**
 * 显示登录错误
 */
function showLoginError(message) {
    const loginError = document.getElementById('adminLoginError');
    if (loginError) {
        loginError.textContent = message;
        loginError.style.display = 'block';
    }
}

/**
 * 隐藏登录错误
 */
function hideLoginError() {
    const loginError = document.getElementById('adminLoginError');
    if (loginError) {
        loginError.style.display = 'none';
    }
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 页面导航
    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(item.dataset.page);
        });
    });

    // 添加用户按钮
    if (elements.addUserBtn) {
        elements.addUserBtn.addEventListener('click', () => openUserModal());
    }

    // 用户模态框事件
    if (elements.closeUserModal) {
        elements.closeUserModal.addEventListener('click', closeUserModal);
    }
    if (elements.cancelUserBtn) {
        elements.cancelUserBtn.addEventListener('click', closeUserModal);
    }
    if (elements.saveUserBtn) {
        elements.saveUserBtn.addEventListener('click', saveUser);
    }
    if (elements.userModal) {
        elements.userModal.addEventListener('click', (e) => {
            if (e.target === elements.userModal) closeUserModal();
        });
    }

    // 用户表单回车提交
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveUser();
            }
        });
    }

    // 密码输入实时验证
    const newPasswordInput = document.getElementById('newPassword');
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', validatePasswordRequirements);
    }

    // 用户筛选器事件
    const statusFilter = document.getElementById('userStatusFilter');
    const roleFilter = document.getElementById('userRoleFilter');
    const searchInput = document.getElementById('userSearchInput');

    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            pageCache.users.timestamp = 0; // 清除缓存
            loadUsers(true);
        });
    }

    if (roleFilter) {
        roleFilter.addEventListener('change', () => {
            pageCache.users.timestamp = 0; // 清除缓存
            loadUsers(true);
        });
    }

    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                pageCache.users.timestamp = 0; // 清除缓存
                loadUsers(true);
            }, 300); // 300ms防抖
        });
    }

    // 视频管理按钮
    const addLocalVideoBtn = document.getElementById('addLocalVideoBtn');
    if (addLocalVideoBtn) {
        addLocalVideoBtn.addEventListener('click', () => openLocalVideoModal());
    }
    if (elements.uploadVideoBtn) {
        elements.uploadVideoBtn.addEventListener('click', () => openUploadModal('video'));
    }
    if (elements.refreshVideosBtn) {
        elements.refreshVideosBtn.addEventListener('click', () => {
            pageCache.videos.timestamp = 0; // 清除缓存
            loadVideos();
        });
    }
    
    // 扫描uploads文件夹按钮 - 使用事件委托支持多个按钮
    document.addEventListener('click', function(e) {
        if (e.target.closest('#scanUploadsBtn')) {
            scanUploadsFolder();
        }
    });

    // 文件管理按钮
    if (elements.uploadFileBtn) {
        elements.uploadFileBtn.addEventListener('click', () => openUploadModal('file'));
    }
    if (elements.cleanupFilesBtn) {
        elements.cleanupFilesBtn.addEventListener('click', cleanupFiles);
    }

    // 保存设置
    if (elements.saveSettingsBtn) {
        elements.saveSettingsBtn.addEventListener('click', saveSettings);
    }

    // 刷新日志
    if (elements.refreshLogsBtn) {
        elements.refreshLogsBtn.addEventListener('click', () => {
            pageCache.logs.timestamp = 0; // 清除缓存
            loadLogs();
        });
    }
    if (elements.logLevel) {
        elements.logLevel.addEventListener('change', () => {
            pageCache.logs.timestamp = 0; // 清除缓存
            loadLogs();
        });
    }

    // 退出登录
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', handleLogout);
    }

    // 上传模态框事件
    if (elements.closeUploadModal) {
        elements.closeUploadModal.addEventListener('click', closeUploadModal);
    }
    if (elements.uploadModal) {
        elements.uploadModal.addEventListener('click', (e) => {
            if (e.target === elements.uploadModal) closeUploadModal();
        });
    }
    if (elements.uploadDropzone) {
        elements.uploadDropzone.addEventListener('click', () => {
            if (elements.fileInput) {
                elements.fileInput.click();
            }
        });
        elements.uploadDropzone.addEventListener('dragover', handleDragOver);
        elements.uploadDropzone.addEventListener('dragleave', handleDragLeave);
        elements.uploadDropzone.addEventListener('drop', handleDrop);
    }
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', handleFileSelect);
    }

    // 上传完成后的操作按钮
    const openFolderBtn = document.getElementById('openFolderBtn');
    const closeUploadDoneBtn = document.getElementById('closeUploadDoneBtn');
    
    if (openFolderBtn) {
        openFolderBtn.addEventListener('click', () => {
            // 打开文件管理页面
            navigateToPage('files');
            // 关闭上传模态框
            closeUploadModal();
            // 刷新文件列表
            pageCache.files.timestamp = 0;
            loadFileStats(true);
        });
    }
    
    if (closeUploadDoneBtn) {
        closeUploadDoneBtn.addEventListener('click', () => {
            closeUploadModal();
            // 刷新数据
            pageCache.files.timestamp = 0;
            pageCache.videos.timestamp = 0;
            loadFileStats(true);
            loadVideos(true);
        });
    }

    // 视频播放器模态框事件
    const closeVideoPlayerModal = document.getElementById('closeVideoPlayerModal');
    const videoPlayerModal = document.getElementById('videoPlayerModal');

    if (closeVideoPlayerModal) {
        closeVideoPlayerModal.addEventListener('click', closeVideoPlayer);
    }
    if (videoPlayerModal) {
        videoPlayerModal.addEventListener('click', (e) => {
            if (e.target === videoPlayerModal) closeVideoPlayer();
        });
    }

    // ESC键关闭视频播放器
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && videoPlayerModal && videoPlayerModal.classList.contains('show')) {
            closeVideoPlayer();
        }
    });

    // 侧边栏菜单切换
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // 点击主内容区关闭侧边栏（移动端）
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
        });
    }

    // ==================== 本地视频模态框事件绑定 ====================
    
    // 模态框关闭和取消按钮
    if (elements.closeLocalVideoModal) {
        elements.closeLocalVideoModal.addEventListener('click', closeLocalVideoModal);
    }
    if (elements.cancelLocalVideoBtn) {
        elements.cancelLocalVideoBtn.addEventListener('click', closeLocalVideoModal);
    }
    if (elements.localVideoModal) {
        elements.localVideoModal.addEventListener('click', (e) => {
            if (e.target === elements.localVideoModal) closeLocalVideoModal();
        });
    }
    
    // 保存按钮
    if (elements.saveLocalVideoBtn) {
        elements.saveLocalVideoBtn.addEventListener('click', saveLocalVideo);
    }

    // 打开文件夹按钮
    const openVideoFolderBtn = document.getElementById('openVideoFolderBtn');
    if (openVideoFolderBtn) {
        openVideoFolderBtn.addEventListener('click', () => {
            // 切换到视频管理页面
            navigateToPage('videos');
            // 关闭模态框
            closeLocalVideoModal();
            // 刷新视频列表
            pageCache.videos.timestamp = 0;
            loadVideos(true);
        });
    }

    // 浏览按钮 - 打开文件选择器
    const browsePathBtn = document.getElementById('browsePathBtn');
    const localVideoFileInput = document.getElementById('localVideoFileInput');
    if (browsePathBtn && localVideoFileInput) {
        browsePathBtn.addEventListener('click', () => {
            localVideoFileInput.click();
        });
    }

    // 隐藏文件输入框的选择事件
    if (localVideoFileInput) {
        localVideoFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const pathInput = document.getElementById('localVideoPath');
                const nameInput = document.getElementById('localVideoName');
                
                // 注意：由于浏览器安全限制，无法获取真实路径
                // 这里使用文件名作为路径
                if (pathInput) {
                    pathInput.value = file.name;
                }
                
                // 自动填充名称
                if (nameInput && !nameInput.value.trim()) {
                    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                    nameInput.value = fileNameWithoutExt;
                }
                
                showToast(`已选择: ${file.name}`, 'info');
            }
            // 清空input，允许重复选择同一文件
            event.target.value = '';
        });
    }

    // 路径输入框事件 - 自动提取文件名
    const localVideoPathInput = document.getElementById('localVideoPath');
    const localVideoNameInput = document.getElementById('localVideoName');
    let nameAutoFilled = false; // 标记名称是否自动填充

    if (localVideoPathInput && localVideoNameInput) {
        // 监听路径输入变化
        localVideoPathInput.addEventListener('input', () => {
            const path = localVideoPathInput.value.trim();
            if (path) {
                // 从路径中提取文件名（去掉扩展名）
                const fileName = extractFileName(path);
                if (fileName && !localVideoNameInput.value.trim()) {
                    // 只有当名称输入框为空时才自动填充
                    localVideoNameInput.value = fileName;
                    nameAutoFilled = true;
                } else if (fileName && nameAutoFilled) {
                    // 如果路径改变且之前是自动填充的，更新名称
                    localVideoNameInput.value = fileName;
                }
                // 更新按钮状态（输入路径后启用按钮）
                updateSaveButtonState();
            }
        });

        // 监听名称手动修改，标记为非自动填充
        localVideoNameInput.addEventListener('input', () => {
            if (nameAutoFilled && localVideoNameInput.value.trim()) {
                nameAutoFilled = false; // 用户手动修改了名称
            }
        });

        // 路径框获得焦点时，如果之前是自动填充的且路径变化，重新提取
        localVideoPathInput.addEventListener('focus', () => {
            const path = localVideoPathInput.value.trim();
            if (path && nameAutoFilled) {
                const fileName = extractFileName(path);
                if (fileName) {
                    localVideoNameInput.value = fileName;
                }
            }
        });
    }

    // 标签页切换
    document.querySelectorAll('#localVideoModal .modal-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            currentVideoTab = tabName;
            
            // 更新标签页状态
            document.querySelectorAll('#localVideoModal .modal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 更新内容显示
            document.querySelectorAll('#localVideoModal .tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const targetContent = document.getElementById(`tab-${tabName}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            // 更新按钮状态
            updateSaveButtonState();
        });
    });
    
    // ==================== 单个文件选择事件 ====================
    
    if (elements.singleVideoDropzone && elements.singleVideoInput) {
        // 点击打开文件选择
        elements.singleVideoDropzone.addEventListener('click', () => {
            elements.singleVideoInput.click();
        });
        
        // 拖拽事件
        elements.singleVideoDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.singleVideoDropzone.classList.add('dragover');
        });
        elements.singleVideoDropzone.addEventListener('dragleave', () => {
            elements.singleVideoDropzone.classList.remove('dragover');
        });
        elements.singleVideoDropzone.addEventListener('drop', handleSingleVideoDrop);
    }
    
    if (elements.singleVideoInput) {
        elements.singleVideoInput.addEventListener('change', handleSingleVideoSelect);
    }
    
    // 清空按钮
    if (elements.clearSelectedBtn) {
        elements.clearSelectedBtn.addEventListener('click', clearSelectedVideos);
    }
    
    // ==================== 批量选择事件 ====================
    
    if (elements.batchVideoDropzone && elements.batchVideoInput) {
        // 点击打开文件选择
        elements.batchVideoDropzone.addEventListener('click', () => {
            elements.batchVideoInput.click();
        });
        
        // 拖拽事件
        elements.batchVideoDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.batchVideoDropzone.classList.add('dragover');
        });
        elements.batchVideoDropzone.addEventListener('dragleave', () => {
            elements.batchVideoDropzone.classList.remove('dragover');
        });
        elements.batchVideoDropzone.addEventListener('drop', handleBatchVideoDrop);
    }
    
    if (elements.batchVideoInput) {
        elements.batchVideoInput.addEventListener('change', handleBatchVideoSelect);
    }
    
    // ==================== 文件夹扫描事件 ====================
    
    if (elements.folderDropzone && elements.folderInput) {
        // 点击打开文件夹选择
        elements.folderDropzone.addEventListener('click', () => {
            elements.folderInput.click();
        });
        
        // 拖拽事件
        elements.folderDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.folderDropzone.classList.add('dragover');
        });
        elements.folderDropzone.addEventListener('dragleave', () => {
            elements.folderDropzone.classList.remove('dragover');
        });
        elements.folderDropzone.addEventListener('drop', handleFolderVideoDrop);
    }
    
    if (elements.folderInput) {
        elements.folderInput.addEventListener('change', handleFolderVideoSelect);
    }

    // 批量添加模态框事件
    if (elements.closeBatchAddModal) {
        elements.closeBatchAddModal.addEventListener('click', closeBatchAddModal);
    }
    if (elements.batchAddModal) {
        elements.batchAddModal.addEventListener('click', (e) => {
            if (e.target === elements.batchAddModal) closeBatchAddModal();
        });
    }
    if (elements.clearBatchListBtn) {
        elements.clearBatchListBtn.addEventListener('click', clearBatchFileList);
    }
    if (elements.startBatchAddBtn) {
        elements.startBatchAddBtn.addEventListener('click', startBatchAddVideos);
    }

    // 文件夹扫描模态框事件
    if (elements.closeFolderScanModal) {
        elements.closeFolderScanModal.addEventListener('click', closeFolderScanModal);
    }
    if (elements.folderScanModal) {
        elements.folderScanModal.addEventListener('click', (e) => {
            if (e.target === elements.folderScanModal) closeFolderScanModal();
        });
    }
    if (elements.scanFolderInput) {
        elements.scanFolderInput.addEventListener('change', handleFolderScanInput);
    }
    if (elements.startScanBtn) {
        elements.startScanBtn.addEventListener('click', startFolderScan);
    }

    // 模态框标签页切换事件
    document.querySelectorAll('.modal-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            const tabName = btn.dataset.tab;

            // 更新标签页状态
            modal.querySelectorAll('.modal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 更新内容显示
            modal.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const targetContent = document.getElementById(`tab-${tabName}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // 本地文件模态框事件
    const closeLocalFileModal = document.getElementById('closeLocalFileModal');
    const localFileModal = document.getElementById('localFileModal');
    const cancelLocalFileBtn = document.getElementById('cancelLocalFileBtn');
    const saveLocalFileBtn = document.getElementById('saveLocalFileBtn');
    const clearFileSelectedBtn = document.getElementById('clearFileSelectedBtn');
    const singleFileDropzone = document.getElementById('singleFileDropzone');
    const batchFileDropzone = document.getElementById('batchFileDropzone');
    const fileFolderDropzone = document.getElementById('fileFolderDropzone');
    const singleFileInput = document.getElementById('singleFileInput');
    const batchFileInput = document.getElementById('batchFileInput');
    const fileFolderInput = document.getElementById('fileFolderInput');

    if (closeLocalFileModal) {
        closeLocalFileModal.addEventListener('click', closeLocalFileModalFunc);
    }
    if (localFileModal) {
        localFileModal.addEventListener('click', (e) => {
            if (e.target === localFileModal) closeLocalFileModalFunc();
        });
    }
    if (cancelLocalFileBtn) {
        cancelLocalFileBtn.addEventListener('click', closeLocalFileModalFunc);
    }

    // 文件路径输入事件 - 自动提取文件名
    const localFilePathInput = document.getElementById('localFilePath');
    const localFileNameInput = document.getElementById('localFileName');
    let fileNameAutoFilled = false;

    if (localFilePathInput && localFileNameInput) {
        // 监听路径输入变化
        localFilePathInput.addEventListener('input', () => {
            const path = localFilePathInput.value.trim();
            if (path) {
                const fileName = extractFileName(path);
                if (fileName && !localFileNameInput.value.trim()) {
                    localFileNameInput.value = fileName;
                    fileNameAutoFilled = true;
                } else if (fileName && fileNameAutoFilled) {
                    localFileNameInput.value = fileName;
                }
            }
        });

        // 监听名称手动修改
        localFileNameInput.addEventListener('input', () => {
            if (fileNameAutoFilled && localFileNameInput.value.trim()) {
                fileNameAutoFilled = false;
            }
        });
    }

    // 路径输入框获得焦点时更新名称
    if (localFilePathInput) {
        localFilePathInput.addEventListener('focus', () => {
            const path = localFilePathInput.value.trim();
            if (path && fileNameAutoFilled) {
                const fileName = extractFileName(path);
                if (fileName) {
                    localFileNameInput.value = fileName;
                }
            }
        });
    }

    if (saveLocalFileBtn) {
        saveLocalFileBtn.addEventListener('click', saveLocalFile);
    }

    // 打开文件夹按钮
    const openFileFolderBtn = document.getElementById('openFileFolderBtn');
    if (openFileFolderBtn) {
        openFileFolderBtn.addEventListener('click', () => {
            // 切换到文件管理页面
            navigateToPage('files');
            // 关闭模态框
            closeLocalFileModalFunc();
            // 刷新文件列表
            pageCache.files.timestamp = 0;
            loadFileStats(true);
        });
    }

    // 文件浏览按钮 - 打开文件选择器
    const browseFilePathBtn = document.getElementById('browseFilePathBtn');
    const localSingleFileInput = document.getElementById('localSingleFileInput');
    if (browseFilePathBtn && localSingleFileInput) {
        browseFilePathBtn.addEventListener('click', () => {
            localSingleFileInput.click();
        });
    }
    
    // 隐藏文件输入框的选择事件（本地文件）
    if (localSingleFileInput) {
        localSingleFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const pathInput = document.getElementById('localFilePath');
                const nameInput = document.getElementById('localFileName');
                
                if (pathInput) {
                    pathInput.value = file.name;
                }
                
                if (nameInput && !nameInput.value.trim()) {
                    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                    nameInput.value = fileNameWithoutExt;
                }
                
                showToast(`已选择: ${file.name}`, 'info');
            }
            event.target.value = '';
        });
    }
    
    if (clearFileSelectedBtn) {
        clearFileSelectedBtn.addEventListener('click', clearFileSelectedList);
    }

    // 文件拖拽区域事件
    if (singleFileDropzone) {
        singleFileDropzone.addEventListener('click', () => {
            if (singleFileInput) singleFileInput.click();
        });
        singleFileDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            singleFileDropzone.classList.add('dragover');
        });
        singleFileDropzone.addEventListener('dragleave', () => {
            singleFileDropzone.classList.remove('dragover');
        });
        singleFileDropzone.addEventListener('drop', handleFileDrop);
    }

    if (batchFileDropzone) {
        batchFileDropzone.addEventListener('click', () => {
            if (batchFileInput) batchFileInput.click();
        });
        batchFileDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            batchFileDropzone.classList.add('dragover');
        });
        batchFileDropzone.addEventListener('dragleave', () => {
            batchFileDropzone.classList.remove('dragover');
        });
        batchFileDropzone.addEventListener('drop', handleBatchFileDrop);
    }

    if (fileFolderDropzone) {
        fileFolderDropzone.addEventListener('click', () => {
            if (fileFolderInput) fileFolderInput.click();
        });
        fileFolderDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileFolderDropzone.classList.add('dragover');
        });
        fileFolderDropzone.addEventListener('dragleave', () => {
            fileFolderDropzone.classList.remove('dragover');
        });
        fileFolderDropzone.addEventListener('drop', handleFileFolderDrop);
    }

    // 文件选择事件
    if (singleFileInput) {
        singleFileInput.addEventListener('change', handleSingleFileSelect);
    }
    if (batchFileInput) {
        batchFileInput.addEventListener('change', handleBatchFileSelect);
    }
    if (fileFolderInput) {
        fileFolderInput.addEventListener('change', handleFileFolderSelect);
    }
}

/**
 * 页面导航
 */
function navigateToPage(pageName) {
    // 更新导航项状态（active类需要添加到li元素上，而不是a元素上）
    elements.navItems.forEach(item => {
        const isActive = item.dataset.page === pageName;
        const parentLi = item.closest('li');
        if (parentLi) {
            parentLi.classList.toggle('active', isActive);
        }
    });

    // 更新页面内容显示
    elements.pageContents.forEach(content => {
        const isActive = content.id === `page-${pageName}`;
        content.classList.toggle('active', isActive);
    });

    // 更新页面标题
    const pageTitle = document.querySelector('.header-title h1');
    if (pageTitle) {
        const titles = {
            dashboard: '服务器管理',
            videos: '视频管理',
            users: '用户管理',
            files: '文件管理',
            settings: '系统设置',
            logs: '系统日志'
        };
        pageTitle.textContent = titles[pageName] || '服务器管理';
    }

    // 根据页面加载数据
    switch (pageName) {
        case 'dashboard':
            loadSystemStatus();
            break;
        case 'videos':
            loadVideos(true); // 强制刷新
            break;
        case 'users':
            loadUsers(true); // 强制刷新
            break;
        case 'files':
            loadFileStats(true); // 强制刷新
            break;
        case 'settings':
            loadSettings();
            break;
        case 'logs':
            loadLogs(true); // 强制刷新
            break;
    }
}

/**
 * 加载用户信息
 */
function loadUserInfo() {
    if (!currentUser) return;

    const avatar = document.getElementById('headerAvatar');
    const username = document.getElementById('headerUsername');

    if (avatar) {
        avatar.textContent = getInitials(currentUser.display_name || currentUser.username);
        avatar.style.background = getAvatarGradient(currentUser.username);
    }
    if (username) {
        username.textContent = currentUser.display_name || currentUser.username;
    }
}

/**
 * 加载系统概览
 */
async function loadSystemOverview() {
    try {
        const response = await api.getSystemOverview();
        
        if (response.success) {
            const data = response.data;
            
            // 调试日志：显示实际硬件数据
            console.log('[SystemStatus] 硬件数据:', {
                cpu: data.cpu?.usage,
                gpu: data.gpu?.usage,
                memory: data.memory?.percent,
                disk: data.disk?.usedPercent,
                activeConnections: data.activeConnections
            });

            // 更新系统信息显示
            const serverNameEl = document.getElementById('serverName');
            const serverVersionEl = document.getElementById('serverVersion');
            const osInfoEl = document.getElementById('osInfo');
            const localIPEl = document.getElementById('localIP');
            const totalFilesEl = document.getElementById('totalFiles');
            const cpuCoresEl = document.getElementById('cpuCores');

            if (serverNameEl) serverNameEl.textContent = data.server?.name || 'LANStream Pro';
            if (serverVersionEl) serverVersionEl.textContent = data.server?.version || '--';
            if (osInfoEl) osInfoEl.textContent = `${data.network?.platform || '--'} (${data.network?.arch || '--'})`;
            if (localIPEl) localIPEl.textContent = data.network?.localIP || '--';
            if (totalFilesEl) totalFilesEl.textContent = data.storage?.total || 0;

            // CPU信息
            if (cpuCoresEl) cpuCoresEl.textContent = data.cpu?.cores || '--';
        }
    } catch (error) {
        console.error('加载系统概览失败:', error);
    }
}

/**
 * 加载系统状态
 */
/**
 * 加载系统实时状态
 * 包含超时控制和错误处理优化
 */
async function loadSystemStatus(forceRefresh = false) {
    // 防止重复调用
    if (loadSystemStatus.running) {
        return;
    }

    loadSystemStatus.running = true;

    // 创建超时控制器（8秒超时）
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 8000);

    try {
        const response = await api.getRealtimeStatus({ signal: timeoutController.signal });

        clearTimeout(timeoutId);

        if (!response) {
            console.warn('[SystemStatus] API返回空响应');
            updateSystemStatusError('API无响应');
            return;
        }

        if (response.success) {
            const data = response.data;
            
            // 调试日志：显示实际硬件数据
            console.log('[SystemStatus] 硬件数据:', {
                cpu: data.cpu?.usage,
                gpu: data.gpu?.usage,
                memory: data.memory?.percent,
                disk: data.disk?.usedPercent,
                activeConnections: data.activeConnections
            });

            // 批量更新DOM，减少重绘
            const updates = [];

            // CPU监控
            console.log('[Debug] CPU数据:', data.cpu?.usage, '| GPU:', data.gpu?.usage, '| Memory:', data.memory?.percent);
            updates.push(() => updateGauge('cpu', data.cpu?.usage, data.cpu?.temperature));

            const cpuUsageEl = document.getElementById('cpuUsage');
            const cpuCoresEl = document.getElementById('cpuCores');
            const cpuModelEl = document.getElementById('cpuModel');
            const cpuPowerEl = document.getElementById('cpuPower');

            if (cpuUsageEl) {
                const usage = data.cpu?.usage;
                cpuUsageEl.textContent = (usage !== null && usage !== undefined) ? `${parseFloat(usage).toFixed(1)}%` : '--%';
            }
            if (cpuCoresEl) cpuCoresEl.textContent = data.cpu?.cores || '--';
            if (cpuModelEl) cpuModelEl.textContent = data.cpu?.model || '--';
            if (cpuPowerEl) {
                const power = data.cpu?.powerUsage;
                cpuPowerEl.textContent = (power !== null && power !== undefined) ? power : '-- W';
            }

            // GPU监控
            updates.push(() => updateGauge('gpu', data.gpu?.usage, data.gpu?.temperature));

            const gpuUsageEl = document.getElementById('gpuUsage');
            const gpuTempEl = document.getElementById('gpuTemp');
            const gpuNameEl = document.getElementById('gpuName');
            const gpuMemoryEl = document.getElementById('gpuMemory');
            const gpuPowerEl = document.getElementById('gpuPower');

            if (gpuUsageEl) {
                const usage = data.gpu?.usage;
                gpuUsageEl.textContent = (usage !== null && usage !== undefined) ? `${parseFloat(usage).toFixed(1)}%` : '--%';
            }
            if (gpuTempEl) {
                const temp = data.gpu?.temperature;
                gpuTempEl.textContent = (temp !== null && temp !== undefined) ? `${temp}°C` : '--°C';
            }
            if (gpuNameEl) {
                let gpuText = data.gpu?.name || '集成显卡';
                if (data.gpu?.isDedicated) {
                    gpuText += ' (独立显卡)';
                } else if (data.gpu?.name && data.gpu?.name !== '集成显卡') {
                    gpuText += ' (集成显卡)';
                }
                gpuNameEl.textContent = gpuText;
            }
            if (gpuMemoryEl) {
                const memoryUsed = data.gpu?.memoryUsed || '--';
                const memoryTotal = data.gpu?.vram || '--';
                gpuMemoryEl.textContent = `${memoryUsed} / ${memoryTotal}`;
            }
            if (gpuPowerEl) {
                const power = data.gpu?.powerUsage || '--';
                gpuPowerEl.textContent = power;
            }

            // 内存监控
            updates.push(() => updateGauge('memory', data.memory?.percent));

            const memoryUsedEl = document.getElementById('memoryUsed');
            const memoryTotalEl = document.getElementById('memoryTotal');
            const memoryPercentEl = document.getElementById('memoryPercent');

            if (memoryUsedEl) memoryUsedEl.textContent = `${(data.memory?.used || 0)} GB`;
            if (memoryTotalEl) memoryTotalEl.textContent = `${(data.memory?.total || 0)} GB`;
            if (memoryPercentEl) memoryPercentEl.textContent = `${(data.memory?.percent || 0)}%`;

            // 硬盘监控
            updates.push(() => updateGauge('disk', data.disk?.usedPercent));

            const diskUsedEl = document.getElementById('diskUsed');
            const diskTotalEl = document.getElementById('diskTotal');
            const diskPercentEl = document.getElementById('diskPercent');

            if (diskUsedEl) diskUsedEl.textContent = `${(data.disk?.used || 0)} GB`;
            if (diskTotalEl) diskTotalEl.textContent = `${(data.disk?.total || 0)} GB`;
            if (diskPercentEl) diskPercentEl.textContent = `${(data.disk?.usedPercent || 0)}%`;

            // 在线用户数
            const onlineCountEl = document.getElementById('onlineCount');
            if (onlineCountEl) {
                onlineCountEl.textContent = data.activeConnections || 0;
            }

            // 运行时间 - 初始化并启动实时更新
            const serverUptimeEl = document.getElementById('serverUptime');
            if (serverUptimeEl && data.uptime !== undefined && data.timestamp) {
                serverStartTimestamp = data.timestamp - (data.uptime * 1000);
                updateUptimeDisplay();

                if (!uptimeInterval) {
                    uptimeInterval = setInterval(updateUptimeDisplay, 1000);
                    updateCurrentTime();
                    updateCurrentDate();
                    setInterval(updateCurrentTime, 1000);
                    setInterval(updateCurrentDate, 1000);
                }
            }

            // 立即执行更新（不等待 requestAnimationFrame）
            try {
                updates.forEach(fn => fn());
                updateCharts(data);
            } catch (e) {
                console.error('[SystemStatus] 更新DOM失败:', e);
            }

            // 延迟加载在线用户列表（降低频率以提升主监控性能）
            if (loadOnlineUsers.running !== true) {
                loadOnlineUsers.running = true;
                setTimeout(() => {
                    loadOnlineUsers().catch(() => {}).finally(() => { loadOnlineUsers.running = false; });
                }, 10000); // 每10秒加载一次在线用户
            }
        } else {
            console.warn('[SystemStatus] API返回错误:', response.error);
            updateSystemStatusError(response.error || '获取数据失败');
        }
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            console.warn('[SystemStatus] 请求超时');
            updateSystemStatusError('请求超时');
        } else {
            console.warn('[SystemStatus] 加载失败:', error.message);
            updateSystemStatusError(error.message || '网络错误');
        }
    } finally {
        // 确保无论成功或失败都重置运行状态
        loadSystemStatus.running = false;
    }
}

/**
 * 更新系统状态错误显示
 */
function updateSystemStatusError(message) {
    const elements = ['cpuUsage', 'cpuCores', 'cpuModel', 'gpuUsage', 'gpuName', 'memoryUsed', 'memoryTotal', 'memoryPercent', 'diskUsed', 'diskTotal', 'diskPercent'];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '--';
    });
    
    // 更新CPU型号显示错误
    const cpuModelEl = document.getElementById('cpuModel');
    if (cpuModelEl) cpuModelEl.textContent = `错误: ${message}`;
}

/**
 * 实时更新运行时间显示（每秒调用）
 */
function updateUptimeDisplay() {
    const serverUptimeEl = document.getElementById('serverUptime');
    if (!serverUptimeEl || !serverStartTimestamp) return;

    const now = Date.now();
    const uptime = Math.floor((now - serverStartTimestamp) / 1000); // 秒
    
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    let uptimeText = '';
    if (days > 0) uptimeText += `${days}天 `;
    if (hours > 0 || days > 0) uptimeText += `${hours}小时 `;
    uptimeText += `${minutes}分 ${seconds}秒`;

    serverUptimeEl.textContent = uptimeText;
}

/**
 * 更新当前时间显示（每秒调用）
 */
function updateCurrentTime() {
    const currentTimeEl = document.getElementById('currentTime');
    if (!currentTimeEl) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    currentTimeEl.textContent = `${hours}:${minutes}:${seconds}`;
}

/**
 * 更新当前日期显示（每秒调用）
 */
function updateCurrentDate() {
    const currentDateEl = document.getElementById('currentDate');
    if (!currentDateEl) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekDay = weekDays[now.getDay()];
    
    currentDateEl.textContent = `${year}年${month}月${day}日 ${weekDay}`;
}

/**
 * 更新仪表盘
 * 3D球形进度动画
 * @param {string} type - 组件类型 (cpu, gpu, memory, disk)
 * @param {number} usage - 使用率百分比
 * @param {string|number} extraValue - 温度值或健康状态
 */
function updateGauge(type, usage, extraValue) {
    const usageNum = parseFloat(usage) || 0;
    const displayPercent = Math.min(usageNum, 100);

    // 获取DOM元素 - 3D球形
    const gauge = document.getElementById(`${type}Gauge`);
    const gaugeFill = gauge ? gauge.querySelector('.sphere-fill') : null;
    const progressBar = document.getElementById(`${type}ProgressBar`);
    const gaugeValue = document.getElementById(`${type}GaugeValue`);
    const statusEl = document.getElementById(`${type}Status`);

    // 圆环总长度 (2 * π * r = 2 * 3.14159 * 45 ≈ 282.7)
    const circumference = 282.7;

    // 清除所有状态类名
    const stateClasses = ['critical', 'danger', 'warning', 'good', 'loading'];
    if (gauge) {
        stateClasses.forEach(cls => gauge.classList.remove(cls));
    }
    if (gaugeValue) {
        stateClasses.forEach(cls => gaugeValue.classList.remove(cls));
    }
    if (progressBar) {
        stateClasses.forEach(cls => progressBar.classList.remove(cls));
    }

    // 确定当前状态
    let currentStatus = 'good';
    if (usageNum >= 100) {
        currentStatus = 'critical';
    } else if (usageNum > 80) {
        currentStatus = 'danger';
    } else if (usageNum > 60) {
        currentStatus = 'warning';
    }

    // 更新球体填充高度 - 使用transform控制水位
    if (gaugeFill) {
        // translateY(100%) = 完全空，translateY(0%) = 完全满
        // 所以 translateY = 100% - 显示百分比
        const translateY = 100 - displayPercent;
        gaugeFill.style.transform = `translateY(${translateY}%)`;
    }

    // 更新外部进度环
    if (progressBar) {
        const offset = circumference - (displayPercent / 100) * circumference;
        progressBar.style.strokeDashoffset = offset;
    }

    // 添加状态类名到球体容器和进度条
    if (gauge) {
        gauge.classList.add(currentStatus);
    }
    if (progressBar) {
        progressBar.classList.add(currentStatus);
    }

    // 更新数值显示 - 添加更新动画
    if (gaugeValue) {
        // 触发更新动画
        gaugeValue.classList.add('updating');
        setTimeout(() => gaugeValue.classList.remove('updating'), 400);

        if (usageNum >= 100) {
            // 100%及以上使用更醒目的显示
            gaugeValue.innerHTML = '100<span class="sphere-percent">%</span>';
            gaugeValue.classList.add('critical');
        } else if (usageNum >= 80) {
            // 80%以上使用警告色
            gaugeValue.innerHTML = `${usageNum.toFixed(0)}<span class="sphere-percent">%</span>`;
            gaugeValue.classList.add('danger');
        } else if (usageNum > 60) {
            // 60%-80%使用警告色
            gaugeValue.innerHTML = `${usageNum.toFixed(0)}<span class="sphere-percent">%</span>`;
            gaugeValue.classList.add('warning');
        } else {
            // 正常范围
            gaugeValue.innerHTML = `${usageNum.toFixed(1)}<span class="sphere-percent">%</span>`;
            gaugeValue.classList.add('good');
        }
    }

    // 更新温度/健康度显示
    if (type === 'disk') {
        // 硬盘使用健康度显示
        const healthEl = document.getElementById(`${type}Health`);
        if (healthEl) {
            if (extraValue !== null && extraValue !== undefined && extraValue !== '') {
                healthEl.textContent = extraValue;
                // 根据健康状态设置颜色
                const lowerValue = String(extraValue).toLowerCase();
                if (lowerValue === 'good' || lowerValue === '正常' || lowerValue === '良好') {
                    healthEl.style.color = '#4caf50';
                } else if (lowerValue === 'bad' || lowerValue === '异常' || lowerValue === '故障') {
                    healthEl.style.color = '#f44336';
                } else {
                    healthEl.style.color = '#ff9800';
                }
            } else {
                healthEl.textContent = '--';
                healthEl.style.color = '';
            }
        }
    } else {
        // CPU、GPU、内存使用温度显示
        const tempEl = document.getElementById(`${type}Temp`);
        const tempNum = parseFloat(extraValue) || null;
        if (tempEl) {
            if (tempNum !== null && tempNum !== undefined) {
                tempEl.textContent = `${tempNum.toFixed(0)}°C`;
                tempEl.style.color = tempNum > 70 ? '#f44336' : (tempNum > 50 ? '#ff9800' : '');
            } else {
                tempEl.textContent = '--°C';
                tempEl.style.color = '';
            }
        }
    }

    // 更新状态文字和样式
    if (statusEl) {
        if (usageNum >= 100) {
            statusEl.textContent = '已满载';
            statusEl.className = 'monitor-status critical';
        } else if (usageNum > 80) {
            statusEl.textContent = '高负载';
            statusEl.className = 'monitor-status warning';
        } else if (usageNum > 60) {
            statusEl.textContent = '正常';
            statusEl.className = 'monitor-status normal';
        } else {
            statusEl.textContent = '良好';
            statusEl.className = 'monitor-status good';
        }
    }

    // 仪表盘整体动画效果 - 球体和轨道同步跳动
    if (gauge) {
        if (usageNum >= 100) {
            gauge.style.transform = 'scale(1.02)';
            gauge.style.transition = 'transform 0.3s ease';
            // 轨道也跟随跳动
            const ring = gauge.querySelector('.sphere-ring');
            if (ring) {
                ring.style.transform = 'rotateX(70deg) scale(1.02)';
                ring.style.transition = 'transform 0.3s ease';
            }
        } else {
            gauge.style.transform = 'scale(1)';
            // 轨道恢复正常
            const ring = gauge.querySelector('.sphere-ring');
            if (ring) {
                ring.style.transform = 'rotateX(70deg) scale(1)';
                ring.style.transition = 'transform 0.3s ease';
            }
        }
    }
}

/**
 * 获取使用率颜色
 * 优化100%时的颜色方案
 */
function getUsageColor(percent) {
    if (percent >= 100) return '#d32f2f';  // 深红色，表示严重
    if (percent > 80) return '#f44336';    // 红色，表示警告
    if (percent > 60) return '#ff9800';    // 橙色，表示注意
    return '#4caf50';                      // 绿色，表示正常
}

/**
 * 初始化图表
 */
function initCharts() {
    // 只设置canvas大小，不添加数据点
    // 数据点由 updateCharts 负责添加
    const charts = ['cpu', 'gpu', 'memory', 'disk'];

    charts.forEach(type => {
        const canvas = document.getElementById(`${type}Chart`);
        if (canvas) {
            // 设置canvas的实际像素大小
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = Math.max(rect.width - 32, 200);
            canvas.height = 60;
        }
    });

    chartData.initialized = true;
}

/**
 * 更新图表（使用 requestAnimationFrame 优化性能）
 */
let chartUpdateQueued = false;
function updateCharts(data) {
    if (chartUpdateQueued) return;
    
    chartUpdateQueued = true;
    requestAnimationFrame(() => {
        chartUpdateQueued = false;
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });

        // 解析数据，处理 null 和 undefined
        const cpuUsage = data.cpu?.usage !== null && data.cpu?.usage !== undefined ? parseFloat(data.cpu.usage) : 0;
        const gpuUsage = data.gpu?.usage !== null && data.gpu?.usage !== undefined ? parseFloat(data.gpu.usage) : 0;
        const memoryPercent = data.memory?.percent !== null && data.memory?.percent !== undefined ? parseFloat(data.memory.percent) : 0;
        const diskPercent = data.disk?.usedPercent !== null && data.disk?.usedPercent !== undefined ? parseFloat(data.disk.usedPercent) : 0;

        // 更新数据
        chartData.cpu.push({ time: timestamp, value: cpuUsage });
        chartData.gpu.push({ time: timestamp, value: gpuUsage });
        chartData.memory.push({ time: timestamp, value: memoryPercent });
        chartData.disk.push({ time: timestamp, value: diskPercent });

        // 限制数据点数量
        Object.keys(chartData).forEach(key => {
            if (Array.isArray(chartData[key]) && chartData[key].length > chartData.maxPoints) {
                chartData[key].shift();
            }
        });

        // 绘制图表
        drawChart('cpu', chartData.cpu);
        drawChart('gpu', chartData.gpu);
        drawChart('memory', chartData.memory);
        drawChart('disk', chartData.disk);
    });
}

/**
 * 绘制图表（优化版）
 */
function drawChart(type, data) {
    const canvas = document.getElementById(`${type}Chart`);
    if (!canvas || data.length < 1) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // 跳过背景重绘（使用CSS背景）
    const padding = 5;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // 快速绘制线条
    if (data.length === 1) {
        // 只有一个点时绘制一个点
        const point = data[0];
        const x = padding + chartWidth / 2;
        const y = padding + chartHeight - (Math.max(0, Math.min(100, point.value)) / 100) * chartHeight;
        
        ctx.fillStyle = getChartColor(type);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    // 批量绘制路径
    ctx.beginPath();
    ctx.strokeStyle = getChartColor(type);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const maxValue = 100;
    const minValue = 0;
    const dataLength = data.length - 1;

    data.forEach((point, index) => {
        const x = padding + (index / dataLength) * chartWidth;
        const y = padding + chartHeight - ((Math.max(minValue, Math.min(maxValue, point.value)) - minValue) / (maxValue - minValue)) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    // 简化填充（只填充最后一段）
    if (data.length > 1) {
        const lastPoint = data[data.length - 1];
        const lastX = padding + chartWidth;
        const lastY = padding + chartHeight - ((Math.max(0, Math.min(100, lastPoint.value)) / 100) * chartHeight);
        
        ctx.lineTo(lastX, height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, padding, 0, height);
        gradient.addColorStop(0, getChartColor(type, 0.2));
        gradient.addColorStop(1, getChartColor(type, 0));
        ctx.fillStyle = gradient;
        ctx.fill();
    }
}

/**
 * 获取图表颜色
 */
function getChartColor(type, alpha = 1) {
    const colors = {
        cpu: `rgba(92, 157, 237, ${alpha})`,
        gpu: `rgba(156, 39, 176, ${alpha})`,
        memory: `rgba(76, 175, 80, ${alpha})`,
        disk: `rgba(255, 152, 0, ${alpha})`
    };
    return colors[type] || colors.cpu;
}

/**
 * 加载在线用户列表
 * 从服务器获取当前在线用户列表并显示
 */
async function loadOnlineUsers() {
    try {
        console.log('[OnlineUsers] 正在加载在线用户列表...');
        const response = await api.getSystemUsers();
        const usersList = document.getElementById('onlineUsersList');
        const onlineCountEl = document.getElementById('onlineCount');

        if (response.success && usersList) {
            const users = response.data.users || [];
            const count = response.data.count || users.length;

            // 更新在线人数显示
            if (onlineCountEl) {
                onlineCountEl.textContent = count;
                console.log('[OnlineUsers] 在线用户数:', count);
            }

            // 更新用户列表显示
            if (users.length === 0) {
                usersList.innerHTML = '<div class="user-item empty">暂无用户在线</div>';
            } else {
                // 显示前10个用户
                usersList.innerHTML = users.slice(0, 10).map(user => `
                    <div class="user-item">
                        <div class="user-avatar-small" style="background: ${getAvatarGradient(user.username)}">${getInitials(user.username)}</div>
                        <span class="user-name-small">${escapeHtml(user.username)}</span>
                    </div>
                `).join('');

                if (users.length > 10) {
                    usersList.innerHTML += `<div class="user-item more">还有其他 ${users.length - 10} 位用户...</div>`;
                }
            }

            console.log('[OnlineUsers] 在线用户列表已更新，用户数:', users.length);
        } else {
            console.warn('[OnlineUsers] 获取用户列表失败:', response.error);
        }
    } catch (error) {
        console.error('[OnlineUsers] 加载在线用户失败:', error);
    }
}

/**
 * 加载用户列表
 */
async function loadUsers(forceRefresh = false) {
    // 检查缓存
    const now = Date.now();
    if (!forceRefresh && pageCache.users.data && (now - pageCache.users.timestamp) < 30000) {
        renderUsers(pageCache.users.data);
        return;
    }

    try {
        // 获取筛选条件
        const statusFilter = document.getElementById('userStatusFilter')?.value || 'all';
        const roleFilter = document.getElementById('userRoleFilter')?.value || 'all';
        const searchText = document.getElementById('userSearchInput')?.value?.trim() || '';
        
        const response = await api.getAllUsers({ 
            limit: 50, // 减少每次获取的数量
            status: statusFilter !== 'all' ? statusFilter : undefined,
            role: roleFilter !== 'all' ? roleFilter : undefined,
            search: searchText || undefined
        });
        
        if (response.success) {
            // 后端已支持筛选，直接使用响应数据
            const users = response.data.users || [];
            
            pageCache.users.data = users;
            pageCache.users.timestamp = now;
            renderUsers(users);
        } else {
            const tbody = document.getElementById('usersTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr class="loading-row"><td colspan="7">加载失败</td></tr>';
            }
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
        const tbody = document.getElementById('usersTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr class="loading-row"><td colspan="7">加载失败，请重试</td></tr>';
        }
    }
}

/**
 * 渲染用户列表
 */
function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!users || !users.length) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="7">暂无用户数据</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        // 不能删除自己
        const isSelf = currentUser && user.id === currentUser.id;
        // 不能删除超级管理员
        const isSuperadmin = user.role === 'superadmin';
        const canDelete = currentUser && !isSelf && !isSuperadmin && 
            (currentUser.role === 'superadmin' || currentUser.role === 'admin');
        // 管理员和超级管理员都视为管理员角色
        const isAdmin = user.role === 'admin' || user.role === 'superadmin';

        return `
            <tr data-user-id="${user.id}">
                <td>${user.id}</td>
                <td>
                    <div class="user-cell">
                        <div class="user-avatar-mini" style="background: ${getAvatarGradient(user.username)}">${getInitials(user.username)}</div>
                        <span>${escapeHtml(user.username)}</span>
                    </div>
                </td>
                <td>${escapeHtml(user.display_name || '-')}</td>
                <td><span class="role-badge ${user.role}">${getRoleDisplayName(user.role)}</span></td>
                <td>
                    <span class="status-badge ${getStatusClass(user.status)}">
                        <span class="status-dot ${getStatusClass(user.status)}"></span>
                        ${getStatusDisplayName(user.status)}
                    </span>
                </td>
                <td>${formatDate(user.last_login)}</td>
                <td>
                    <div class="action-group">
                        <button class="btn-icon" onclick="editUser('${user.id}')" title="编辑">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        </button>
                        ${canDelete ? `
                        <button class="btn-icon danger" onclick="deleteUser('${user.id}')" title="删除">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 打开用户模态框
 */
function openUserModal(user = null) {
    const modal = document.getElementById('userModal');
    const titleEl = document.getElementById('userModalTitle');
    const editIdEl = document.getElementById('editUserId');
    const usernameEl = document.getElementById('newUsername');
    const displayNameEl = document.getElementById('newDisplayName');
    const emailEl = document.getElementById('newEmail');
    const passwordEl = document.getElementById('newPassword');
    const roleEl = document.getElementById('newRole');
    const statusEl = document.getElementById('newUserStatus');
    const statusRowEl = document.getElementById('statusRow');
    const roleRowEl = document.getElementById('roleRow');

    if (!modal || !titleEl) return;

    const isEdit = !!user;
    const isModifyingSelf = user && currentUser && user.id === currentUser.id;
    const isSelfSuperadmin = isModifyingSelf && currentUser.role === 'superadmin';
    
    titleEl.textContent = isEdit ? '编辑用户' : '添加用户';

    if (editIdEl) editIdEl.value = isEdit ? user.id : '';
    if (usernameEl) {
        usernameEl.value = user ? user.username : '';
        usernameEl.disabled = isEdit; // 编辑时不能修改用户名
    }
    if (displayNameEl) displayNameEl.value = user ? (user.display_name || '') : '';
    if (emailEl) emailEl.value = user ? (user.email || '') : '';
    if (passwordEl) {
        passwordEl.value = '';
        passwordEl.required = !isEdit; // 编辑时密码可选
    }
    
    // 角色设置
    if (roleEl) {
        roleEl.value = user ? user.role : 'user';
        // 超级管理员不能修改自己的角色
        if (isSelfSuperadmin) {
            roleEl.disabled = true;
            roleEl.title = '超级管理员不能给自己降级';
        } else {
            roleEl.disabled = false;
            roleEl.title = '';
        }
    }
    
    // 编辑模式显示状态选择，创建模式隐藏
    if (statusRowEl) {
        statusRowEl.style.display = isEdit ? 'flex' : 'none';
    }
    
    // 超级管理员不能修改自己的状态
    if (statusEl) {
        const validStatuses = ['active', 'pending', 'locked', 'suspended', 'disabled'];
        const userStatus = user?.status || 'active';
        statusEl.value = validStatuses.includes(userStatus) ? userStatus : 'active';
        
        if (isSelfSuperadmin) {
            statusEl.disabled = true;
            statusEl.title = '超级管理员不能修改自己的账户状态';
        } else {
            statusEl.disabled = false;
            statusEl.title = '';
        }
    }

    modal.classList.add('active');

    // 自动聚焦
    setTimeout(() => {
        if (displayNameEl && !isEdit) {
            displayNameEl.focus();
        } else if (emailEl) {
            emailEl.focus();
        }
    }, 5000);
}

/**
 * 关闭用户模态框
 */
function closeUserModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.classList.remove('active');
    }

    // 重置表单
    const form = document.getElementById('userForm');
    if (form) {
        form.reset();
    }

    // 启用用户名输入框
    const usernameEl = document.getElementById('newUsername');
    if (usernameEl) {
        usernameEl.disabled = false;
    }

    // 重置密码要求提示
    resetPasswordRequirements();
}

/**
 * 重置密码要求提示样式
 */
function resetPasswordRequirements() {
    const requirements = ['req-length', 'req-uppercase', 'req-lowercase', 'req-number'];
    requirements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('valid', 'invalid');
            const iconEl = el.querySelector('.req-icon');
            if (iconEl) {
                iconEl.textContent = 'O';
            }
        }
    });
}

/**
 * 验证密码要求并更新UI
 * 密码要求：至少6个字符，包含字母（大小写均可），包含数字
 */
function validatePasswordRequirements() {
    const passwordEl = document.getElementById('newPassword');
    if (!passwordEl) return;

    const password = passwordEl.value;

    // 验证长度（至少6个字符）
    const lengthEl = document.getElementById('req-length');
    if (lengthEl) {
        updateRequirementIcon(lengthEl, password.length >= 6, password.length > 0);
    }

    // 验证包含字母（大小写均可）
    const letterEl = document.getElementById('req-letter');
    if (letterEl) {
        updateRequirementIcon(letterEl, /[a-zA-Z]/.test(password), password.length > 0);
    }

    // 验证数字
    const numberEl = document.getElementById('req-number');
    if (numberEl) {
        updateRequirementIcon(numberEl, /[0-9]/.test(password), password.length > 0);
    }
}

/**
 * 更新密码要求项的图标
 * @param {HTMLElement} liElement - li元素
 * @param {boolean} isValid - 是否满足要求
 * @param {boolean} hasInput - 是否有输入
 */
function updateRequirementIcon(liElement, isValid, hasInput) {
    if (!liElement) return;

    const iconEl = liElement.querySelector('.req-icon');
    if (!iconEl) return;

    if (!hasInput) {
        liElement.classList.remove('valid', 'invalid');
        iconEl.textContent = 'O';
    } else if (isValid) {
        liElement.classList.add('valid');
        liElement.classList.remove('invalid');
        iconEl.textContent = 'V';
    } else {
        liElement.classList.add('invalid');
        liElement.classList.remove('valid');
        iconEl.textContent = 'X';
    }
}

/**
 * 检查密码是否满足所有要求
 * @param {string} password - 密码
 * @returns {object} - 验证结果
 */
function checkPasswordRequirements(password) {
    return {
        valid: password.length >= 6 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password),
        length: password.length >= 6,
        letter: /[a-zA-Z]/.test(password),
        number: /[0-9]/.test(password)
    };
}

/**
 * 保存用户
 */
async function saveUser() {
    const editIdEl = document.getElementById('editUserId');
    const usernameEl = document.getElementById('newUsername');
    const displayNameEl = document.getElementById('newDisplayName');
    const emailEl = document.getElementById('newEmail');
    const passwordEl = document.getElementById('newPassword');
    const roleEl = document.getElementById('newRole');
    const statusEl = document.getElementById('newUserStatus');

    if (!usernameEl || !displayNameEl || !roleEl) {
        showToast('页面加载中，请稍候', 'error');
        return;
    }

    const userId = editIdEl ? editIdEl.value : '';
    const username = usernameEl.value.trim();
    const displayName = displayNameEl.value.trim();
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const role = roleEl.value;
    const status = statusEl ? statusEl.value : 'active';

    if (!username) {
        showToast('请输入用户名', 'error');
        usernameEl.focus();
        return;
    }

    // 验证用户名格式
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showToast('用户名只能包含字母、数字和下划线', 'error');
        return;
    }

    // 新用户必须填写密码
    if (!userId && !password) {
        showToast('请输入密码', 'error');
        if (passwordEl) passwordEl.focus();
        return;
    }

    // 验证密码要求
    if (password) {
        const requirements = checkPasswordRequirements(password);
        if (!requirements.valid) {
            let errorMsg = '密码必须满足以下要求：';
            if (!requirements.length) errorMsg += '\n- 至少6个字符';
            if (!requirements.letter) errorMsg += '\n- 包含字母（大小写均可）';
            if (!requirements.number) errorMsg += '\n- 包含数字 (0-9)';
            showToast(errorMsg, 'error');
            if (passwordEl) passwordEl.focus();
            return;
        }
    }

    // 验证邮箱格式（如果填写）
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('请输入有效的邮箱地址', 'error');
        if (emailEl) emailEl.focus();
        return;
    }

    try {
        let response;
        if (userId) {
            // 更新用户
            const updateData = {
                display_name: displayName,
                email: email,
                role: role,
                status: status
            };
            if (password) {
                // 验证密码要求
                const requirements = checkPasswordRequirements(password);
                if (!requirements.valid) {
                    let errorMsg = '密码必须满足以下要求：';
                    if (!requirements.length) errorMsg += '\n- 至少6个字符';
                    if (!requirements.letter) errorMsg += '\n- 包含字母（大小写均可）';
                    if (!requirements.number) errorMsg += '\n- 包含数字 (0-9)';
                    showToast(errorMsg, 'error');
                    if (passwordEl) passwordEl.focus();
                    return;
                }
                updateData.password = password;
            }
            // 传递原始userId（支持UUID格式）
            response = await api.updateUser(userId, updateData);
        } else {
            // 创建用户
            response = await api.createUser({
                username,
                display_name: displayName,
                email,
                password,
                role,
                status: 'active' // 新用户默认状态为正常
            });
        }

        if (response.success) {
            closeUserModal();
            pageCache.users.timestamp = 0; // 清除缓存
            loadUsers(true);
            showToast(userId ? '用户更新成功' : '用户创建成功', 'success');
        } else {
            showToast(response.error || '操作失败', 'error');
        }
    } catch (error) {
        console.error('保存用户失败:', error);
        showToast('操作失败，请重试', 'error');
    }
}

/**
 * 编辑用户
 */
function editUser(userId) {
    api.getUser(userId)
        .then(response => {
            if (response.success && response.data.user) {
                openUserModal(response.data.user);
            } else {
                showToast('获取用户信息失败', 'error');
            }
        })
        .catch(() => {
            showToast('获取用户信息失败', 'error');
        });
}

/**
 * 删除用户
 */
async function deleteUser(userId) {
    if (!confirm(`确定要删除用户 #${userId} 吗？此操作不可恢复，用户的所有数据将被删除。`)) {
        return;
    }

    try {
        const response = await api.deleteUser(userId);
        if (response.success) {
            // 清除所有相关缓存
            pageCache.users.data = null;
            pageCache.users.timestamp = 0;
            
            // 强制重新加载用户列表
            await loadUsers(true);
            
            showToast('用户删除成功', 'success');
        } else {
            showToast(response.error || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除用户失败:', error);
        showToast('删除失败，请重试', 'error');
    }
}

/**
 * 加载视频列表
 */
async function loadVideos(forceRefresh = false) {
    // 检查缓存
    const now = Date.now();
    if (!forceRefresh && pageCache.videos.data && (now - pageCache.videos.timestamp) < 30000) {
        renderVideos(pageCache.videos.data);
        return;
    }

    try {
        const response = await api.getVideos({ limit: 50 });
        if (response.success) {
            pageCache.videos.data = response.data.videos || [];
            pageCache.videos.timestamp = now;
            renderVideos(pageCache.videos.data);
        } else {
            const videoGrid = document.getElementById('videoGrid');
            if (videoGrid) {
                videoGrid.innerHTML = '<div class="loading-state"><span>加载失败</span></div>';
            }
        }
    } catch (error) {
        console.error('加载视频列表失败:', error);
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            videoGrid.innerHTML = '<div class="loading-state"><span>加载失败，请重试</span></div>';
        }
    }
}

/**
 * 渲染视频列表
 */
function renderVideos(videos) {
    const videoGrid = document.getElementById('videoGrid');
    const totalCountEl = document.getElementById('videoTotalCount');
    const totalSizeEl = document.getElementById('videoTotalSize');
    const todayCountEl = document.getElementById('videoTodayCount');

    if (!videoGrid) return;

    if (!videos || !videos.length) {
        videoGrid.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                </svg>
                <h3>暂无视频</h3>
                <p>上传视频即可在这里显示</p>
            </div>
        `;
        if (totalCountEl) totalCountEl.textContent = '0';
        if (totalSizeEl) totalSizeEl.textContent = '0 B';
        if (todayCountEl) todayCountEl.textContent = '0';
        return;
    }

    // 计算统计数据
    let totalSize = 0;
    const today = new Date().toDateString();
    let todayCount = 0;

    videos.forEach(video => {
        totalSize += video.size || 0;
        if (video.created_at && new Date(video.created_at).toDateString() === today) {
            todayCount++;
        }
    });

    // 更新统计
    if (totalCountEl) totalCountEl.textContent = videos.length;
    if (totalSizeEl) totalSizeEl.textContent = formatFileSize(totalSize);
    if (todayCountEl) todayCountEl.textContent = todayCount;

    // 渲染视频网格 - 使用优化的缩略图加载策略
    // 使用内联SVG作为默认占位符，避免重复请求默认图片
    const placeholderSvg = `<svg class="video-placeholder" viewBox="0 0 16 9" preserveAspectRatio="none"><rect fill="#e8f0f5" width="16" height="9"/><g fill="#a0b4c8" opacity="0.5"><polygon points="8,0 16,9 0,9"/></g></svg>`;
    
    videoGrid.innerHTML = videos.map(video => {
        const hasRealThumbnail = video.thumbnail && video.thumbnail.trim() !== '';
        const thumbnailUrl = hasRealThumbnail ? video.thumbnail : '';
        
        return `
        <div class="video-item" data-id="${video.id}">
            <div class="video-thumbnail ${hasRealThumbnail ? 'has-thumbnail' : 'no-thumbnail'}" data-thumbnail="${hasRealThumbnail ? escapeHtml(thumbnailUrl) : ''}">
                ${hasRealThumbnail ? `
                    <img src="" 
                         data-src="${escapeHtml(thumbnailUrl)}"
                         alt="${escapeHtml(video.name)}"
                         loading="lazy"
                         onerror="this.style.display='none'; this.parentElement.classList.add('no-thumbnail'); this.parentElement.classList.remove('has-thumbnail');">
                    ${placeholderSvg}
                ` : placeholderSvg}
                <span class="video-duration">${formatDuration(video.duration)}</span>
            </div>
            <div class="video-info">
                <h4 class="video-name" title="${escapeHtml(video.name)}">${escapeHtml(video.name)}</h4>
                <div class="video-meta">
                    <span class="meta-item">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                        </svg>
                        ${video.view_count || 0}
                    </span>
                    <span class="meta-item">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M5 18h14V8H5v10zm4-8h6v4H9V10zm8 4h-6v2h6v-2z"/>
                        </svg>
                        ${formatFileSize(video.size)}
                    </span>
                </div>
            </div>
            <div class="video-actions">
                <button class="btn-icon" onclick="playVideo('${video.id}')" title="播放">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </button>
                <button class="btn-icon" onclick="editVideo('${video.id}')" title="编辑">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                </button>
                <button class="btn-icon danger" onclick="deleteVideo('${video.id}')" title="删除">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            </div>
        </div>
    `}).join('');

    // 延迟加载缩略图 - 使用Intersection Observer
    initThumbnailLoading();
}

/**
 * 初始化缩略图延迟加载
 * 使用Intersection Observer实现视口外缩略图的延迟加载
 */
function initThumbnailLoading() {
    // 检查浏览器是否支持Intersection Observer
    if (!('IntersectionObserver' in window)) {
        // 不支持时立即加载所有缩略图
        loadAllThumbnails();
        return;
    }

    const thumbnailObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const thumbnail = entry.target;
                const img = thumbnail.querySelector('img[data-src]');
                
                if (img && img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    
                    // 图片加载成功后隐藏占位符
                    img.onload = () => {
                        const placeholder = thumbnail.querySelector('.video-placeholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                    };
                }
                
                observer.unobserve(thumbnail);
            }
        });
    }, {
        rootMargin: '100px 0px', // 提前100px开始加载
        threshold: 0.1
    });

    // 观察所有有缩略图的容器
    document.querySelectorAll('.video-thumbnail.has-thumbnail').forEach(thumbnail => {
        thumbnailObserver.observe(thumbnail);
    });
}

/**
 * 加载所有缩略图（用于不支持Intersection Observer的浏览器）
 */
function loadAllThumbnails() {
    document.querySelectorAll('.video-thumbnail.has-thumbnail img[data-src]').forEach(img => {
        if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            
            // 加载成功后隐藏占位符
            img.onload = () => {
                const placeholder = img.parentElement.querySelector('.video-placeholder');
                if (placeholder) {
                    placeholder.style.display = 'none';
                }
            };
        }
    });
}

/**
 * 播放视频 - 在内嵌播放器中播放
 */
async function playVideo(videoId) {
    try {
        // 获取视频信息
        const response = await api.getVideoInfo(videoId);
        if (!response.success) {
            showToast(response.error || '获取视频信息失败', 'error');
            return;
        }

        const videoData = response.data;
        const videoPlayer = document.getElementById('inlineVideoPlayer');
        const videoPlayerModal = document.getElementById('videoPlayerModal');
        const videoPlayerTitle = document.getElementById('videoPlayerTitle');
        const playerVideoName = document.getElementById('playerVideoName');
        const playerVideoDuration = document.getElementById('playerVideoDuration');
        const playerVideoSize = document.getElementById('playerVideoSize');
        const playerVideoViews = document.getElementById('playerVideoViews');

        // 设置标题和信息
        videoPlayerTitle.textContent = '视频播放';
        playerVideoName.textContent = videoData.file.name;
        playerVideoDuration.textContent = `时长: ${formatDuration(videoData.file.duration)}`;
        playerVideoSize.textContent = `大小: ${formatFileSize(videoData.file.size)}`;
        playerVideoViews.textContent = `播放: ${videoData.file.view_count || 0}`;

        // 显示模态框 - 使用内联样式确保显示
        videoPlayerModal.classList.add('show');
        videoPlayerModal.style.cssText = 'position: fixed !important; inset: 0 !important; background: rgba(0, 0, 0, 0.7) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 9999 !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;';
        document.body.style.overflow = 'hidden';
        
        // 确保modal-content也正确显示
        const modalContent = videoPlayerModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.cssText = 'background: #fff !important; border-radius: 14px !important; max-width: 1200px !important; width: 95% !important; transform: scale(1) translateY(0) !important; opacity: 1 !important; visibility: visible !important; display: block !important; max-height: 95vh !important; overflow: visible !important;';
            console.log('[PlayVideo] modal-content 样式已设置');
        }
        
        // 强制模态框可见
        console.log('[PlayVideo] 模态框类名:', videoPlayerModal.className);
        console.log('[PlayVideo] 模态框尺寸:', videoPlayerModal.offsetWidth, 'x', videoPlayerModal.offsetHeight);

        // 获取视频URL（带认证token）
        const playlistUrl = api.getVideoHLSURL(videoId);
        const streamUrl = await api.getVideoStreamURL(videoId);
        
        // 调试日志：显示实际生成的URL
        console.log('[PlayVideo] 播放列表URL:', playlistUrl);
        console.log('[PlayVideo] 流URL:', streamUrl);

        // 获取token用于HLS请求
        const token = api.token || localStorage.getItem('accessToken') || '';

        // 播放失败时使用的备用函数
        const playWithFallback = () => {
            // 先尝试直接流
            videoPlayer.src = streamUrl;
            videoPlayer.load();
            videoPlayer.play().catch(err => {
                console.log('播放失败:', err);
            });
        };

        // 为URL添加token的辅助函数
        const addTokenToUrl = (url) => {
            if (!token || !url.includes('/api/')) return url;
            const separator = url.includes('?') ? '&' : '?';
            if (url.includes('token=')) return url;
            return url + separator + 'token=' + encodeURIComponent(token);
        };

        // 检测视频格式，判断是否需要转码
        // 如果是 MP4/WebM 格式，可以直接播放原始文件
        // 优先使用视频编码信息，如果没有则使用文件扩展名判断
        const videoCodec = videoData.video?.codec;
        const fileName = videoData.file?.name || '';
        const fileExtension = fileName.split('.').pop().toLowerCase();
        
        // 支持直接播放的格式列表
        const directPlayableExtensions = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'webm'];
        const directPlayableCodecs = ['mp4', 'webm', 'ogg', 'mov'];
        
        // 检查是否有直接播放的编码
        const hasDirectPlayableCodec = videoCodec && directPlayableCodecs.includes(videoCodec.toLowerCase());
        // 或者检查文件扩展名（作为后备）
        const hasDirectPlayableExtension = directPlayableExtensions.includes(fileExtension);
        
        const isDirectPlayable = hasDirectPlayableCodec || hasDirectPlayableExtension;
        
        console.log('[PlayVideo] 视频编码:', videoCodec || '未知');
        console.log('[PlayVideo] 文件扩展名:', fileExtension);
        console.log('[PlayVideo] 是否可以直接播放:', isDirectPlayable, '(编码:' + hasDirectPlayableCodec + ', 扩展名:' + hasDirectPlayableExtension + ')');

        // 如果是支持的格式，直接使用 HTML5 video 标签播放
        if (isDirectPlayable) {
            console.log('[PlayVideo] 直接播放原始视频文件（无需转码）');
            videoPlayer.src = streamUrl;
            videoPlayer.load();
            
            // 添加媒体事件监听器用于调试
            videoPlayer.onloadedmetadata = function() {
                console.log('[PlayVideo] ✅ 视频元数据已加载');
                console.log('[PlayVideo] 视频宽度:', videoPlayer.videoWidth, '高度:', videoPlayer.videoHeight);
                console.log('[PlayVideo] 视频时长:', videoPlayer.duration, '秒');
                // 检查视频元素尺寸
                const rect = videoPlayer.getBoundingClientRect();
                console.log('[PlayVideo] 视频元素尺寸:', rect.width, 'x', rect.height);
                console.log('[PlayVideo] 视频元素位置:', rect.left, rect.top);
                // 检查模态框状态
                const modal = document.getElementById('videoPlayerModal');
                console.log('[PlayVideo] 模态框类名:', modal.className);
                console.log('[PlayVideo] 模态框可见:', modal.classList.contains('show') || modal.classList.contains('active'));
                console.log('[PlayVideo] 模态框尺寸:', modal.offsetWidth, 'x', modal.offsetHeight);
                // 检查是否有覆盖层
                const overlay = modal.querySelector('.modal-overlay');
                if (overlay) {
                    console.log('[PlayVideo] 发现覆盖层:', overlay.tagName, overlay.className);
                }
            };
            
            videoPlayer.onerror = function() {
                console.error('[PlayVideo] ❌ 视频加载错误:', videoPlayer.error);
                console.error('[PlayVideo] 错误代码:', videoPlayer.error ? videoPlayer.error.code : '无');
                console.error('[PlayVideo] 错误消息:', videoPlayer.error ? videoPlayer.error.message : '无');
            };
            
            videoPlayer.ontimeupdate = function() {
                console.log('[PlayVideo] 📺 播放进度:', videoPlayer.currentTime, '/', videoPlayer.duration);
            };
            
            videoPlayer.onplay = function() {
                console.log('[PlayVideo] ▶️ 视频开始播放');
                const rect = videoPlayer.getBoundingClientRect();
                console.log('[PlayVideo] 播放时元素尺寸:', rect.width, 'x', rect.height);
            };
            
            videoPlayer.play().catch(err => {
                console.log('自动播放被阻止:', err);
            });
            return;
        }

        // 如果需要转码，使用 HLS.js
        console.log('[PlayVideo] 视频需要转码，使用 HLS 播放');

        // 检查是否支持HLS
        if (Hls.isSupported()) {
            // 使用HLS.js播放HLS流
            const hls = new Hls({
                // 启用凭据以自动发送Cookie（解决浏览器阻止localStorage访问的问题）
                withCredentials: true,
                xhrSetup: function(xhr, url) {
                    // 为所有到本服务器的请求添加token认证
                    // 使用 api.getToken() 支持 Cookie 后备，确保在 localStorage 被阻止时仍能获取 token
                    const currentToken = api.getToken();
                    
                    // 调试日志
                    console.log('[HLS xhrSetup] URL:', url.substring(0, 100), '...');
                    console.log('[HLS xhrSetup] Token found:', !!currentToken, 'Token length:', currentToken ? currentToken.length : 0);
                    
                    if (currentToken && url.includes(window.location.host)) {
                        // 添加 Authorization header（更安全的认证方式）
                        xhr.setRequestHeader('Authorization', `Bearer ${currentToken}`);
                        
                        // 同时在 URL 中添加 token（作为双重保障）
                        const separator = url.includes('?') ? '&' : '?';
                        if (!url.includes('token=')) {
                            const newUrl = url + separator + 'token=' + encodeURIComponent(currentToken);
                            console.log('[HLS xhrSetup] Modified URL:', newUrl.substring(0, 100), '...');
                            return newUrl;
                        }
                    } else if (!currentToken) {
                        console.warn('[HLS xhrSetup] No token found! Authentication will rely on cookies only.');
                    }
                }
            });

            hls.loadSource(playlistUrl);
            hls.attachMedia(videoPlayer);

            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                videoPlayer.play().catch(err => {
                    console.log('自动播放被阻止:', err);
                });
            });

            hls.on(Hls.Events.ERROR, function(event, data) {
                console.warn('HLS错误:', data.type, data.details, data.fatal);

                // 检查是否是转码中的错误
                // manifestParsingError: 解析播放列表失败（播放列表格式不正确）
                // levelEmptyError: 播放列表没有片段（通常是转码占位符）
                const isTranscodeError = 
                    (data.type === 'networkError' && data.details === 'manifestParsingError') ||
                    (data.type === 'networkError' && data.details === 'levelEmptyError') ||
                    (data.type === 'networkError' && data.details === 'bufferAppendingError');

                if (isTranscodeError) {
                    console.warn('检测到转码中状态，轮询等待...');

                    // 【关键修复】立即停止 HLS 播放器，防止重复触发错误
                    hls.stopLoad();
                    hls.destroy();
                    console.log('[TranscodeHandler] HLS 播放器已停止');

                    // 显示转码提示
                    const titleEl = document.getElementById('videoPlayerTitle');
                    if (titleEl) {
                        titleEl.textContent = '视频转码中，请稍候...';
                    }

                    // 启动轮询等待转码完成
                    let pollCount = 0;
                    const maxPolls = 120; // 最多等待60秒
                    const pollInterval = setInterval(async () => {
                        pollCount++;

                        if (pollCount >= maxPolls) {
                            clearInterval(pollInterval);
                            showToast('转码超时，请稍后重试', 'error');
                            return;
                        }

                        try {
                            const progressData = await api.getTranscodeProgress(videoId);
                            console.log('轮询转码进度:', progressData.data);

                            if (progressData.success && progressData.data.progress >= 100) {
                                clearInterval(pollInterval);
                                // 转码完成，重新创建 HLS 播放器
                                console.log('转码完成，创建新的 HLS 播放器...');

                                const newHls = new Hls({
                                    // 启用凭据以自动发送Cookie
                                    withCredentials: true,
                                    xhrSetup: function(xhr, url) {
                                        // 使用 api.getToken() 支持 Cookie 后备
                                        const currentToken = api.getToken();
                                        if (currentToken && url.includes(window.location.host)) {
                                            const separator = url.includes('?') ? '&' : '?';
                                            if (url.includes('token=')) return url;
                                            return url + separator + 'token=' + encodeURIComponent(currentToken);
                                        }
                                    }
                                });

                                newHls.loadSource(playlistUrl);
                                newHls.attachMedia(videoPlayer);

                                newHls.on(Hls.Events.MANIFEST_PARSED, function() {
                                    console.log('[TranscodeHandler] 新 HLS 播放器就绪，开始播放...');
                                    videoPlayer.play().catch(err => {
                                        console.log('自动播放被阻止:', err);
                                    });
                                });

                                // 复制新的 hls 实例到 videoPlayer
                                videoPlayer.hlsInstance = newHls;
                            }
                        } catch (err) {
                            console.warn('轮询转码进度失败:', err);
                        }
                    }, 500);
                    return;
                }

                if (data.fatal) {
                    console.error('HLS严重错误:', data);
                    // 如果HLS失败，尝试直接流
                    hls.destroy();
                    playWithFallback();
                }
            });

            // 保存hls实例以便关闭时销毁
            videoPlayer.hlsInstance = hls;

        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // 原生支持HLS的浏览器（如Safari）
            videoPlayer.src = playlistUrl;
            videoPlayer.addEventListener('loadedmetadata', function() {
                videoPlayer.play().catch(err => {
                    console.log('自动播放被阻止:', err);
                });
            });
        } else {
            // 不支持HLS，直接播放原始文件
            playWithFallback();
        }

        // 记录播放进度
        videoPlayer.addEventListener('ended', async () => {
            try {
                await api.updateVideoProgress(videoId, videoPlayer.duration, videoPlayer.duration, true);
            } catch (err) {
                console.warn('记录播放进度失败:', err);
            }
        });

    } catch (error) {
        console.error('播放视频失败:', error);
        showToast('播放视频失败，请重试', 'error');
    }
}

/**
 * 关闭视频播放器模态框
 */
function closeVideoPlayer() {
    const videoPlayerModal = document.getElementById('videoPlayerModal');
    const videoPlayer = document.getElementById('inlineVideoPlayer');
    
    console.log('[PlayVideo] 关闭视频播放器');

    // 暂停播放
    if (videoPlayer) {
        videoPlayer.pause();
        
        // 销毁HLS实例
        if (videoPlayer.hlsInstance) {
            videoPlayer.hlsInstance.destroy();
            videoPlayer.hlsInstance = null;
        }

        // 清除视频源
        videoPlayer.src = '';
        videoPlayer.removeAttribute('src');
    }

    // 隐藏模态框 - 清除所有内联样式
    if (videoPlayerModal) {
        videoPlayerModal.classList.remove('show');
        videoPlayerModal.style.cssText = ''; // 清除所有内联样式
        
        // 清除modal-content的内联样式
        const modalContent = videoPlayerModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.cssText = '';
        }
    }
    
    document.body.style.overflow = '';
    console.log('[PlayVideo] 视频播放器已关闭');
}

/**
 * 编辑视频
 */
function editVideo(videoId) {
    showToast('视频编辑功能开发中', 'info');
}

/**
 * 删除视频
 */
async function deleteVideo(videoId) {
    if (!confirm('确定要删除该视频吗？此操作不可恢复。')) {
        return;
    }

    try {
        const response = await api.deleteFile(videoId);
        if (response.success) {
            pageCache.videos.timestamp = 0;
            loadVideos(true);
            showToast('视频删除成功', 'success');
        } else {
            showToast(response.error || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除视频失败:', error);
        showToast('删除失败，请重试', 'error');
    }
}

/**
 * 加载文件统计
 */
async function loadFileStats(forceRefresh = false) {
    // 检查缓存
    const now = Date.now();
    if (!forceRefresh && pageCache.files.data && (now - pageCache.files.timestamp) < 30000) {
        renderFiles(pageCache.files.data.files || []);
        return;
    }

    try {
        // 获取文件统计
        const statsResponse = await api.getAdminFileStats();
        const filesResponse = await api.getFiles({ limit: 50 });

        if (statsResponse.success) {
            const stats = statsResponse.data;

            const totalFilesEl = document.getElementById('totalFilesCount');
            const totalVideosEl = document.getElementById('totalVideosCount');
            const totalSizeEl = document.getElementById('totalStorageSize');
            const usagePercentEl = document.getElementById('storageUsagePercent');

            if (totalFilesEl) totalFilesEl.textContent = stats.total_files || 0;
            if (totalVideosEl) totalVideosEl.textContent = stats.video_count || 0;
            if (totalSizeEl) totalSizeEl.textContent = formatFileSize(stats.total_size || 0);
            if (usagePercentEl) usagePercentEl.textContent = `${stats.storage_percent || 0}%`;
        }

        if (filesResponse.success) {
            pageCache.files.data = filesResponse;
            pageCache.files.timestamp = now;
            renderFiles(filesResponse.data.files || []);
        }
    } catch (error) {
        console.error('加载文件统计失败:', error);
    }
}

/**
 * 渲染文件列表
 */
function renderFiles(files) {
    const tbody = document.getElementById('filesTableBody');
    if (!tbody) return;

    if (!files || !files.length) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="5">暂无文件</td></tr>';
        return;
    }

    tbody.innerHTML = files.map(file => `
        <tr data-id="${file.id}">
            <td>
                <div class="file-cell">
                    <div class="file-icon ${file.type}">
                        ${getFileIcon(file.type)}
                    </div>
                    <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                </div>
            </td>
            <td><span class="type-badge ${file.type}">${getFileTypeName(file.type)}</span></td>
            <td>${formatFileSize(file.size)}</td>
            <td>${formatDate(file.created_at)}</td>
            <td>
                <div class="action-group">
                    <button class="btn-icon" onclick="previewFile('${file.id}', event)" title="打开">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                    </button>
                    <button class="btn-icon" onclick="downloadFile('${file.id}', event)" title="下载">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </button>
                    <button class="btn-icon danger" onclick="deleteFile('${file.id}', event)" title="删除">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * 获取文件图标
 */
function getFileIcon(type) {
    const icons = {
        folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
        video: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>',
        audio: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
        image: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
        document: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
        archive: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>',
        other: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>'
    };
    return icons[type] || icons.other;
}

/**
 * 预览文件
 */
function previewFile(fileId, event) {
    // 阻止事件冒泡，防止触发父元素的点击事件
    if (event) {
        event.stopPropagation();
    }

    // 在服务器端打开文件
    api.request('POST', `/files/${fileId}/open`)
        .then(response => {
            if (response.success) {
                showToast('已在服务器端打开文件', 'success');
            } else {
                showToast(response.error || '打开文件失败', 'error');
            }
        })
        .catch(error => {
            console.error('打开文件失败:', error);
            showToast('打开文件失败，请重试', 'error');
        });
}

/**
 * 下载文件
 */
function downloadFile(fileId, event) {
    // 阻止事件冒泡，防止触发父元素的点击事件
    if (event) {
        event.stopPropagation();
    }
    api.downloadFile(fileId);
}

/**
 * 删除文件
 */
async function deleteFile(fileId, event) {
    // 阻止事件冒泡，防止触发父元素的点击事件
    if (event) {
        event.stopPropagation();
    }
    if (!confirm('确定要删除该文件吗？此操作不可恢复。')) {
        return;
    }

    try {
        const response = await api.deleteFile(fileId);
        if (response.success) {
            pageCache.files.timestamp = 0;
            loadFileStats(true);
            showToast('文件删除成功', 'success');
        } else {
            showToast(response.error || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除文件失败:', error);
        showToast('删除失败，请重试', 'error');
    }
}

/**
 * 清理无效文件
 */
async function cleanupFiles() {
    if (!confirm('确定要清理无效文件吗？此操作不可恢复。清理过程中可能会删除没有关联记录的文件。')) {
        return;
    }

    try {
        const response = await api.cleanupFiles();
        if (response.success) {
            const deletedCount = response.data?.deleted_count || 0;
            showToast(`清理完成，删除了 ${deletedCount} 个无效文件`, 'success');
            pageCache.files.timestamp = 0;
            loadFileStats(true);
        } else {
            showToast(response.error || '清理失败', 'error');
        }
    } catch (error) {
        console.error('清理文件失败:', error);
        showToast('清理失败，请重试', 'error');
    }
}

/**
 * 扫描 uploads 文件夹
 */
async function scanUploadsFolder() {
    if (!confirm('确定要扫描 uploads 文件夹吗？此操作会自动导入文件夹中的所有文件。')) {
        return;
    }

    try {
        showToast('正在扫描 uploads 文件夹...', 'info');
        const response = await api.scanUploadsFolder();
        
        if (response.success) {
            const data = response.data || {};
            const added = data.added || 0;
            const skipped = data.skipped || 0;
            
            showToast(`扫描完成: 新增 ${added} 个文件, 跳过 ${skipped} 个重复文件`, 'success');

            // 刷新视频和文件列表
            pageCache.videos.timestamp = 0;
            pageCache.files.timestamp = 0;
            loadVideos(true);
            loadFileStats(true);
        } else {
            showToast(response.error || '扫描失败', 'error');
        }
    } catch (error) {
        console.error('扫描 uploads 文件夹失败:', error);
        showToast('扫描失败，请重试', 'error');
    }
}

/**
 * 加载系统设置
 */
async function loadSettings() {
    try {
        const response = await api.getAdminConfig();
        if (response.success) {
            const config = response.data;

            const portEl = document.getElementById('serverPort');
            const uploadLimitEl = document.getElementById('uploadLimit');
            const sessionTimeoutEl = document.getElementById('sessionTimeout');
            const enableCaptchaEl = document.getElementById('enableCaptcha');

            if (portEl) portEl.value = config.port || 3000;
            if (uploadLimitEl) {
                // upload_limit 是以字节为单位，需要转换为 GB 显示
                const uploadLimitGB = config.upload_limit ? Math.round(config.upload_limit / (1024 * 1024 * 1024)) : 5;
                uploadLimitEl.value = uploadLimitGB;
            }
            if (sessionTimeoutEl) sessionTimeoutEl.value = config.session_timeout || 120;
            if (enableCaptchaEl) enableCaptchaEl.checked = config.enable_captcha !== false;
        }
    } catch (error) {
        console.error('加载设置失败:', error);
        // 使用默认值
        const portEl = document.getElementById('serverPort');
        const uploadLimitEl = document.getElementById('uploadLimit');
        const sessionTimeoutEl = document.getElementById('sessionTimeout');

        if (portEl) portEl.value = 3000;
        if (uploadLimitEl) uploadLimitEl.value = 5;
        if (sessionTimeoutEl) sessionTimeoutEl.value = 120;
    }
}

/**
 * 保存系统设置
 */
async function saveSettings() {
    const portEl = document.getElementById('serverPort');
    const uploadLimitEl = document.getElementById('uploadLimit');
    const sessionTimeoutEl = document.getElementById('sessionTimeout');
    const enableCaptchaEl = document.getElementById('enableCaptcha');

    if (!portEl || !uploadLimitEl || !sessionTimeoutEl) {
        showToast('页面加载中，请稍候', 'error');
        return;
    }

    const port = parseInt(portEl.value) || 3000;
    const uploadLimitGB = parseInt(uploadLimitEl.value) || 5;
    const sessionTimeout = parseInt(sessionTimeoutEl.value) || 120;
    const enableCaptcha = enableCaptchaEl ? enableCaptchaEl.checked : true;

    // 验证端口范围
    if (port < 1 || port > 65535) {
        showToast('请输入有效的端口号（1-65535）', 'error');
        portEl.focus();
        return;
    }

    // 验证上传限制（GB）
    if (uploadLimitGB < 1) {
        showToast('请输入有效的上传限制', 'error');
        uploadLimitEl.focus();
        return;
    }

    // 验证会话超时
    if (sessionTimeout < 5 || sessionTimeout > 10080) {
        showToast('请输入有效的会话超时时间（5-10080分钟）', 'error');
        sessionTimeoutEl.focus();
        return;
    }

    const config = {
        port,
        // 将 GB 转换为字节存储
        upload_limit: uploadLimitGB * 1024 * 1024 * 1024,
        session_timeout: sessionTimeout,
        enable_captcha: enableCaptcha
    };

    try {
        const response = await api.updateAdminConfig(config);
        if (response.success) {
            showToast('设置保存成功', 'success');
        } else {
            showToast(response.error || '保存失败', 'error');
        }
    } catch (error) {
        console.error('保存设置失败:', error);
        showToast('保存失败，请重试', 'error');
    }
}

/**
 * 加载系统日志
 */
async function loadLogs(forceRefresh = false) {
    // 检查缓存
    const now = Date.now();
    const logLevelEl = document.getElementById('logLevel');
    const level = logLevelEl ? logLevelEl.value : '';

    if (!forceRefresh && pageCache.logs.data && pageCache.logs.level === level && (now - pageCache.logs.timestamp) < 10000) {
        return; // 使用缓存
    }

    try {
        const response = await api.getSystemLogs(level, 100);
        if (response.success) {
            pageCache.logs.data = response.data.logs || [];
            pageCache.logs.level = level;
            pageCache.logs.timestamp = now;
            renderLogs(pageCache.logs.data);
        } else {
            const logContainer = document.getElementById('logContainer');
            if (logContainer) {
                logContainer.innerHTML = '<div class="log-empty">加载失败</div>';
            }
        }
    } catch (error) {
        console.error('加载日志失败:', error);
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            logContainer.innerHTML = '<div class="log-empty">加载失败，请重试</div>';
        }
    }
}

/**
 * 渲染日志
 */
function renderLogs(logs) {
    const logContainer = document.getElementById('logContainer');
    if (!logContainer) return;

    if (!logs || !logs.length) {
        logContainer.innerHTML = '<div class="log-empty">暂无日志记录</div>';
        return;
    }

    // 按时间倒序排列
    const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    logContainer.innerHTML = sortedLogs.map(log => `
        <div class="log-entry">
            <span class="log-time">${formatDateTime(log.timestamp)}</span>
            <span class="log-level ${log.level}">${log.level.toUpperCase().padEnd(5)}</span>
            <span class="log-message">${escapeHtml(log.message)}</span>
        </div>
    `).join('');
}

/**
 * 打开上传模态框
 */
function openUploadModal(type = 'file') {
    const modal = document.getElementById('uploadModal');
    const dropzone = document.getElementById('uploadDropzone');

    if (modal) {
        modal.classList.add('active');
    }

    // 更新上传提示
    if (dropzone) {
        const hint = dropzone.querySelector('p');
        if (hint) {
            hint.textContent = type === 'video' ? '拖拽视频文件到此处或点击选择' : '拖拽文件到此处或点击选择';
        }
    }

    // 重置文件输入
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
    }
}

/**
 * 关闭上传模态框
 */
function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    const progress = document.getElementById('uploadProgress');
    const uploadActions = document.getElementById('uploadActions');
    const uploadDropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileInput');

    if (modal) {
        modal.classList.remove('active');
    }
    if (progress) {
        progress.style.display = 'none';
    }
    if (uploadActions) {
        uploadActions.style.display = 'none';
    }
    if (uploadDropzone) {
        uploadDropzone.style.display = 'block';
    }
    if (fileInput) {
        fileInput.value = '';
    }
}

/**
 * 验证本地视频路径
 */
async function validateLocalVideoPath() {
    const pathInput = document.getElementById('localVideoPath');
    const status = document.getElementById('localVideoStatus');
    const preview = document.getElementById('localVideoPreview');
    const saveBtn = document.getElementById('saveLocalVideoBtn');

    if (!pathInput || !pathInput.value.trim()) {
        showToast('请输入视频文件路径', 'error');
        return;
    }

    const filePath = pathInput.value.trim();

    // 验证路径格式
    if (!isValidPathFormat(filePath)) {
        if (status) {
            status.className = 'local-video-status invalid';
            status.innerHTML = `<span>✗ 路径格式不正确，请使用绝对路径，例如：/mnt/data/video.mp4 或 D:\\Videos\\video.mp4</span>`;
        }
        return;
    }

    // 显示加载状态
    if (status) {
        status.className = 'local-video-status loading';
        status.innerHTML = '<span>正在验证文件...</span>';
    }

    try {
        const response = await api.validateLocalPath(filePath);

        if (response.success && response.valid) {
            // 显示文件信息预览
            if (preview) preview.style.display = 'block';
            if (status) {
                status.className = 'local-video-status valid';
                status.innerHTML = '<span>✓ 文件验证成功</span>';
            }
            if (saveBtn) saveBtn.disabled = false;

            // 填充预览信息
            document.getElementById('previewFileName').textContent = response.data.fileName;
            document.getElementById('previewFileSize').textContent = response.data.formattedSize;
            document.getElementById('previewDuration').textContent = formatDuration(response.data.duration);
            document.getElementById('previewResolution').textContent =
                response.data.width && response.data.height
                    ? `${response.data.width}x${response.data.height}`
                    : '--';
        } else {
            // 提供更详细的错误信息
            const errorMessage = response.error || '文件验证失败';
            let detailedError = errorMessage;
            
            // 根据不同错误提供帮助信息
            if (errorMessage.includes('不存在') || errorMessage.includes('Not found')) {
                detailedError = `文件不存在，请检查路径是否正确。<br>
                    <span style="font-size: 12px; color: #666;">
                    常见路径示例：<br>
                    • Linux: /home/user/videos/video.mp4<br>
                    • Windows: C:\\Users\\Public\\Videos\\video.mp4<br>
                    • 网络路径: //server/share/video.mp4
                    </span>`;
            } else if (errorMessage.includes('权限') || errorMessage.includes('Permission')) {
                detailedError = `服务器无权访问该文件，请检查文件权限。`;
            } else if (errorMessage.includes('格式') || errorMessage.includes('Format')) {
                detailedError = `文件格式不支持，请选择有效的视频文件（MP4、WebM、MKV等）。`;
            }

            if (status) {
                status.className = 'local-video-status invalid';
                status.innerHTML = `<span>✗ ${detailedError}</span>`;
            }
            if (preview) preview.style.display = 'none';
            if (saveBtn) saveBtn.disabled = true;
        }
    } catch (error) {
        console.error('验证文件路径失败:', error);
        
        let errorMessage = '验证失败，请检查网络连接';
        
        // 根据错误类型提供更详细的提示
        if (error.message && error.message.includes('Failed to fetch')) {
            errorMessage = '无法连接到服务器，请确认服务器正在运行';
        } else if (error.message && error.message.includes('NetworkError')) {
            errorMessage = '网络错误，请检查服务器地址和端口';
        }
        
        if (status) {
            status.className = 'local-video-status invalid';
            status.innerHTML = `<span>✗ ${errorMessage}</span>`;
        }
    }
}

/**
 * 验证路径格式是否正确
 */
function isValidPathFormat(path) {
    if (!path || path.trim().length === 0) return false;
    
    const trimmedPath = path.trim();
    
    // 检查是否包含非法字符
    const illegalChars = /[?*|"<>]/;
    if (illegalChars.test(trimmedPath)) {
        return false;
    }
    
    // Linux/Unix路径: 以/开头
    if (trimmedPath.startsWith('/')) {
        return true;
    }
    
    // Windows路径: 包含盘符如 C: 或网络路径 \\
    if (/^[A-Za-z]:/.test(trimmedPath) || trimmedPath.startsWith('\\\\')) {
        return true;
    }
    
    return false;
}

/**
 * 保存本地视频
 * 根据当前激活的标签页处理单个、批量或文件夹扫描的视频添加
 */
async function saveLocalVideo() {
    const saveBtn = document.getElementById('saveLocalVideoBtn');
    const status = document.getElementById('localVideoStatus');

    // 根据当前标签页处理
    if (currentVideoTab === 'single') {
        // 单个文件模式 - 使用路径输入
        await addLocalVideoByPath(saveBtn, status);
    } else if (currentVideoTab === 'batch') {
        // 批量添加模式 - 需要多行路径输入
        await addMultipleVideosByPaths(saveBtn, status);
    } else if (currentVideoTab === 'folder') {
        // 文件夹扫描模式
        await addVideosFromFolder(saveBtn, status);
    }
}

/**
 * 通过路径添加单个视频
 */
async function addLocalVideoByPath(saveBtn, status) {
    const pathInput = document.getElementById('localVideoPath');
    const nameInput = document.getElementById('localVideoName');
    const descInput = document.getElementById('localVideoDescription');

    const videoPath = pathInput ? pathInput.value.trim() : '';
    const videoName = nameInput ? nameInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';

    if (!videoPath) {
        showToast('请输入视频路径', 'warning');
        return;
    }

    // 验证路径格式
    if (!isValidPathFormat(videoPath)) {
        if (status) {
            status.className = 'local-video-status invalid';
            status.innerHTML = '<span>✗ 路径格式不正确，请输入有效路径</span>';
        }
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.querySelector('#saveBtnText').textContent = '添加中...';
    }

    if (status) {
        status.className = 'local-video-status loading';
        status.innerHTML = '<span>正在验证文件...</span>';
    }

    try {
        // 验证文件
        const validateResponse = await api.validateLocalPath(videoPath);

        if (!validateResponse.success || !validateResponse.valid) {
            if (status) {
                status.className = 'local-video-status invalid';
                status.innerHTML = '<span>✗ 文件不存在或无法访问</span>';
            }
            showToast('视频文件验证失败，请检查路径是否正确', 'error');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.querySelector('#saveBtnText').textContent = '添加视频';
            }
            return;
        }

        if (status) {
            status.className = 'local-video-status loading';
            status.innerHTML = '<span>正在添加视频...</span>';
        }

        // 如果名称为空，从路径自动提取
        const displayName = videoName || extractFileName(videoPath);

        const addResponse = await api.registerLocalVideo(videoPath, displayName, description);

        if (addResponse.success) {
            if (status) {
                status.className = 'local-video-status success';
                status.innerHTML = '<span>✓ 视频添加成功!</span>';
            }
            showToast('视频已成功添加到资料库', 'success');
            closeLocalVideoModal();
            loadVideos(true);
        } else {
            if (status) {
                status.className = 'local-video-status invalid';
                status.innerHTML = `<span>✗ ${addResponse.error || '添加失败'}</span>`;
            }
            showToast(addResponse.error || '添加视频失败', 'error');
        }
    } catch (error) {
        console.error('添加本地视频失败:', error);
        if (status) {
            status.className = 'local-video-status invalid';
            status.innerHTML = '<span>✗ 网络错误，请检查连接</span>';
        }
        showToast('添加失败，请重试', 'error');
    }

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.querySelector('#saveBtnText').textContent = '添加视频';
    }
}

/**
 * 通过多行路径批量添加视频
 */
async function addMultipleVideosByPaths(saveBtn, status) {
    const nameInput = document.getElementById('localVideoName');
    const descInput = document.getElementById('localVideoDescription');

    // 获取名称前缀和描述
    const namePrefix = nameInput ? nameInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.querySelector('#saveBtnText').textContent = '添加中...';
    }

    if (status) {
        status.className = 'local-video-status loading';
        status.innerHTML = '<span>正在添加视频...</span>';
    }

    showToast('批量添加功能即将推出，请使用单个文件模式添加视频', 'info');

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.querySelector('#saveBtnText').textContent = '添加视频';
    }
}

/**
 * 从文件夹添加视频
 */
async function addVideosFromFolder(saveBtn, status) {
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.querySelector('#saveBtnText').textContent = '添加中...';
    }

    if (status) {
        status.className = 'local-video-status loading';
        status.innerHTML = '<span>正在添加视频...</span>';
    }

    showToast('文件夹扫描功能即将推出，请使用单个文件模式添加视频', 'info');

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.querySelector('#saveBtnText').textContent = '添加视频';
    }
}

/**
 * 更新保存按钮状态
 */
function updateSaveButtonState() {
    const saveBtn = document.getElementById('saveLocalVideoBtn');
    const saveBtnText = document.getElementById('saveBtnText');
    const saveBtnCount = document.getElementById('saveBtnCount');

    // 检查路径输入框是否有内容
    const pathInput = document.getElementById('localVideoPath');
    const hasPath = pathInput && pathInput.value.trim().length > 0;

    if (hasPath) {
        if (saveBtn) {
            saveBtn.disabled = false;
        }

        if (saveBtnText) saveBtnText.textContent = '添加视频';
        if (saveBtnCount) saveBtnCount.style.display = 'none';
    } else {
        if (saveBtn) {
            saveBtn.disabled = true;
        }
        if (saveBtnText) saveBtnText.textContent = '添加视频';
        if (saveBtnCount) saveBtnCount.style.display = 'none';
    }
}

/**
 * 处理单个视频文件选择
 */
function handleSingleVideoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 存储选中的文件
    selectedVideoFiles = [file];
    
    // 更新状态显示
    const status = document.getElementById('localVideoStatus');
    if (status) {
        status.className = 'local-video-status';
        status.innerHTML = `<span>已选择: ${file.name} (${formatFileSize(file.size)})</span>`;
    }
    
    // 自动填充名称
    if (elements.localVideoName && !elements.localVideoName.value.trim()) {
        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        elements.localVideoName.value = fileNameWithoutExt;
    }
    
    showToast(`已选择视频: ${file.name}`, 'info');
    
    // 更新按钮状态
    updateSaveButtonState();
    
    // 清空input，允许重复选择同一文件
    event.target.value = '';
}

/**
 * 处理单个视频拖拽放置
 */
function handleSingleVideoDrop(e) {
    e.preventDefault();
    
    const dropzone = document.getElementById('singleVideoDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        // 只取第一个视频文件
        const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v'];
        const videoFile = Array.from(files).find(f => {
            const name = f.name || '';
            return videoExtensions.some(ext => name.toLowerCase().endsWith(ext));
        });
        
        if (videoFile) {
            handleSingleVideoSelect({ target: { files: [videoFile] } });
        } else {
            showToast('请选择视频文件', 'warning');
        }
    }
}

/**
 * 处理批量视频文件选择
 */
function handleBatchVideoSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    // 过滤视频文件
    const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v'];
    const videoFiles = files.filter(f => {
        const name = f.name || '';
        return videoExtensions.some(ext => name.toLowerCase().endsWith(ext));
    });
    
    if (videoFiles.length === 0) {
        showToast('未找到有效的视频文件', 'warning');
        return;
    }
    
    selectedVideoFiles = videoFiles;
    
    // 更新计数
    if (elements.selectedCount) {
        elements.selectedCount.textContent = videoFiles.length;
    }
    
    // 更新文件列表显示
    if (elements.selectedFilesList) {
        const totalSize = videoFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        
        elements.selectedFilesList.innerHTML = videoFiles.map((file, index) => `
            <div class="selected-file-item">
                <div class="selected-file-info">
                    <svg class="selected-file-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                    </svg>
                    <span class="selected-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                    <span class="selected-file-size">${formatFileSize(file.size)}</span>
                </div>
                <button class="selected-file-remove" onclick="removeSelectedVideo(${index})">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
        `).join('');
    }
    
    // 更新状态
    const status = document.getElementById('localVideoStatus');
    const totalSize = videoFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    if (status) {
        status.className = 'local-video-status';
        status.innerHTML = `<span>已选择 ${videoFiles.length} 个视频，总大小: ${formatFileSize(totalSize)}</span>`;
    }
    
    showToast(`已选择 ${videoFiles.length} 个视频`, 'info');
    
    // 更新按钮状态
    updateSaveButtonState();
    
    // 清空input
    event.target.value = '';
}

/**
 * 处理批量视频拖拽放置
 */
function handleBatchVideoDrop(e) {
    e.preventDefault();
    
    const dropzone = document.getElementById('batchVideoDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleBatchVideoSelect({ target: { files: files } });
    }
}

/**
 * 从选中列表移除视频
 */
window.removeSelectedVideo = function(index) {
    if (index >= 0 && index < selectedVideoFiles.length) {
        selectedVideoFiles.splice(index, 1);
        
        // 更新计数
        if (elements.selectedCount) {
            elements.selectedCount.textContent = selectedVideoFiles.length;
        }
        
        // 重新渲染列表
        if (selectedVideoFiles.length === 0) {
            if (elements.selectedFilesList) {
                elements.selectedFilesList.innerHTML = '<div class="empty-state">尚未选择文件</div>';
            }
            const status = document.getElementById('localVideoStatus');
            if (status) status.innerHTML = '';
        } else {
            handleBatchVideoSelect({ target: { files: selectedVideoFiles } });
        }
        
        updateSaveButtonState();
    }
};

/**
 * 清空选中的视频列表
 */
function clearSelectedVideos() {
    selectedVideoFiles = [];
    
    if (elements.selectedCount) {
        elements.selectedCount.textContent = '0';
    }
    
    if (elements.selectedFilesList) {
        elements.selectedFilesList.innerHTML = '<div class="empty-state">尚未选择文件</div>';
    }
    
    const status = document.getElementById('localVideoStatus');
    if (status) status.innerHTML = '';
    
    // 清空文件输入
    if (elements.batchVideoInput) {
        elements.batchVideoInput.value = '';
    }
    
    // 清空批量选项
    if (elements.batchNamePrefix) elements.batchNamePrefix.value = '';
    if (elements.batchDescription) elements.batchDescription.value = '';
    
    updateSaveButtonState();
}

/**
 * 处理文件夹视频选择
 */
function handleFolderVideoSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    // 过滤视频文件
    const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v'];
    const videoFiles = files.filter(f => {
        const name = f.name || f.webkitRelativePath || '';
        return videoExtensions.some(ext => name.toLowerCase().endsWith(ext));
    });
    
    if (videoFiles.length === 0) {
        showToast('未找到有效的视频文件', 'warning');
        return;
    }
    
    // 获取文件夹名称
    let folderName = '未知';
    if (files[0].webkitRelativePath) {
        folderName = files[0].webkitRelativePath.split('/')[0];
    } else {
        folderName = files[0].name || '选择文件夹';
    }
    
    // 显示预览
    if (elements.folderPreview) {
        elements.folderPreview.style.display = 'block';
    }
    
    if (elements.folderPath) {
        elements.folderPath.textContent = folderName;
    }
    
    if (elements.foundVideos) {
        elements.foundVideos.textContent = videoFiles.length;
    }
    
    const totalSize = videoFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    if (elements.estimatedSize) {
        elements.estimatedSize.textContent = formatFileSize(totalSize);
    }
    
    // 存储选中的视频文件
    selectedVideoFiles = videoFiles;
    
    // 更新状态
    const status = document.getElementById('localVideoStatus');
    if (status) {
        status.className = 'local-video-status';
        status.innerHTML = `<span>已选择文件夹: ${folderName}，包含 ${videoFiles.length} 个视频</span>`;
    }
    
    showToast(`已选择文件夹，包含 ${videoFiles.length} 个视频`, 'info');
    
    // 更新按钮状态
    updateSaveButtonState();
    
    // 清空input
    event.target.value = '';
}

/**
 * 处理文件夹拖拽放置
 */
function handleFolderVideoDrop(e) {
    e.preventDefault();
    
    const dropzone = document.getElementById('folderDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }
    
    // 处理文件夹拖拽
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
        const fileQueue = [];
        const files = [];
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                if (entry) {
                    if (entry.isFile) {
                        files.push(item.getAsFile());
                    } else if (entry.isDirectory) {
                        fileQueue.push(entry);
                    }
                }
            }
        }
        
        if (fileQueue.length > 0) {
            readDirectoryForVideo(fileQueue, files).then(() => {
                handleFolderVideoSelect({ target: { files: files } });
            });
        } else {
            handleFolderVideoSelect({ target: { files: files } });
        }
    }
}

/**
 * 递归读取目录中的视频文件
 */
function readDirectoryForVideo(directories, files) {
    return new Promise((resolve) => {
        if (directories.length === 0) {
            resolve();
            return;
        }
        
        const reader = directories.shift().createReader();
        reader.readEntries((entries) => {
            const subDirs = [];
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (entry.isFile) {
                    files.push(entry);
                } else if (entry.isDirectory) {
                    subDirs.push(entry);
                }
            }
            
            if (entries.length > 0) {
                directories.unshift(reader);
            }
            
            if (subDirs.length > 0) {
                readDirectoryForVideo(subDirs, files).then(() => {
                    readDirectoryForVideo(directories, files).then(resolve);
                });
            } else {
                readDirectoryForVideo(directories, files).then(resolve);
            }
        });
    });
}

/**
 * 打开本地视频模态框
 */
function openLocalVideoModal() {
    // 调试信息
    console.log('[Admin] 尝试打开本地视频模态框');
    console.log('[Admin] 检查DOM元素:');
    
    const modal = document.getElementById('localVideoModal');
    const btn = document.getElementById('addLocalVideoBtn');
    
    console.log('  - localVideoModal:', modal);
    console.log('  - addLocalVideoBtn:', btn);
    console.log('  - 模态框当前classList:', modal ? modal.classList.toString() : 'N/A');
    
    if (modal) {
        // 检查模态框的实际位置和尺寸
        const rect = modal.getBoundingClientRect();
        console.log('[Admin] 模态框位置和尺寸:');
        console.log('  - top:', rect.top, 'px');
        console.log('  - left:', rect.left, 'px');
        console.log('  - width:', rect.width, 'px');
        console.log('  - height:', rect.height, 'px');
        console.log('  - visibility:', getComputedStyle(modal).visibility);
        console.log('  - opacity:', getComputedStyle(modal).opacity);
        console.log('  - z-index:', getComputedStyle(modal).zIndex);
        
        console.log('[Admin] 找到模态框，添加active类');
        modal.classList.add('active');
        
        // 再次检查位置
        setTimeout(() => {
            const rectAfter = modal.getBoundingClientRect();
            console.log('[Admin] 添加active类后模态框:');
            console.log('  - top:', rectAfter.top, 'px');
            console.log('  - left:', rectAfter.left, 'px');
            console.log('  - width:', rectAfter.width, 'px');
            console.log('  - height:', rectAfter.height, 'px');
            console.log('  - classList:', modal.classList.toString());
            console.log('  - visibility:', getComputedStyle(modal).visibility);
            console.log('  - opacity:', getComputedStyle(modal).opacity);
        }, 50);
        
        resetLocalVideoForm();
        console.log('[Admin] 模态框应该已显示 - 请检查屏幕中央是否有一个对话框！');
    } else {
        console.error('[Admin] 未找到localVideoModal元素!');
    }
}

/**
 * 关闭本地视频模态框
 */
function closeLocalVideoModal() {
    const modal = document.getElementById('localVideoModal');
    if (modal) {
        modal.classList.remove('active');
    }
    resetLocalVideoForm();
}

/**
 * 重置本地视频表单
 */
function resetLocalVideoForm() {
    selectedVideoFiles = [];
    currentVideoTab = 'single';

    // 重置标签页UI
    document.querySelectorAll('#localVideoModal .modal-tabs .tab-btn').forEach((btn, index) => {
        btn.classList.toggle('active', index === 0);
    });
    document.querySelectorAll('#localVideoModal .tab-content').forEach((content, index) => {
        content.classList.toggle('active', index === 0);
    });

    // 清空输入字段
    const pathInput = document.getElementById('localVideoPath');
    if (pathInput) pathInput.value = '';
    if (elements.localVideoName) elements.localVideoName.value = '';
    if (elements.localVideoDescription) elements.localVideoDescription.value = '';
    if (elements.batchNamePrefix) elements.batchNamePrefix.value = '';
    if (elements.batchDescription) elements.batchDescription.value = '';

    // 清空文件列表
    if (elements.selectedFilesList) {
        elements.selectedFilesList.innerHTML = '<div class="empty-state">尚未选择文件</div>';
    }
    if (elements.selectedCount) {
        elements.selectedCount.textContent = '0';
    }

    // 隐藏文件夹预览
    if (elements.folderPreview) {
        elements.folderPreview.style.display = 'none';
    }

    // 清空状态
    const status = document.getElementById('localVideoStatus');
    if (status) status.innerHTML = '';

    // 重置按钮状态
    updateSaveButtonState();
}

/**
 * 处理本地视频拖拽悬停
 * 当拖拽文件进入拖拽区域时触发
 */
function handleLocalVideoDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = document.getElementById('localVideoDropzone');
    if (dropzone) {
        dropzone.classList.add('dragover');
    }
}

/**
 * 处理本地视频拖拽离开
 * 当拖拽文件离开拖拽区域时触发
 */
function handleLocalVideoDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = document.getElementById('localVideoDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }
}

/**
 * 处理本地视频拖拽放置
 * 当用户拖拽视频文件到拖拽区域时触发
 */
function handleLocalVideoDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const dropzone = document.getElementById('localVideoDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    // 收集所有文件
    const files = [];
    const fileQueue = [];

    // 检查是否为文件夹
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
            if (entry) {
                if (entry.isFile) {
                    files.push(item.getAsFile());
                } else if (entry.isDirectory) {
                    // 递归读取文件夹
                    fileQueue.push(entry);
                }
            } else {
                // 降级处理：直接获取文件
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }
    }

    // 如果有待扫描的文件夹，使用递归读取
    if (fileQueue.length > 0) {
        readDirectoryEntries(fileQueue, files).then(() => {
            processVideoFiles(files);
        });
    } else {
        processVideoFiles(files);
    }
}

/**
 * 递归读取目录中的文件
 * @param {Array} directories - 目录队列
 * @param {Array} files - 文件收集数组
 * @returns {Promise} 完成时resolve
 */
function readDirectoryEntries(directories, files) {
    return new Promise((resolve) => {
        if (directories.length === 0) {
            resolve();
            return;
        }

        const reader = directories.shift().createReader();
        reader.readEntries((entries) => {
            const subDirs = [];
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (entry.isFile) {
                    files.push(entry);
                } else if (entry.isDirectory) {
                    subDirs.push(entry);
                }
            }

            // 继续读取当前目录的更多条目
            if (entries.length > 0) {
                directories.unshift(reader);
            }

            // 递归处理子目录
            if (subDirs.length > 0) {
                readDirectoryEntries(subDirs, files).then(() => {
                    readDirectoryEntries(directories, files).then(resolve);
                });
            } else {
                readDirectoryEntries(directories, files).then(resolve);
            }
        });
    });
}

/**
 * 处理视频文件列表
 * @param {Array} files - 文件数组
 */
function processVideoFiles(files) {
    const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp', '.ogv'];
    const videoFiles = files.filter(file => {
        if (!file) return false;
        const name = file.name || '';
        return videoExtensions.some(ext => name.toLowerCase().endsWith(ext));
    });

    if (videoFiles.length === 0) {
        showToast('未检测到有效的视频文件', 'warning');
        return;
    }

    if (videoFiles.length === 1) {
        // 单个文件，使用现有逻辑
        handleSingleVideoFile(videoFiles[0]);
    } else {
        // 多个文件，打开批量添加模态框
        openBatchAddModal(videoFiles);
    }
}

/**
 * 处理单个视频文件
 * @param {File} file - 文件对象
 */
function handleSingleVideoFile(file) {
    const pathInput = document.getElementById('localVideoPath');
    const nameInput = document.getElementById('localVideoName');
    const status = document.getElementById('localVideoStatus');

    // 获取文件路径
    let filePath = file.webkitRelativePath || file.name || file.fullPath || '';

    if (pathInput) {
        pathInput.value = filePath;
    }

    // 自动填充名称
    if (nameInput && !nameInput.value.trim()) {
        const fileName = (file.name || filePath).split('/').pop();
        const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        nameInput.value = fileNameWithoutExt;
    }

    showToast(`已选择视频: ${file.name || filePath}`, 'info');

    // 更新状态
    if (status) {
        status.className = 'local-video-status';
        status.innerHTML = '<span style="color: #ff9800;">⚠ 请验证文件路径是否正确</span>';
    }
}

/**
 * 打开批量添加模态框
 * @param {Array} files - 视频文件数组
 */
function openBatchAddModal(files) {
    const modal = document.getElementById('batchAddModal');
    const fileList = document.getElementById('batchFileList');
    const progress = document.getElementById('batchAddProgress');

    if (modal) {
        modal.classList.add('active');
    }

    // 重置进度
    if (progress) {
        progress.style.display = 'none';
    }

    // 显示文件列表
    if (fileList) {
        const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp', '.ogv'];

        // 过滤并显示视频文件
        const videoFiles = files.filter(file => {
            if (!file) return false;
            const name = file.name || '';
            return videoExtensions.some(ext => name.toLowerCase().endsWith(ext));
        });

        fileList.innerHTML = videoFiles.map((file, index) => {
            const name = file.name || file.webkitRelativePath || '未知文件';
            const size = file.size ? formatFileSize(file.size) : '--';

            return `
            <div class="batch-file-item" data-index="${index}">
                <div class="file-info">
                    <svg viewBox="0 0 24 24" fill="currentColor" class="file-icon">
                        <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                    </svg>
                    <div class="file-details">
                        <span class="file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                        <span class="file-size">${size}</span>
                    </div>
                </div>
                <button class="btn-remove" onclick="removeBatchFile(${index})" title="移除">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            `;
        }).join('');

        // 更新统计
        const countEl = document.getElementById('batchFileCount');
        if (countEl) {
            countEl.textContent = videoFiles.length;
        }
    }
}

/**
 * 关闭批量添加模态框
 */
function closeBatchAddModal() {
    const modal = document.getElementById('batchAddModal');
    const fileList = document.getElementById('batchFileList');
    const progress = document.getElementById('batchAddProgress');

    if (modal) {
        modal.classList.remove('active');
    }
    if (fileList) {
        fileList.innerHTML = '';
    }
    if (progress) {
        progress.style.display = 'none';
    }

    // 清除文件输入
    const fileInput = document.getElementById('batchFileInput');
    if (fileInput) {
        fileInput.value = '';
    }
}

/**
 * 从批量列表中移除文件
 * @param {number} index - 文件索引
 */
function removeBatchFile(index) {
    const fileItem = document.querySelector(`.batch-file-item[data-index="${index}"]`);
    if (fileItem) {
        fileItem.remove();

        // 更新计数
        const countEl = document.getElementById('batchFileCount');
        const remainingItems = document.querySelectorAll('.batch-file-item');
        if (countEl) {
            countEl.textContent = remainingItems.length;
        }

        // 如果没有文件了，关闭模态框
        if (remainingItems.length === 0) {
            closeBatchAddModal();
        }
    }
}

/**
 * 清空批量文件列表
 */
function clearBatchFileList() {
    const fileList = document.getElementById('batchFileList');
    if (fileList) {
        fileList.innerHTML = '';
    }

    const countEl = document.getElementById('batchFileCount');
    if (countEl) {
        countEl.textContent = '0';
    }

    const progress = document.getElementById('batchAddProgress');
    if (progress) {
        progress.style.display = 'none';
    }

    // 清除文件输入
    const fileInput = document.getElementById('batchFileInput');
    if (fileInput) {
        fileInput.value = '';
    }
}

/**
 * 开始批量添加视频
 */
async function startBatchAddVideos() {
    const fileItems = document.querySelectorAll('.batch-file-item');
    if (fileItems.length === 0) {
        showToast('请先添加视频文件', 'warning');
        return;
    }

    const progress = document.getElementById('batchAddProgress');
    const progressBar = document.getElementById('batchAddProgressBar');
    const progressText = document.getElementById('batchAddProgressText');
    const startBtn = document.getElementById('startBatchAddBtn');

    if (!progress || !progressBar || !progressText) {
        showToast('页面加载中，请稍候', 'error');
        return;
    }

    progress.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '准备批量添加视频...';

    // 禁用开始按钮
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = '添加中...';
    }

    let successCount = 0;
    let failCount = 0;
    const total = fileItems.length;

    for (let i = 0; i < total; i++) {
        const fileItem = fileItems[i];
        const fileName = fileItem.querySelector('.file-name')?.textContent || `视频${i + 1}`;

        progressText.textContent = `正在处理 ${i + 1}/${total}: ${fileName}`;

        try {
            // 从DOM获取路径
            const path = fileItem.querySelector('.file-name')?.title || fileName;

            // 验证文件
            const validateResponse = await api.validateLocalPath(path);

            if (!validateResponse.success || !validateResponse.valid) {
                failCount++;
                fileItem.classList.add('failed');
                fileItem.querySelector('.file-info')?.insertAdjacentHTML('beforeend',
                    '<span class="error-tag">验证失败</span>');
                continue;
            }

            // 添加到数据库
            const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
            const addResponse = await api.registerLocalVideo(path, nameWithoutExt, '');

            if (addResponse.success) {
                successCount++;
                fileItem.classList.add('success');
                fileItem.querySelector('.file-info')?.insertAdjacentHTML('beforeend',
                    '<span class="success-tag">✓</span>');
            } else {
                failCount++;
                fileItem.classList.add('failed');
                fileItem.querySelector('.file-info')?.insertAdjacentHTML('beforeend',
                    `<span class="error-tag">${addResponse.error || '添加失败'}</span>`);
            }
        } catch (error) {
            console.error('批量添加视频失败:', error);
            failCount++;
            fileItem.classList.add('failed');
            fileItem.querySelector('.file-info')?.insertAdjacentHTML('beforeend',
                '<span class="error-tag">网络错误</span>');
        }

        // 更新进度条
        const percent = Math.round(((i + 1) / total) * 100);
        progressBar.style.width = `${percent}%`;
    }

    progressText.textContent = `批量添加完成: 成功 ${successCount} 个, 失败 ${failCount} 个`;

    // 恢复按钮
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = '开始添加';
    }

    // 延迟刷新并显示结果
    setTimeout(() => {
        if (failCount === 0) {
            showToast(`成功添加 ${successCount} 个视频到数据库`, 'success');
        } else {
            showToast(`完成: ${successCount} 个成功, ${failCount} 个失败`, failCount > 0 ? 'warning' : 'success');
        }

        closeBatchAddModal();

        // 刷新视频列表
        pageCache.videos.timestamp = 0;
        loadVideos(true);
    }, 1500);
}

/**
 * 打开文件夹扫描模态框
 */
function openFolderScanModal() {
    const modal = document.getElementById('folderScanModal');
    const pathInput = document.getElementById('scanFolderPath');
    const status = document.getElementById('scanStatus');
    const results = document.getElementById('scanResults');

    if (modal) {
        modal.classList.add('active');
    }

    // 重置表单
    if (pathInput) pathInput.value = '';
    if (status) status.innerHTML = '';
    if (results) results.innerHTML = '';
}

/**
 * 关闭文件夹扫描模态框
 */
function closeFolderScanModal() {
    const modal = document.getElementById('folderScanModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * 处理文件夹扫描输入
 */
function handleFolderScanInput(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const pathInput = document.getElementById('scanFolderPath');
    const status = document.getElementById('scanStatus');

    // 获取文件夹路径
    let folderPath = '';
    if (files[0].webkitRelativePath) {
        folderPath = files[0].webkitRelativePath.split('/')[0];
    } else {
        const path = files[0].path || '';
        folderPath = path.split('/').slice(0, -1).join('/') || files[0].name;
    }

    if (pathInput) {
        pathInput.value = folderPath;
    }

    // 更新状态
    if (status) {
        status.className = 'scan-status';
        status.innerHTML = '<span style="color: #2196f3;">已选择文件夹，请设置扫描选项后开始扫描</span>';
    }

    // 清空input
    event.target.value = '';
}

/**
 * 开始扫描文件夹
 */
async function startFolderScan() {
    const pathInput = document.getElementById('scanFolderPath');
    const extensionsInput = document.getElementById('scanExtensions');
    const recursivelyInput = document.getElementById('scanRecursively');
    const status = document.getElementById('scanStatus');
    const results = document.getElementById('scanResults');
    const scanBtn = document.getElementById('startScanBtn');

    if (!pathInput || !pathInput.value.trim()) {
        showToast('请输入或选择文件夹路径', 'error');
        return;
    }

    const folderPath = pathInput.value.trim();
    const extensions = extensionsInput ? extensionsInput.value.trim() : 'mp4,webm,mkv,avi,mov,flv,wmv,m4v';
    const recursively = recursivelyInput ? recursivelyInput.checked : true;

    // 验证路径格式
    if (!isValidPathFormat(folderPath)) {
        if (status) {
            status.className = 'scan-status invalid';
            status.innerHTML = '<span>✗ 路径格式不正确</span>';
        }
        return;
    }

    // 更新UI状态
    if (status) {
        status.className = 'scan-status loading';
        status.innerHTML = '<span>正在扫描文件夹...</span>';
    }
    if (results) results.innerHTML = '';

    // 禁用扫描按钮
    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.textContent = '扫描中...';
    }

    try {
        // 调用后端API扫描文件夹
        const response = await api.scanLocalFolder(folderPath, extensions, recursively);

        if (response.success) {
            const files = response.data.files || [];
            const totalSize = response.data.totalSize || 0;

            // 更新状态
            if (status) {
                status.className = 'scan-status success';
                status.innerHTML = `<span>✓ 扫描完成，找到 ${files.length} 个视频文件 (${formatFileSize(totalSize)})</span>`;
            }

            // 显示扫描结果
            if (results) {
                if (files.length === 0) {
                    results.innerHTML = '<div class="scan-empty">未找到视频文件</div>';
                } else {
                    results.innerHTML = `
                        <div class="scan-summary">
                            <span class="summary-item">文件数: ${files.length}</span>
                            <span class="summary-item">总大小: ${formatFileSize(totalSize)}</span>
                        </div>
                        <div class="scan-file-list">
                            ${files.map((file, index) => `
                                <div class="scan-file-item">
                                    <span class="file-name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
                                    <span class="file-size">${formatFileSize(file.size)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="scan-actions">
                            <button class="btn btn-primary" onclick="addScannedFilesToLibrary(${JSON.stringify(files).replace(/"/g, '&quot;')})">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                                全部添加到资料库
                            </button>
                            <button class="btn" onclick="openBatchAddModalFromScan(${JSON.stringify(files).replace(/"/g, '&quot;')})">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>
                                选择性添加
                            </button>
                        </div>
                    `;
                }
            }
        } else {
            if (status) {
                status.className = 'scan-status invalid';
                status.innerHTML = `<span>✗ ${response.error || '扫描失败'}</span>`;
            }
            showToast(response.error || '扫描文件夹失败', 'error');
        }
    } catch (error) {
        console.error('扫描文件夹失败:', error);

        if (status) {
            status.className = 'scan-status invalid';
            status.innerHTML = '<span>✗ 网络错误，扫描失败</span>';
        }

        showToast('扫描文件夹失败，请检查网络连接', 'error');
    }

    // 恢复按钮
    if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.textContent = '开始扫描';
    }
}

/**
 * 将扫描到的文件添加到资料库
 * @param {Array} files - 文件数组
 */
window.addScannedFilesToLibrary = async function(files) {
    if (!files || files.length === 0) {
        showToast('没有可添加的文件', 'warning');
        return;
    }

    const status = document.getElementById('scanStatus');

    if (status) {
        status.className = 'scan-status loading';
        status.innerHTML = '<span>正在添加到资料库...</span>';
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
            const response = await api.registerLocalVideo(file.path, file.name, '');

            if (response.success) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            console.error('添加文件失败:', error);
            failCount++;
        }

        // 更新状态
        if (status) {
            status.innerHTML = `<span>正在添加 ${i + 1}/${files.length}...</span>`;
        }
    }

    if (status) {
        status.className = 'scan-status success';
        status.innerHTML = `<span>✓ 添加完成: 成功 ${successCount} 个, 失败 ${failCount} 个</span>`;
    }

    showToast(`完成: ${successCount} 个成功, ${failCount} 个失败`,
        failCount > 0 ? 'warning' : 'success');

    // 刷新视频列表
    pageCache.videos.timestamp = 0;
    loadVideos(true);
};

/**
 * 从扫描结果打开批量添加模态框
 * @param {Array} files - 文件数组
 */
window.openBatchAddModalFromScan = function(files) {
    // 转换为File对象格式
    const fileObjects = files.map(file => ({
        name: file.name,
        path: file.path,
        size: file.size,
        webkitRelativePath: file.path
    }));

    closeFolderScanModal();
    openBatchAddModal(fileObjects);
};

/**
 * 处理拖拽
 */
function handleDragOver(e) {
    e.preventDefault();
    const dropzone = document.getElementById('uploadDropzone');
    if (dropzone) {
        dropzone.classList.add('dragover');
    }
}

/**
 * 处理拖拽离开
 */
function handleDragLeave(e) {
    e.preventDefault();
    const dropzone = document.getElementById('uploadDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }
}

/**
 * 处理文件放置
 */
function handleDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById('uploadDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        uploadFiles(files);
    }
}

/**
 * 处理文件选择
 */
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        uploadFiles(files);
    }
}

/**
 * 上传文件
 */
async function uploadFiles(files) {
    const progress = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');

    if (!progress || !progressBar || !progressText) {
        showToast('页面加载中，请稍候', 'error');
        return;
    }

    progress.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '准备上传...';

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        progressText.textContent = `正在上传 ${i + 1}/${files.length}: ${file.name}`;

        try {
            const response = await api.uploadFile(file, null, (progressEvent) => {
                if (progressEvent.total > 0) {
                    const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                    progressBar.style.width = `${percent}%`;
                    progressText.textContent = `${file.name}: ${percent}%`;
                }
            });

            if (response.success) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            console.error('上传文件失败:', error);
            failCount++;
        }
    }

    progressBar.style.width = '100%';
    progressText.textContent = `上传完成: 成功 ${successCount} 个, 失败 ${failCount} 个`;

    // 显示操作按钮
    const uploadActions = document.getElementById('uploadActions');
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadDropzone = document.getElementById('uploadDropzone');
    
    if (uploadProgress) {
        uploadProgress.style.display = 'none';
    }
    if (uploadDropzone) {
        uploadDropzone.style.display = 'none';
    }
    if (uploadActions) {
        uploadActions.style.display = 'flex';
    }

    // 显示提示消息
    if (failCount === 0) {
        showToast(`成功上传 ${successCount} 个文件`, 'success');
    } else {
        showToast(`上传完成: ${successCount} 个成功, ${failCount} 个失败`, failCount > 0 ? 'warning' : 'success');
    }
}

/**
 * 处理退出登录
 */
// ==================== 登录表单清除功能 ====================

/**
 * 清除指定输入框的内容
 * 同时清除保存的凭据（如果清除了用户名或密码输入框）
 */
function clearInput(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        // 如果清除了用户名或密码输入框，也清除保存的凭据
        if (inputId === 'adminUsername' || inputId === 'adminPassword') {
            clearSavedCredentials();
        }

        input.value = '';
        input.focus();
        // 触发input事件以更新样式
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * 清除保存的用户名（用于清除按钮和退出登录时）
 */
function clearSavedCredentials() {
    localStorage.removeItem('rememberUsername');
    localStorage.removeItem('rememberPassword');
    localStorage.removeItem('rememberMe');
    console.log('[Admin] 已清除保存的用户名和密码');
}

/**
 * 清除所有登录表单输入
 * 同时清除保存的凭据
 */
function clearAllLoginInputs() {
    const usernameInput = document.getElementById('adminUsername');
    const passwordInput = document.getElementById('adminPassword');
    const captchaInput = document.getElementById('adminCaptcha');

    let cleared = false;

    if (usernameInput && usernameInput.value) {
        usernameInput.value = '';
        cleared = true;
    }

    if (passwordInput && passwordInput.value) {
        passwordInput.value = '';
        cleared = true;
    }

    if (captchaInput && captchaInput.value) {
        captchaInput.value = '';
        cleared = true;
    }

    // 清除保存的凭据
    clearSavedCredentials();

    if (cleared) {
        showToast('已清除输入和保存的凭据', 'info');
    }
    
    // 聚焦到用户名输入框
    if (usernameInput) {
        usernameInput.focus();
    }
}

/**
 * 初始化登录表单清除功能
 */
function initLoginClearButtons() {
    // 单个输入框的清除按钮
    const clearButtons = document.querySelectorAll('.input-clear-btn[data-target]');
    clearButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('data-target');
            clearInput(targetId);
        });
    });
    
    // 清除所有按钮
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function(e) {
            e.preventDefault();
            clearAllLoginInputs();
        });
    }
    
    // 为输入框添加内容检测，用于显示/隐藏清除按钮
    const loginInputs = document.querySelectorAll('#adminLoginForm input');
    loginInputs.forEach(input => {
        input.addEventListener('input', function() {
            const formGroup = this.closest('.form-group');
            if (formGroup) {
                if (this.value) {
                    formGroup.classList.add('has-content');
                } else {
                    formGroup.classList.remove('has-content');
                }
            }
        });
        
        // 初始化时检查是否有内容
        if (input.value) {
            const formGroup = input.closest('.form-group');
            if (formGroup) {
                formGroup.classList.add('has-content');
            }
        }
    });
    
    // 阻止浏览器自动填充 - 使用type="text"配合CSS伪装成密码框
    // 浏览器通常不会自动填充非password类型的密码字段

    const passwordInput = document.getElementById('adminPassword');
    const usernameInput = document.getElementById('adminUsername');
    const savedRemember = localStorage.getItem('rememberMe');
    const savedUsername = localStorage.getItem('rememberUsername');
    const savedPassword = localStorage.getItem('rememberPassword');

    // 确保密码框使用圆点掩盖输入（使用CSS实现的text-security效果）
    if (passwordInput) {
        passwordInput.setAttribute('type', 'text');
        passwordInput.style.cssText = '-webkit-text-security: disc !important; text-security: disc !important;';
        console.log('[Admin] 密码框已配置为使用圆点掩盖');
    }

    // 处理用户名和密码输入框
    // 如果选择了记住我且有保存的凭据，填充用户名和密码
    // 如果没有选择记住我，则清空输入框
    setTimeout(() => {
        if (savedRemember === 'true' && savedUsername) {
            // 填充保存的用户名
            if (usernameInput) {
                usernameInput.value = savedUsername;
                usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[Admin] 已填充保存的用户名:', savedUsername);
            }

            // 填充保存的密码
            if (passwordInput && savedPassword) {
                passwordInput.value = savedPassword;
                passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[Admin] 已填充保存的密码');
            }

            // 勾选记住我复选框
            const rememberInput = document.getElementById('adminRemember');
            if (rememberInput) {
                rememberInput.checked = true;
            }
        } else {
            // 没有选择记住我，清空用户名
            if (usernameInput && usernameInput.value) {
                console.log('[Admin] 清空用户名输入框（未选择记住我）');
                usernameInput.value = '';
                usernameInput.removeAttribute('value');
            }
            // 清空密码
            if (passwordInput && passwordInput.value) {
                console.log('[Admin] 清空密码输入框（未选择记住我）');
                passwordInput.value = '';
                passwordInput.removeAttribute('value');
            }
        }
    }, 50);
}


async function handleLogout() {
    // 断开 WebSocket 连接
    disconnectWebSocket();

    // 停止状态更新
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }

    // 停止运行时间更新
    if (uptimeInterval) {
        clearInterval(uptimeInterval);
        uptimeInterval = null;
    }

    // 清除本地存储
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    // 清除当前用户状态并重置用户信息显示
    currentUser = null;
    const avatar = document.getElementById('headerAvatar');
    const username = document.getElementById('headerUsername');
    if (avatar) {
        avatar.textContent = '?';
        avatar.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
    if (username) {
        username.textContent = '请登录';
    }

    // 隐藏管理界面，显示登录遮罩层（不刷新页面）
    const appContainer = document.getElementById('adminAppContainer');
    const loginOverlay = document.getElementById('adminLoginOverlay');

    if (appContainer) {
        appContainer.style.display = 'none';
    }
    
    if (loginOverlay) {
        // 移除hidden类，使用内联样式完全控制显示
        loginOverlay.classList.remove('hidden');
        loginOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #f5f9fc 0%, #e8f1f8 50%, #dce9f3 100%); display: flex; align-items: center; justify-content: center; z-index: 9999;';
    }

    // 彻底清空所有登录表单输入（防止浏览器自动填充恢复）
    // 注意：不清除保存的账号密码，因为用户可能还想在下次登录时使用
    // 只有当用户主动点击清除按钮时，才会调用 clearSavedCredentials() 清除保存的账号密码
    
    const usernameInput = document.getElementById('adminUsername');
    const passwordInput = document.getElementById('adminPassword');
    const captchaInput = document.getElementById('adminCaptcha');
    const loginBtn = document.getElementById('adminLoginBtn');
    
    if (usernameInput) {
        usernameInput.value = '';
        usernameInput.removeAttribute('value');
        // 使用setTimeout确保值被清除
        setTimeout(() => { usernameInput.value = ''; }, 10);
        usernameInput.focus();
    }
    if (passwordInput) {
        passwordInput.value = '';
        passwordInput.removeAttribute('value');
        setTimeout(() => { passwordInput.value = ''; }, 10);
    }
    if (captchaInput) {
        captchaInput.value = '';
        captchaInput.removeAttribute('value');
    }
    
    // 恢复登录按钮状态
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.classList.remove('loading');
        const btnText = loginBtn.querySelector('span');
        if (btnText) btnText.textContent = '登录管理后台';
    }

    // 刷新验证码
    refreshCaptcha();

    // 显示退出成功提示
    showToast('已安全退出', 'info');
}

/**
 * 显示提示消息
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer') || document.body;
    const existingToast = container.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes === 0 || !bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 格式化时长
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '--:--';
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
function formatDate(dateString) {
    if (!dateString) return '从未';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (isNaN(diff)) return '无效日期';

    if (diff < 60000) {
        return '刚刚';
    }
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes}分钟前`;
    }
    if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`;
    }
    if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)}天前`;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 格式化日期时间
 */
function formatDateTime(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '--:--:--';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 获取名字首字母
 */
function getInitials(name) {
    if (!name) return '?';
    const cleanedName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
    if (cleanedName.length === 0) return '?';

    if (/^[a-zA-Z]/.test(cleanedName)) {
        return cleanedName.charAt(0).toUpperCase();
    }
    if (/^[\u4e00-\u9fa5]/.test(cleanedName)) {
        return cleanedName.charAt(0);
    }
    return cleanedName.charAt(0).toUpperCase();
}

/**
 * 获取角色显示名称
 */
function getRoleDisplayName(role) {
    const roleNames = {
        'superadmin': '超级管理员',
        'admin': '管理员',
        'moderator': '版主',
        'vip': 'VIP用户',
        'user': '普通用户'
    };
    return roleNames[role] || '普通用户';
}

/**
 * 获取状态显示名称
 */
function getStatusDisplayName(status) {
    const statusNames = {
        'active': '正常',
        'pending': '待验证',
        'locked': '锁定',
        'suspended': '停用',
        'disabled': '禁用'
    };
    return statusNames[status] || '正常';
}

/**
 * 获取状态CSS类名
 */
function getStatusClass(status) {
    const validStatuses = ['active', 'pending', 'locked', 'suspended', 'disabled'];
    return validStatuses.includes(status) ? status : 'active';
}

/**
 * 获取头像渐变色
 */
function getAvatarGradient(username) {
    const colors = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
    ];
    let hash = 0;
    for (let i = 0; i < (username || '').length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

/**
 * 获取文件类型名称
 */
function getFileTypeName(type) {
    const types = {
        folder: '文件夹',
        video: '视频',
        audio: '音频',
        image: '图片',
        document: '文档',
        archive: '压缩包',
        other: '其他'
    };
    return types[type] || '其他';
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// ==================== 本地文件管理功能 ====================

// 已选择的文件列表
let selectedFiles = [];

/**
 * 打开本地文件模态框
 */
function openLocalFileModal() {
    const modal = document.getElementById('localFileModal');
    if (modal) {
        modal.classList.add('active');
        resetLocalFileForm();
    }
}

/**
 * 关闭本地文件模态框
 */
function closeLocalFileModalFunc() {
    const modal = document.getElementById('localFileModal');
    if (modal) {
        modal.classList.remove('active');
    }
    resetLocalFileForm();
}

/**
 * 重置本地文件表单
 */
function resetLocalFileForm() {
    selectedFiles = [];
    updateFileSelectedCount();

    const fileList = document.getElementById('fileSelectedList');
    if (fileList) {
        fileList.innerHTML = '<div class="empty-state">尚未选择文件</div>';
    }

    // 清空路径和输入字段
    const pathInput = document.getElementById('localFilePath');
    const nameInput = document.getElementById('localFileName');
    const descInput = document.getElementById('localFileDescription');
    if (pathInput) pathInput.value = '';
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';

    const status = document.getElementById('localFileStatus');
    if (status) status.innerHTML = '';

    const saveBtn = document.getElementById('saveLocalFileBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.querySelector('#fileSaveBtnText').textContent = '添加文件';
    }

    const folderPreview = document.getElementById('fileFolderPreview');
    if (folderPreview) folderPreview.style.display = 'none';
}

/**
 * 处理单个文件拖拽放置
 */
function handleFileDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById('singleFileDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleSingleFileSelect({ target: { files: files } });
    }
}

/**
 * 处理批量文件拖拽放置
 */
function handleBatchFileDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById('batchFileDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleBatchFileSelect({ target: { files: files } });
    }
}

/**
 * 处理文件夹拖拽放置
 */
function handleFileFolderDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById('fileFolderDropzone');
    if (dropzone) {
        dropzone.classList.remove('dragover');
    }

    // 处理文件夹拖拽
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
        const fileQueue = [];
        const files = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                if (entry) {
                    if (entry.isFile) {
                        files.push(item.getAsFile());
                    } else if (entry.isDirectory) {
                        fileQueue.push(entry);
                    }
                }
            }
        }

        if (fileQueue.length > 0) {
            readDirectoryForFile(fileQueue, files).then(() => {
                handleFileFolderSelect({ target: { files: files } });
            });
        } else {
            handleFileFolderSelect({ target: { files: files } });
        }
    }
}

/**
 * 递归读取目录
 */
function readDirectoryForFile(directories, files) {
    return new Promise((resolve) => {
        if (directories.length === 0) {
            resolve();
            return;
        }

        const reader = directories.shift().createReader();
        reader.readEntries((entries) => {
            const subDirs = [];
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (entry.isFile) {
                    files.push(entry);
                } else if (entry.isDirectory) {
                    subDirs.push(entry);
                }
            }

            if (entries.length > 0) {
                directories.unshift(reader);
            }

            if (subDirs.length > 0) {
                readDirectoryForFile(subDirs, files).then(() => {
                    readDirectoryForFile(directories, files).then(resolve);
                });
            } else {
                readDirectoryForFile(directories, files).then(resolve);
            }
        });
    });
}

/**
 * 处理单个文件选择
 */
function handleSingleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const nameInput = document.getElementById('localFileName');
    const saveBtn = document.getElementById('saveLocalFileBtn');
    const status = document.getElementById('localFileStatus');

    // 自动填充名称
    if (nameInput && !nameInput.value.trim()) {
        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        nameInput.value = fileNameWithoutExt;
    }

    showToast(`已选择文件: ${file.name}`, 'info');

    if (status) {
        status.className = 'local-video-status';
        status.innerHTML = `<span>已选择: ${file.name} (${formatFileSize(file.size)})</span>`;
    }

    if (saveBtn) {
        saveBtn.disabled = false;
    }
}

/**
 * 处理批量文件选择
 */
function handleBatchFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    selectedFiles = files;
    updateFileSelectedCount();
    renderFileSelectedList();

    const saveBtn = document.getElementById('saveLocalFileBtn');
    const status = document.getElementById('localFileStatus');

    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

    if (status) {
        status.className = 'local-video-status';
        status.innerHTML = `<span>已选择 ${files.length} 个文件，总大小: ${formatFileSize(totalSize)}</span>`;
    }

    if (saveBtn) {
        saveBtn.disabled = false;
    }
}

/**
 * 处理文件夹选择
 */
function handleFileFolderSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const folderPreview = document.getElementById('fileFolderPreview');
    const folderPath = document.getElementById('fileFolderPath');
    const foundCount = document.getElementById('fileFoundCount');
    const estimatedSize = document.getElementById('fileEstimatedSize');
    const saveBtn = document.getElementById('saveLocalFileBtn');
    const status = document.getElementById('localFileStatus');

    let folderName = '未知';
    if (files[0].webkitRelativePath) {
        folderName = files[0].webkitRelativePath.split('/')[0];
    } else {
        folderName = files[0].name || '选择文件夹';
    }

    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

    if (folderPath) folderPath.textContent = folderName;
    if (foundCount) foundCount.textContent = files.length;
    if (estimatedSize) estimatedSize.textContent = formatFileSize(totalSize);
    if (folderPreview) folderPreview.style.display = 'block';

    selectedFiles = files;

    if (status) {
        status.className = 'local-video-status';
        status.innerHTML = `<span>已选择文件夹: ${folderName}，包含 ${files.length} 个文件</span>`;
    }

    if (saveBtn) {
        saveBtn.disabled = false;
    }

    showToast(`已选择文件夹，包含 ${files.length} 个文件`, 'info');
}

/**
 * 更新已选文件计数
 */
function updateFileSelectedCount() {
    const countEl = document.getElementById('fileSelectedCount');
    if (countEl) {
        countEl.textContent = selectedFiles.length;
    }
}

/**
 * 渲染已选文件列表
 */
function renderFileSelectedList() {
    const fileList = document.getElementById('fileSelectedList');
    if (!fileList) return;

    if (selectedFiles.length === 0) {
        fileList.innerHTML = '<div class="empty-state">尚未选择文件</div>';
        return;
    }

    fileList.innerHTML = selectedFiles.map((file, index) => `
        <div class="selected-file-item">
            <div class="selected-file-info">
                <svg class="selected-file-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                </svg>
                <span class="selected-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                <span class="selected-file-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="selected-file-remove" onclick="removeFileFromSelection(${index})">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        </div>
    `).join('');
}

/**
 * 从选择列表中移除文件
 */
window.removeFileFromSelection = function(index) {
    if (index >= 0 && index < selectedFiles.length) {
        selectedFiles.splice(index, 1);
        updateFileSelectedCount();
        renderFileSelectedList();

        const saveBtn = document.getElementById('saveLocalFileBtn');
        const status = document.getElementById('localFileStatus');

        if (selectedFiles.length === 0) {
            if (saveBtn) saveBtn.disabled = true;
            if (status) status.innerHTML = '';
        } else {
            const totalSize = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
            if (status) {
                status.innerHTML = `<span>已选择 ${selectedFiles.length} 个文件，总大小: ${formatFileSize(totalSize)}</span>`;
            }
        }
    }
};

/**
 * 清空已选文件列表
 */
function clearFileSelectedList() {
    selectedFiles = [];
    updateFileSelectedCount();
    renderFileSelectedList();

    const saveBtn = document.getElementById('saveLocalFileBtn');
    const status = document.getElementById('localFileStatus');
    const folderPreview = document.getElementById('fileFolderPreview');
    const singleFileInput = document.getElementById('singleFileInput');
    const batchFileInput = document.getElementById('batchFileInput');
    const fileFolderInput = document.getElementById('fileFolderInput');

    if (saveBtn) saveBtn.disabled = true;
    if (status) status.innerHTML = '';
    if (folderPreview) folderPreview.style.display = 'none';
    if (singleFileInput) singleFileInput.value = '';
    if (batchFileInput) batchFileInput.value = '';
    if (fileFolderInput) fileFolderInput.value = '';
}

/**
 * 保存本地文件
 */
async function saveLocalFile() {
    const nameInput = document.getElementById('localFileName');
    const descInput = document.getElementById('localFileDescription');
    const pathInput = document.getElementById('localFilePath');
    const saveBtn = document.getElementById('saveLocalFileBtn');

    const name = nameInput ? nameInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';
    const filePath = pathInput ? pathInput.value.trim() : '';

    if (!filePath) {
        showToast('请输入文件路径', 'warning');
        return;
    }

    // 验证路径格式
    if (!isValidPathFormat(filePath)) {
        showToast('路径格式不正确，请输入有效路径', 'warning');
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.querySelector('#fileSaveBtnText').textContent = '添加中...';
    }

    try {
        // 如果名称为空，从路径自动提取
        const displayName = name || extractFileName(filePath);

        const response = await api.registerLocalFile(filePath, displayName, description);

        if (response.success) {
            showToast('本地文件添加成功', 'success');
            closeLocalFileModalFunc();

            // 刷新文件列表
            pageCache.files.timestamp = 0;
            loadFileStats(true);
        } else {
            showToast(response.error || '添加失败', 'error');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.querySelector('#fileSaveBtnText').textContent = '添加文件';
            }
        }
    } catch (error) {
        console.error('添加本地文件失败:', error);
        showToast('添加失败，请重试', 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.querySelector('#fileSaveBtnText').textContent = '添加文件';
        }
    }
}

// 全局函数（供 HTML 中调用）
window.editUser = editUser;
window.deleteUser = deleteUser;
window.playVideo = playVideo;
window.editVideo = editVideo;
window.deleteVideo = deleteVideo;
window.previewFile = previewFile;
window.downloadFile = downloadFile;
window.deleteFile = deleteFile;
window.openLocalVideoModal = openLocalVideoModal;
window.openLocalFileModal = openLocalFileModal;
window.removeBatchFile = removeBatchFile;
window.scanUploadsFolder = scanUploadsFolder;

// 调试函数 - 在控制台中运行此函数测试模态框
window.testModal = function() {
    console.log('=== 测试模态框功能 ===');
    const modal = document.getElementById('localVideoModal');
    const btn = document.getElementById('addLocalVideoBtn');
    
    console.log('1. 检查按钮元素:', btn);
    console.log('2. 检查模态框元素:', modal);
    console.log('3. 模态框当前classList:', modal ? modal.classList.toString() : 'N/A');
    
    if (btn) {
        console.log('4. 按钮存在，触发点击事件...');
        btn.click();
        setTimeout(() => {
            console.log('5. 点击后模态框classList:', modal ? modal.classList.toString() : 'N/A');
        }, 5000);
    }
    
    // 手动打开模态框
    if (modal) {
        modal.classList.add('active');
        console.log('6. 手动添加active类后:', modal.classList.toString());
    }
};

/**
 * 从文件路径中提取文件名（去掉扩展名）
 * @param {string} filePath - 文件路径
 * @returns {string} 文件名（不带扩展名）
 */
function extractFileName(filePath) {
    if (!filePath) return '';
    
    // 获取路径的最后部分作为文件名
    const fileName = filePath.split('/').pop().split('\\').pop();
    
    if (!fileName) return '';
    
    // 去掉扩展名
    const extIndex = fileName.lastIndexOf('.');
    if (extIndex > 0) {
        return fileName.substring(0, extIndex);
    }

    return fileName;
}

// 将需要在内联事件处理器中调用的函数暴露到全局作用域
window.editUser = editUser;
window.deleteUser = deleteUser;
window.openUserModal = openUserModal;
window.saveUser = saveUser;
window.closeUserModal = closeUserModal;
