/**
 * 个人资料页面脚本
 * 处理用户资料编辑、头像上传、密码修改等功能
 */

// DOM 元素
const elements = {
    // 头像相关
    avatarWrapper: null,
    avatarImage: null,
    avatarInput: null,

    // 用户信息
    headerAvatar: null,
    headerUsername: null,
    usernameValue: null,
    displayNameValue: null,
    emailValue: null,
    roleValue: null,
    createdAtValue: null,
    lastLoginValue: null,

    // 按钮
    editInfoBtn: null,
    logoutBtn: null,

    // 模态框
    editInfoModal: null,
    closeModalBtn: null,
    cancelEditBtn: null,
    saveInfoBtn: null,

    // 编辑表单
    editInfoForm: null,
    editDisplayName: null,
    editEmail: null,

    // 密码表单
    passwordForm: null,
    currentPassword: null,
    newPassword: null,
    confirmPassword: null,
    passwordStrength: null
};

// 当前用户数据
let currentUser = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    bindEvents();
    loadUserProfile();
});

/**
 * 初始化元素引用
 */
function initElements() {
    elements.avatarWrapper = document.getElementById('avatarWrapper');
    elements.avatarImage = document.getElementById('avatarImage');
    elements.avatarInput = document.getElementById('avatarInput');

    elements.headerAvatar = document.getElementById('headerAvatar');
    elements.headerUsername = document.getElementById('headerUsername');
    elements.usernameValue = document.getElementById('usernameValue');
    elements.displayNameValue = document.getElementById('displayNameValue');
    elements.emailValue = document.getElementById('emailValue');
    elements.roleValue = document.getElementById('roleValue');
    elements.createdAtValue = document.getElementById('createdAtValue');
    elements.lastLoginValue = document.getElementById('lastLoginValue');

    elements.editInfoBtn = document.getElementById('editInfoBtn');
    elements.logoutBtn = document.getElementById('logoutBtn');

    elements.editInfoModal = document.getElementById('editInfoModal');
    elements.closeModalBtn = document.getElementById('closeModalBtn');
    elements.cancelEditBtn = document.getElementById('cancelEditBtn');
    elements.saveInfoBtn = document.getElementById('saveInfoBtn');

    elements.editInfoForm = document.getElementById('editInfoForm');
    elements.editDisplayName = document.getElementById('editDisplayName');
    elements.editEmail = document.getElementById('editEmail');

    elements.passwordForm = document.getElementById('passwordForm');
    elements.currentPassword = document.getElementById('currentPassword');
    elements.newPassword = document.getElementById('newPassword');
    elements.confirmPassword = document.getElementById('confirmPassword');
    elements.passwordStrength = document.getElementById('passwordStrength');
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 头像上传
    if (elements.avatarWrapper) {
        elements.avatarWrapper.addEventListener('click', () => {
            elements.avatarInput.click();
        });
    }

    if (elements.avatarInput) {
        elements.avatarInput.addEventListener('change', handleAvatarChange);
    }

    // 编辑信息
    if (elements.editInfoBtn) {
        elements.editInfoBtn.addEventListener('click', openEditModal);
    }

    // 模态框关闭
    if (elements.closeModalBtn) {
        elements.closeModalBtn.addEventListener('click', closeEditModal);
    }

    if (elements.cancelEditBtn) {
        elements.cancelEditBtn.addEventListener('click', closeEditModal);
    }

    if (elements.saveInfoBtn) {
        elements.saveInfoBtn.addEventListener('click', saveProfileInfo);
    }

    // 点击模态框背景关闭
    if (elements.editInfoModal) {
        elements.editInfoModal.addEventListener('click', (e) => {
            if (e.target === elements.editInfoModal) {
                closeEditModal();
            }
        });
    }

    // 密码修改
    if (elements.passwordForm) {
        elements.passwordForm.addEventListener('submit', handlePasswordChange);
    }

    // 密码强度检测
    if (elements.newPassword) {
        elements.newPassword.addEventListener('input', updatePasswordStrength);
    }

    // 确认密码实时验证
    if (elements.confirmPassword) {
        elements.confirmPassword.addEventListener('input', () => {
            validateConfirmPassword();
        });
    }

    // 退出登录
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', handleLogout);
    }

    // 侧边栏菜单切换
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }
}

/**
 * 加载用户资料
 */
async function loadUserProfile() {
    try {
        const response = await api.getUserProfile();

        if (response.success) {
            currentUser = response.data.user;
            renderUserProfile(currentUser);
            updateSidebarUser(currentUser);
            checkAdminPermission(currentUser);
        } else {
            showToast(response.error || '加载用户资料失败', 'error');
        }
    } catch (error) {
        console.error('加载用户资料失败:', error);
        showToast('加载用户资料失败，请刷新重试', 'error');
    }
}

/**
 * 渲染用户资料
 */
function renderUserProfile(user) {
    // 设置头像
    if (user.avatar_url) {
        elements.avatarImage.src = user.avatar_url;
    } else {
        // 生成默认头像（微信风格）
        const initials = getInitials(user.display_name || user.username);
        elements.avatarImage.style.background = getAvatarGradient(user.username);
        elements.avatarImage.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 48px; color: #fff; font-weight: 500;">${initials}</div>`;
    }

    // 设置用户信息
    elements.usernameValue.textContent = user.username;
    elements.displayNameValue.textContent = user.display_name || '未设置';
    elements.emailValue.textContent = user.email || '未设置';

    // 角色标签
    const roleText = user.role === 'admin' ? '管理员' : '普通用户';
    const roleClass = user.role === 'admin' ? 'admin' : 'user';
    elements.roleValue.innerHTML = `<span class="role-badge ${roleClass}">${roleText}</span>`;

    // 注册时间
    if (user.created_at) {
        elements.createdAtValue.textContent = formatDate(user.created_at);
    } else {
        elements.createdAtValue.textContent = '未知';
    }

    // 最后登录
    if (user.last_login) {
        elements.lastLoginValue.textContent = formatDate(user.last_login);
    } else {
        elements.lastLoginValue.textContent = '首次登录';
    }
}

/**
 * 更新侧边栏用户信息
 */
function updateSidebarUser(user) {
    const initials = getInitials(user.display_name || user.username);
    elements.headerAvatar.textContent = initials;
    elements.headerAvatar.style.background = getAvatarGradient(user.username);
    elements.headerUsername.textContent = user.display_name || user.username;
}

/**
 * 检查管理员权限
 */
function checkAdminPermission(user) {
    const adminElements = document.querySelectorAll('.admin-only');
    if (user.role === 'admin') {
        adminElements.forEach(el => el.style.display = 'block');
    }
}

/**
 * 获取名字首字母
 */
function getInitials(name) {
    if (!name) return '?';
    const cleanedName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
    if (/^[a-zA-Z]/.test(cleanedName)) {
        return cleanedName.charAt(0).toUpperCase();
    }
    // 中文字符取第一个
    if (/^[\u4e00-\u9fa5]/.test(cleanedName)) {
        return cleanedName.charAt(0);
    }
    return cleanedName.charAt(0).toUpperCase();
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
 * 格式化日期
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    // 小于1小时显示"刚刚"
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return '刚刚';
        return `${minutes}分钟前`;
    }

    // 小于24小时显示"x小时前"
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}小时前`;
    }

    // 小于7天显示"x天前"
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days}天前`;
    }

    // 否则显示具体日期
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (year === now.getFullYear()) {
        return `${month}-${day} ${hours}:${minutes}`;
    }
    return `${year}-${month}-${day}`;
}

/**
 * 处理头像变更
 */
async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast('请选择 JPG、PNG、GIF 或 WebP 格式的图片', 'error');
        return;
    }

    // 验证文件大小（最大2MB）
    if (file.size > 2 * 1024 * 1024) {
        showToast('图片大小不能超过 2MB', 'error');
        return;
    }

    try {
        showToast('正在上传头像...', 'success');

        const response = await api.uploadAvatar(file);

        if (response.success) {
            // 更新本地显示
            const reader = new FileReader();
            reader.onload = (e) => {
                elements.avatarImage.src = e.target.result;
            };
            reader.readAsDataURL(file);

            showToast('头像上传成功', 'success');
        } else {
            showToast(response.error || '头像上传失败', 'error');
        }
    } catch (error) {
        console.error('头像上传失败:', error);
        showToast('头像上传失败，请重试', 'error');
    }

    // 清空 input，允许重复选择同一文件
    e.target.value = '';
}

/**
 * 打开编辑模态框
 */
function openEditModal() {
    if (!currentUser) return;

    elements.editDisplayName.value = currentUser.display_name || '';
    elements.editEmail.value = currentUser.email || '';

    elements.editInfoModal.classList.add('active');
}

/**
 * 关闭编辑模态框
 */
function closeEditModal() {
    elements.editInfoModal.classList.remove('active');
}

/**
 * 保存个人信息
 */
async function saveProfileInfo() {
    const displayName = elements.editDisplayName.value.trim();
    const email = elements.editEmail.value.trim();

    // 验证显示名称
    if (displayName && displayName.length > 30) {
        showToast('显示名称不能超过30个字符', 'error');
        return;
    }

    // 验证邮箱
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showToast('请输入有效的邮箱地址', 'error');
            return;
        }
    }

    try {
        const response = await api.updateProfile({
            display_name: displayName,
            email: email
        });

        if (response.success) {
            currentUser.display_name = displayName;
            currentUser.email = email;

            // 更新显示
            elements.displayNameValue.textContent = displayName || '未设置';
            elements.emailValue.textContent = email || '未设置';
            updateSidebarUser(currentUser);

            closeEditModal();
            showToast('个人信息更新成功', 'success');
        } else {
            showToast(response.error || '更新失败', 'error');
        }
    } catch (error) {
        console.error('更新个人信息失败:', error);
        showToast('更新失败，请重试', 'error');
    }
}

/**
 * 更新密码强度指示器
 */
function updatePasswordStrength() {
    const password = elements.newPassword.value;
    const strengthBar = elements.passwordStrength;

    if (!password) {
        strengthBar.style.setProperty('--strength', '0%');
        strengthBar.style.setProperty('--strength-color', 'var(--border-color)');
        return;
    }

    let strength = 0;
    let color = '#fa5151';

    // 长度检查
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;

    // 复杂度检查
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 1;

    // 计算百分比
    const percentage = Math.min((strength / 5) * 100, 100);

    // 设置颜色
    if (strength <= 2) {
        color = '#fa5151'; // 弱
    } else if (strength <= 3) {
        color = '#fa9d3b'; // 中
    } else {
        color = '#07c160'; // 强
    }

    strengthBar.style.setProperty('--strength', `${percentage}%`);
    strengthBar.style.setProperty('--strength-color', color);
}

/**
 * 验证确认密码
 */
function validateConfirmPassword() {
    const newPassword = elements.newPassword.value;
    const confirmPassword = elements.confirmPassword.value;

    if (confirmPassword && newPassword !== confirmPassword) {
        elements.confirmPassword.setCustomValidity('两次输入的密码不一致');
    } else {
        elements.confirmPassword.setCustomValidity('');
    }
}

/**
 * 处理密码修改
 */
async function handlePasswordChange(e) {
    e.preventDefault();

    const currentPassword = elements.currentPassword.value;
    const newPassword = elements.newPassword.value;
    const confirmPassword = elements.confirmPassword.value;

    // 验证必填
    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('请填写所有密码字段', 'error');
        return;
    }

    // 验证新密码长度
    if (newPassword.length < 8) {
        showToast('新密码长度至少为8位', 'error');
        return;
    }

    // 验证确认密码
    if (newPassword !== confirmPassword) {
        showToast('两次输入的密码不一致', 'error');
        return;
    }

    // 验证新旧密码相同
    if (currentPassword === newPassword) {
        showToast('新密码不能与当前密码相同', 'error');
        return;
    }

    try {
        const response = await api.changePassword(currentPassword, newPassword);

        if (response.success) {
            showToast('密码修改成功', 'success');

            // 清空表单
            elements.passwordForm.reset();
            elements.passwordStrength.style.setProperty('--strength', '0%');
        } else {
            showToast(response.error || '密码修改失败', 'error');
        }
    } catch (error) {
        console.error('密码修改失败:', error);
        showToast('密码修改失败，请检查当前密码是否正确', 'error');
    }
}

/**
 * 处理退出登录
 */
async function handleLogout() {
    try {
        await api.logout();
    } catch (error) {
        console.error('退出登录失败:', error);
    }

    // 清除本地存储
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    // 跳转登录页
    window.location.href = '/';
}

/**
 * 显示提示消息
 */
function showToast(message, type = 'success') {
    // 移除已存在的 toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // 创建新 toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // 显示
    setTimeout(() => toast.classList.add('show'), 10);

    // 3秒后隐藏
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
