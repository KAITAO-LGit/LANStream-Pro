/**
 * 只读数据库检查脚本 - 不重新初始化
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

async function check() {
    const dbPath = path.join(__dirname, 'data', 'lanstream.db');
    console.log('DB path:', dbPath);
    console.log('File exists:', fs.existsSync(dbPath));
    console.log('File size:', fs.statSync(dbPath).size, 'bytes');

    if (!fs.existsSync(dbPath)) {
        console.error('Database file does not exist!');
        return;
    }

    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(dbPath));

    console.log('\n' + '='.repeat(50));
    console.log('数据库只读检查');
    console.log('='.repeat(50));

    try {
        // 检查表结构
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('\nTables:', tables[0]?.values.flat() || []);

        // 检查用户数量
        const users = db.exec('SELECT COUNT(*) as count FROM users');
        console.log('\nUser count:', users[0]?.values[0]?.[0] || 0);

        // 列出所有用户
        const allUsers = db.exec('SELECT id, username, role FROM users');
        if (allUsers[0]?.values.length > 0) {
            console.log('\nAll users:');
            allUsers[0].values.forEach((row, i) => {
                console.log(`  ${i + 1}. ${row[1]} (${row[2]}) - ID: ${row[0]}`);
            });
        } else {
            console.log('\nNo users found!');
        }

        // 检查文件数量
        const files = db.exec('SELECT COUNT(*) as count FROM files');
        console.log('\nFile count:', files[0]?.values[0]?.[0] || 0);

        console.log('\n' + '='.repeat(50));

    } catch (e) {
        console.error('\nError:', e.message);
    }

    db.close();
}

check();
