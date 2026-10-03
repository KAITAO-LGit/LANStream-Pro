/**
 * playVideo 函数覆盖
 * 在页面加载后执行，添加转码状态检查和智能播放逻辑
 * 支持修补 onclick 属性和 window.playVideo 两种调用方式
 */

(function() {
    console.log('[PlayVideo-Override] 正在加载转码检查覆盖脚本...');

    // 等待 DOM 加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patchPlayVideo);
    } else {
        patchPlayVideo();
    }

    function patchPlayVideo() {
        console.log('[PlayVideo-Override] 开始检查 playVideo 函数状态...');
        console.log('[PlayVideo-Override] 当前 window.playVideo:', typeof window.playVideo);

        // 等待 admin.js 加载完成并定义 playVideo
        if (typeof window.playVideo === 'undefined') {
            console.log('[PlayVideo-Override] playVideo 未定义，等待 100ms 后重试...');
            setTimeout(patchPlayVideo, 100);
            return;
        }

        console.log('[PlayVideo-Override] playVideo 已定义，开始修补...');

        // 保存原始函数
        const originalPlayVideo = window.playVideo;

        // 创建包装函数
        const wrappedPlayVideo = async function(videoId) {
            console.log('[PlayVideo-Override] === playVideo 被调用 ===');
            console.log('[PlayVideo-Override] videoId:', videoId);

            try {
                // 首先检查是否正在转码
                console.log('[PlayVideo-Override] 检查转码状态...');
                const status = await TranscodingChecker.checkStatus(videoId);
                console.log('[PlayVideo-Override] 转码状态:', status);

                // 判断是否需要等待转码
                // 只有当 progress < 100 时才需要等待
                // 优化：如果已经转码完成（progress >= 100），直接播放
                let needsTranscoding = status.progress < 100;

                // 额外的安全检查：确保视频确实需要转码
                // 如果 isTranscoding 为 false 且 progress >= 100，认为转码完成
                if (!status.isTranscoding && status.progress >= 100) {
                    needsTranscoding = false;
                    console.log('[PlayVideo-Override] ✅ 视频已转码完成，直接播放');
                } else if (!status.isTranscoding && status.progress === 0) {
                    // progress 为 0 且 isTranscoding 为 false 可能是：
                    // 1. 视频根本不需要转码（直接上传的MP4）
                    // 2. 视频还没有开始转码
                    // 3. 转码已失败或被中断
                    // 需要预检查播放列表是否可用
                    console.log('[PlayVideo-Override] ⚠️ 视频状态不确定，预检查播放列表...');
                    
                    const playlistUrl = api.getVideoHLSURL(videoId);
                    const isPlaylistValid = await TranscodingChecker.checkPlaylistAvailable(playlistUrl);
                    
                    if (isPlaylistValid) {
                        console.log('[PlayVideo-Override] ✅ 播放列表有效，直接播放');
                        needsTranscoding = false;
                    } else {
                        console.log('[PlayVideo-Override] ⚠️ 播放列表无效，开始等待转码...');
                        needsTranscoding = true;
                        status.progress = 0; // 重置进度以便显示
                    }
                } else if (needsTranscoding) {
                    console.log('[PlayVideo-Override] ⚠️ 视频正在转码中 (' + status.progress + '%)，等待完成...');
                }

                if (needsTranscoding) {
                    // 显示加载提示
                    const modal = document.getElementById('videoPlayerModal');
                    const titleEl = document.getElementById('videoPlayerTitle');
                    if (modal) {
                        console.log('[PlayVideo-Override] 显示视频播放器模态框');
                        modal.classList.add('show');
                        // 使用内联样式确保模态框显示
                        modal.style.cssText = 'position: fixed !important; inset: 0 !important; background: rgba(0, 0, 0, 0.7) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 9999 !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;';
                        document.body.style.overflow = 'hidden';
                        
                        // 确保modal-content也正确显示
                        const modalContent = modal.querySelector('.modal-content');
                        if (modalContent) {
                            modalContent.style.cssText = 'background: #fff !important; border-radius: 14px !important; max-width: 1200px !important; width: 95% !important; transform: scale(1) translateY(0) !important; opacity: 1 !important; visibility: visible !important; display: block !important; max-height: 95vh !important; overflow: visible !important;';
                        }
                        
                        console.log('[PlayVideo-Override] 模态框类名:', modal.className);
                        console.log('[PlayVideo-Override] 模态框尺寸:', modal.offsetWidth, 'x', modal.offsetHeight);
                        if (titleEl) {
                            titleEl.textContent = '视频转码中 (' + status.progress + '%)...';
                        }
                    }

                    // 等待转码完成
                    console.log('[PlayVideo-Override] 开始轮询等待转码完成...');
                    const ready = await TranscodingChecker.waitForTranscoding(videoId, (progress) => {
                        console.log('[PlayVideo-Override] 📊 转码进度:', progress + '%');
                        if (titleEl) {
                            titleEl.textContent = '视频转码中 (' + progress + '%)...';
                        }
                    });

                    console.log('[PlayVideo-Override] 轮询结果 ready:', ready);

                    if (!ready) {
                        console.log('[PlayVideo-Override] ❌ 转码超时');
                        if (typeof showToast === 'function') {
                            showToast('转码超时，请稍后重试', 'error');
                        }
                        if (typeof closeVideoPlayer === 'function') {
                            closeVideoPlayer();
                        }
                        return;
                    }

                    console.log('[PlayVideo-Override] ✅ 转码完成！');
                    needsTranscoding = false;
                }

                // 调用原始函数
                console.log('[PlayVideo-Override] 调用 originalPlayVideo...');
                await originalPlayVideo(videoId);
                console.log('[PlayVideo-Override] ✅ originalPlayVideo 执行完成');

            } catch (error) {
                console.error('[PlayVideo-Override] ❌ 播放视频时出错:', error);
                console.error('[PlayVideo-Override] 错误堆栈:', error.stack);

                // 显示错误提示
                if (typeof showToast === 'function') {
                    showToast('播放失败: ' + (error.message || '未知错误'), 'error');
                }

                // 尝试调用原始函数作为后备
                try {
                    console.log('[PlayVideo-Override] 尝试调用原始函数作为错误恢复...');
                    await originalPlayVideo(videoId);
                } catch (e) {
                    console.error('[PlayVideo-Override] ❌ 原始播放函数也出错:', e);
                }
            }
        };

        // 替换 window.playVideo
        window.playVideo = wrappedPlayVideo;
        console.log('[PlayVideo-Override] ✅ window.playVideo 已修补');

        // 修补所有已有的 onclick 属性中的 playVideo 调用
        patchExistingOnclickHandlers(wrappedPlayVideo);

        // 设置观察者监听新添加的元素
        setupMutationObserver(wrappedPlayVideo);

        console.log('[PlayVideo-Override] ✅ playVideo 函数修补完成！');
    }

    // 修补现有的 onclick 处理器
    function patchExistingOnclickHandlers(wrappedFunction) {
        const elements = document.querySelectorAll('[onclick*="playVideo"]');
        console.log('[PlayVideo-Override] 找到 ' + elements.length + ' 个带有 playVideo onclick 的元素');

        elements.forEach(function(el, index) {
            const onclickAttr = el.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes('playVideo(')) {
                console.log('[PlayVideo-Override] 修补元素 ' + index + ':', onclickAttr.substring(0, 50) + '...');

                // 移除旧的 onclick 属性
                el.removeAttribute('onclick');

                // 添加新的事件监听器
                el.addEventListener('click', function(event) {
                    // 从 onclick 属性中提取 videoId
                    var match = onclickAttr.match(/playVideo\s*\(\s*['"]([^'"]+)['"]\s*\)/);
                    if (match && match[1]) {
                        var videoId = match[1];
                        console.log('[PlayVideo-Override] 从 onclick 提取到 videoId:', videoId);
                        event.preventDefault();
                        wrappedFunction(videoId);
                    }
                });
            }
        });
    }

    // 使用 MutationObserver 监听新添加的元素
    function setupMutationObserver(wrappedFunction) {
        if (typeof MutationObserver === 'undefined') {
            console.log('[PlayVideo-Override] MutationObserver 不可用，跳过动态监听');
            return;
        }

        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // 元素节点
                        // 检查节点本身
                        if (node.matches && node.matches('[onclick*="playVideo"]')) {
                            patchElementOnclick(node, wrappedFunction);
                        }
                        // 检查子节点
                        var children = node.querySelectorAll('[onclick*="playVideo"]');
                        children.forEach(function(child) {
                            patchElementOnclick(child, wrappedFunction);
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('[PlayVideo-Override] MutationObserver 已设置，监听新添加的 playVideo 按钮');
    }

    // 修补单个元素的 onclick
    function patchElementOnclick(element, wrappedFunction) {
        var onclickAttr = element.getAttribute('onclick');
        if (!onclickAttr || !onclickAttr.includes('playVideo(')) {
            return;
        }

        var match = onclickAttr.match(/playVideo\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (match && match[1]) {
            var videoId = match[1];
            console.log('[PlayVideo-Override] 动态修补元素 onclick，videoId:', videoId);

            element.removeAttribute('onclick');
            element.addEventListener('click', function(event) {
                event.preventDefault();
                wrappedFunction(videoId);
            });
        }
    }
})();
