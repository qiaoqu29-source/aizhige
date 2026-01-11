let chars = [], sets = {}, curId = null, mMode = 'create', swReg = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. 加载数据
    chars = JSON.parse(localStorage.getItem('characters') || '[]');
    sets = JSON.parse(localStorage.getItem('settings') || '{"apiUrl":"","apiKey":"","modelName":"gpt-4o","temp":0.7}');
    
    // 2. 初始化UI值
    document.getElementById('set-url').value = sets.apiUrl || '';
    document.getElementById('set-key').value = sets.apiKey || '';
    document.getElementById('set-model').value = sets.modelName || 'gpt-4o';
    document.getElementById('set-temp').value = sets.temp || 0.7;
    if(sets.bgUrl) document.getElementById('phone-wrapper').style.backgroundImage = `url(${sets.bgUrl})`;

    // 3. 启动循环
    updateClock(); setInterval(updateClock, 1000);
    renderList();
    initSW();
    setInterval(checkActiveInteract, 60000); // 1分钟检查一次主动消息
});

// --- Service Worker 注册 ---
async function initSW() {
    if ('serviceWorker' in navigator) swReg = await navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

function requestNotiPerm() { if("Notification" in window) Notification.requestPermission(); }

// --- 核心：主动发消息 ---
async function checkActiveInteract() {
    const now = Date.now();
    chars.forEach(async (c) => {
        if (c.activeInteract) {
            const interval = (c.activeInterval || 60) * 60 * 1000;
            const lastTime = c.lastMsgTime || c.id;
            if (now - lastTime > interval) {
                c.lastMsgTime = now;
                const reply = await getAIReply(c, "（系统指令：用户很久没说话了，请根据【长期记忆】和人设，主动发一句简短消息，不要超过20字）");
                if (reply) {
                    c.messages.push({ role: 'assistant', content: reply });
                    saveData();
                    if(curId === c.id) renderMsgs();
                    triggerPush(c.name, reply);
                }
            }
        }
    });
}

// --- 核心：智能提炼记忆 ---
async function summarizeMemory() {
    if(!curId) return alert('请先进入一个聊天室再编辑设置');
    const c = chars.find(x => x.id === curId);
    if(c.messages.length < 5) return alert('聊天内容太少，还没什么好记的~');
    
    const btn = document.querySelector('.btn-ai-magic');
    btn.innerText = "提炼中..."; btn.disabled = true;

    try {
        const recentChats = c.messages.slice(-20).map(m => `${m.role}: ${typeof m.content==='string'?m.content:'[多媒体]'}`).join('\n');
        const prompt = `提取以下对话中关于用户的喜好、重要事件和角色对用户的态度，总结为一段简练的“长期记忆”。\n\n现有记忆：${c.memory || '无'}\n\n最近对话：\n${recentChats}`;
        
        const summary = await getAIReply(c, prompt, true); // true表示不带前置记忆，纯提炼
        document.getElementById('mo-mem').value = summary;
        alert('大脑整理完毕！请记得保存。');
    } catch(e) { alert('提炼失败'); } 
    finally { btn.innerText = "🧠 智能提炼"; btn.disabled = false; }
}

async function getAIReply(char, sysPrompt = null, rawMode = false) {
    try {
        let hist = [];
        if(rawMode) {
            // 纯提炼模式：只发这一条
            hist = [{role:'user', content: sysPrompt}];
        } else {
            // 对话模式：带上记忆和上下文
            const finalSysPrompt = `${char.prompt}\n\n【长期记忆档案】\n${char.memory || '暂无'}\n\n${sysPrompt || ''}`;
            hist = [{role:'system', content: finalSysPrompt}, ...char.messages.slice(-10)];
        }

        const res = await fetch(sets.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${sets.apiKey}` },
            body: JSON.stringify({ model: sets.modelName, temperature: parseFloat(sets.temp), messages: hist })
        });
        const d = await res.json();
        return d.choices[0].message.content;
    } catch(e) { return null; }
}

// --- UI 基础 ---
function updateClock() {
    const n = new Date();
    const t = n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
    document.getElementById('st-time').innerText = t; document.getElementById('dk-time').innerText = t;
    document.getElementById('dk-date').innerText = (n.getMonth()+1)+'月'+n.getDate()+'日';
}

function openApp(id) { document.getElementById(id).classList.add('open'); }
function closeApp(id) { document.getElementById(id).classList.remove('open'); }
function openRoom(id) { 
    curId = id; const c = chars.find(x => x.id === id); 
    document.getElementById('room-n').innerText = c.name; 
    document.getElementById('win-room').classList.add('active'); 
    renderMsgs(); 
}
function exitRoom() { document.getElementById('win-room').classList.remove('active'); curId = null; renderList(); }

function renderList() {
    const con = document.getElementById('list-con'); con.innerHTML = '';
    chars.forEach(c => {
        const last = c.messages.length ? (typeof c.messages[c.messages.length-1].content==='string'?c.messages[c.messages.length-1].content.substring(0,20):'[多媒体]') : '新朋友';
        const item = document.createElement('div');
        item.className = 'app-item'; // 复用样式做基础
        // 重写列表项样式
        item.style = 'padding:15px;border-bottom:0.5px solid #222;display:flex;flex-direction:row;align-items:center;gap:12px;width:100%';
        item.onclick = () => openRoom(c.id);
        item.innerHTML = `<div class="im-avatar" style="background:#444;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${c.name[0]}</div><div style="flex:1;overflow:hidden"><div style="font-weight:600;font-size:16px;color:#fff;text-align:left">${c.name}</div><div style="font-size:13px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left">${last}</div></div>`;
        con.appendChild(item);
    });
}

function renderMsgs() {
    const c = chars.find(x => x.id === curId);
    const inj = document.getElementById('im-inject'); inj.innerHTML = '';
    inj.innerHTML += `<div class="im-time-tag">下午 4:20</div>`; 
    
    c.messages.forEach((m, idx) => {
        const row = document.createElement('div');
        row.className = `im-row ${m.role === 'user' ? 'user' : 'ai'}`;
        const bubble = document.createElement('div');
        bubble.className = 'im-bubble';
        bubble.innerHTML = (typeof m.content === 'string') ? m.content.replace(/\n/g,"<br>") : '[图片/文件]';
        bubble.onclick = () => openEditMsg(idx); 
        
        const av = `<div class="im-avatar" style="background:${m.role==='user'?'var(--primary-color)':'#444'}">${m.role==='user'?'我':c.name[0]}</div>`;
        row.innerHTML = m.role === 'user' ? bubble.outerHTML + av : av + bubble.outerHTML;
        inj.appendChild(row);
        row.querySelector('.im-bubble').onclick = () => openEditMsg(idx);
    });
    document.getElementById('im-scroll').scrollTop = 999999;
}

// --- 消息发送 ---
async function handleSend() {
    const inp = document.getElementById('chat-inp');
    const v = inp.value.trim(); if(!v || !curId) return;
    const c = chars.find(x => x.id === curId);
    c.messages.push({ role: 'user', content: v });
    c.lastMsgTime = Date.now();
    inp.value = ''; renderMsgs();

    const reply = await getAIReply(c);
    if(reply){
        c.messages.push({ role: 'assistant', content: reply });
        saveData(); renderMsgs();
    }
}

// --- 辅助功能 ---
function toggleT() { document.getElementById('t-panel').classList.toggle('show'); }
function clearH() { if(confirm('清空？')){ const c=chars.find(x=>x.id===curId); c.messages=[]; saveData(); renderMsgs(); toggleT(); } }
function saveData() { localStorage.setItem('characters', JSON.stringify(chars)); }
function up(t) { t==='img'?document.getElementById('up-i').click():document.getElementById('up-f').click(); }
function dImg(el) { /* Keep image logic */ } 
function dFile(el) { /* Keep file logic */ }

function saveGlobalSets() {
    const newSets = {
        apiUrl: document.getElementById('set-url').value,
        apiKey: document.getElementById('set-key').value,
        modelName: document.getElementById('set-model').value,
        temp: document.getElementById('set-temp').value,
        bgUrl: document.getElementById('set-bg').value
    };
    localStorage.setItem('settings', JSON.stringify(newSets));
    location.reload();
}

async function fetchModelsList() {
    const u = document.getElementById('set-url').value.replace('/chat/completions','').replace(/\/+$/,'') + '/models';
    const k = document.getElementById('set-key').value;
    try {
        const r = await fetch(u, { headers: { 'Authorization': `Bearer ${k}` } });
        const d = await r.json();
        const models = d.data || [];
        if(models.length > 0) {
            const cur = document.getElementById('set-model').value;
            document.getElementById('model-select-wrapper').innerHTML = `
                <select id="set-model" class="set-val" style="width:100%;background:#2c2c2e;color:#fff;border-radius:6px;padding:4px">
                    ${models.map(m => `<option value="${m.id}" ${m.id===cur?'selected':''}>${m.id}</option>`).join('')}
                </select>
            `;
        }
    } catch(e) { alert('获取失败，请手动输入'); }
}

// --- 模态框逻辑 ---
function openModal(t) {
    mMode = t;
    if(t==='edit') {
        const c=chars.find(x=>x.id===curId);
        document.getElementById('mo-n').value=c.name;
        document.getElementById('mo-p').value=c.prompt;
        document.getElementById('mo-mem').value=c.memory || '';
        document.getElementById('mo-active').checked=c.activeInteract;
    } else {
        document.getElementById('mo-n').value=''; document.getElementById('mo-p').value=''; document.getElementById('mo-mem').value='';
        document.getElementById('mo-active').checked=false;
    }
    document.getElementById('mo-overlay').style.display='flex';
}
function hideModal() { document.getElementById('mo-overlay').style.display='none'; }
function commitModal() {
    const n=document.getElementById('mo-n').value.trim(), p=document.getElementById('mo-p').value.trim(), mem=document.getElementById('mo-mem').value.trim();
    if(!n) return;
    const active = document.getElementById('mo-active').checked;
    const interval = parseInt(document.getElementById('mo-interval').value);
    if(mMode==='create') chars.unshift({ id:Date.now(), name:n, prompt:p, memory:mem, messages:[], activeInteract:active, activeInterval:interval });
    else { const c=chars.find(x=>x.id===curId); c.name=n; c.prompt=p; c.memory=mem; c.activeInteract=active; c.activeInterval=interval; document.getElementById('room-n').innerText=n; }
    saveData(); renderList(); hideModal();
}

function openEditMsg(msgIndex) {
    const c = chars.find(x => x.id === curId);
    const msg = c.messages[msgIndex];
    const overlay = document.getElementById('edit-msg-overlay');
    const area = document.getElementById('edit-msg-val');
    area.value = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    overlay.style.display = 'flex';
    document.getElementById('save-msg-btn').onclick = () => {
        msg.content = area.value;
        saveData(); renderMsgs();
        overlay.style.display = 'none';
    };
}

function triggerPush(n, b) {
    if (Notification.permission === "granted") {
        const opt = { body: b, icon: 'https://img.icons8.com/color/96/chat--v1.png', tag: 'ai-os', renotify:true };
        if (swReg) swReg.showNotification(n, opt); else new Notification(n, opt);
    }
}
function jumpToChat() { document.getElementById('noti-banner').classList.remove('show'); openApp('win-chat'); if(curId) openRoom(curId); }
function exportData() { const b = new Blob([JSON.stringify({chars, sets})], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'backup.json'; a.click(); }
</script>
</body>
</html>