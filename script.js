let chars = [], sets = {}, curId = null, mMode = 'create', swReg = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. 加载数据
    chars = JSON.parse(localStorage.getItem('characters') || '[]');
    sets = JSON.parse(localStorage.getItem('settings') || '{"bgUrl":"","apiUrl":"","apiKey":"","modelName":"gpt-4o","temp":0.7}');
    
    // 2. 环境初始化
    if(document.getElementById('set-url')) {
        document.getElementById('set-url').value = sets.apiUrl || '';
        document.getElementById('set-key').value = sets.apiKey || '';
        document.getElementById('set-model').value = sets.modelName || 'gpt-4o';
        document.getElementById('set-temp').value = sets.temp || 0.7;
        document.getElementById('set-bg').value = sets.bgUrl || '';
    }
    
    applySettings();
    renderList();
    setInterval(updateClock, 1000); updateClock();
    setInterval(checkActiveMessages, 60000);
});

// 系统应用
function applySettings() {
    if(sets.bgUrl) {
        document.getElementById('phone-wrapper').style.backgroundImage = `url('${sets.bgUrl}')`;
    }
}

function updateClock() {
    const now = new Date();
    const t = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    if(document.getElementById('st-time')) document.getElementById('st-time').innerText = t;
}

function openApp(id) { document.getElementById(id).classList.add('open'); }
function closeApp(id) { document.getElementById(id).classList.remove('open'); }

// 核心渲染：桌面图标 + 列表图标
function renderList() {
    const grid = document.getElementById('desktop-app-grid');
    const list = document.getElementById('list-con');
    if(grid) grid.innerHTML = '';
    if(list) list.innerHTML = '';
    
    chars.forEach(c => {
        // 渲染桌面图标
        const app = document.createElement('div');
        app.className = 'app-item';
        app.onclick = () => openRoom(c.id);
        const iconHtml = c.iconUrl ? `<img src="${c.iconUrl}">` : `<span>${c.name[0]}</span>`;
        app.innerHTML = `<div class="app-icon">${iconHtml}</div><div class="app-name-label">${c.nickname || c.name}</div>`;
        grid.appendChild(app);

        // 渲染侧边列表项
        const li = document.createElement('div');
        li.className = 'chat-item';
        li.onclick = () => openRoom(c.id);
        const avatarHtml = c.aiAvatar ? `<img src="${c.aiAvatar}">` : c.name[0];
        li.innerHTML = `<div class="avatar">${avatarHtml}</div><div class="info"><div class="name">${c.nickname || c.name}</div><div class="preview">点击开始对话</div></div>`;
        list.appendChild(li);
    });
}

// 聊天逻辑
function openRoom(id) { curId = id; const c = chars.find(x => x.id === id); document.getElementById('room-n').innerText = c.nickname || c.name; document.getElementById('win-room').classList.add('open'); renderMsgs(); }
function exitRoom() { document.getElementById('win-room').classList.remove('open'); curId=null; renderList(); }

function renderMsgs() {
    const c = chars.find(x => x.id === curId);
    const inj = document.getElementById('im-inject'); inj.innerHTML = '';
    c.messages.forEach((m, idx) => {
        const row = document.createElement('div');
        row.className = `im-row ${m.role==='user'?'user':'ai'}`;
        const avatar = m.role === 'user' ? (c.userAvatar?`<img src="${c.userAvatar}">`:'我') : (c.aiAvatar?`<img src="${c.aiAvatar}">`:c.name[0]);
        row.innerHTML = `<div class="im-avatar">${avatar}</div><div class="im-bubble" onclick="openEditMsg(${idx})">${m.content}</div>`;
        inj.appendChild(row);
    });
    document.getElementById('im-scroll').scrollTop = 999999;
}

async function handleSend() {
    const inp = document.getElementById('chat-inp'); const v = inp.value.trim(); if(!v || !curId) return;
    const c = chars.find(x => x.id === curId);
    c.messages.push({ role:'user', content: v });
    c.lastMsgTime = Date.now(); inp.value=''; renderMsgs();
    const reply = await getAIReply(c);
    if(reply) { c.messages.push({ role:'assistant', content: reply }); saveData(); renderMsgs(); }
}

async function getAIReply(char, sysPrompt=null, rawMode=false) {
    if(!sets.apiUrl || !sets.apiKey) return "API未配置";
    const hist = rawMode ? [{role:'user', content: sysPrompt}] : [{role:'system', content: char.aiPersona || char.prompt}, ...char.messages.slice(-10)];
    try {
        const res = await fetch(sets.apiUrl, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${sets.apiKey}`}, body:JSON.stringify({model:sets.modelName, messages:hist})});
        const d = await res.json(); return d.choices[0].message.content;
    } catch(e) { return "请求失败"; }
}

// 角色详情逻辑 (完整保留)
function openCharSettings() {
    const c = chars.find(x => x.id === curId);
    document.getElementById('char-nickname').value = c.nickname || '';
    document.getElementById('char-realname').value = c.realName || '';
    document.getElementById('char-username').value = c.userName || '';
    document.getElementById('char-group').value = c.group || '';
    document.getElementById('char-active').checked = c.activeInteract || false;
    document.getElementById('char-interval').value = c.activeInterval || 60;
    document.getElementById('char-icon-url').value = c.iconUrl || '';
    document.getElementById('ai-avatar-preview').innerHTML = c.aiAvatar ? `<img src="${c.aiAvatar}">` : '';
    document.getElementById('user-avatar-preview').innerHTML = c.userAvatar ? `<img src="${c.userAvatar}">` : '';
    openApp('win-char-settings');
}

function saveCharSettings() {
    const c = chars.find(x => x.id === curId);
    c.nickname = document.getElementById('char-nickname').value;
    c.realName = document.getElementById('char-realname').value;
    c.userName = document.getElementById('char-username').value;
    c.group = document.getElementById('char-group').value;
    c.activeInteract = document.getElementById('char-active').checked;
    c.activeInterval = parseInt(document.getElementById('char-interval').value);
    c.iconUrl = document.getElementById('char-icon-url').value;
    saveData(); renderList(); closeApp('win-char-settings');
}

// 高级功能：模型拉取
async function fetchModels() {
    const url = sets.apiUrl.replace('/chat/completions','').replace(/\/+$/,'') + '/models';
    try {
        const r = await fetch(url, { headers:{'Authorization':`Bearer ${sets.apiKey}`}});
        const d = await r.json(); 
        const html = d.data.map(m => `<div class="model-item" onclick="selectModel('${m.id}')">${m.id}</div>`).join('');
        document.getElementById('model-list-inject').innerHTML = html;
        document.getElementById('model-overlay').style.display = 'flex';
    } catch(e) { alert("获取失败"); }
}
function selectModel(id) { document.getElementById('set-model').value = id; hideModelList(); }
function hideModelList() { document.getElementById('model-overlay').style.display='none'; }

// 导出与保存
function saveData() { localStorage.setItem('characters', JSON.stringify(chars)); }
function saveGlobalSets() {
    sets.apiUrl = document.getElementById('set-url').value;
    sets.apiKey = document.getElementById('set-key').value;
    sets.modelName = document.getElementById('set-model').value;
    sets.temp = document.getElementById('set-temp').value;
    sets.bgUrl = document.getElementById('set-bg').value;
    localStorage.setItem('settings', JSON.stringify(sets)); applySettings(); closeApp('win-sets');
}
function exportData() { const b = new Blob([JSON.stringify({chars, sets})], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ai-os-data.json'; a.click(); }

// 这一行调用是为了确保初始化执行
function showCreateModal() { mMode='create'; document.getElementById('mo-overlay').style.display='flex'; }
function hideModal() { document.getElementById('mo-overlay').style.display='none'; }
function commitModal() {
    const n = document.getElementById('mo-n').value; if(!n) return;
    chars.unshift({ id:Date.now(), name:n, messages:[], nickname:'', realName:'', userName:'', group:'', iconUrl:'', aiAvatar:'', userAvatar:'', activeInteract:false, activeInterval:60 });
    saveData(); renderList(); hideModal();
}

/* ... 保持 checkActiveMessages, summarizeMemory, PersonaEditors ... */