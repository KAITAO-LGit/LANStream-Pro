/**
 * 转码状态检查工具
 * 在 playVideo 函数之前加载，用于检查视频是否正在转码
 */

const TranscodingChecker = {
    // 检查是否正在转码
    async checkStatus(videoId) {
        try {
            // 获取 token（支持 Cookie 后备）
            let token = '';
            try {
                token = localStorage.getItem('accessToken') || '';
            } catch (e) {}
            if (!token) {
                // 尝试从 Cookie 获取
                const cookies = document.cookie.split(';');
                for (const cookie of cookies) {
                    const [name, value] = cookie.trim().split('=');
                    if (name === 'accessToken') {
                        token = value;
                        break;
                    }
                }
            }
            
            const response = await fetch(`/api/v1/video/${videoId}/transcode-progress`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await response.json();
            if (data.success) {
                console.log('[TranscodingChecker] API响应:', data.data);
                console.log('[TranscodingChecker] 转码状态判断: isTranscoding=' + data.data.isTranscoding + ', progress=' + data.data.progress);
                return { isTranscoding: data.data.isTranscoding, progress: data.data.progress };
            } else {
                console.log('[TranscodingChecker] API返回失败:', data.error);
            }
        } catch (err) {
            console.warn('[TranscodingChecker] API调用失败:', err.message);
        }
        // 如果 API 调用失败或返回错误，假设视频正在转码中，需要等待
        // 这可以防止在 API 失败时过早尝试播放视频
        console.log('[TranscodingChecker] API失败，假设视频正在转码');
        return { isTranscoding: true, progress: 0 };
    },

    // 检查播放列表是否可用（返回有效内容）
    async checkPlaylistAvailable(playlistUrl) {
        try {
            console.log('[TranscodingChecker] 检查播放列表可用性:', playlistUrl);
            
            const response = await fetch(playlistUrl);
            console.log('[TranscodingChecker] 播放列表响应状态:', response.status);
            
            if (!response.ok) {
                console.log('[TranscodingChecker] 播放列表响应状态异常');
                return false;
            }
            
            const content = await response.text();
            console.log('[TranscodingChecker] 播放列表内容长度:', content.length);
            console.log('[TranscodingChecker] 播放列表内容前200字符:', content.substring(0, 200));
            
            // 检查内容是否有效
            // 1. 内容不能太短
            // 2. 应该包含实际的视频片段引用（.ts文件）或 #EXTINF 标签
            
            if (content.length < 10) {
                console.log('[TranscodingChecker] 播放列表内容太短');
                return false;
            }
            
            // 【关键修复】检测是否是转码占位符
            // 转码占位符通常包含：#EXT-X-TRANSCODING、#EXT-X-TRANSCODING=DEST、或"转码中"等文字
            const isTranscodingPlaceholder = 
                content.includes('#EXT-X-TRANSCODING') ||
                content.includes('TRANSCODING=DEST') ||
                content.includes('转码中') ||
                content.includes('transcoding');
            
            if (isTranscodingPlaceholder) {
                console.log('[TranscodingChecker] 检测到转码占位符，播放列表尚未就绪');
                return false;
            }
            
            // 检查是否是有效的 HLS 播放列表
            // 必须包含实际的片段引用（.ts）或 #EXTINF 标签（表示有实际内容）
            const hasSegments = content.includes('.ts') || content.includes('#EXTINF');
            
            if (hasSegments) {
                console.log('[TranscodingChecker] 播放列表包含实际视频片段，有效');
                return true;
            } else {
                console.log('[TranscodingChecker] 播放列表不包含视频片段，无效');
                return false;
            }
        } catch (err) {
            console.warn('[TranscodingChecker] 检查播放列表失败:', err);
            return false;
        }
    },

    // 等待转码完成
    async waitForTranscoding(videoId, onProgress) {
        return new Promise((resolve) => {
            let pollCount = 0;
            const maxPolls = 120; // 最多等待60秒

            const pollInterval = setInterval(async () => {
                pollCount++;
                const status = await this.checkStatus(videoId);
                console.log('[TranscodingChecker] Poll #' + pollCount + ':', status);

                if (onProgress) onProgress(status.progress);

                // 修复退出条件：支持两种成功场景
                // 1. 不需要转码的视频：isTranscoding 为 false（此时 progress 通常为 0）
                // 2. 转码完成的视频：progress >= 100
                if (!status.isTranscoding || status.progress >= 100) {
                    clearInterval(pollInterval);
                    console.log('[TranscodingChecker] Transcoding complete!');
                    resolve(true);
                } else if (pollCount >= maxPolls) {
                    clearInterval(pollInterval);
                    console.log('[TranscodingChecker] Timeout waiting for transcoding');
                    resolve(false);
                }
            }, 500);
        });
    }
};

// 导出供全局使用
window.TranscodingChecker = TranscodingChecker;
