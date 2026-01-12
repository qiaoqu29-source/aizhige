let chars = [], sets = {}, curId = null, mMode = 'create', swReg = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. 加载数据
    chars = JSON.parse(localStorage.getItem('characters') || '[]');
    sets = JSON.parse(localStorage.getItem('settings') || '{"apiUrl":"","apiKey":"","modelName":"gpt-4o","temp":0.7}');
    
    // 2. 初始化UI
    const urlEl = document.getElementById('set-url');
    const keyEl = document.getElementById('set-key');
    const modEl = document.getElementById('set-model');
    const tmpEl = document.getElementById('set-temp');
    if(urlEl) urlEl.value = sets.apiUrl || '';
    if(keyEl) keyEl.value = sets.apiKey || '';
    if(modEl) modEl.value = sets.modelName || 'gpt-4o';
    if(tmpEl) tmpEl.value = sets.temp || 0.7;

    // 3. 渲染
    renderList();
    setInterval(updateClock, 1000);
    updateClock();
});

// --- UI 基础 ---
function updateClock() {
    const n = new Date();
    const t = n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
    const stTime = document.getElementById('st-time');
    if(stTime) stTime.innerText = t;
}

function openApp(id) { document.getElementById(id).classList.add('open'); }
function closeApp(id) { document.getElementById(id).classList.remove('open'); }

function openRoom(id) { 
    curId = id; 
    const c = chars.find(x => x.id === id); 
    document.getElementById('room-n').innerText = c.name; 
    document.getElementById('win-room').classList.add('active'); 
    renderMsgs(); 
}

function exitRoom() { 
    document.getElementById('win-room').classList.remove('active'); 
    curId = null; 
    renderList(); 
}

//渲染角色列表
function renderList() {
    const con = document.getElementById('list-con'); 
    if(!con) return;
    con.innerHTML = '';
    chars.forEach(c => {
        const last = c.messages && c.messages.length ? (c.messages[c.messages.length-1].content.substring(0,20)) : '新朋友';
        const item = document.createElement('div');
        item.style = 'background:#fff; margin-bottom:10px; padding:15px; border-radius:15px; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,0,0,0.02); cursor:pointer';
        item.onclick = () => openRoom(c.id);
        item.innerHTML = `
            <div style="width:45px;height:45px;background:#000;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${c.name[0]}</div>
            <div style="flex:1;overflow:hidden">
                <div style="font-weight:700;font-size:16px;color:#000">${c.name}</div>
                <div style="font-size:13px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${last}</div>
            </div>
        `;
        con.appendChild(item);
    });
}

// 渲染对话消息
function renderMsgs() {
    const c = chars.find(x => x.id === curId);
    const inj = document.getElementById('im-inject'); 
    if(!inj) return;
    inj.innerHTML = '';
    
    c.messages.forEach((m, idx) => {
        const row = document.createElement('div');
        row.style = `display:flex; margin-bottom:15px; flex-direction:${m.role==='user'?'row-reverse':'row'}`;
        const bubble = document.createElement('div');
        bubble.className = 'im-bubble';
        bubble.innerText = m.content;
        row.appendChild(bubble);
        inj.appendChild(row);
    });
    const scroll = document.getElementById('im-scroll');
    if(scroll) scroll.scrollTop = scroll.scrollHeight;
}

// 发送消息
async function handleSend() {
    const inp = document.getElementById('chat-inp');
    const v = inp.value.trim();
    if(!v || !curId) return;

    const c = chars.find(x => x.id === curId);
    c.messages.push({ role: 'user', content: v });
    inp.value = '';
    renderMsgs();

    const reply = await getAIReply(c);
    if(reply) {
        c.messages.push({ role: 'assistant', content: reply });
        saveData();
        renderMsgs();
    }
}

async function getAIReply(char) {
    try {
        const hist = [{role:'system', content: char.prompt}, ...char.messages.slice(-10)];
        const res = await fetch(sets.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${sets.apiKey}` },
            body: JSON.stringify({ model: sets.modelName, temperature: 0.7, messages: hist })
        });
        const d = await res.json();
        return d.choices[0].message.content;
    } catch(e) { return "网络错误，请检查API设置"; }
}

function saveData() { localStorage.setItem('characters', JSON.stringify(chars)); }

// --- 弹窗逻辑 (唯一版) ---
function openModal(t) {
    mMode = t;
    const overlay = document.getElementById('mo-overlay');
    const title = document.getElementById('mo-title');
    overlay.style.display = 'flex';
    
    if(t === 'edit') {
        const c = chars.find(x => x.id === curId);
        title.innerText = "编辑角色";
        document.getElementById('mo-n').value = c.name;
        document.getElementById('mo-p').value = c.prompt;
    } else {
        title.innerText = "新朋友";
        document.getElementById('mo-n').value = '';
        document.getElementById('mo-p').value = '';
    }
}

function hideModal() { 
    document.getElementById('mo-overlay').style.display = 'none'; 
}

function commitModal() {
    const n = document.getElementById('mo-n').value.trim();
    const p = document.getElementById('mo-p').value.trim();
    if(!n) return alert('名字不能为空');

    if(mMode === 'create') {
        chars.unshift({
            id: Date.now().toString(),
            name: n,
            prompt: p,
            messages: []
        });
    } else {
        const c = chars.find(x => x.id === curId);
        c.name = n;
        c.prompt = p;
        document.getElementById('room-n').innerText = n;
    }
    
    saveData();
    renderList();
    hideModal();
}

function saveGlobalSets() {
    sets = {
        apiUrl: document.getElementById('set-url').value,
        apiKey: document.getElementById('set-key').value,
        modelName: document.getElementById('set-model').value
    };
    localStorage.setItem('settings', JSON.stringify(sets));
    alert('设置已保存');
    closeApp('win-sets');
}