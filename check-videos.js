/**
 * 视频播放诊断脚本
 * 运行此脚本检查视频文件和数据库状态
 */

const path = require('path');
const fs = require('fs');

// 模拟数据库数据
const videoFiles = [
    { id: '9ca1f73f-c784-49d3-b50c-c56345b86fbc', name: '测试视频1', path: 'G:/AI/Videos/test1.mp4' },
    { id: '83668811-8949-475b-b342-c8ead4d537e0', name: '测试视频2', path: 'G:/AI/Videos/test2.mp4' },
    { id: 'eee5bad4-cc39-4626-b768-3484d031a8fd', name: '测试视频3', path: 'G:/AI/Videos/test3.mp4' }
];

console.log('='.repeat(50));
console.log('LANStream Pro - 视频播放诊断工具');
console.log('='.repeat(50));

console.log('\n检查视频文件是否存在...\n');

let allValid = true;

videoFiles.forEach(video => {
    const exists = fs.existsSync(video.path);
    const status = exists ? '✅ 存在' : '❌ 不存在';
    console.log(`视频: ${video.name}`);
    console.log(`  ID: ${video.id}`);
    console.log(`  路径: ${video.path}`);
    console.log(`  状态: ${status}`);
    
    if (exists) {
        const stats = fs.statSync(video.path);
        console.log(`  大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } else {
        allValid = false;
    }
    console.log('');
});

console.log('='.repeat(50));
if (allValid) {
    console.log('✅ 所有视频文件检查通过');
    console.log('如果仍然无法播放，请检查：');
    console.log('1. 视频格式是否被浏览器支持 (MP4, WebM, OGG)');
    console.log('2. FFmpeg是否正确安装');
    console.log('3. 服务器日志中是否有错误信息');
} else {
    console.log('❌ 部分视频文件不存在');
    console.log('请检查：');
    console.log('1. 视频文件路径是否正确');
    console.log('2. 文件是否被移动或删除');
    console.log('3. 是否需要重新注册视频文件');
}
console.log('='.repeat(50));
