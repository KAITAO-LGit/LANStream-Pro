/**
 * 数据库检查脚本
 */

const { DatabaseManager } = require('./utils/database');
const path = require('path');

async function check() {
    const db = new DatabaseManager();

    try {
        await db.initialize();

        console.log('='.repeat(50));
        console.log('数据库状态检查');
        console.log('='.repeat(50));

        // 检查数据库文件路径
        const dbPath = path.join(__dirname, 'data', 'lanstream.db');
        console.log('DB path:', dbPath);

        // 检查表结构
        const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('\nTables:', tables.map(t => t.name));

        // 检查用户数量
        const users = db.query('SELECT COUNT(*) as count FROM users');
        console.log('\nUser count:', users[0]?.count);

        // 检查 users 表的所有列
        const columns = db.query('PRAGMA table_info(users)');
        console.log('\nUsers columns:', columns.map(c => c.name));

        // 检查文件数量
        const files = db.query('SELECT COUNT(*) as count FROM files');
        console.log('\nFile count:', files[0]?.count);

        // 测试查询一个用户
        const sampleUser = db.query('SELECT id, username, role FROM users LIMIT 1');
        if (sampleUser.length > 0) {
            console.log('\nSample user:', sampleUser[0]);
        } else {
            console.log('\nNo users found in database');
        }

        console.log('\n' + '='.repeat(50));
        console.log('Database check passed!');
        console.log('='.repeat(50));

    } catch (e) {
        console.error('\nError:', e.message);
        console.error(e.stack);
    } finally {
        db.close();
    }
}

check();
