/**
 * LANStream Pro - 认证管理模块
 * 处理用户登录状态和认证流程
 */

class AuthManager {
    constructor() {
        this.user = null;
        this.token = null;
        this.isLoadingUser = false; // 防止重复加载用户信息
        this.socket = null;
        this.socketConnected = false;

        this.init();
    }

    /**
     * 初始化认证管理器
     */
    init() {
        this.token = localStorage.getItem('accessToken');
        this.refreshToken = localStorage.getItem('refreshToken');

        // 如果有token，先显示主应用界面，异步加载用户信息
        if (this.token) {
            this.showApp();
            this.loadUser();
        }
    }

    /**
     * 建立 WebSocket 连接并发送用户在线状态
     */
    connectSocket() {
        // 检查是否已连接
        if (this.socket && this.socketConnected) {
            console.log('[Auth] WebSocket 已连接，跳过重复连接');
            return;
        }

        // 检查 Socket.IO 是否可用
        if (typeof io === 'undefined') {
            console.warn('[Auth] Socket.IO 未加载，跳过 WebSocket 连接');
            return;
        }

        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 3,
                reconnectionDelay: 1000
            });

            this.socket.on('connect', () => {
                console.log('[Auth] WebSocket 连接已建立:', this.socket.id);
                this.socketConnected = true;

                // 发送用户登录事件
                if (this.user && this.user.id && this.user.username) {
                    this.socket.emit('user:login', {
                        userId: this.user.id,
                        username: this.user.username
                    });
                    console.log('[Auth] 已发送用户登录事件:', this.user.username);
                }
            });

            this.socket.on('disconnect', (reason) => {
                console.log('[Auth] WebSocket 连接断开:', reason);
                this.socketConnected = false;
            });

            this.socket.on('connect_error', (error) => {
                console.error('[Auth] WebSocket 连接错误:', error.message);
            });

            // 处理账户被禁用事件
            this.socket.on('user:blocked', (data) => {
                console.warn('[Auth] 账户被禁用:', data);
                this.disconnectSocket();
                
                // 清除本地登录状态
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                this.user = null;
                this.isAuthenticated = false;
                
                // 显示提示并跳转登录页
                alert(data?.message || '账户已被禁用，请联系管理员');
                window.location.href = '/login.html';
            });

            console.log('[Auth] 正在建立 WebSocket 连接...');
        } catch (error) {
            console.error('[Auth] 建立 WebSocket 连接失败:', error);
        }
    }

    /**
     * 断开 WebSocket 连接
     */
    disconnectSocket() {
        if (this.socket) {
            // 发送用户下线事件
            if (this.user && this.user.id) {
                this.socket.emit('user:logout', {
                    userId: this.user.id,
                    username: this.user.username
                });
                console.log('[Auth] 已发送用户下线事件');
            }

            this.socket.disconnect();
            this.socket = null;
            this.socketConnected = false;
            console.log('[Auth] WebSocket 连接已断开');
        }
    }

    /**
     * 加载当前用户信息
     */
    async loadUser() {
        // 防止重复加载
        if (this.isLoadingUser) {
            console.log('用户信息正在加载中，跳过重复请求');
            return;
        }

        this.isLoadingUser = true;

        try {
            const result = await api.getCurrentUser();
            if (result.success) {
                this.user = result.data.user;
                this.updateUI();

                // 建立 WebSocket 连接（用于在线用户统计）
                this.connectSocket();
            } else {
                this.logout();
            }
        } catch (error) {
            console.error('加载用户信息失败:', error);
            this.logout();
        } finally {
            this.isLoadingUser = false;
        }
    }

    /**
     * 登出（内部方法，使用handleLogout作为公开方法）
     */
    logout() {
        // 清除本地存储
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        this.token = null;
        this.user = null;

        // 显示登录页面
        this.showLogin();
        this.showNotification('请重新登录', 'info');
    }

    showLogin() {
        const loginPage = document.getElementById('login-page');
        const appContainer = document.getElementById('app-container');

        if (loginPage) {
            loginPage.classList.add('active');
        }
        if (appContainer) {
            appContainer.classList.remove('active');
        }

        // 延迟500ms生成验证码，避免与其他API请求冲突
        setTimeout(() => {
            this.generateCaptcha();
        }, 500);
    }

    /**
     * 隐藏登录表单，显示主应用
     */
    showApp() {
        const loginPage = document.getElementById('login-page');
        const appContainer = document.getElementById('app-container');
        
        if (loginPage) {
            loginPage.classList.remove('active');
        }
        if (appContainer) {
            appContainer.classList.add('active');
        }
    }

    /**
     * 生成验证码
     */
    async generateCaptcha() {
        try {
            const blob = await api.getCaptcha();
            const url = URL.createObjectURL(blob);
            const captchaImg = document.getElementById('captcha-img');
            if (captchaImg) {
                captchaImg.src = url;
            }
        } catch (error) {
            console.error('生成验证码失败:', error);
        }
    }

    /**
     * 处理登录
     */
    async handleLogin(event) {
        event.preventDefault();
        
        const form = event.target;
        const submitBtn = form.querySelector('.btn-login');
        const username = form.username.value.trim();
        const password = form.password.value;
        const captcha = form.captcha?.value.trim();
        const remember = form.remember?.checked;

        // 验证输入
        if (!username || !password) {
            this.showNotification('请输入用户名和密码', 'error');
            return;
        }

        // 验证验证码
        if (!captcha) {
            this.showNotification('请输入验证码', 'error');
            return;
        }

        // 禁用按钮，显示加载状态
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const result = await api.login(username, password, captcha);

            if (result.success) {
                // 始终保存令牌
                localStorage.setItem('accessToken', result.data.accessToken);
                localStorage.setItem('refreshToken', result.data.refreshToken);

                this.token = result.data.accessToken;
                this.user = result.data.user;

                this.showNotification('登录成功', 'success');

                // 建立 WebSocket 连接（用于在线用户统计）
                this.connectSocket();

                // 更新UI
                this.updateUI();

                // 显示主应用
                this.showApp();

                // 安全地跳转到首页
                setTimeout(() => {
                    if (window.app) {
                        window.app.navigateTo('home');
                    } else {
                        // 如果window.app不存在，手动显示首页
                        document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
                        const homePage = document.getElementById('page-home');
                        if (homePage) homePage.classList.add('active');
                    }
                }, 100);
            } else {
                this.showNotification(result.error || '登录失败', 'error');
                // 如果失败，重新生成验证码
                if (result.code === 'INVALID_CAPTCHA') {
                    this.generateCaptcha();
                    form.captcha.value = '';
                }
            }
        } catch (error) {
            this.showNotification(error.message || '登录失败，请稍后重试', 'error');
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }

    /**
     * 处理登出
     */
    async handleLogout() {
        // 断开 WebSocket 连接
        this.disconnectSocket();

        try {
            await api.logout();
        } catch (error) {
            console.error('登出请求失败:', error);
        }

        // 清除本地存储
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        this.token = null;
        this.user = null;

        // 显示登录页面
        this.showLogin();
        this.showNotification('已安全退出', 'info');
    }

    /**
     * 更新UI显示
     */
    updateUI() {
        if (!this.user) return;

        // 更新侧边栏用户信息
        const sidebarUsername = document.getElementById('sidebar-username');
        const sidebarUserRole = document.getElementById('sidebar-user-role');
        const headerUsername = document.getElementById('header-username');
        const sidebarUserInfo = document.getElementById('sidebar-user-info');

        if (sidebarUsername) sidebarUsername.textContent = this.user.username;
        if (headerUsername) headerUsername.textContent = this.user.username;
        
        if (sidebarUserRole) {
            const roleNames = {
                'admin': '管理员',
                'vip': 'VIP会员',
                'user': '普通用户'
            };
            sidebarUserRole.textContent = roleNames[this.user.role] || '用户';
        }

        // 显示管理员入口
        if (this.user.role === 'admin') {
            const adminNavItems = document.querySelectorAll('.admin-only');
            adminNavItems.forEach(item => item.style.display = 'block');
        }

        // 更新头像 - 侧边栏
        const sidebarAvatar = document.getElementById('sidebar-user-avatar');
        if (sidebarAvatar) {
            if (this.user.avatar_url) {
                // 使用自定义头像
                sidebarAvatar.innerHTML = `<img src="${this.user.avatar_url}" alt="用户头像" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                sidebarAvatar.style.background = 'transparent';
            } else if (window.app) {
                // 生成首字母头像
                const initials = window.app.getInitials(this.user.display_name || this.user.username);
                const gradient = window.app.getAvatarGradient(this.user.username);
                sidebarAvatar.innerHTML = `<span style="font-size:24px;color:#fff;">${initials}</span>`;
                sidebarAvatar.style.background = gradient;
            }
        }

        // 更新头像 - 顶部下拉菜单
        const headerAvatar = document.getElementById('header-user-avatar');
        if (headerAvatar) {
            if (this.user.avatar_url) {
                // 使用自定义头像
                headerAvatar.innerHTML = `<img src="${this.user.avatar_url}" alt="用户头像" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                headerAvatar.style.background = 'transparent';
            } else if (window.app) {
                // 生成首字母头像
                const initials = window.app.getInitials(this.user.display_name || this.user.username);
                const gradient = window.app.getAvatarGradient(this.user.username);
                headerAvatar.innerHTML = `<span style="font-size:14px;color:#fff;">${initials}</span>`;
                headerAvatar.style.background = gradient;
            }
        }
    }

    /**
     * 检查是否已登录
     */
    isLoggedIn() {
        return !!this.token && !!this.user;
    }

    /**
     * 检查用户角色
     */
    hasRole(role) {
        return this.user?.role === role;
    }

    /**
     * 检查是否是管理员
     */
    isAdmin() {
        return this.user?.role === 'admin';
    }

    /**
     * 生成UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        notification.innerHTML = `
            <i class="${icons[type]}"></i>
            <span>${message}</span>
            <span class="notification-close"><i class="fas fa-times"></i></span>
        `;
        
        container.appendChild(notification);
        
        // 绑定关闭事件
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
        
        // 自动关闭
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    /**
     * 显示加载动画
     */
    showLoading(message = '加载中...') {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = overlay.querySelector('p');
        loadingText.textContent = message;
        overlay.classList.add('active');
    }

    /**
     * 隐藏加载动画
     */
    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    }
}

// 初始化认证管理器
window.authManager = new AuthManager();

// 绑定登录表单事件
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => authManager.handleLogin(e));
    }
    
    // 登出按钮事件
    const logoutBtns = [
        document.getElementById('btn-logout'),
        document.getElementById('btn-logout-dropdown')
    ];
    
    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                authManager.handleLogout();
            });
        }
    });

    // 用户下拉菜单事件
    const userDropdown = document.getElementById('user-dropdown');
    if (userDropdown) {
        userDropdown.addEventListener('click', () => {
            userDropdown.classList.toggle('active');
        });
        
        // 点击外部关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!userDropdown.contains(e.target)) {
                userDropdown.classList.remove('active');
            }
        });
    }

    // 检查登录状态（根据token判断，user信息会异步加载）
    if (authManager.token) {
        // 有token，界面已经在init中显示了
        // 用户信息会异步加载并更新UI
    } else {
        authManager.showLogin();
    }
});
