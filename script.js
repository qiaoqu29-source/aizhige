let chars = [];
let settings = {};
let currentId = null;
let modalMode = 'create';

// 页面加载
document.addEventListener('DOMContentLoaded', () => {
    chars = JSON.parse(localStorage.getItem('characters') || '[]');
    settings = JSON.parse(localStorage.getItem('settings') || '{}');
    
    // 填充设置表单
    document.getElementById('set-url').value = settings.apiUrl || '';
    document.getElementById('set-key').value = settings.apiKey || '';
    document.getElementById('set-model').value = settings.model || 'gpt-4o';
    
    updateClock();
    setInterval(updateClock, 1000);
    renderChatList();
});

// 时钟
function updateClock() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('st-time').innerText = `${h}:${m}`;
}

// 打开/关闭窗口
function openApp(id) {
    document.getElementById(id).classList.add('open');
}
function closeApp(id) {
    document.getElementById(id).classList.remove('open');
}

// 渲染聊天列表
function renderChatList() {
    const container = document.getElementById('chat-list');
    container.innerHTML = '';
    
    if (chars.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#888;padding:40px">点击右上角 ＋ 创建角色</div>';
        return;
    }
    
    chars.forEach(c => {
        const lastMsg = c.messages.length > 0 ? c.messages[c.messages.length - 1].content : '新朋友';
        const preview = lastMsg.length > 25 ? lastMsg.substring(0, 25) + '...' : lastMsg;
        
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.onclick = () => openRoom(c.id);
        item.innerHTML = `
            <div class="avatar">${c.name[0]}</div>
            <div class="info">
                <div class="name">${c.name}</div>
                <div class="preview">${preview}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// 打开聊天室
function openRoom(id) {
    currentId = id;
    const c = chars.find(x => x.id === id);
    document.getElementById('room-title').innerText = c.name;
    document.getElementById('win-room').classList.add('open');
    renderMessages();
}

// 退出聊天室
function exitRoom() {
    document.getElementById('win-room').classList.remove('open');
    currentId = null;
    renderChatList();
}

// 渲染消息
function renderMessages() {
    const c = chars.find(x => x.id === currentId);
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    
    c.messages.forEach(m => {
        const row = document.createElement('div');
        row.className = `msg-row ${m.role === 'user' ? 'user' : 'ai'}`;
        
        const avatarText = m.role === 'user' ? '我' : c.name[0];
        
        row.innerHTML = `
            <div class="avatar">${avatarText}</div>
            <div class="bubble">${m.content}</div>
        `;
        container.appendChild(row);
    });
    
    container.scrollTop = container.scrollHeight;
}

// 发送消息
async function sendMsg() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentId) return;
    
    const c = chars.find(x => x.id === currentId);
    c.messages.push({ role: 'user', content: text });
    input.value = '';
    renderMessages();
    saveData();
    
    // 调用 AI
    const reply = await callAI(c);
    if (reply) {
        c.messages.push({ role: 'assistant', content: reply });
        saveData();
        renderMessages();
    }
}

// 调用 AI API
async function callAI(char) {
    if (!settings.apiUrl || !settings.apiKey) {
        return '请先在设置里填写 API 地址和 Key';
    }
    
    try {
        const messages = [
            { role: 'system', content: char.prompt || '你是一个助手' },
            ...char.messages.slice(-10)
        ];
        
        const res = await fetch(settings.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model || 'gpt-4o',
                messages: messages
            })
        });
        
        const data = await res.json();
        return data.choices[0].message.content;
    } catch (e) {
        return '请求失败，请检查网络和API设置';
    }
}

// 模态框
function openModal(mode) {
    modalMode = mode;
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const nameInput = document.getElementById('mo-name');
    const promptInput = document.getElementById('mo-prompt');
    
    if (mode === 'create') {
        title.innerText = '新角色';
        nameInput.value = '';
        promptInput.value = '';
    } else if (mode === 'edit') {
        const c = chars.find(x => x.id === currentId);
        title.innerText = '编辑角色';
        nameInput.value = c.name;
        promptInput.value = c.prompt || '';
    }
    
    modal.classList.add('open');
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
}

function saveModal() {
    const name = document.getElementById('mo-name').value.trim();
    const prompt = document.getElementById('mo-prompt').value.trim();
    
    if (!name) {
        alert('请输入名字');
        return;
    }
    
    if (modalMode === 'create') {
        chars.unshift({
            id: Date.now().toString(),
            name: name,
            prompt: prompt,
            messages: []
        });
    } else {
        const c = chars.find(x => x.id === currentId);
        c.name = name;
        c.prompt = prompt;
        document.getElementById('room-title').innerText = name;
    }
    
    saveData();
    renderChatList();
    closeModal();
}

// 保存设置
function saveSettings() {
    settings = {
        apiUrl: document.getElementById('set-url').value,
        apiKey: document.getElementById('set-key').value,
        model: document.getElementById('set-model').value
    };
    localStorage.setItem('settings', JSON.stringify(settings));
    alert('设置已保存');
    closeApp('win-sets');
}

// 保存数据
function saveData() {
    localStorage.setItem('characters', JSON.stringify(chars));
}