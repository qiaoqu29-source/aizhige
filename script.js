let chars = [], sets = {}, curId = null, mMode = 'create', swReg = null;

document.addEventListener('DOMContentLoaded', () => {
    chars = JSON.parse(localStorage.getItem('characters') || '[]');
    sets = JSON.parse(localStorage.getItem('settings') || '{"apiUrl":"","apiKey":"","modelName":"gpt-4o","temp":0.7}');
    
    document.getElementById('set-url').value = sets.apiUrl || '';
    document.getElementById('set-key').value = sets.apiKey || '';
    document.getElementById('set-model').value = sets.modelName || 'gpt-4o';
    document.getElementById('set-temp').value = sets.temp || 0.7;
    if(sets.bgUrl) document.getElementById('phone-wrapper').style.backgroundImage = `url(${sets.bgUrl})`;

    updateClock();
    setInterval(updateClock, 1000);
    renderList();
    initSW();
    setInterval(checkActiveInteract, 60000);
});

async function initSW() {
    if ('serviceWorker' in navigator) {
        swReg = await navigator.serviceWorker.register('./sw.js').catch(() => null);
    }
}

function updateClock() {
    const n = new Date();
    const t = n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
    document.getElementById('st-time').innerText = t;
}

function openApp(id) { document.getElementById(id).classList.add('open'); }
function closeApp(id) { document.getElementById(id).classList.remove('open'); }

function openRoom(id) {
    curId = id;
    const c = chars.find(x => x.id === id);
    document.getElementById('room-n').innerText = c.name;
    document.getElementById('win-room').classList.add('open');
    renderMsgs();
}

function exitRoom() {
    document.getElementById('win-room').classList.remove('open');
    curId = null;
    renderList();
}

function renderList() {
    const con = document.getElementById('list-con');
    con.innerHTML = '';
    
    if (chars.length === 0) {
        con.innerHTML = '<div style="text-align:center;color:#888;padding:40px">点击右上角 ＋ 创建角色</div>';
        return;
    }
    
    chars.forEach(c => {
        const last = c.messages && c.messages.length 
            ? (typeof c.messages[c.messages.length-1].content === 'string' 
                ? c.messages[c.messages.length-1].content.substring(0, 25) 
                : '[多媒体]')
            : '新朋友';
        
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.onclick = () => openRoom(c.id);
        item.innerHTML = `
            <div class="avatar">${c.name[0]}</div>
            <div class="info">
                <div class="name">${c.name}</div>
                <div class="preview">${last}</div>
            </div>
        `;
        con.appendChild(item);
    });
}

function renderMsgs() {
    const c = chars.find(x => x.id === curId);
    const inj = document.getElementById('im-inject');
    inj.innerHTML = '';
    
    c.messages.forEach((m, idx) => {
        const row = document.createElement('div');
        row.className = `im-row ${m.role === 'user' ? 'user' : 'ai'}`;
        
        const avatarText = m.role === 'user' ? '我' : c.name[0];
        
        let contentHtml = '';
        if (typeof m.content === 'string') {
            contentHtml = m.content.replace(/\n/g, '<br>');
        } else if (Array.isArray(m.content)) {
            m.content.forEach(p => {
                if (p.type === 'text') contentHtml += p.text.replace(/\n/g, '<br>');
                if (p.type === 'image_url') contentHtml += `<img src="${p.image_url.url}">`;
            });
        }
        
        row.innerHTML = `
            <div class="im-avatar">${avatarText}</div>
            <div class="im-bubble" onclick="openEditMsg(${idx})">${contentHtml}</div>
        `;
        inj.appendChild(row);
    });
    
    document.getElementById('im-scroll').scrollTop = 999999;
}

async function handleSend(attach = null) {
    const inp = document.getElementById('chat-inp');
    const v = inp.value.trim();
    if (!v && !attach) return;
    if (!curId) return;

    const c = chars.find(x => x.id === curId);
    
    const newMsg = { role: 'user', content: [] };
    if (attach && attach.type === 'image') {
        if (v) newMsg.content.push({ type: 'text', text: v });
        newMsg.content.push({ type: 'image_url', image_url: { url: attach.data } });
    } else {
        let txt = v;
        if (attach && attach.type === 'file') txt = (v ? v + '\n\n' : '') + `[文件: ${attach.name}]\n${attach.data}`;
        newMsg.content = txt;
    }

    c.messages.push(newMsg);
    c.lastMsgTime = Date.now();
    inp.value = '';
    document.getElementById('t-panel').classList.remove('show');
    renderMsgs();

    const reply = await getAIReply(c);
    if (reply) {
        c.messages.push({ role: 'assistant', content: reply });
        saveData();
        renderMsgs();
        if (document.visibilityState !== 'visible') triggerPush(c.name, reply);
    }
}

async function getAIReply(char, sysPrompt = null, rawMode = false) {
    try {
        let hist = [];
        if (rawMode) {
            hist = [{ role: 'user', content: sysPrompt }];
        } else {
            const finalSysPrompt = `${char.prompt}\n\n【长期记忆】\n${char.memory || '暂无'}\n\n${sysPrompt || ''}`;
            hist = [{ role: 'system', content: finalSysPrompt }, ...char.messages.slice(-10)];
        }

        const res = await fetch(sets.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sets.apiKey}` },
            body: JSON.stringify({ model: sets.modelName, temperature: parseFloat(sets.temp), messages: hist })
        });
        const d = await res.json();
        return d.choices[0].message.content;
    } catch (e) {
        return '请求失败，请检查 API 设置';
    }
}

async function checkActiveInteract() {
    const now = Date.now();
    chars.forEach(async (c) => {
        if (c.activeInteract) {
            const interval = (c.activeInterval || 60) * 60 * 1000;
            const lastTime = c.lastMsgTime || c.id;
            if (now - lastTime > interval) {
                c.lastMsgTime = now;
                const reply = await getAIReply(c, "（系统指令：请根据记忆主动发一句简短消息）");
                if (reply) {
                    c.messages.push({ role: 'assistant', content: reply });
                    saveData();
                    if (curId === c.id) renderMsgs();
                    triggerPush(c.name, reply);
                }
            }
        }
    });
}

async function summarizeMemory() {
    if (!curId) return alert('请先进入一个聊天室');
    const c = chars.find(x => x.id === curId);
    if (c.messages.length < 5) return alert('对话太短，无法提炼');
    
    const btn = document.querySelector('.btn-magic');
    btn.innerText = "提炼中...";
    btn.disabled = true;

    try {
        const recentChats = c.messages.slice(-20).map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : '[多媒体]'}`).join('\n');
        const summary = await getAIReply(c, `总结以下对话中的重要信息：\n\n${recentChats}`, true);
        document.getElementById('mo-mem').value = summary;
        alert('提炼完成，请点保存');
    } catch (e) {
        alert('提炼失败');
    } finally {
        btn.innerText = "🧠 智能提炼";
        btn.disabled = false;
    }
}

function toggleT() { document.getElementById('t-panel').classList.toggle('show'); }
function clearH() {
    if (confirm('确定清空对话？')) {
        const c = chars.find(x => x.id === curId);
        c.messages = [];
        saveData();
        renderMsgs();
        toggleT();
    }
}
function saveData() { localStorage.setItem('characters', JSON.stringify(chars)); }

function up(t) {
    t === 'img' ? document.getElementById('up-i').click() : document.getElementById('up-f').click();
}

function dImg(el) {
    const f = el.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const can = document.getElementById('comp-c');
            const ctx = can.getContext('2d');
            let w = img.width, h = img.height, max = 800;
            if (w > max || h > max) {
                if (w > h) { h *= max / w; w = max; }
                else { w *= max / h; h = max; }
            }
            can.width = w;
            can.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            handleSend({ type: 'image', data: can.toDataURL('image/jpeg', 0.6) });
        };
        img.src = e.target.result;
    };
    r.readAsDataURL(f);
    el.value = '';
}

function dFile(el) {
    const f = el.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (e) => handleSend({ type: 'file', name: f.name, data: e.target.result });
    r.readAsText(f);
    el.value = '';
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

async function fetchModelsList() {
    const u = document.getElementById('set-url').value.replace('/chat/completions', '').replace(/\/+$/, '') + '/models';
    const k = document.getElementById('set-key').value;
    try {
        const r = await fetch(u, { headers: { 'Authorization': `Bearer ${k}` } });
        const d = await r.json();
        if (d.data && d.data.length > 0) {
            alert('可用模型：\n' + d.data.map(m => m.id).join('\n'));
        }
    } catch (e) {
        alert('获取失败');
    }
}

function openModal(t) {
    mMode = t;
    const title = document.getElementById('mo-title');
    
    if (t === 'edit') {
        const c = chars.find(x => x.id === curId);
        title.innerText = '编辑角色';
        document.getElementById('mo-n').value = c.name;
        document.getElementById('mo-p').value = c.prompt || '';
        document.getElementById('mo-mem').value = c.memory || '';
        document.getElementById('mo-active').checked = c.activeInteract || false;
        document.getElementById('mo-interval').value = c.activeInterval || 60;
    } else {
        title.innerText = '新角色';
        document.getElementById('mo-n').value = '';
        document.getElementById('mo-p').value = '';
        document.getElementById('mo-mem').value = '';
        document.getElementById('mo-active').checked = false;
        document.getElementById('mo-interval').value = 60;
    }
    document.getElementById('mo-overlay').classList.add('open');
}

function hideModal() { document.getElementById('mo-overlay').classList.remove('open'); }

function commitModal() {
    const n = document.getElementById('mo-n').value.trim();
    const p = document.getElementById('mo-p').value.trim();
    const mem = document.getElementById('mo-mem').value.trim();
    const active = document.getElementById('mo-active').checked;
    const interval = parseInt(document.getElementById('mo-interval').value);
    
    if (!n) return alert('请输入名字');
    
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
        const c = chars.find(x => x.id === curId);
        c.name = n;
        c.prompt = p;
        c.memory = mem;
        c.activeInteract = active;
        c.activeInterval = interval;
        document.getElementById('room-n').innerText = n;
    }
    
    saveData();
    renderList();
    hideModal();
}

function openEditMsg(idx) {
    const c = chars.find(x => x.id === curId);
    const msg = c.messages[idx];
    const overlay = document.getElementById('edit-msg-overlay');
    const area = document.getElementById('edit-msg-val');
    area.value = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    overlay.style.display = 'flex';
    document.getElementById('save-msg-btn').onclick = () => {
        msg.content = area.value;
        saveData();
        renderMsgs();
        overlay.style.display = 'none';
    };
}

function triggerPush(n, b) {
    if (Notification.permission === "granted") {
        const opt = { body: b, icon: 'https://img.icons8.com/color/96/chat--v1.png', tag: 'ai-os', renotify: true };
        if (swReg) swReg.showNotification(n, opt);
        else new Notification(n, opt);
    }
    
    document.getElementById('noti-n').innerText = n;
    document.getElementById('noti-t').innerText = b;
    document.getElementById('noti-banner').classList.add('show');
    setTimeout(() => document.getElementById('noti-banner').classList.remove('show'), 4000);
}

function jumpToChat() {
    document.getElementById('noti-banner').classList.remove('show');
    openApp('win-chat');
    if (curId) openRoom(curId);
}

function exportData() {
    const b = new Blob([JSON.stringify({ chars, sets })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'ai-os-backup.json';
    a.click();
}