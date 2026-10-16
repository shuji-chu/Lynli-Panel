if (!checkAuth()) throw 0;
renderShell('users');

let allUsers = [];
let filter = 'all';
let sort = 'reg_desc';
let plansCache = [];
const URL_Q = new URLSearchParams(location.search).get('q') || '';

function setFilter(f) {
  filter = f;
  document.querySelectorAll('.u-filter .uf').forEach(el =>
    el.classList.toggle('on', el.dataset.f === f));
  render();
}
function setSort(s) { sort = s; render(); }

function userStatus(u) {
  const now = Math.floor(Date.now() / 1000);
  if (u.banned) return {cls: 'banned', txt: '已封禁'};
  if (!u.plan_id && !u.expired_at) return {cls: 'none', txt: '无套餐'};
  if (!u.expired_at) return {cls: 'none', txt: '无到期'};
  if (u.expired_at < now) return {cls: 'expired', txt: '已过期'};
  if (u.plan_id) return {cls: 'active', txt: '正常'};
  return {cls: 'none', txt: '无套餐'};
}
function daysLeft(u) {
  if (!u.expired_at) return '';
  const now = Math.floor(Date.now() / 1000);
  const d = Math.floor((u.expired_at - now) / 86400);
  if (d < 0) return '已过期 ' + (-d) + ' 天';
  return '剩 ' + d + ' 天';
}
function userCard(u) {
  const s = userStatus(u);
  const name = u.nickname || '未设置昵称';
  return '<div class="u-card">' +
    '<div style="display:flex;align-items:flex-start;gap:10px">' +
      '<input type="checkbox" class="u-check" data-id="' + u.id + '" onclick="event.stopPropagation();updateBatchBar()" style="margin-top:6px;width:18px;height:18px;flex-shrink:0;accent-color:#2E5BFF">' +
      '<div class="u-av">' + ((u.avatar && u.avatar.startsWith('data:image'))
          ? '<img src="' + u.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
          : (u.nickname || u.email || '?').slice(0,1).toUpperCase()) + '</div>' +
      '<div style="flex:1;min-width:0" onclick="location.href=\'user.html?id=' + u.id + '\'">' +
        '<div class="u-row1">' +
          '<div class="u-name-wrap"><div class="u-nick">' + name +
            (u.tag ? ' <span style="font-size:11px;color:#fff;font-weight:600;background:#2E5BFF;padding:2px 8px;border-radius:8px;margin-left:4px">' + u.tag + '</span>' : '') +
            (u.short_id ? ' <span style="font-size:11px;color:#1a73e8;font-weight:600;background:#eef4ff;padding:2px 6px;border-radius:6px;margin-left:4px">ID:' + u.short_id + '</span>' : '') + '</div>' +
          '<div class="u-email" onclick="event.stopPropagation();copyText(\'' + u.email + '\')">' + u.email + '　📋</div></div>' +
          '<div class="tag ' + s.cls + '">' + s.txt + '</div>' +
        '</div>' +
        '<div class="u-stats">' +
          '<div class="us"><div class="k">到期</div><div class="v">' + (u.expired_at ? fmtDate(u.expired_at) : '—') + '</div>' +
            (u.expired_at ? '<div class="sub">' + daysLeft(u) + '</div>' : '') + '</div>' +
          '<div class="us"><div class="k">套餐</div><div class="v">' + (u.plan_id ? '#' + u.plan_id : '—') + '</div></div>' +
          '<div class="us"><div class="k">已用</div><div class="v">' + fmtSize(u.u + u.d) + '</div></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function render() {
  const now = Math.floor(Date.now() / 1000);
  let list = allUsers;
  if (URL_Q) list = list.filter(u => (u.email || '').includes(URL_Q) || (u.nickname || '').includes(URL_Q));
  if (filter === 'active')  list = list.filter(u => !u.banned && u.plan_id && u.expired_at >= now);
  if (filter === 'expired') list = list.filter(u => !u.banned && (!u.plan_id || u.expired_at < now));
  if (filter === 'banned')  list = list.filter(u => u.banned);
  if (sort === 'expire_asc') list = [...list].sort((a, b) => (a.expired_at || 9999999999) - (b.expired_at || 9999999999));
  if (sort === 'used_desc')  list = [...list].sort((a, b) => (b.u + b.d) - (a.u + a.d));
  if (sort === 'reg_desc')   list = [...list].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const box = document.getElementById('userList');
  if (!list.length) { box.innerHTML = searchTag() + '<div class="empty">暂无用户</div>'; return; }
  box.innerHTML = searchTag() + list.map(userCard).join('');
}
function searchTag() {
  if (!URL_Q) return '';
  return '<div class="search-tag">搜索：<b>' + URL_Q + '</b><span class="x" onclick="location.href=location.pathname">×</span></div>';
}
function updateCounts() {
  const now = Math.floor(Date.now() / 1000);
  const active  = allUsers.filter(u => !u.banned && u.plan_id && u.expired_at >= now).length;
  const expired = allUsers.filter(u => !u.banned && (!u.plan_id || u.expired_at < now)).length;
  const banned  = allUsers.filter(u => u.banned).length;
  document.querySelector('.uf[data-f="all"] .c').textContent = allUsers.length;
  document.querySelector('.uf[data-f="active"] .c').textContent = active;
  document.querySelector('.uf[data-f="expired"] .c').textContent = expired;
  document.querySelector('.uf[data-f="banned"] .c').textContent = banned;
}

async function load() {
  const [ju, jp] = await Promise.all([api('/users'), api('/plans')]);
  if (ju.code !== 1) return;
  allUsers = ju.data || [];
  applyRemarks();
  plansCache = (jp && jp.data) || [];
  updateCounts();
  render();
}

function editUser(u) {
  const planOpts = plansCache.map(p =>
    '<option value="' + p.id + '"' + (u.plan_id === p.id ? ' selected' : '') + '>' +
    p.name + '（' + (p.tagline || '') + '）</option>').join('');

  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>用户：' + (u.nickname || u.email) + '</h2>' +
    '<div class="u-detail">' +
      '<div class="ud-row"><div class="ud-k">昵称</div><div class="ud-v">' + (u.nickname || '未设置') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">邮箱</div><div class="ud-v">' + u.email + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">数据库 ID</div><div class="ud-v">#' + u.id + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">数字 ID</div><div class="ud-v">' + (u.short_id || '未设置') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">所属节点</div><div class="ud-v">' + (u.node_id ? ('#' + u.node_id) : '未分配') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">节点账号</div><div class="ud-v" onclick="copyText(\'' + (u.node_user || '') + '\')">' + (u.node_user || '未分配') + '　📋</div></div>' +
      '<div class="ud-row"><div class="ud-k">节点密码</div><div class="ud-v" onclick="copyText(\'' + (u.node_pass || '') + '\')">' + (u.node_pass || '—') + '　📋</div></div>' +
      '<div class="ud-row"><div class="ud-k">订阅链接</div><div class="ud-v" style="font-size:11px;word-break:break-all;color:#1a73e8" onclick="copyText(\'https://lynli.abrdns.com/api/v1/sub/' + (u.sub_token || '') + '\')">' + (u.sub_token ? ('https://lynli.abrdns.com/api/v1/sub/' + u.sub_token + '　📋') : '未生成　点此生成') + '</div></div>' + '<div class="ud-row"><div class="ud-k">备注</div><div class="ud-v" style="color:#666;font-size:12px">' + (u.remark || '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">到期</div><div class="ud-v">' + (u.expired_at ? fmtDate(u.expired_at) : '—') + '　' + daysLeft(u) + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">已用流量</div><div class="ud-v">' + fmtSize(u.u + u.d) + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">真实姓名</div><div class="ud-v">' + (u.real_name || '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">USDT</div><div class="ud-v" style="font-size:11px;word-break:break-all" onclick="copyText(\'' + (u.usdt_addr||'') + '\')">' + (u.usdt_addr || '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">支付宝</div><div class="ud-v" onclick="copyText(\'' + (u.alipay||'') + '\')">' + (u.alipay || '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">钱包审核</div><div class="ud-v">' + ((u.wallet_status==1) ? '✅ 已通过' : (u.real_name ? '⏳ 待审核' : '未提交')) + '</div></div>' +
    '</div>' +

    '<div class="op-sec"><div class="op-sec-title">开通 / 续期</div>' +
      '<label>套餐</label><select id="g_plan">' + planOpts + '</select>' +
      '<label>时长</label><select id="g_days">' +
        '<option value="30">月付（30 天）</option>' +
        '<option value="90">季付（90 天）</option>' +
        '<option value="180">半年（180 天）</option>' +
        '<option value="365">年付（365 天）</option>' +
        '<option value="0">自定义…</option>' +
      '</select>' +
      '<input id="g_custom" type="number" placeholder="输入天数" style="display:none;margin-bottom:12px">' +
      '<button class="op-btn primary" style="width:100%;padding:13px" onclick="grantPlan(' + u.id + ')">立即开通 / 续期</button>' +
    '</div>' +

    ((u.real_name && u.wallet_status != 1) ?
      '<div class="op-sec"><div class="op-sec-title">钱包审核</div>' +
        '<button class="op-btn primary" style="width:100%;padding:13px" onclick="reviewWallet(' + u.id + ')">通过钱包审核</button>' +
      '</div>' : '') +
    '<div class="op-sec"><div class="op-sec-title">快捷操作</div>' +
      '<div class="op-row">' +
        '<button class="op-btn" onclick="addDays(' + u.id + ',30)">+30 天</button>' +
        '<button class="op-btn" onclick="addDays(' + u.id + ',90)">+90 天</button>' +
        '<button class="op-btn" onclick="addDays(' + u.id + ',365)">+1 年</button>' +
      '</div>' +
      '<div class="op-row">' +
        '<button class="op-btn warn" onclick="resetTraffic(' + u.id + ')">重置流量</button>' +
        '<button class="op-btn" onclick="editRemark(' + u.id + ')">编辑备注</button>' +
      '</div>' +
      '<div class="op-row">' +
        '<button class="op-btn" style="background:#eef4ff;color:#2E5BFF;border-color:#d5e0ff" onclick="editTag(' + u.id + ')">设置标签</button>' +
      '</div>' +
      '<div class="op-row">' +
        '<button class="op-btn" onclick="editProfile(' + u.id + ')">编辑资料</button>' +
        (u.banned
          ? '<button class="op-btn" onclick="setBan(' + u.id + ',0)">解除封禁</button>'
          : '<button class="op-btn danger" onclick="setBan(' + u.id + ',1)">封禁</button>') +
      '</div>' +
      '<div class="op-row">' +
        '<button class="op-btn danger" style="flex:1;background:#fff5f5" onclick="delUser(' + u.id + ',\'' + u.email + '\')">删除用户</button>' +
      '</div>' +
    '</div>' +

    '<div class="btn-row"><button class="btn-cancel" onclick="closeModal()">关闭</button></div>' +
    '</div></div>';

  const sel = document.getElementById('g_days');
  const custom = document.getElementById('g_custom');
  sel.onchange = () => { custom.style.display = sel.value === '0' ? 'block' : 'none'; };
}

async function reviewWallet(uid) {
  if (!(await cConfirm('确认通过该用户的钱包审核？'))) return;
  var j = await api('/wallet/review', {method:'POST', body: JSON.stringify({id: uid, status: 1})});
  if (j.code === 1) { toast('已通过'); closeModal(); setTimeout(load, 600); }
  else { toast('失败：' + (j.msg||'')); }
}

async function grantPlan(id) {
  const plan_id = +document.getElementById('g_plan').value;
  const sel = document.getElementById('g_days');
  let days = +sel.value;
  if (days === 0) days = +document.getElementById('g_custom').value;
  if (!plan_id) { toast('请选择套餐'); return; }
  if (!days || days <= 0) { toast('请输入有效天数'); return; }
  await api('/users/grant', {method:'POST', body: JSON.stringify({id, plan_id, days})});
  toast('已开通 ' + days + ' 天');
  closeModal(); load();
}
async function addDays(id, d) {
  await api('/users/add-days', {method:'POST', body: JSON.stringify({id, days: d})});
  toast('已加 ' + d + ' 天'); closeModal(); load();
}
async function resetTraffic(id) {
  if (!(await cConfirm('确定重置该用户流量？'))) return;
  await api('/users/reset-traffic', {method:'POST', body: JSON.stringify({id})});
  toast('已重置流量');
}
async function setBan(id, banned) {
  if (!(await cConfirm(banned ? '确定封禁该用户？' : '确定解除封禁？'))) return;
  await api('/users/ban', {method:'POST', body: JSON.stringify({id, banned})});
  toast(banned ? '已封禁' : '已解封'); closeModal(); load();
}
async function delUser(id, email) {
  if (!(await cConfirm('⚠️ 删除用户 ' + email + '？此操作不可恢复！'))) return;
  if (!(await cConfirm('再次确认：真的要删除？'))) return;
  await api('/users/delete', {method:'POST', body: JSON.stringify({id})});
  toast('已删除'); closeModal(); load();
}

async function editTag(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  const t = prompt('输入标签（留空 = 清空）\n例：VIP / 试用 / 黑名单', u.tag || '');
  if (t === null) return;
  const tag = t.trim().slice(0, 32);
  var j = await api('/users/tag', {method:'POST', body: JSON.stringify({id: id, tag: tag})});
  if (j.code === 1) { toast('已更新'); closeModal(); load(); }
  else { toast('失败：' + (j.msg || '')); }
}
window.editTag = editTag;

function editRemark(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  const nv = prompt('输入备注（留空则清除）', u.remark || '');
  if (nv === null) return;
  const map = JSON.parse(localStorage.getItem('lynli_remarks') || '{}');
  map[id] = nv;
  localStorage.setItem('lynli_remarks', JSON.stringify(map));
  u.remark = nv;
  toast('已保存备注'); closeModal();
}
function applyRemarks() {
  const map = JSON.parse(localStorage.getItem('lynli_remarks') || '{}');
  allUsers.forEach(u => { if (map[u.id] != null) u.remark = map[u.id]; });
}
function editProfile(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>编辑资料</h2>' +
    '<label>昵称</label><input id="p_nick" value="' + (u.nickname || '') + '">' +
    '<label>数字 ID</label><input id="p_sid" type="number" placeholder="如 6398" value="' + (u.short_id || '') + '">' +
    '<label>邮箱</label><input id="p_email" type="email" value="' + (u.email || '') + '">' +
    '<label>新密码（留空不改）</label><input id="p_pw" type="password" placeholder="不修改则留空">' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="editUser(' + JSON.stringify(u).replace(/'/g, "&#39;") + ')">返回</button>' +
      '<button class="btn-primary" onclick="saveProfile(' + id + ')">保存</button>' +
    '</div></div></div>';
}
async function saveProfile(id) {
  const body = {
    id,
    nickname: document.getElementById('p_nick').value.trim(),
    short_id: document.getElementById('p_sid').value.trim(),
    email: document.getElementById('p_email').value.trim(),
    password: document.getElementById('p_pw').value
  };
  if (!body.email) { toast('邮箱不能为空'); return; }
  await api('/users/update', {method:'POST', body: JSON.stringify(body)});
  toast('已保存'); closeModal(); load();
}

function exportCSV() {
  if (!allUsers.length) { toast('暂无数据'); return; }
  const rows = [['ID','昵称','邮箱','套餐ID','到期','已用(GB)','状态','备注','注册时间']];
  for (const u of allUsers) {
    const st = u.banned ? '已封禁' : (!u.plan_id ? '无套餐' : (u.expired_at < Math.floor(Date.now()/1000) ? '已过期' : '正常'));
    rows.push([u.id, u.nickname||'', u.email, u.plan_id||'', u.expired_at?fmtDate(u.expired_at):'', ((u.u+u.d)/1024/1024/1024).toFixed(2), st, u.remark||'', fmtDate(u.created_at)]);
  }
  downloadCSV(rows, 'users_' + Date.now() + '.csv');
}
function downloadCSV(rows, filename) {
  const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出');
}


// ===== 批量操作 =====
function getSelectedIds() {
  var ids = [];
  document.querySelectorAll('.u-check:checked').forEach(function(el){ ids.push(+el.dataset.id); });
  return ids;
}
function updateBatchBar() {
  var ids = getSelectedIds();
  var c = document.getElementById('selCount');
  if (c) c.textContent = ids.length ? ('已选 ' + ids.length + ' 人') : '';
}
function toggleAll(on) {
  document.querySelectorAll('.u-check').forEach(function(el){ el.checked = on; });
  updateBatchBar();
}
async function doBatchTag() {
  var ids = getSelectedIds();
  if (!ids.length) { toast('请先勾选用户'); return; }
  var tag = prompt('输入标签（留空 = 清空标签）\n例：VIP / 试用 / 黑名单 / 大客户', '');
  if (tag === null) return;
  tag = tag.trim().slice(0, 32);
  if (!(await cConfirm('给 ' + ids.length + ' 个用户打标签「' + (tag || '(清空)') + '」？'))) return;
  toast('处理中...');
  var j = await api('/users/batch_tag', {method:'POST', body: JSON.stringify({ids: ids, tag: tag})});
  if (j.code === 1) {
    toast('已完成 ' + (j.data && j.data.done || 0) + '/' + ids.length);
    setTimeout(load, 500);
  } else {
    toast('失败：' + (j.msg || ''));
  }
}
window.doBatchTag = doBatchTag;

async function doBatch(action, days) {
  var ids = getSelectedIds();
  if (!ids.length) { toast('请先勾选用户'); return; }
  var label = {add_days:'加天数', reset_traffic:'重置流量', ban:'封禁', unban:'解封', delete:'删除'}[action] || action;
  var msg = '确定对 ' + ids.length + ' 个用户执行「' + label + '」？';
  if (action === 'delete') msg = '⚠️ 确定删除 ' + ids.length + ' 个用户？不可恢复！';
  if (!(await cConfirm(msg))) return;
  if (action === 'delete') {
    if (!(await cConfirm('再次确认：真的要删除？'))) return;
  }
  toast('处理中...');
  var body = {ids: ids, action: action};
  if (days) body.days = days;
  var j = await api('/users/batch', {method:'POST', body: JSON.stringify(body)});
  if (j.code === 1) {
    var d = j.data || {};
    toast('已完成 ' + (d.done||0) + '/' + (d.total||0));
    setTimeout(load, 500);
  } else {
    toast('失败：' + (j.msg || ''));
  }
}

load();
