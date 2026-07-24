// 主题切换核心逻辑：修复上传点击问题
(function initTheme() {
    const themes = {
        light: 'style-day.css',
        dark: 'style-night.css'
    };
    const savedTheme = localStorage.getItem('wordTheme') || 'light';
    const cssUrl = themes[savedTheme];
    
    // 直接往head插link，不通过div，避免DOM加载延迟
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link); // 改这里，直接插head
    
    window.switchTheme = function() {
        const newTheme = savedTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('wordTheme', newTheme);
        link.href = themes[newTheme];
    };
})();







// 新增：页面加载后立即初始化（删除初始化界面后，无需等待点击“开始”）
window.addEventListener('load', () => {
    initBaseEvents();
    initKeyboardEvents();
});

// 全局变量定义（数据存储+状态控制）
let toReviewWords = [];    // 记忆区单词数组（完整对象：word/translations/type）
let masteredWords = [];    // 已牢记单词数组
let untrainedWords = [];   // 待巩固单词数组
let currentIndex = 0;      // 当前选中记忆区单词索引
let isMeaningHidden = false; // 释义显示状态
let isInited = false;      // 应用初始化状态
// 新增：词汇表名称（初始值与HTML默认文本一致，用于展示、编辑、下载命名）
let vocabularyName = "未选择文件";

// 新增滑动相关全局变量
let startX = 0; // 滑动起始X坐标
let isSliding = false; // 是否处于滑动状态
let targetCardObj = null; // 滑动操作的目标单词卡片对象
let currentOperateArea = ''; // 当前滑动操作的区域（mastered/review/untrained）
const slideThreshold = 50; // 滑动触发阈值（px），可调整






// DOM元素缓存（与HTML ID对应，修改feedback为新容器）
const dom = {
    uploadBtn: document.getElementById('uploadBtn'),
    uploadInput: document.getElementById('uploadInput'),
    downloadBtn: document.getElementById('downloadBtn'),
    toggleMeaningBtn: document.getElementById('toggleMeaningBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    wordInput: document.getElementById('wordInput'),
    reviewCardScroll: document.getElementById('reviewCardScroll'),
    wordListEl: document.getElementById('wordList'),
    masteredList: document.getElementById('masteredList'),
    untrainedList: document.getElementById('untrainedList'),
    masteredCountEl: document.getElementById('masteredCount'),
    reviewCountEl: document.getElementById('reviewCount'),
    untrainedCountEl: document.getElementById('untrainedCount'),
    // 关键修改：替换为顶部新的操作反馈容器
    feedbackEl: document.getElementById('operationFeedback')
};


/**
 * 模块1：绑定基础事件（上传、下载、释义切换等）
 */
function initBaseEvents() {
    // 1. 调用词汇表名称双击编辑绑定函数
    bindVocabularyNameEdit();



const themeBtn = document.getElementById('themeSwitchBtn');
if (themeBtn) {
  let currentTheme = localStorage.getItem('wordTheme') || 'light';
  themeBtn.textContent = currentTheme === 'light' ? '🌙' : '☀️'; // 初始图标
  themeBtn.addEventListener('click', () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('wordTheme', currentTheme);
    document.head.querySelector('link[rel="stylesheet"]').href = currentTheme === 'light' ? 'style-day.css' : 'style-night.css';
    themeBtn.textContent = currentTheme === 'light' ? '🌙' : '☀️'; // 切换图标
  });
}






    // 2. 上传按钮点击事件（触发文件选择框）
    dom.uploadBtn?.addEventListener('click', () => {
        dom.uploadInput?.click();
    });

    // 3. 文件选择后处理（智能识别：单个JSON/压缩包）
    dom.uploadInput?.addEventListener('change', handleFileUpload);

    // 4. 下载进度包按钮事件
    dom.downloadBtn?.addEventListener('click', downloadProgressPackage);

    // 5. 切换释义显示状态事件
    dom.toggleMeaningBtn?.addEventListener('click', toggleMeaning);

    // 6. 打乱记忆区单词事件
    dom.shuffleBtn?.addEventListener('click', shuffleToReviewWords);

    // 7. 输入框初始化（聚焦+基础按键拦截）
    initWordInput();

    // 初始提示（显示在顶部左侧）
    showFeedback('请上传单词文件（单个JSON）或进度压缩包', 'info');
    
    // 8. 调用滑动事件绑定函数（放在函数末尾）
    bindSlideEvents();
}




/**
 * 模块2：文件上传处理（核心：智能识别文件类型）
 */
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    showFeedback(`正在处理文件：${file.name}...`, 'info');

    try {
        // 区分文件类型：压缩包（.zip）/ 单个JSON（.json）
        if (file.name.endsWith('.zip')) {
            await handleZipUpload(file); // 处理进度压缩包
        } else if (file.name.endsWith('.json')) {
            await handleJsonUpload(file); // 处理单个单词JSON
        } else {
            throw new Error('文件类型错误，仅支持.zip压缩包或.json文件');
        }

        // 数据加载成功后，启用所有功能按钮
        dom.toggleMeaningBtn.disabled = false;
        dom.shuffleBtn.disabled = false;
        dom.downloadBtn.disabled = false;

        // 初始化完成：更新UI+标记状态
        isInited = true;
        updateAllUI();
        showFeedback('✅ 数据加载成功！', 'success');
        dom.uploadInput.value = ''; // 清空文件选择框
    } catch (err) {
        showFeedback(`❌ 处理失败：${err.message}`, 'error');
        dom.uploadInput.value = '';
    }
}

/**
 * 模块3：处理单个JSON文件上传（首次使用/原始单词库）
 */
async function handleJsonUpload(file) {
    const text = await readFileAsText(file);
    const jsonData = parseJson(text, file.name);

    // 验证JSON格式（需包含word和translations字段）
    if (!Array.isArray(jsonData) || !jsonData.every(item => item.word && item.translations)) {
        throw new Error('JSON格式错误，需包含单词数组（每个项含word和translations字段）');
    }

    // 新增：从JSON文件名提取vocabularyName（不含后缀，从后往前找第一个横杠）
    const fileNameWithoutExt = file.name.replace(/\.[^.]+$/, ''); // 去掉文件后缀（如.json）
    const lastHyphenIndex = fileNameWithoutExt.lastIndexOf('-'); // 从后往前找第一个横杠
    // 有横杠则取横杠后内容，无横杠则取完整文件名（不含后缀）
    vocabularyName = lastHyphenIndex > -1 
        ? fileNameWithoutExt.slice(lastHyphenIndex + 1) 
        : fileNameWithoutExt;

    // 初始化数据：JSON内容作为记忆区，其他列空
    toReviewWords = [...jsonData];
    masteredWords = [];
    untrainedWords = [];
    currentIndex = 0; // 重置当前选中索引

    // 新增：更新HTML中的词汇表名称显示
    document.getElementById('vocabularyNameDisplay').textContent = vocabularyName;
}

/**
 * 模块4：处理压缩包上传（有历史进度）
 */
async function handleZipUpload(file) {
    // 检查是否加载JSZip库
    if (typeof JSZip === 'undefined') {
        throw new Error('请先引入JSZip库（用于解压压缩包）');
    }

    const arrayBuffer = await readFileAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 定义需要读取的三个文件名称（固定）
    const requiredFiles = ['记忆区.json', '已牢记.json', '待巩固.json'];
    const fileData = {};

    // 读取压缩包内的三个文件
    for (const fileName of requiredFiles) {
        if (!zip.files[fileName]) {
            // 缺失文件用空数组填充
            fileData[fileName] = [];
            showFeedback(`⚠️  压缩包缺失${fileName}，已自动初始化为空`, 'warning');
            continue;
        }
        // 读取并解析JSON
        const text = await zip.files[fileName].async('text');
        fileData[fileName] = parseJson(text, fileName);
    }

    // 新增：从压缩包文件名提取vocabularyName（不含后缀，从后往前找第一个横杠）
    const fileNameWithoutExt = file.name.replace(/\.[^.]+$/, ''); // 去掉文件后缀（如.zip）
    const lastHyphenIndex = fileNameWithoutExt.lastIndexOf('-'); // 从后往前找第一个横杠
    // 有横杠则取横杠后内容，无横杠则取完整文件名（不含后缀）
    vocabularyName = lastHyphenIndex > -1 
        ? fileNameWithoutExt.slice(lastHyphenIndex + 1) 
        : fileNameWithoutExt;

    // 赋值到全局数组
    toReviewWords = fileData['记忆区.json'] || [];
    masteredWords = fileData['已牢记.json'] || [];
    untrainedWords = fileData['待巩固.json'] || [];
    currentIndex = Math.min(currentIndex, toReviewWords.length - 1); // 防止索引越界

    // 新增：更新HTML中的词汇表名称显示
    document.getElementById('vocabularyNameDisplay').textContent = vocabularyName;
}

/**
 * 模块5：工具函数 - 读取文件为文本
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error(`读取${file.name}失败`));
        reader.readAsText(file, 'utf8');
    });
}

/**
 * 模块6：工具函数 - 读取文件为ArrayBuffer（用于压缩包）
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error(`读取${file.name}失败`));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * 模块7：工具函数 - 解析JSON（含错误处理）
 */
function parseJson(text, fileName) {
    try {
        return text ? JSON.parse(text) : []; // 空文本返回空数组
    } catch (err) {
        throw new Error(`${fileName}格式错误，无法解析JSON`);
    }
}

/**
 * 模块8：工具函数 - 显示反馈信息（适配顶部左侧新容器，解决频繁触发闪动问题）
 */
function showFeedback(message, type = 'info') {
    if (!dom.feedbackEl) return;

    // 关键：清除上一个未执行的定时器，避免频繁触发时提示闪动
    if (window.feedbackTimer) {
        clearTimeout(window.feedbackTimer);
    }

    // 清除原有样式和内容，显示新提示
    dom.feedbackEl.className = 'operation-feedback';
    dom.feedbackEl.classList.add(type);
    dom.feedbackEl.textContent = message;

    // 重新设置定时器，确保当前提示能完整显示 3 秒（可改时长）
    window.feedbackTimer = setTimeout(() => {
        dom.feedbackEl.textContent = '';
    }, 3000);
}

/**
 * 模块9：初始化单词输入框（聚焦+基础按键拦截）
 */
function initWordInput() {
    if (!dom.wordInput) return;

    dom.wordInput.focus();

    // 按键事件拦截
    dom.wordInput.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'ArrowUp':
            case 'ArrowDown':
            case ' ':
            case 'Enter':
                e.preventDefault();
                break;
            default:
                break;
        }
    });
}

/**
 * 模块10：新增 - 绑定词汇表名称双击编辑事件
 */
function bindVocabularyNameEdit() {
    const displayEl = document.getElementById('vocabularyNameDisplay');
    const containerEl = displayEl.parentElement; // 父容器（top-tip-container）

    // 双击展示元素触发编辑
    displayEl.addEventListener('dblclick', () => {
        // 1. 创建临时输入框
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'vocabulary-name-input'; // 应用CSS样式
        inputEl.value = vocabularyName; // 初始值为当前词汇表名称

        // 2. 用输入框替换展示元素
        containerEl.replaceChild(inputEl, displayEl);
        inputEl.focus(); // 自动聚焦，方便用户直接输入

        // 3. 定义保存逻辑（失焦或按Enter键）
        const saveEditedName = () => {
            // 处理空值：用户输入为空时用默认值
            const newName = inputEl.value.trim() || "未命名词汇表";
            // 更新全局变量和HTML展示
            vocabularyName = newName;
            displayEl.textContent = newName;
            // 用展示元素替换输入框
            containerEl.replaceChild(displayEl, inputEl);
            // 显示修改成功的反馈
            showFeedback(`词汇表名称已更新为：${newName}`, 'info');
        };

        // 绑定保存事件：失焦保存 + 按Enter保存
        inputEl.addEventListener('blur', saveEditedName);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEditedName();
        });
    });
}



/**
 * 新增模块：绑定鼠标滑动事件（左滑/右滑迁移卡片）
 */
function bindSlideEvents() {
    // 1. 已牢记区（左列）滑动绑定
    const masteredContainer = document.querySelector('.mastered-section');
    bindSlideToContainer(masteredContainer, 'mastered');
    
    // 2. 记忆区（中间）滑动绑定
    const reviewContainer = document.querySelector('.review-section');
    bindSlideToContainer(reviewContainer, 'review');
    
    // 3. 待巩固区（右列）滑动绑定
    const untrainedContainer = document.querySelector('.untrained-section');
    bindSlideToContainer(untrainedContainer, 'untrained');
}

// 通用滑动事件绑定工具函数（复用逻辑）
function bindSlideToContainer(container, area) {
    let targetCardEl = null;
    let slideTraceEl = null;
    let startPos = { x: 0, y: 0 };
    
    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        startX = e.clientX;
        startPos.x = e.clientX;
        startPos.y = e.clientY;
        isSliding = true;
        currentOperateArea = area;
        targetCardObj = null;
        targetCardEl = null;
        
        const cardEl = e.target.closest('.mastered-card, .word-card, .untrained-card');
        if (!cardEl) return;
        targetCardEl = cardEl;
        
        slideTraceEl = document.createElement('div');
        slideTraceEl.className = 'slide-trace';
        slideTraceEl.style.left = `${startPos.x}px`;
        slideTraceEl.style.setProperty('--trace-top', `${startPos.y}px`); // 固定初始y值
        slideTraceEl.style.width = '0px';
        document.body.appendChild(slideTraceEl);
        
        const wordText = cardEl.querySelector('.word').textContent.trim();
        if (area === 'mastered') {
            targetCardObj = masteredWords.find(item => item.word.trim() === wordText);
        } else if (area === 'untrained') {
            targetCardObj = untrainedWords.find(item => item.word.trim() === wordText);
        } else if (area === 'review') {
            targetCardObj = toReviewWords.find(item => item.word.trim() === wordText);
        }
    });
    
    
    container.addEventListener('mousemove', (e) => {
    if (!isSliding || !slideTraceEl) return;
    const currentX = e.clientX;
    const width = Math.abs(currentX - startPos.x);

    // 新增：判断是否为无效操作
    const isInvalid = (area === 'mastered' && currentX < startPos.x) || (area === 'untrained' && currentX > startPos.x);

    if (isInvalid) {
        // 无效操作：移除轨迹线（横线+箭头都不显示）
        if (slideTraceEl.parentNode) {
            slideTraceEl.parentNode.removeChild(slideTraceEl);
        }
        slideTraceEl = null;
        return;
    }

    // 有效操作：正常显示轨迹线+箭头
    slideTraceEl.style.left = `${Math.min(startPos.x, currentX)}px`;
    slideTraceEl.style.width = `${width}px`;
    if (currentX > startPos.x) {
        slideTraceEl.className = 'slide-trace right';
    } else if (currentX < startPos.x) {
        slideTraceEl.className = 'slide-trace left';
    } else {
        slideTraceEl.className = 'slide-trace';
    }
});



    
    container.addEventListener('mouseup', (e) => {
        if (slideTraceEl) {
            document.body.removeChild(slideTraceEl);
            slideTraceEl = null;
        }
        if (!isSliding || !targetCardObj) {
            resetSlideState();
            return;
        }
        const endX = e.clientX;
        const slideDistance = endX - startX;
        if (Math.abs(slideDistance) >= slideThreshold) {
            switch (currentOperateArea) {
                case 'mastered': 
                    if (slideDistance > 0) moveFromSideToReview(targetCardObj, currentOperateArea);
                    break;
                case 'untrained': 
                    if (slideDistance < 0) moveFromSideToReview(targetCardObj, currentOperateArea);
                    break;
                case 'review': 
                    const reviewIndex = toReviewWords.findIndex(item => item.word.trim() === targetCardObj.word.trim());
                    if (reviewIndex === -1) break;
                    if (slideDistance < 0) { 
                        const [movedWord] = toReviewWords.splice(reviewIndex, 1);
                        masteredWords.unshift(movedWord);
                        showFeedback(`⬅️  单词「${movedWord.word}」移至已牢记`, 'info');
                    } else { 
                        const [movedWord] = toReviewWords.splice(reviewIndex, 1);
                        untrainedWords.unshift(movedWord);
                        showFeedback(`➡️  单词「${movedWord.word}」移至待巩固`, 'info');
                    }
                    updateAllUI();
                    break;
            }
        }
        resetSlideState();
    });
    
    container.addEventListener('mouseleave', () => {
        if (slideTraceEl) {
            document.body.removeChild(slideTraceEl);
            slideTraceEl = null;
        }
        resetSlideState();
    });
}

// 重置滑动状态工具函数
function resetSlideState() {
    startX = 0;
    isSliding = false;
    targetCardObj = null;
    currentOperateArea = '';
}





/**
 * 模块11：下载进度压缩包（优化：使用vocabularyName生成文件名）
 */
async function downloadProgressPackage() {
    // 双重判断，避免未加载数据时点击
    if (!isInited || (toReviewWords.length === 0 && masteredWords.length === 0 && untrainedWords.length === 0)) {
        showFeedback('❌ 未加载有效数据，无法下载进度', 'error');
        return;
    }

    // 检查JSZip库
    if (typeof JSZip === 'undefined') {
        showFeedback('❌ 请先引入JSZip库', 'error');
        return;
    }

    showFeedback('正在生成进度包...', 'info');

    try {
        // 1. 创建压缩包
        const zip = new JSZip();

        // 2. 添加三个JSON文件到压缩包（格式化存储）
        zip.file('记忆区.json', JSON.stringify(toReviewWords, null, 2));
        zip.file('已牢记.json', JSON.stringify(masteredWords, null, 2));
        zip.file('待巩固.json', JSON.stringify(untrainedWords, null, 2));

        // 3. 生成压缩包（添加压缩参数，避免生成失败）
        const content = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 } // 平衡压缩率和速度
        });

        // 4. 自动命名（优化：用vocabularyName替代固定文本）
        const now = new Date();
        const timeStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
        const fileName = `${timeStr}-${vocabularyName}.zip`; // 核心修改：使用词汇表名称

        // 5. 触发下载
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        // 6. 清理资源（延长延迟，避免下载中断）
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 500);

        showFeedback('✅ 进度包下载成功！', 'success');
    } catch (err) {
        showFeedback(`❌ 生成进度包失败：${err.message}`, 'error');
        console.error('下载失败详细原因：', err); // 控制台输出详细错误
    }
}

/**
 * 模块12：切换释义显示状态（修复：同步DOM更新）
 */
function toggleMeaning() {
    isMeaningHidden = !isMeaningHidden;
    dom.toggleMeaningBtn.textContent = isMeaningHidden ? '显示释义' : '隐藏释义';
    
    // 直接操作DOM，同步所有记忆区卡片的释义状态
    const meanings = document.querySelectorAll('[data-controlled="true"] .meaning');
    meanings.forEach(el => {
        el.classList.toggle('hidden', isMeaningHidden);
    });

    showFeedback(`释义已${isMeaningHidden ? '隐藏' : '显示'}`, 'info');
}

/**
 * 模块13：打乱记忆区单词
 */
function shuffleToReviewWords() {
    if (toReviewWords.length === 0) {
        showFeedback('❌ 记忆区无单词，无法打乱', 'error');
        return;
    }

    // 打乱数组（不改变原数组）
    toReviewWords = [...toReviewWords].sort(() => Math.random() - 0.5);
    currentIndex = 0; // 重置选中索引到第一个
    updateReviewWordsUI(); // 刷新记忆区UI
    showFeedback('🔀 记忆区单词已打乱', 'info');
}

/**
 * 模块14：更新所有UI
 */
function updateAllUI() {
    updateReviewWordsUI();
    updateMasteredWordsUI();
    updateUntrainedWordsUI();
    updateCounts();
}














/**
 * 模块15：更新记忆区单词UI（核心渲染逻辑）
 */
function updateReviewWordsUI() {
    if (!dom.wordListEl) return;
    dom.wordListEl.innerHTML = '';

    // 记忆区为空时显示提示
    if (toReviewWords.length === 0) {
        dom.wordListEl.innerHTML = '<div class="empty-state">🎉 所有记忆区单词已分类完成！</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    toReviewWords.forEach((wordObj, index) => {
        const isActive = index === currentIndex;
        const card = createWordCard(wordObj, isActive, 'word-card', false, true);
        fragment.appendChild(card);
    });
    dom.wordListEl.appendChild(fragment);

    // 同步释义显示状态
    if (isMeaningHidden) {
        hideMiddleTranslations();
    } else {
        showMiddleTranslations();
    }

    // 激活当前单词并滚动置顶
    activateCurrentWord();
}

/**
 * 模块16：更新已牢记单词UI
 */
function updateMasteredWordsUI() {
    if (!dom.masteredList) return;
    dom.masteredList.innerHTML = '';

    if (masteredWords.length === 0) {
        dom.masteredList.innerHTML = '<div class="empty-state">暂无已牢记单词<br>按←键或空格将中间单词移至此处</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    masteredWords.forEach((wordObj, index) => {
        const isLatest = index === 0; // 最新添加的单词标亮
        const card = createWordCard(wordObj, false, 'mastered-card', isLatest, false);
        // 绑定双击事件：移至中间记忆区当前高亮前一位
        card.addEventListener('dblclick', () => {
            moveFromSideToReview(wordObj, 'mastered');
        });
        fragment.appendChild(card);
    });
    dom.masteredList.appendChild(fragment);
    //forceScrollToTop(dom.masteredList);
}

/**
 * 模块17：更新待巩固单词UI
 */
function updateUntrainedWordsUI() {
    if (!dom.untrainedList) return;
    dom.untrainedList.innerHTML = '';

    if (untrainedWords.length === 0) {
        dom.untrainedList.innerHTML = '<div class="empty-state">暂无待巩固单词<br>按→键或输入正确后按Enter将中间单词移至此处</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    untrainedWords.forEach((wordObj, index) => {
        const isLatest = index === 0; // 最新添加的单词标亮
        const card = createWordCard(wordObj, false, 'untrained-card', isLatest, false);
        // 绑定双击事件：移至中间记忆区当前高亮前一位
        card.addEventListener('dblclick', () => {
            moveFromSideToReview(wordObj, 'untrained');
        });
        fragment.appendChild(card);
    });
    dom.untrainedList.appendChild(fragment);
    //forceScrollToTop(dom.untrainedList);
}

/**
 * 模块18：创建单词卡片（通用函数）
 */
function createWordCard(wordObj, isActive, cardClass, isLatest, isControlled) {
    const card = document.createElement('div');
    card.className = `${cardClass} ${isActive ? 'active' : ''} ${isLatest ? 'latest' : ''}`;
    if (isControlled) card.dataset.controlled = 'true';

    // 构建释义HTML（单词+词性+释义）
    let translationsHtml = '<div class="translations-container">';
    if (wordObj?.translations && Array.isArray(wordObj.translations)) {
        wordObj.translations.forEach(trans => {
            const transText = trans.translation || '';
            const meanings = transText.split('；').filter(mean => mean.trim());
            const typeText = trans.type || '未知词性';

            meanings.forEach(mean => {
                translationsHtml += `
                    <div class="translation-item">
                        <span class="meaning">${mean.trim()}</span>
                        <span class="pos-tag">${typeText}</span>
                    </div>
                `;
            });
        });
    } else {
        translationsHtml += `
            <div class="translation-item">
                <span class="meaning">无释义</span>
                <span class="pos-tag">未知词性</span>
            </div>
        `;
    }
    translationsHtml += '</div>';

    const wordText = wordObj.word || '无单词';
    card.innerHTML = `
        <div class="word-header">
            <div class="word">${wordText}</div>
        </div>
        ${translationsHtml}
    `;

    // 记忆区卡片：点击释义切换显示
    if (isControlled) {
        card.querySelectorAll('.translation-item').forEach(el => {
            el.addEventListener('click', () => {
                el.querySelector('.meaning').classList.toggle('hidden');
            });
        });
    }

    return card;
}

/**
 * 新增模块：左右区单词双击移至中间记忆区逻辑
 * @param {object} wordObj - 待迁移单词对象
 * @param {string} fromArea - 来源区域（mastered/untrained）
 */
function moveFromSideToReview(wordObj, fromArea) {
    // 1. 从来源数组删除单词
    let sourceArr = fromArea === 'mastered' ? masteredWords : untrainedWords;
    const deleteIndex = sourceArr.findIndex(item => item.word === wordObj.word);
    if (deleteIndex === -1) return;
    sourceArr.splice(deleteIndex, 1);

    // 2. 插入位置直接设为当前高亮索引（无需减1）
    const insertIndex = currentIndex;
    toReviewWords.splice(insertIndex, 0, wordObj);

    // 3. 高亮索引保持为插入位置（新卡片自动高亮）
    currentIndex = insertIndex;

    // 4. 刷新UI+提示
    updateAllUI();
    showFeedback(`🔄 单词「${wordObj.word}」移至记忆区`, 'info');
}

/**
 * 模块19：激活当前单词（记忆区）+ 滚动置顶
 */
function activateCurrentWord() {
    if (toReviewWords.length === 0) return;

    // 高亮当前选中卡片
    const cards = document.querySelectorAll('.word-card');
    cards.forEach((card, index) => {
        card.classList.toggle('active', index === currentIndex);
    });

    // 滚动到当前选中卡片
    debouncedScrollToTarget();
}

/**
 * 模块20：防抖工具函数（滚动优化）
 */
function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * 模块21：记忆区滚动到当前选中单词
 */
const debouncedScrollToTarget = debounce(() => {
    const cards = document.querySelectorAll('.word-card');
    const targetCard = cards[currentIndex];
    if (!targetCard || !dom.reviewCardScroll) return;

    const containerTop = dom.reviewCardScroll.getBoundingClientRect().top;
    const cardTop = targetCard.getBoundingClientRect().top;
    const scrollOffset = dom.reviewCardScroll.scrollTop + (cardTop - containerTop) - 20; // 偏移20px留边距

    dom.reviewCardScroll.scrollTo({
        top: scrollOffset,
        behavior: 'smooth'
    });
}, 100);

/**
 * 模块22：强制滚动到顶部（已牢记/待巩固列）
 */
function forceScrollToTop(container) {
    if (container && container.scrollHeight > 0) {
        container.scrollTop = 0;
    }
}

/**
 * 模块23：隐藏/显示记忆区释义
 */
function hideMiddleTranslations() {
    document.querySelectorAll('[data-controlled="true"] .meaning').forEach(el => {
        el.classList.add('hidden');
    });
}

function showMiddleTranslations() {
    document.querySelectorAll('[data-controlled="true"] .meaning').forEach(el => {
        el.classList.remove('hidden');
    });
}

/**
 * 模块24：更新三列单词计数
 */
function updateCounts() {
    if (dom.masteredCountEl) dom.masteredCountEl.textContent = masteredWords.length;
    if (dom.untrainedCountEl) dom.untrainedCountEl.textContent = untrainedWords.length;
    
    // 记忆区计数：当前索引/总数量
    const total = toReviewWords.length;
    const currentPos = total > 0 ? currentIndex + 1 : 0;
    if (dom.reviewCountEl) dom.reviewCountEl.textContent = `${currentPos} | ${total}`;
}

/**
 * 模块25：单词移动 - 移至已牢记（左移/空格）
 */
async function moveToMastered() {
    if (toReviewWords.length === 0) return;

    // 从记忆区移除，添加到已牢记头部
    const [movedWord] = toReviewWords.splice(currentIndex, 1);
    masteredWords.unshift(movedWord);

    // 更新索引（避免越界）
    currentIndex = Math.min(currentIndex, toReviewWords.length - 1);

    // 刷新UI并显示提示
    updateAllUI();
    showFeedback(`⬅️  单词「${movedWord.word}」移至已牢记`, 'info');
}

/**
 * 模块26：单词移动 - 移至待巩固（右移/输入正确）
 */
async function moveToUntrained() {
    if (toReviewWords.length === 0) return;

    // 从记忆区移除，添加到待巩固头部
    const [movedWord] = toReviewWords.splice(currentIndex, 1);
    untrainedWords.unshift(movedWord);

    // 更新索引（避免越界）
    currentIndex = Math.min(currentIndex, toReviewWords.length - 1);

    // 刷新UI并显示提示
    updateAllUI();
    showFeedback(`➡️  单词「${movedWord.word}」移至待巩固`, 'info');
}

/**
 * 模块27：切换单词（上下键）
 */
function switchWord(direction) {
    if (toReviewWords.length === 0) return;

    if (direction === 'up') {
        currentIndex = Math.max(0, currentIndex - 1); // 上一个
    } else if (direction === 'down') {
        currentIndex = Math.min(toReviewWords.length - 1, currentIndex + 1); // 下一个
    }

    activateCurrentWord();
    updateCounts();
    dom.wordInput?.focus();
}

/**
 * 模块28：完善键盘快捷键（输入框+全局）
 */
function initKeyboardEvents() {
    // 输入框聚焦时的快捷键
    dom.wordInput?.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowLeft': // 左移→已牢记
                e.preventDefault();
                moveToMastered();
                break;
            case 'ArrowRight': // 右移→待巩固
                e.preventDefault();
                moveToUntrained();
                break;
            case ' ': // 空格→已牢记
                e.preventDefault();
                moveToMastered();
                break;
            case 'Enter': // Enter→验证输入
                e.preventDefault();
                validateInputWord();
                break;
            case 'ArrowUp': // 上一个单词（禁用长按连发）
                if (e.repeat) return;
                e.preventDefault();
                switchWord('up');
                break;
            case 'ArrowDown': // 下一个单词（禁用长按连发）
                if (e.repeat) return;
                e.preventDefault();
                switchWord('down');
                break;
            default:
                break;
        }
    });

    // 全局快捷键（输入框未聚焦时）
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                moveToMastered();
                break;
            case 'ArrowRight':
                e.preventDefault();
                moveToUntrained();
                break;
            case 'ArrowUp':
                if (e.repeat) return;
                e.preventDefault();
                switchWord('up');
                break;
            case 'ArrowDown':
                if (e.repeat) return;
                e.preventDefault();
                switchWord('down');
                break;
            case ' ':
                e.preventDefault();
                moveToMastered();
                break;
            // 字母/数字键自动聚焦输入框并填充
            default:
                if (/^[a-zA-Z0-9]$/.test(e.key)) {
                    e.preventDefault();
                    dom.wordInput.focus();
                    dom.wordInput.value += e.key;
                }
                break;
        }
    });

    // 记忆区滚动同步选中单词
    dom.reviewCardScroll?.addEventListener('scroll', () => {
        if (toReviewWords.length === 0) return;

        const cards = document.querySelectorAll('.word-card');
        const containerRect = dom.reviewCardScroll.getBoundingClientRect();
        const targetY = containerRect.top + 20; // 偏移20px

        let closestIndex = currentIndex;
        let minDistance = Infinity;

        cards.forEach((card, index) => {
            const cardTop = card.getBoundingClientRect().top;
            const distance = Math.abs(cardTop - targetY);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });

        if (closestIndex !== currentIndex) {
            currentIndex = closestIndex;
            activateCurrentWord();
            updateCounts();
        }
    });
}













/**
 * 模块29：输入验证（Enter键）
 */
function validateInputWord() {
    if (!dom.wordInput || toReviewWords.length === 0) return;

    const inputValue = dom.wordInput.value.trim();
    const currentWord = toReviewWords[currentIndex]?.word?.trim() || '';

    if (inputValue.toLowerCase() === currentWord.toLowerCase()) {
        // 输入正确：移至待巩固
        dom.wordInput.classList.add('success');
        moveToUntrained();
        dom.wordInput.value = '';
        setTimeout(() => dom.wordInput.classList.remove('success'), 500);
    } else {
        // 输入错误：高亮提示
        dom.wordInput.classList.add('error');
        showFeedback(`❌ 输入错误，正确单词为「${currentWord}」`, 'error');
        dom.wordInput.select();
        setTimeout(() => dom.wordInput.classList.remove('error'), 500);
    }

    dom.wordInput.focus();
}










