/**
 * 角色权限配置
 * 定义系统中所有用户角色的权限级别和功能
 */

module.exports = {
    // 角色定义（按权限从高到低排序）
    ROLES: {
        SUPERADMIN: 'superadmin',
        ADMIN: 'admin',
        MODERATOR: 'moderator',
        VIP: 'vip',
        USER: 'user'
    },

    // 角色显示名称
    ROLE_NAMES: {
        'superadmin': '超级管理员',
        'admin': '管理员',
        'moderator': '版主',
        'vip': 'VIP用户',
        'user': '普通用户'
    },

    // 角色权限级别（数字越大权限越高）
    ROLE_LEVELS: {
        'superadmin': 100,
        'admin': 80,
        'moderator': 60,
        'vip': 40,
        'user': 20
    },

    // 权限配置
    PERMISSIONS: {
        // 系统管理权限
        system: {
            superadmin: true,  // 完全控制
            admin: true,       // 可以访问
            moderator: false,  // 不能访问
            vip: false,
            user: false
        },

        // 用户管理权限
        users: {
            superadmin: true,  // 可以管理所有用户
            admin: true,       // 可以管理普通用户和VIP
            moderator: false,  // 不能管理用户
            vip: false,
            user: false
        },

        // 文件管理权限
        files: {
            superadmin: true,
            admin: true,
            moderator: true,   // 版主可以管理文件
            vip: false,
            user: false        // 普通用户不能管理文件
        },

        // 视频管理权限
        videos: {
            superadmin: true,
            admin: true,
            moderator: true,   // 版主可以管理视频
            vip: false,
            user: false
        },

        // 配置管理权限
        config: {
            superadmin: true,
            admin: true,
            moderator: false,
            vip: false,
            user: false
        },

        // 日志查看权限
        logs: {
            superadmin: true,
            admin: true,
            moderator: false,
            vip: false,
            user: false
        }
    },

    /**
     * 检查用户是否有指定权限
     * @param {string} userRole - 用户角色
     * @param {string} permission - 权限名称
     * @returns {boolean} 是否有权限
     */
    hasPermission(userRole, permission) {
        const roleLevel = this.ROLE_LEVELS[userRole] || 0;
        
        // 超级管理员拥有所有权限
        if (userRole === this.ROLES.SUPERADMIN) {
            return true;
        }

        // 检查特定权限
        if (this.PERMISSIONS[permission]) {
            return this.PERMISSIONS[permission][userRole] === true;
        }

        return false;
    },

    /**
     * 检查用户角色是否至少为指定级别
     * @param {string} userRole - 用户角色
     * @param {string} requiredRole - 需要的角色
     * @returns {boolean} 是否满足要求
     */
    hasRole(userRole, requiredRole) {
        const userLevel = this.ROLE_LEVELS[userRole] || 0;
        const requiredLevel = this.ROLE_LEVELS[requiredRole] || 0;
        return userLevel >= requiredLevel;
    },

    /**
     * 获取角色的显示名称
     * @param {string} role - 角色
     * @returns {string} 显示名称
     */
    getRoleName(role) {
        return this.ROLE_NAMES[role] || '普通用户';
    }
};
