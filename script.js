let chars = [];
let sets = {};
let curId = null;
let swReg = null;
let currentAvatarType = null;
let currentPersonaType = null;

// 页面加载
document.addEventListener('DOMContentLoaded', function() {
    chars = JSON.parse(localStorage.getItem('characters') || '[]');
    sets = JSON.parse(localStorage.getItem('settings') || '{}');
    
    if (document.getElementById('set-url')) document.getElementById('set-url').value = sets.apiUrl || '';
    if (document.getElementById('set-key')) document.getElementById('set-key').value = sets.apiKey || '';
    if (document.getElementById('set-model')) document.getElementById('set-model').value = sets.modelName || 'gpt-4o';
    if (document.getElementById('set-temp')) document.getElementById('set-temp').value = sets.temp || 0.7;
    if (document.getElementById('set-bg')) document.getElementById('set-bg').value = sets.bgUrl || '';
    
    updateClock();
    setInterval(updateClock, 1000);
    renderList();
    initSW();
    setInterval(checkActiveMessages, 60000);
    setTimeout(checkActiveMessages, 3000);
    
    // 通知横幅点击
    document.getElementById('noti-banner').onclick = function() {
        document.getElementById('noti-banner').classList.remove('show');
        openApp('win-chat');
    };
});

// Service Worker
function initSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(function(reg) { swReg = reg; })
            .catch(function(err) { console.log('SW error', err); });
    }
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function updateClock() {
    var now = new Date();
    var h = now.getHours().toString().padStart(2, '0');
    var m = now.getMinutes().toString().padStart(2, '0');
    var el = document.getElementById('st-time');
    if (el) el.innerText = h + ':' + m;
}

function openApp(id) {
    document.getElementById(id).classList.add('open');
}

function closeApp(id) {
    document.getElementById(id).classList.remove('open');
}

// ========== 模型拉取功能 ==========
function fetchModels() {
    var apiUrl = document.getElementById('set-url').value;
    var apiKey = document.getElementById('set-key').value;
    
    if (!apiUrl || !apiKey) {
        alert('请先填写 API 地址和 Key');
        return;
    }
    
    // 构造模型列表 URL
    var modelsUrl = apiUrl.replace('/chat/completions', '').replace(/\/+$/, '') + '/models';
    
    document.getElementById('model-list').innerHTML = '<div class="loading">加载中...</div>';
    document.getElementById('model-overlay').style.display = 'flex';
    
    fetch(modelsUrl, {
        headers: { 'Authorization': 'Bearer ' + apiKey }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        var models = data.data || [];
        var currentModel = document.getElementById('set-model').value;
        var html = '';
        
        if (models.length === 0) {
            html = '<div class="loading">未找到可用模型</div>';
        } else {
            for (var i = 0; i < models.length; i++) {
                var m = models[i];
                var isSelected = m.id === currentModel;
                html += '<div class="model-item' + (isSelected ? ' selected' : '') + '" onclick="selectModel(\'' + m.id + '\')">';
                html += '<span>' + m.id + '</span>';
                if (isSelected) html += '<i class="fas fa-check check"></i>';
                html += '</div>';
            }
        }
        
        document.getElementById('model-list').innerHTML = html;
    })
    .catch(function(err) {
        document.getElementById('model-list').innerHTML = '<div class="loading">加载失败，请检查 API 设置</div>';
    });
}

function selectModel(modelId) {
    document.getElementById('set-model').value = modelId;
    hideModelList();
}

function hideModelList() {
    document.getElementById('model-overlay').style.display = 'none';
}

// ========== 聊天列表 ==========
function renderList() {
    var con = document.getElementById('list-con');
    if (!con) return;
    con.innerHTML = '';
    
    if (chars.length === 0) {
        con.innerHTML = '<div style="text-align:center;color:#888;padding:40px">点击右上角 ＋ 创建角色</div>';
        return;
    }
    
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        var displayName = c.nickname || c.name;
        var last = '新朋友';
        if (c.messages && c.messages.length > 0) {
            var lastMsg = c.messages[c.messages.length - 1];
            last = typeof lastMsg.content === 'string' ? lastMsg.content.substring(0, 25) : '[多媒体]';
        }
        
        var avatarHtml = c.aiAvatar 
            ? '<img src="' + c.aiAvatar + '">' 
            : c.name[0];
        
        var item = document.createElement('div');
        item.className = 'chat-item';
        item.onclick = (function(id) { return function() { openRoom(id); }; })(c.id);
        item.innerHTML = '<div class="avatar">' + avatarHtml + '</div><div class="info"><div class="name">' + displayName + '</div><div class="preview">' + last + '</div></div>';
        con.appendChild(item);
    }
}

function openRoom(id) {
    curId = id;
    var c = getChar(id);
    document.getElementById('room-n').innerText = c.nickname || c.name;
    document.getElementById('win-room').classList.add('open');
    renderMsgs();
}

function exitRoom() {
    document.getElementById('win-room').classList.remove('open');
    curId = null;
    renderList();
}

function getChar(id) {
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === id) return chars[i];
    }
    return null;
}

// ========== 消息渲染 ==========
function renderMsgs() {
    var c = getChar(curId);
    if (!c) return;
    
    var inj = document.getElementById('im-inject');
    inj.innerHTML = '';
    
    for (var j = 0; j < c.messages.length; j++) {
        var m = c.messages[j];
        var row = document.createElement('div');
        row.className = 'im-row ' + (m.role === 'user' ? 'user' : 'ai');
        
        var avatarHtml = '';
        if (m.role === 'user') {
            avatarHtml = c.userAvatar ? '<img src="' + c.userAvatar + '">' : (c.userName ? c.userName[0] : '我');
        } else {
            avatarHtml = c.aiAvatar ? '<img src="' + c.aiAvatar + '">' : (c.realName ? c.realName[0] : c.name[0]);
        }
        
        var contentHtml = '';
        if (typeof m.content === 'string') {
            contentHtml = m.content.replace(/\n/g, '<br>');
        } else if (Array.isArray(m.content)) {
            for (var k = 0; k < m.content.length; k++) {
                var p = m.content[k];
                if (p.type === 'text') contentHtml += p.text.replace(/\n/g, '<br>');
                if (p.type === 'image_url') contentHtml += '<img src="' + p.image_url.url + '">';
            }
        }
        
        row.innerHTML = '<div class="im-avatar">' + avatarHtml + '</div><div class="im-bubble">' + contentHtml + '</div>';
        inj.appendChild(row);
    }
    
    document.getElementById('im-scroll').scrollTop = 999999;
}

// ========== 发送消息 ==========
function handleSend() {
    var inp = document.getElementById('chat-inp');
    var v = inp.value.trim();
    if (!v || !curId) return;
    
    var c = getChar(curId);
    c.messages.push({ role: 'user', content: v });
    c.lastMsgTime = Date.now();
    inp.value = '';
    renderMsgs();
    saveData();
    
    getAIReply(c).then(function(reply) {
        if (reply) {
            c.messages.push({ role: 'assistant', content: reply });
            saveData();
            renderMsgs();
        }
    });
}

function getAIReply(char) {
    return new Promise(function(resolve) {
        if (!sets.apiUrl || !sets.apiKey) {
            resolve('请先在设置里填写 API');
            return;
        }
        
        // 构建系统提示
        var sysPrompt = '';
        if (char.aiPersona) sysPrompt += '【角色设定】\n' + char.aiPersona + '\n\n';
        if (char.realName) sysPrompt += '你的名字是：' + char.realName + '\n';
        if (char.userName) sysPrompt += '用户希望你称呼他为：' + char.userName + '\n';
        if (char.userPersona) sysPrompt += '\n【用户信息】\n' + char.userPersona + '\n';
        if (char.memory) sysPrompt += '\n【长期记忆】\n' + char.memory + '\n';
        if (char.prompt) sysPrompt += '\n【补充说明】\n' + char.prompt;
        
        if (!sysPrompt) sysPrompt = '你是一个友好的AI助手。';
        
        var messages = [{ role: 'system', content: sysPrompt }];
        var recent = char.messages.slice(-10);
        for (var i = 0; i < recent.length; i++) {
            messages.push(recent[i]);
        }
        
        fetch(sets.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sets.apiKey
            },
            body: JSON.stringify({
                model: sets.modelName || 'gpt-4o',
                temperature: parseFloat(sets.temp) || 0.7,
                messages: messages
            })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.choices && data.choices[0]) {
                resolve(data.choices[0].message.content);
            } else {
                resolve('请求失败：' + JSON.stringify(data));
            }
        })
        .catch(function() {
            resolve('网络错误');
        });
    });
}

// ========== 角色详情设置 ==========
function openCharSettings() {
    var c = getChar(curId);
    if (!c) return;
    
    document.getElementById('char-nickname').value = c.nickname || '';
    document.getElementById('char-realname').value = c.realName || '';
    document.getElementById('char-username').value = c.userName || '';
    document.getElementById('char-group').value = c.group || '';
    document.getElementById('char-active').checked = c.activeInteract || false;
    document.getElementById('char-interval').value = c.activeInterval || 60;
    
    // 头像
    var aiPreview = document.getElementById('ai-avatar-preview');
    var userPreview = document.getElementById('user-avatar-preview');
    aiPreview.innerHTML = c.aiAvatar ? '<img src="' + c.aiAvatar + '">' : '<i class="fas fa-camera"></i>';
    userPreview.innerHTML = c.userAvatar ? '<img src="' + c.userAvatar + '">' : '<i class="fas fa-camera"></i>';
    
    // 提示
    document.getElementById('ai-persona-hint').innerText = c.aiPersona ? '已设置' : '点击编辑';
    document.getElementById('user-persona-hint').innerText = c.userPersona ? '已设置' : '点击编辑';
    document.getElementById('memory-hint').innerText = c.memory ? '已设置' : '点击编辑';
    
    document.getElementById('win-char-settings').classList.add('open');
}

function closeCharSettings() {
    document.getElementById('win-char-settings').classList.remove('open');
}

function saveCharSettings() {
    var c = getChar(curId);
    if (!c) return;
    
    c.nickname = document.getElementById('char-nickname').value.trim();
    c.realName = document.getElementById('char-realname').value.trim();
    c.userName = document.getElementById('char-username').value.trim();
    c.group = document.getElementById('char-group').value.trim();
    c.activeInteract = document.getElementById('char-active').checked;
    c.activeInterval = parseInt(document.getElementById('char-interval').value) || 60;
    
    document.getElementById('room-n').innerText = c.nickname || c.name;
    
    saveData();
    closeCharSettings();
    renderList();
}

function deleteChar() {
    if (!confirm('确定删除该角色？所有聊天记录将丢失。')) return;
    
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === curId) {
            chars.splice(i, 1);
            break;
        }
    }
    
    saveData();
    closeCharSettings();
    exitRoom();
    closeApp('win-room');
}

// ========== 头像上传 ==========
function uploadAvatar(type) {
    currentAvatarType = type;
    document.getElementById('up-avatar').click();
}

function handleAvatarUpload(el) {
    var f = el.files[0];
    if (!f) return;
    
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var can = document.getElementById('comp-c');
            var ctx = can.getContext('2d');
            var size = 200;
            can.width = size;
            can.height = size;
            
            // 居中裁剪
            var sx = 0, sy = 0, sw = img.width, sh = img.height;
            if (sw > sh) {
                sx = (sw - sh) / 2;
                sw = sh;
            } else {
                sy = (sh - sw) / 2;
                sh = sw;
            }
            
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
            var data = can.toDataURL('image/jpeg', 0.8);
            
            var c = getChar(curId);
            if (currentAvatarType === 'ai') {
                c.aiAvatar = data;
                document.getElementById('ai-avatar-preview').innerHTML = '<img src="' + data + '">';
            } else {
                c.userAvatar = data;
                document.getElementById('user-avatar-preview').innerHTML = '<img src="' + data + '">';
            }
            saveData();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(f);
    el.value = '';
}

// ========== Persona 编辑器 ==========
function openPersonaEditor(type) {
    currentPersonaType = type;
    var c = getChar(curId);
    
    if (type === 'ai') {
        document.getElementById('persona-editor-title').innerText = 'AI Persona';
        document.getElementById('persona-hint-text').innerText = '描述AI角色的性格、背景、说话风格等。AI会按照这个设定来扮演角色。';
        document.getElementById('persona-textarea').value = c.aiPersona || '';
    } else {
        document.getElementById('persona-editor-title').innerText = 'My Persona';
        document.getElementById('persona-hint-text').innerText = '描述你自己的信息，让AI更了解你。例如：你的性格、爱好、职业等。';
        document.getElementById('persona-textarea').value = c.userPersona || '';
    }
    
    document.getElementById('win-persona-editor').classList.add('open');
}

function closePersonaEditor() {
    document.getElementById('win-persona-editor').classList.remove('open');
}

function savePersona() {
    var c = getChar(curId);
    var text = document.getElementById('persona-textarea').value.trim();
    
    if (currentPersonaType === 'ai') {
        c.aiPersona = text;
        document.getElementById('ai-persona-hint').innerText = text ? '已设置' : '点击编辑';
    } else {
        c.userPersona = text;
        document.getElementById('user-persona-hint').innerText = text ? '已设置' : '点击编辑';
    }
    
    saveData();
    closePersonaEditor();
}

function aiGeneratePersona() {
    var c = getChar(curId);
    if (!sets.apiUrl || !sets.apiKey) {
        alert('请先在设置里填写 API');
        return;
    }
    
    var prompt = currentPersonaType === 'ai' 
        ? '请根据角色名"' + c.name + '"，生成一段详细的角色人设描述，包括性格、背景故事、说话风格等。直接输出人设内容，不要有多余解释。'
        : '请生成一段示例用户人设，包括基本信息、性格特点、兴趣爱好等。直接输出人设内容，不要有多余解释。';
    
    document.getElementById('persona-textarea').value = '正在生成中...';
    
    fetch(sets.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sets.apiKey
        },
        body: JSON.stringify({
            model: sets.modelName || 'gpt-4o',
            messages: [{ role: 'user', content: prompt }]
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.choices && data.choices[0]) {
            document.getElementById('persona-textarea').value = data.choices[0].message.content;
        }
    })
    .catch(function() {
        document.getElementById('persona-textarea').value = '生成失败，请重试';
    });
}

// ========== 记忆编辑器 ==========
function openMemoryEditor() {
    var c = getChar(curId);
    document.getElementById('memory-textarea').value = c.memory || '';
    document.getElementById('win-memory-editor').classList.add('open');
}

function closeMemoryEditor() {
    document.getElementById('win-memory-editor').classList.remove('open');
}

function saveMemory() {
    var c = getChar(curId);
    c.memory = document.getElementById('memory-textarea').value.trim();
    document.getElementById('memory-hint').innerText = c.memory ? '已设置' : '点击编辑';
    saveData();
    closeMemoryEditor();
}

function aiSummarizeMemory() {
    var c = getChar(curId);
    if (!sets.apiUrl || !sets.apiKey) {
        alert('请先在设置里填写 API');
        return;
    }
    
    if (c.messages.length < 5) {
        alert('对话记录太少，无法提炼');
        return;
    }
    
    var recentChats = '';
    var start = Math.max(0, c.messages.length - 30);
    for (var j = start; j < c.messages.length; j++) {
        var msg = c.messages[j];
        var content = typeof msg.content === 'string' ? msg.content : '[多媒体]';
        recentChats += msg.role + ': ' + content + '\n';
    }
    
    document.getElementById('memory-textarea').value = '正在提炼中...';
    
    fetch(sets.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sets.apiKey
        },
        body: JSON.stringify({
            model: sets.modelName || 'gpt-4o',
            messages: [{ role: 'user', content: '请从以下对话中提取重要信息，包括用户的喜好、习惯、重要事件等，整理成简洁的记忆条目：\n\n' + recentChats }]
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.choices && data.choices[0]) {
            document.getElementById('memory-textarea').value = data.choices[0].message.content;
        }
    })
    .catch(function() {
        document.getElementById('memory-textarea').value = '提炼失败，请重试';
    });
}

// ========== 创建角色 ==========
function showCreateModal() {
    document.getElementById('mo-title').innerText = '新角色';
    document.getElementById('mo-n').value = '';
    document.getElementById('mo-p').value = '';
    document.getElementById('mo-overlay').style.display = 'flex';
}

function hideModal() {
    document.getElementById('mo-overlay').style.display = 'none';
}

function commitModal() {
    var n = document.getElementById('mo-n').value.trim();
    var p = document.getElementById('mo-p').value.trim();
    
    if (!n) {
        alert('请输入名字');
        return;
    }
    
    chars.unshift({
        id: Date.now(),
        name: n,
        prompt: p,
        messages: [],
        aiPersona: '',
        userPersona: '',
        memory: '',
        nickname: '',
        realName: '',
        userName: '',
        group: '',
        aiAvatar: '',
        userAvatar: '',
        activeInteract: false,
        activeInterval: 60
    });
    
    saveData();
    renderList();
    hideModal();
}

// ========== 工具栏 ==========
function toggleTools() {
    document.getElementById('t-panel').classList.toggle('show');
}

function clearHistory() {
    if (!confirm('确定清空对话？')) return;
    var c = getChar(curId);
    c.messages = [];
    saveData();
    renderMsgs();
    toggleTools();
}

function uploadImg() {
    document.getElementById('up-i').click();
}

function handleImgUpload(el) {
    var f = el.files[0];
    if (!f) return;
    
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var can = document.getElementById('comp-c');
            var ctx = can.getContext('2d');
            var w = img.width, h = img.height, max = 800;
            if (w > max || h > max) {
                if (w > h) { h = h * max / w; w = max; }
                else { w = w * max / h; h = max; }
            }
            can.width = w;
            can.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            sendWithAttach('image', can.toDataURL('image/jpeg', 0.6));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(f);
    el.value = '';
}

function uploadFile() {
    document.getElementById('up-f').click();
}

function handleFileUpload(el) {
    var f = el.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        sendWithAttach('file', e.target.result, f.name);
    };
    reader.readAsText(f);
    el.value = '';
}

function sendWithAttach(type, data, name) {
    var c = getChar(curId);
    if (!c) return;
    
    var inp = document.getElementById('chat-inp');
    var v = inp.value.trim();
    var newMsg = { role: 'user', content: [] };
    
    if (type === 'image') {
        if (v) newMsg.content.push({ type: 'text', text: v });
        newMsg.content.push({ type: 'image_url', image_url: { url: data } });
    } else {
        newMsg.content = (v ? v + '\n\n' : '') + '[文件: ' + name + ']\n' + data;
    }
    
    c.messages.push(newMsg);
    c.lastMsgTime = Date.now();
    inp.value = '';
    document.getElementById('t-panel').classList.remove('show');
    renderMsgs();
    saveData();
    
    getAIReply(c).then(function(reply) {
        if (reply) {
            c.messages.push({ role: 'assistant', content: reply });
            saveData();
            renderMsgs();
        }
    });
}

// ========== 主动发消息 ==========
function checkActiveMessages() {
    var now = Date.now();
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        if (!c.activeInteract) continue;
        
        var interval = (c.activeInterval || 60) * 60 * 1000;
        var lastTime = c.lastMsgTime || c.id;
        
        if (now - lastTime > interval) {
            sendActiveMessage(c);
        }
    }
}

function sendActiveMessage(char) {
    char.lastMsgTime = Date.now();
    saveData();
    
    var sysPrompt = (char.aiPersona || char.prompt || '你是一个助手');
    if (char.memory) sysPrompt += '\n\n【长期记忆】\n' + char.memory;
    
    var messages = [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: '（系统指令：请主动给用户发一句简短的问候，不超过30字）' }
    ];
    
    fetch(sets.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sets.apiKey
        },
        body: JSON.stringify({
            model: sets.modelName || 'gpt-4o',
            messages: messages
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.choices && data.choices[0]) {
            var reply = data.choices[0].message.content;
            char.messages.push({ role: 'assistant', content: reply });
            saveData();
            if (curId === char.id) renderMsgs();
            showNotification(char.nickname || char.name, reply);
        }
    });
}

function showNotification(name, message) {
    document.getElementById('noti-n').innerText = name;
    document.getElementById('noti-t').innerText = message;
    document.getElementById('noti-banner').classList.add('show');
    setTimeout(function() {
        document.getElementById('noti-banner').classList.remove('show');
    }, 4000);
    
    if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
        if (swReg) {
            swReg.showNotification(name, { body: message, icon: 'https://img.icons8.com/color/96/chat--v1.png' });
        } else {
            new Notification(name, { body: message });
        }
    }
}

// ========== 保存和导出 ==========
function saveData() {
    localStorage.setItem('characters', JSON.stringify(chars));
}

function saveGlobalSets() {
    sets = {
        apiUrl: document.getElementById('set-url').value,
        apiKey: document.getElementById('set-key').value,
        modelName: document.getElementById('set-model').value,
        temp: document.getElementById('set-temp').value,
        bgUrl: document.getElementById('set-bg').value
    };
    localStorage.setItem('settings', JSON.stringify(sets));
    alert('设置已保存');
    closeApp('win-sets');
}

function exportData() {
    var data = JSON.stringify({ chars: chars, sets: sets });
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ai-chat-backup.json';
    a.click();
}