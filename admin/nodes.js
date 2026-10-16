var currentServerId = '';
var serversList = [];


if (!checkAuth()) throw 0;
renderShell('home');

async function load() {
  var jn = await api('/nodes' + (currentServerId ? '?server_id=' + currentServerId : ''));
  var js = await api('/nodes/stats' + (currentServerId ? '?server_id=' + currentServerId : ''));
  var jh = await api('/nodes/hysteria' + (currentServerId ? '?server_id=' + currentServerId : ''));
  if (jn.code !== 1) {
    document.getElementById('nodeList').innerHTML = '<div class="empty">加载失败：' + (jn.msg || '') + '</div>';
    return;
  }
  var list = jn.data || [];
  var s = (js.code === 1) ? js.data : {};

  document.getElementById('summary').innerHTML =
    '<div class="nt-sum-card"><div class="k">节点总数</div><div class="v">' + (s.inbounds || list.length) + '</div></div>' +
    '<div class="nt-sum-card"><div class="k">客户端</div><div class="v">' + (s.clients || 0) + '</div></div>' +
    '<div class="nt-sum-card"><div class="k">在线</div><div class="v g">' + (s.online || 0) + '</div></div>';

  var box = document.getElementById('nodeList');
  var hyHtml = '';
  if (jh && jh.code === 1 && jh.data) {
    var hy = jh.data;
    hyHtml = '<div class="nt-card" style="border-color:#2E5BFF">' +
      '<div class="nt-row1">' +
        '<div class="nt-name">' + (hy.name || 'Hysteria2 节点') + '<span class="nt-flag">' + (hy.protocol || 'hysteria2') + '</span></div>' +
        '<div class="nt-status ' + (hy.alive ? 'on' : 'off') + '"><span class="dot"></span>' + (hy.alive ? '在线' : '停用') + '</div>' +
      '</div>' +
      '<div class="nt-host">' + (hy.server || '') + ':' + (hy.port || 443) + ' · ' + (hy.obfs || '') + '</div>' +
      '<div class="nt-stats">' +
        '<div class="it"><div class="k">客户端</div><div class="v">单密码</div></div>' +
        '<div class="it"><div class="k">在线连接</div><div class="v g">' + (hy.connections || 0) + '</div></div>' +
        '<div class="it"><div class="k">协议</div><div class="v">HY2</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<a href="hysteria.html" style="flex:1;padding:11px;border:1px solid #2E5BFF;background:#fff;color:#2E5BFF;border-radius:10px;font-size:13px;font-weight:600;text-align:center;text-decoration:none;display:block">管理 Hysteria2</a>' +
      '</div>' +
    '</div>';
  }

  if (!list.length && !hyHtml) { box.innerHTML = '<div class="empty">暂无节点</div>'; return; }

  box.innerHTML = hyHtml + list.map(function(n){
    var up = n.up || 0, down = n.down || 0;
    var total = up + down;
    var load = n.clients > 0 ? Math.min(100, Math.round(n.online / n.clients * 100)) : 0;
    return '<div class="nt-card' + (n.enable ? '' : ' off') + '" onclick="openNode(' + n.id + ')">' +
      '<div class="nt-row1">' +
        '<div class="nt-name">' + (n.name || ('节点 #' + n.id)) + '<span class="nt-flag">' + (n.protocol || '') + '</span></div>' +
        '<div class="nt-status ' + (n.enable ? 'on' : 'off') + '"><span class="dot"></span>' + (n.enable ? '在线' : '停用') + '</div>' +
      '</div>' +
      '<div class="nt-host">端口 ' + n.port + '</div>' +
      '<div class="nt-stats">' +
        '<div class="it"><div class="k">客户端</div><div class="v">' + (n.clients || 0) + '</div></div>' +
        '<div class="it"><div class="k">在线</div><div class="v">' + (n.online || 0) + '</div></div>' +
        '<div class="it"><div class="k">流量</div><div class="v">' + fmtSize(total) + '</div></div>' +
      '</div>' +
      '<div class="nt-bar"><div class="fill" style="width:' + load + '%"></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<a href="node.html?id=' + n.id + '&name=' + encodeURIComponent(n.name||('节点'+n.id)) + '" style="flex:1;padding:11px;border:1px solid #2E5BFF;background:#fff;color:#2E5BFF;border-radius:10px;font-size:13px;font-weight:600;text-align:center;text-decoration:none;display:block">管理节点</a>' +
      '</div>' +
    '</div>';
  }).join('');
}

function fmtExpire(ts) {
  if (!ts) return '永久';
  var d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

async function openNode(id) {
  window._nid = id;
  // 从卡片上读端口
  try {
    var cards = document.querySelectorAll('.nt-card');
    for (var i=0; i<cards.length; i++) {
      if (cards[i].getAttribute('onclick') && cards[i].getAttribute('onclick').indexOf('openNode(' + id + ')') > -1) {
        var h = cards[i].querySelector('.nt-host');
        if (h) window._nport = h.textContent.replace('端口 ', '').trim();
      }
    }
  } catch(e) {}
  var j = await api('/nodes/clients?inbound_id=' + id + (currentServerId ? '&server_id=' + currentServerId : ''));
  var list = (j.code === 1) ? (j.data || []) : [];
  var body = list.length ? list.map(function(c){
    var used = (c.up||0)+(c.down||0);
    return '<div class="cl-row">' +
      '<div class="cl-email">' + (c.email || '') + (c.online ? ' <span style="color:#0a9f52;font-size:10px">●在线</span>' : '') + '</div>' +
      '<div class="cl-info">' +
        '<span>流量 ' + fmtSize(used) + ' / ' + (c.total ? fmtSize(c.total) : '不限') + '</span>' +
        '<span>到期 ' + fmtExpire(c.expiry_time) + '</span>' +
      '</div>' +
      '<div class="cl-acts">' +
        '<button class="cl-del" onclick="delClient(\'' + c.email + '\')">删除</button>' +
      '</div>' +
    '</div>';
  }).join('') : '<div class="empty">暂无客户端</div>';

  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet" style="max-height:80vh;overflow-y:auto">' +
    '<h2>节点 #' + id + ' · 客户端</h2>' +
    '<div style="font-size:12px;color:#1a73e8;margin-bottom:6px" onclick="copyText(\'167.253.96.220:' + (window._nport || '') + '\')">端口 ' + (window._nport || '') + '　📋 点复制</div>' +
    '<div style="font-size:12px;color:#888;margin-bottom:14px">共 ' + list.length + ' 个客户端</div>' +
    '<div class="cl-list">' + body + '</div>' +
    '<label style="margin-top:16px">新增客户端</label>' +
    '<input id="ac_email" placeholder="邮箱（如 user3@lynli.com）">' +
    '<label>时长（天）</label>' +
    '<input id="ac_days" type="number" value="30">' +
    '<button class="btn-primary" style="width:100%;padding:13px;margin-top:12px" onclick="addClient()">添加客户端</button>' +
    '<div class="btn-row"><button class="btn-cancel" onclick="closeModal()">关闭</button></div>' +
    '</div></div>';
}

async function addClient() {
  var email = document.getElementById('ac_email').value.trim();
  var days = +document.getElementById('ac_days').value || 30;
  if (!email) { toast('请填邮箱'); return; }
  var j = await api('/nodes/add-client', {method: 'POST', body: JSON.stringify({inbound_id: window._nid, email: email, days: days, server_id: currentServerId})});
  if (j.code === 1 && j.data && j.data.ok) { toast('已添加，几秒后生效'); openNode(window._nid); }
  else toast('失败：' + ((j.data && j.data.msg) || j.msg || '未知'));
}

async function delClient(email) {
  if (!(await cConfirm('确定删除 ' + email + '？'))) return;
  var j = await api('/nodes/del-client', {method: 'POST', body: JSON.stringify({inbound_id: window._nid, email: email, server_id: currentServerId})});
  if (j.code === 1) { toast('已删除'); openNode(window._nid); }
  else toast('失败');
}

load();


// ===== Hysteria2 管理弹窗 =====
var _hyCache = null;

async function openHysteria() {
  var j = await api('/nodes/hysteria');
  var hy = (j.code === 1) ? (j.data || {}) : {};
  _hyCache = hy;
  var alive = hy.alive ? '<span style="color:#0a9f52">● 在线</span>' : '<span style="color:#e74c3c">● 停用</span>';
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet" style="max-height:85vh;overflow-y:auto">' +
    '<h2>易搜加速·美西 (Hysteria2)</h2>' +
    '<div class="u-detail">' +
      '<div class="ud-row"><div class="ud-k">状态</div><div class="ud-v">' + alive + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">服务地址</div><div class="ud-v">' + (hy.server || '') + ':' + (hy.port || 443) + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">协议</div><div class="ud-v">hysteria2 · ' + (hy.obfs || 'salamander') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">在线连接</div><div class="ud-v">' + (hy.connections || 0) + '</div></div>' +
    '</div>' +

    '<div class="op-sec"><div class="op-sec-title">服务操作</div>' +
      '<button class="op-btn primary" style="width:100%;padding:13px" onclick="doHysteria(\'restart\',{})">重启服务</button>' +
    '</div>' +

    '<div class="op-sec"><div class="op-sec-title">修改密码（影响所有用户，需重新拉订阅）</div>' +
      '<label>新的连接密码</label><input id="hy_pw" placeholder="留空不改">' +
      '<button class="op-btn warn" style="width:100%;padding:11px;margin-top:6px" onclick="hyPw()">保存密码并重启</button>' +
    '</div>' +

    '<div class="op-sec"><div class="op-sec-title">修改混淆密码（影响所有用户）</div>' +
      '<label>新的混淆密码</label><input id="hy_obfs" placeholder="留空不改">' +
      '<button class="op-btn warn" style="width:100%;padding:11px;margin-top:6px" onclick="hyObfs()">保存混淆并重启</button>' +
    '</div>' +

    '<div class="btn-row"><button class="btn-cancel" onclick="closeModal()">关闭</button></div>' +
    '</div></div>';
}

async function submitHyPw() {
  var v = document.getElementById('hy_pw').value.trim();
  if (!v) { toast('请输入新密码'); return; }
  if (!(await cConfirm('确定要修改连接密码？所有用户需重新导入订阅才能连上'))) return;
  await doHysteria('set_password', {password: v});
}

async function submitHyObfs() {
  var v = document.getElementById('hy_obfs').value.trim();
  if (!v) { toast('请输入新混淆密码'); return; }
  if (!(await cConfirm('确定要修改混淆密码？所有用户需重新导入订阅才能连上'))) return;
  await doHysteria('set_obfs', {obfs: v});
}

function hyRestart() { doHysteria('restart', {}); }
function hyPw() { submitHyPw(); }
function hyObfs() { submitHyObfs(); }

async function doHysteria(action, body) {
  toast('处理中...');
  var j = await api('/nodes/hysteria/' + action, {method:'POST', body: JSON.stringify(Object.assign({}, body || {}, {server_id: currentServerId}))});
  if (j.code === 1) {
    toast(j.msg || '操作成功');
    closeModal();
    setTimeout(load, 800);
  } else {
    toast('失败：' + (j.msg || ''));
  }
}


// ===== 多服务器切换 =====
async function loadServers() {
  try {
    var j = await api('/servers');
    serversList = (j.code === 1) ? (j.data || []) : [];
    if (!currentServerId && serversList.length > 0) {
      currentServerId = String(serversList[0].id);
    }
    renderServerSelector();
  } catch (e) {}
}

function renderServerSelector() {
  var box = document.getElementById('serverSelector');
  if (!box) return;
  if (!serversList.length) {
    box.innerHTML = '<div style="color:#888;font-size:12px;padding:8px 0">暂无服务器（<a href="servers.html" style="color:#2E5BFF">去添加</a>）</div>';
    return;
  }
  box.innerHTML = serversList.map(function(s){
    var on = String(s.id) === currentServerId;
    return '<div onclick="switchServer(' + s.id + ')" style="flex:1;padding:9px 12px;text-align:center;font-size:13px;border-radius:10px;cursor:pointer;font-weight:' + (on ? '600' : '400') + ';color:' + (on ? '#fff' : '#333') + ';background:' + (on ? '#2E5BFF' : '#fff') + ';border:1px solid ' + (on ? '#2E5BFF' : '#eaeaea') + '">' + (s.name || ('服务器' + s.id)) + (s.enabled ? '' : ' · 停') + '</div>';
  }).join('');
}

function switchServer(id) {
  currentServerId = String(id);
  renderServerSelector();
  load();
}

// 启动时先拉服务器列表再 load
loadServers().then(function(){ load(); });
