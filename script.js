let chars = [];
let sets = {};
let curId = null;
let mMode = 'create';
let swReg = null;

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
    
    // 注册 Service Worker
    initSW();
    
    // 请求通知权限
    requestNotificationPermission();
    
    // 每分钟检查主动发消息
    setInterval(checkActiveMessages, 60000);
    
    // 页面加载时也检查一次
    setTimeout(checkActiveMessages, 3000);
});

// 注册 Service Worker
function initSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(function(reg) {
                swReg = reg;
                console.log('SW 注册成功');
            })
            .catch(function(err) {
                console.log('SW 注册失败', err);
            });
    }
}

// 请求通知权限
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// 检查主动发消息
function checkActiveMessages() {
    var now = Date.now();
    
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        
        // 检查是否开启了主动发消息
        if (!c.activeInteract) continue;
        
        // 计算间隔（毫秒）
        var interval = (c.activeInterval || 60) * 60 * 1000;
        
        // 获取上次消息时间
        var lastTime = c.lastMsgTime || c.id;
        
        // 如果超过间隔时间，发送主动消息
        if (now - lastTime > interval) {
            sendActiveMessage(c);
        }
    }
}

// 发送主动消息
function sendActiveMessage(char) {
    // 更新最后消息时间
    char.lastMsgTime = Date.now();
    saveData();
    
    // 构造系统指令
    var sysPrompt = (char.prompt || '你是一个助手') + '\n\n【长期记忆】\n' + (char.memory || '暂无');
    var messages = [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: '（系统指令：请根据你的人设和记忆，主动给用户发一句简短的问候或关心的话，不要超过30字，要自然亲切）' }
    ];
    
    // 添加最近几条对话作为上下文
    if (char.messages && char.messages.length > 0) {
        var recent = char.messages.slice(-5);
        for (var i = 0; i < recent.length; i++) {
            messages.splice(1, 0, recent[i]);
        }
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
            var reply = data.choices[0].message.content;
            
            // 保存消息
            char.messages.push({ role: 'assistant', content: reply });
            saveData();
            
            // 如果当前正在这个聊天室，刷新消息
            if (curId === char.id) {
                renderMsgs();
            }
            
            // 发送通知
            showNotification(char.name, reply);
        }
    })
    .catch(function(err) {
        console.log('主动消息发送失败', err);
    });
}

// 显示通知
function showNotification(name, message) {
    // 显示页面内的通知横幅
    document.getElementById('noti-n').innerText = name;
    document.getElementById('noti-t').innerText = message;
    document.getElementById('noti-banner').classList.add('show');
    
    // 3秒后隐藏
    setTimeout(function() {
        document.getElementById('noti-banner').classList.remove('show');
    }, 4000);
    
    // 如果页面不在前台，发送系统通知
    if (document.visibilityState !== 'visible') {
        if (Notification.permission === 'granted') {
            var options = {
                body: message,
                icon: 'https://img.icons8.com/color/96/chat--v1.png',
                tag: 'ai-chat-' + Date.now(),
                renotify: true
            };
            
            if (swReg) {
                swReg.showNotification(name, options);
            } else {
                new Notification(name, options);
            }
        }
    }
}

// 时钟
function updateClock() {
    var now = new Date();
    var h = now.getHours().toString().padStart(2, '0');
    var m = now.getMinutes().toString().padStart(2, '0');
    var el = document.getElementById('st-time');
    if (el) el.innerText = h + ':' + m;
}

// 打开/关闭窗口
function openApp(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('open');
}

function closeApp(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
}

// 渲染聊天列表
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
        var last = '新朋友';
        if (c.messages && c.messages.length > 0) {
            var lastMsg = c.messages[c.messages.length - 1];
            if (typeof lastMsg.content === 'string') {
                last = lastMsg.content.substring(0, 25);
            } else {
                last = '[多媒体]';
            }
        }
        
        var item = document.createElement('div');
        item.className = 'chat-item';
        item.setAttribute('data-id', c.id);
        item.onclick = (function(id) {
            return function() { openRoom(id); };
        })(c.id);
        item.innerHTML = '<div class="avatar">' + c.name[0] + '</div><div class="info"><div class="name">' + c.name + '</div><div class="preview">' + last + '</div></div>';
        con.appendChild(item);
    }
}

// 打开聊天室
function openRoom(id) {
    curId = id;
    var c = null;
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === id) { c = chars[i]; break; }
    }
    if (!c) return;
    
    document.getElementById('room-n').innerText = c.name;
    document.getElementById('win-room').classList.add('open');
    renderMsgs();
}

// 退出聊天室
function exitRoom() {
    document.getElementById('win-room').classList.remove('open');
    curId = null;
    renderList();
}

// 渲染消息
function renderMsgs() {
    var c = null;
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === curId) { c = chars[i]; break; }
    }
    if (!c) return;
    
    var inj = document.getElementById('im-inject');
    inj.innerHTML = '';
    
    for (var j = 0; j < c.messages.length; j++) {
        var m = c.messages[j];
        var row = document.createElement('div');
        row.className = 'im-row ' + (m.role === 'user' ? 'user' : 'ai');
        
        var avatarText = m.role === 'user' ? '我' : c.name[0];
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
        
        row.innerHTML = '<div class="im-avatar">' + avatarText + '</div><div class="im-bubble">' + contentHtml + '</div>';
        inj.appendChild(row);
    }
    
    document.getElementById('im-scroll').scrollTop = 999999;
}

// 发送消息
function handleSend() {
    var inp = document.getElementById('chat-inp');
    var v = inp.value.trim();
    if (!v || !curId) return;
    
    var c = null;
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === curId) { c = chars[i]; break; }
    }
    if (!c) return;
    
    c.messages.push({ role: 'user', content: v });
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

// 调用AI
function getAIReply(char) {
    return new Promise(function(resolve) {
        if (!sets.apiUrl || !sets.apiKey) {
            resolve('请先在设置里填写 API');
            return;
        }
        
        var sysPrompt = (char.prompt || '你是一个助手') + '\n\n【长期记忆】\n' + (char.memory || '暂无');
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
                resolve('请求失败');
            }
        })
        .catch(function() {
            resolve('网络错误');
        });
    });
}

// 显示创建弹窗
function showCreateModal() {
    mMode = 'create';
    document.getElementById('mo-title').innerText = '新角色';
    document.getElementById('mo-n').value = '';
    document.getElementById('mo-p').value = '';
    document.getElementById('mo-mem').value = '';
    document.getElementById('mo-active').checked = false;
    document.getElementById('mo-interval').value = 60;
    document.getElementById('mo-overlay').style.display = 'flex';
}

// 显示编辑弹窗
function showEditModal() {
    mMode = 'edit';
    var c = null;
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === curId) { c = chars[i]; break; }
    }
    if (!c) return;
    
    document.getElementById('mo-title').innerText = '编辑角色';
    document.getElementById('mo-n').value = c.name;
    document.getElementById('mo-p').value = c.prompt || '';
    document.getElementById('mo-mem').value = c.memory || '';
    document.getElementById('mo-active').checked = c.activeInteract || false;
    document.getElementById('mo-interval').value = c.activeInterval || 60;
    document.getElementById('mo-overlay').style.display = 'flex';
}

// 隐藏弹窗
function hideModal() {
    document.getElementById('mo-overlay').style.display = 'none';
}

// 保存角色
function commitModal() {
    var n = document.getElementById('mo-n').value.trim();
    var p = document.getElementById('mo-p').value.trim();
    var mem = document.getElementById('mo-mem').value.trim();
    var active = document.getElementById('mo-active').checked;
    var interval = parseInt(document.getElementById('mo-interval').value) || 60;
    
    if (!n) {
        alert('请输入名字');
        return;
    }
    
    if (mMode === 'create') {
        chars.unshift({
            id: Date.now(),
            name: n,
            prompt: p,
            memory: mem,
            messages: [],
            activeInteract: active,
            activeInterval: interval
        });
    } else {
        for (var i = 0; i < chars.length; i++) {
            if (chars[i].id === curId) {
                chars[i].name = n;
                chars[i].prompt = p;
                chars[i].memory = mem;
                chars[i].activeInteract = active;
                chars[i].activeInterval = interval;
                document.getElementById('room-n').innerText = n;
                break;
            }
        }
    }
    
    saveData();
    renderList();
    hideModal();
}

// 智能提炼
function summarizeMemory() {
    if (!curId) {
        alert('请先进入一个聊天室');
        return;
    }
    
    var c = null;
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === curId) { c = chars[i]; break; }
    }
    if (!c || c.messages.length < 5) {
        alert('对话太短，无法提炼');
        return;
    }
    
    alert('正在提炼...');
    
    var recentChats = '';
    var start = Math.max(0, c.messages.length - 20);
    for (var j = start; j < c.messages.length; j++) {
        var msg = c.messages[j];
        var content = typeof msg.content === 'string' ? msg.content : '[多媒体]';
        recentChats += msg.role + ': ' + content + '\n';
    }
    
    fetch(sets.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sets.apiKey
        },
        body: JSON.stringify({
            model: sets.modelName || 'gpt-4o',
            messages: [{ role: 'user', content: '总结以下对话中的重要信息：\n\n' + recentChats }]
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.choices && data.choices[0]) {
            document.getElementById('mo-mem').value = data.choices[0].message.content;
            alert('提炼完成');
        }
    })
    .catch(function() {
        alert('提炼失败');
    });
}

// 工具栏
function toggleTools() {
    document.getElementById('t-panel').classList.toggle('show');
}

function clearHistory() {
    if (!confirm('确定清空对话？')) return;
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === curId) {
            chars[i].messages = [];
            break;
        }
    }
    saveData();
    renderMsgs();
    toggleTools();
}

// 上传图片
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
            var w = img.width;
            var h = img.height;
            var max = 800;
            if (w > max || h > max) {
                if (w > h) { h = h * max / w; w = max; }
                else { w = w * max / h; h = max; }
            }
            can.width = w;
            can.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            
            var data = can.toDataURL('image/jpeg', 0.6);
            sendWithAttach('image', data);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(f);
    el.value = '';
}

// 上传文件
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
    if (!curId) return;
    
    var c = null;
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === curId) { c = chars[i]; break; }
    }
    if (!c) return;
    
    var inp = document.getElementById('chat-inp');
    var v = inp.value.trim();
    
    var newMsg = { role: 'user', content: [] };
    
    if (type === 'image') {
        if (v) newMsg.content.push({ type: 'text', text: v });
        newMsg.content.push({ type: 'image_url', image_url: { url: data } });
    } else {
        var txt = v ? v + '\n\n' : '';
        txt += '[文件: ' + name + ']\n' + data;
        newMsg.content = txt;
    }
    
    c.messages.push(newMsg);
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

// 消息编辑
function hideEditOverlay() {
    document.getElementById('edit-overlay').style.display = 'none';
}

// 保存设置
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

// 保存数据
function saveData() {
    localStorage.setItem('characters', JSON.stringify(chars));
}

// 导出数据
function exportData() {
    var data = JSON.stringify({ chars: chars, sets: sets });
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ai-os-backup.json';
    a.click();
}
// 点击通知横幅跳转
document.getElementById('noti-banner').onclick = function() {
    document.getElementById('noti-banner').classList.remove('show');
    openApp('win-chat');
};