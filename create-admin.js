/**
 * 创建默认管理员账户
 */

const { DatabaseManager } = require('./utils/database');
const { SecurityManager } = require('./utils/security');
const path = require('path');
const fs = require('fs');

async function createAdmin() {
    const db = new DatabaseManager();
    const security = new SecurityManager();

    try {
        await db.initialize();

        console.log('='.repeat(50));
        console.log('创建管理员账户');
        console.log('='.repeat(50));

        // 检查是否已有用户
        const users = db.query('SELECT COUNT(*) as count FROM users');
        const userCount = users.length > 0 ? users[0].count : 0;

        console.log('\n当前用户数量:', userCount);

        if (userCount > 0) {
            // 列出所有用户
            const allUsers = db.query('SELECT id, username, role FROM users');
            console.log('\n现有用户:');
            allUsers.forEach((row, i) => {
                console.log(`  ${i + 1}. ${row.username} (${row.role})`);
            });
        }

        // 检查admin用户
        const admin = db.getUserByUsername('admin');
        if (admin) {
            console.log('\n管理员用户已存在:', admin.username);
        } else {
            // 创建admin用户
            const hashedPassword = await security.hashPassword('admin123');
            const userId = require('uuid').v4();

            db.run(`
                INSERT INTO users (id, username, email, password_hash, role, avatar_url)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, 'admin', 'admin@lanstream.local', hashedPassword, 'admin', null]);

            console.log('\n✅ 管理员账户创建成功!');
            console.log('   用户名: admin');
            console.log('   密码: admin123');
        }

        // 验证登录
        const testUser = db.getUserByUsername('admin');
        if (testUser) {
            console.log('\n验证登录...');
            const isValid = await security.verifyPassword('admin123', testUser.password_hash);
            console.log('密码验证结果:', isValid ? '✅ 成功' : '❌ 失败');
        }

        console.log('\n' + '='.repeat(50));

    } catch (e) {
        console.error('\n错误:', e.message);
        console.error(e.stack);
    } finally {
        db.close();
    }
}

createAdmin();
