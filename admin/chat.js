if (!checkAuth()) throw 0;
renderShell('chat');

let activeId = null;
let activeTicket = null;
let pendingFile = null;
let pollTimer = null;
let lastMsgCount = -1;
let localMsgs = {}; // 本地暂存各对话的假消息（接后端后删掉）

async function listChats() {
  stopPoll();
  activeId = null;
  activeTicket = null;
  const j = await api('/ticket/list');
  if (j.code !== 1) return;
  let h = '<div class="chat-wrap"><div class="chat-list">';
  if (!j.data.length) h += '<div class="empty">暂无对话</div>';
  for (const t of j.data) {
    const tag = t.handoff ? '<div class="ci-tag human">人工</div>' : '<div class="ci-tag ai">AI</div>';
    h += '<div class="chat-item" onclick="openChat(' + t.id + ')">' +
      '<div class="ci-l"><div class="ci-email">' + (t.email || ('用户' + t.user_id)) + '</div>' +
      '<div class="ci-preview">' + (t.handoff ? '人工接管中' : 'AI 自动回复') + ' · ' + fmtTime(t.updated_at) + '</div></div>' +
      tag + '</div>';
  }
  h += '</div></div>';
  document.getElementById('content').innerHTML = h;

  // 列表页每 5 秒刷新，方便看到新对话进来
  setTimeout(() => {
    if (!activeId) {
      const j2 = api('/ticket/list');
      if (j2) listChats();
    }
  }, 5000);
}

function msgHTML(m) {
  const cls = m.sender === 'user' ? 'msg-user' : (m.sender === 'ai' ? 'msg-ai' : 'msg-admin');
  let inner = '';
  if (m.image) inner += '<img class="msg-img" src="' + m.image + '">';
  if (m.content) inner += '<div class="bubble">' + m.content + '</div>';
  return '<div class="' + cls + '">' + inner + '</div>';
}

function toolbarHTML(t) {
  return '<div class="chat-toolbar">' +
    (t.handoff
      ? '<button class="tb-btn back-ai" onclick="toggleHandoff(0)">↩ 交还 AI</button>'
      : '<button class="tb-btn take" onclick="toggleHandoff(1)">✋ 接管对话</button>') +
    '<button class="tb-btn" onclick="refreshMessages()">🔄 刷新</button>' +
  '</div>';
}

async function openChat(id) {
  stopPoll();
  activeId = id;
  const listJ = await api('/ticket/list');
  activeTicket = (listJ.data || []).find(x => x.id === id) || {id, handoff: 0};

  const j = await api('/ticket/messages?id=' + id);
  const msgs = (j.code === 1 ? j.data : []).concat(localMsgs[id] || []);
  lastMsgCount = msgs.length;

  const head = '<div class="chat-head"><button class="back-btn" onclick="listChats()">← 返回</button>' +
    '<div class="chat-title">对话 #' + id + '</div>' +
    '<div class="chat-state ' + (activeTicket.handoff ? 'human' : 'ai') + '">' +
    (activeTicket.handoff ? '人工接管' : 'AI 自动回复') + '</div></div>';

  let body = '<div class="chat-body" id="chatBody">';
  for (const m of msgs) body += msgHTML(m);
  body += '</div>';

  const input = '<div class="chat-input">' +
    '<button class="pic-btn" onclick="document.getElementById(\'picFile\').click()">📷</button>' +
    '<input type="file" id="picFile" accept="image/*" style="display:none" onchange="pickPic(event)">' +
    '<input id="replyBox" placeholder="输入回复…">' +
    '<button class="send-btn" onclick="sendReply()">发送</button>' +
    '</div>';

  document.getElementById('content').innerHTML =
    '<div class="chat-detail">' + head + toolbarHTML(activeTicket) + body + '<div class="chat-quick" id="chatQuick"></div>' + input + '</div>';
  scrollBottom();

  startPoll();
  loadQuick();
}

function stopPoll() { clearInterval(pollTimer); pollTimer = null; }

function startPoll() {
  stopPoll();
  pollTimer = setInterval(pollMessages, 3000);
}

async function pollMessages() {
  if (!activeId) return;
  const j = await api('/ticket/messages?id=' + activeId);
  if (j.code !== 1) return;
  const msgs = (j.data || []).concat(localMsgs[activeId] || []);
  if (msgs.length === lastMsgCount) return;
  lastMsgCount = msgs.length;
  const body = document.getElementById('chatBody');
  if (!body) return;
  body.innerHTML = msgs.map(msgHTML).join('');
  scrollBottom();
}

async function refreshMessages() {
  lastMsgCount = -1;
  await pollMessages();
  toast('已刷新');
}

function scrollBottom() {
  setTimeout(() => {
    const b = document.getElementById('chatBody');
    if (b) b.scrollTop = b.scrollHeight;
  }, 30);
}

function pickPic(e) {
  const f = e.target.files[0];
  if (!f) return;
  pendingFile = f;
  toast('已选图：' + f.name);
}

async function uploadFile(file) {
  if (MOCK) {
    return await new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(file);
    });
  }
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(API + '/upload', {
    method: 'POST', body: fd, headers: { 'Authorization': getToken() }
  });
  const j = await r.json();
  if (j.code !== 1) throw new Error(j.msg || '上传失败');
  return j.data.url;
}

async function sendReply() {
  const box = document.getElementById('replyBox');
  const text = box.value.trim();
  if (!text && !pendingFile) return;

  let imageUrl = null;
  if (pendingFile) {
    try { imageUrl = await uploadFile(pendingFile); }
    catch (e) { toast('图片上传失败'); return; }
  }

  const body = document.getElementById('chatBody');
  body.insertAdjacentHTML('beforeend', msgHTML({ sender: 'admin', content: text, image: imageUrl }));
  scrollBottom();
  lastMsgCount++;

  if (MOCK) {
    localMsgs[activeId] = (localMsgs[activeId] || []).concat([{ sender: 'admin', content: text, image: imageUrl, created_at: Math.floor(Date.now()/1000) }]);
  } else {
    await api('/ticket/reply', { method: 'POST', body: JSON.stringify({ ticket_id: activeId, content: text, image: imageUrl }) });
  }

  box.value = '';
  pendingFile = null;
}

async function toggleHandoff(v) {
  if (!activeTicket) return;
  activeTicket.handoff = v;
  await api('/ticket/handoff', { method: 'POST', body: JSON.stringify({ id: activeId, handoff: v }) });
  toast(v ? '已接管，AI 停止' : '已交还，AI 恢复');

  const head = document.querySelector('.chat-state');
  if (head) {
    head.className = 'chat-state ' + (v ? 'human' : 'ai');
    head.textContent = v ? '人工接管' : 'AI 自动回复';
  }
  const tb = document.querySelector('.chat-toolbar');
  if (tb) tb.outerHTML = toolbarHTML(activeTicket);
}

listChats();


async function loadQuick() {
  const j = await api('/quick_replies');
  if (j.code !== 1) return;
  const box = document.getElementById('chatQuick');
  if (!box) return;
  if (!j.data.length) { box.style.display = 'none'; return; }
  window._quick = j.data;
  box.innerHTML = j.data.map((q, i) => '<button class="qk-btn" onclick="useQuick(' + i + ')">' + (q.text.length > 14 ? q.text.slice(0, 14) + '…' : q.text) + '</button>').join('');
}
function useQuick(i) {
  const q = window._quick && window._quick[i];
  if (!q) return;
  document.getElementById('replyBox').value = q.text;
  document.getElementById('replyBox').focus();
}
