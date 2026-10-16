if (!checkAuth()) throw 0;
renderShell('users');

var Q = new URLSearchParams(location.search);
var UID = Q.get('id') || '';
var U = null;
var plansCache = [];

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

function fmtDate(ts) {
  if (!ts) return '—';
  var d = new Date(ts * 1000);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' +
         String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function fmtSize(b) {
  if (!b) return '0 B';
  var k = 1024, u = ['B','KB','MB','GB','TB'], i = 0;
  while (b >= k && i < u.length - 1) { b /= k; i++; }
  return b.toFixed(2) + u[i];
}

function copyText(t) {
  if (!t) return;
  navigator.clipboard && navigator.clipboard.writeText(t).then(function(){ toast('已复制'); });
}

async function load() {
  if (!UID) { document.getElementById('content').innerHTML = '<div style="text-align:center;color:#e74c3c;padding:40px 0">缺少用户 ID</div>'; return; }
  var [ju, jp] = await Promise.all([api('/users/detail?id=' + UID), api('/plans')]);
  if (ju.code !== 1) { document.getElementById('content').innerHTML = '<div style="text-align:center;color:#e74c3c;padding:40px 0">' + (ju.msg||'用户不存在') + '</div>'; return; }
  U = ju.data;
  plansCache = (jp && jp.data) || [];
  render();
}

function render() {
  var s = userStatus(U);
  var initial = (U.nickname || U.email || '?').slice(0, 1).toUpperCase();
  var subUrl = '/api/v1/sub/' + (U.sub_token || '');
  var walletTxt = (U.wallet_status == 1) ? '<span style="color:#0a9f52">已通过</span>' : (U.real_name ? '<span style="color:#d97706">待审核</span>' : '未提交');

  function periodZh(p){ return ({'month_price':'月付','quarter_price':'季付','half_year_price':'半年','year_price':'年付','onetime_price':'一次性'})[p] || (p||''); }
  function orderStatusZh(s){ return ({0:'待支付',1:'已支付',2:'已退款',3:'已取消'})[s] || ('状态'+(s||0)); }
  var orderRows = (U.orders||[]).map(function(o){
    var cls = o.status==1 ? 'color:#0a9f52' : (o.status==0 ? 'color:#d97706' : 'color:#888');
    return '<div class="ud-row"><div class="ud-k" style="font-family:monospace;font-size:11px">' + (o.trade_no||'') + '</div>' +
           '<div class="ud-v"><span style="'+cls+'">' + orderStatusZh(o.status) + '</span> · ' + periodZh(o.period) + ' · ¥' + ((o.total_amount||0)/100).toFixed(2) + '<br><span style="color:#888;font-size:11px">' + fmtDate(o.created_at) + '</span></div></div>';
  }).join('') || '<div style="color:#888;font-size:13px;padding:10px 0">暂无订单</div>';
  var ticketRows = (U.tickets||[]).map(function(t){
    var st = t.status==1 ? '<span style="color:#0a9f52">进行中</span>' : '<span style="color:#888">已关闭</span>';
    var ho = t.handoff ? ' · <span style="color:#d97706">人工接管</span>' : ' · AI';
    return '<div class="ud-row"><div class="ud-k">#' + t.id + ' ' + (t.subject||'无标题') + '</div>' +
           '<div class="ud-v">' + st + ho + '<br><span style="color:#888;font-size:11px">' + fmtDate(t.created_at) + '</span></div></div>';
  }).join('') || '<div style="color:#888;font-size:13px;padding:10px 0">暂无工单</div>';
  var logRows = (U.logs||[]).map(function(l){
    return '<div class="ud-row"><div class="ud-k">' + (l.admin||'') + ' · ' + (l.action||'') + '</div>' +
           '<div class="ud-v">' + (l.detail||'') + '<br><span style="color:#888;font-size:11px">' + fmtDate(l.created_at) + ' · ' + (l.ip||'') + '</span></div></div>';
  }).join('') || '<div style="color:#888;font-size:13px;padding:10px 0">暂无日志</div>';
  var orderCard = '<div class="ud-card"><div class="ud-sec-title">历史订单（最近 30 单）</div>' + orderRows + '</div>';
  var ticketCard = '<div class="ud-card"><div class="ud-sec-title">工单记录（最近 20 条）</div>' + ticketRows + '</div>';
  var logCard = '<div class="ud-card"><div class="ud-sec-title">操作日志（最近 30 条）</div>' + logRows + '</div>';

  var planOpts = plansCache.map(function(p){
    return '<option value="' + p.id + '"' + (U.plan_id === p.id ? ' selected' : '') + '>' + p.name + '（' + (p.tagline||'') + '）</option>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="ud-card">' +
      '<div class="ud-head">' +
        '<div class="ud-avatar">' + ((U.avatar && U.avatar.startsWith('data:image'))
        ? '<img src="' + U.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
        : initial) + '</div>' +
        '<div class="ud-head-info">' +
          '<div class="ud-nick">' + (U.nickname || '未设置昵称') + '</div>' +
          '<div class="ud-email">' + U.email + '</div>' +
        '</div>' +
        '<span class="ud-tag ' + s.cls + '">' + s.txt + '</span>' +
      '</div>' +
      '<div class="ud-row"><div class="ud-k">数据库 ID</div><div class="ud-v">#' + U.id + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">数字 ID</div><div class="ud-v">' + (U.short_id || '未设置') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">注册时间</div><div class="ud-v">' + fmtDate(U.created_at) + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">到期</div><div class="ud-v">' + (U.expired_at ? fmtDate(U.expired_at) + '　' + daysLeft(U) : '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">套餐</div><div class="ud-v">' + (U.plan_id ? '#' + U.plan_id : '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">已用流量</div><div class="ud-v">' + fmtSize((U.u||0)+(U.d||0)) + ' / ' + fmtSize(U.transfer_enable||0) + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">订阅链接</div><div class="ud-v"><span class="ud-copy" onclick="copyText(\'' + subUrl + '\')">' + (U.sub_token ? '点此复制' : '未生成') + '</span></div></div>' +
    '</div>' +

    '<div class="ud-card">' +
      '<div class="ud-sec-title">收款信息</div>' +
      '<div class="ud-row"><div class="ud-k">真实姓名</div><div class="ud-v">' + (U.real_name || '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">USDT</div><div class="ud-v"><span class="ud-copy" onclick="copyText(\'' + (U.usdt_addr||'') + '\')">' + (U.usdt_addr || '—') + '</span></div></div>' +
      '<div class="ud-row"><div class="ud-k">支付宝</div><div class="ud-v"><span class="ud-copy" onclick="copyText(\'' + (U.alipay||'') + '\')">' + (U.alipay || '—') + '</span></div></div>' +
      '<div class="ud-row"><div class="ud-k">钱包审核</div><div class="ud-v">' + walletTxt + '</div></div>' +
      ((U.real_name && U.wallet_status != 1) ?
        '<button class="ud-btn primary" style="width:100%;margin-top:10px" onclick="reviewWallet()">通过钱包审核</button>' : '') +
    '</div>' +

    '<div class="ud-card">' +
      '<div class="ud-sec-title">开通 / 续期</div>' +
      '<div class="ud-label">套餐</div>' +
      '<select id="g_plan" class="ud-select">' + planOpts + '</select>' +
      '<div class="ud-label" style="margin-top:8px">时长</div>' +
      '<select id="g_days" class="ud-select">' +
        '<option value="30">月付（30 天）</option>' +
        '<option value="90">季付（90 天）</option>' +
        '<option value="180">半年（180 天）</option>' +
        '<option value="365">年付（365 天）</option>' +
        '<option value="0">自定义…</option>' +
      '</select>' +
      '<input id="g_custom" type="number" placeholder="输入天数" class="ud-input" style="display:none">' +
      '<button class="ud-btn primary" style="width:100%;margin-top:10px" onclick="grantPlan()">立即开通 / 续期</button>' +
    '</div>' +

    '<div class="ud-card" id="deviceCard">' +
      '<div class="ud-sec-title">登录设备 <span id="devCount" style="font-weight:400;color:#94A3B8;font-size:11px"></span></div>' +
      '<div id="devList" style="font-size:13px;color:#94A3B8;padding:8px 0">加载中…</div>' +
      '<button class="ud-btn danger" style="width:100%;margin-top:10px" onclick="kickAll()">踢出所有设备</button>' +
    '</div>' +

    '<div class="ud-card">' +
      '<div class="ud-sec-title">快捷操作</div>' +
      '<div class="ud-op-row">' +
        '<button class="ud-btn" onclick="addDays(30)">+30 天</button>' +
        '<button class="ud-btn" onclick="addDays(90)">+90 天</button>' +
        '<button class="ud-btn" onclick="addDays(365)">+1 年</button>' +
      '</div>' +
      '<div class="ud-op-row">' +
        '<button class="ud-btn warn" onclick="resetTraffic()">重置流量</button>' +
        '<button class="ud-btn" onclick="editRemark()">编辑备注</button>' +
      '</div>' +
      '<div class="ud-op-row">' +
        '<button class="ud-btn" onclick="editProfile()">编辑资料</button>' +
        (U.banned
          ? '<button class="ud-btn" onclick="setBan(0)">解除封禁</button>'
          : '<button class="ud-btn danger" onclick="setBan(1)">封禁</button>') +
      '</div>' +
      '<div class="ud-op-row">' +
        '<button class="ud-btn danger" style="flex:1" onclick="delUser()">删除用户</button>' +
      '</div>' +
    '</div>' + orderCard + ticketCard + logCard;

  var sel = document.getElementById('g_days');
  var custom = document.getElementById('g_custom');
  sel.onchange = function(){ custom.style.display = sel.value === '0' ? 'block' : 'none'; };
}

async function reviewWallet() {
  if (!(await cConfirm('确认通过该用户的钱包审核？'))) return;
  var j = await api('/wallet/review', {method:'POST', body: JSON.stringify({id: U.id, status: 1})});
  if (j.code === 1) { toast('已通过'); load();

async function loadDevices() {
  var j = await api('/users/devices?id=' + UID);
  var box = document.getElementById('devList');
  var cnt = document.getElementById('devCount');
  if (!j.code || !j.data || !j.data.length) {
    box.innerHTML = '<div style="padding:10px 0">暂无登录设备</div>';
    if (cnt) cnt.textContent = '';
    return;
  }
  if (cnt) cnt.textContent = '共 ' + j.data.length + ' 台';
  function fmt(t){ if(!t) return ''; var d=new Date(t*1000); var p=function(n){return String(n).padStart(2,'0');}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }
  box.innerHTML = j.data.map(function(r){
    var ua = r.ua || '未知设备';
    ua = ua.replace(/okhttp\/[\d.]+/g,'APP').replace(/Mozilla\/5\.0.*/g,'浏览器');
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f5f5f5;gap:8px">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:600;color:#0F1A3C;word-break:break-all">' + ua + '</div>' +
        '<div style="font-size:11px;color:#94A3B8;margin-top:2px">IP: ' + (r.ip || '—') + ' · ' + fmt(r.last_used_at || r.created_at) + '</div>' +
      '</div>' +
      '<button class="ud-btn" style="padding:6px 12px;font-size:12px;flex-shrink:0" onclick="kickOne(\'' + r.token_short + '\')">踢出</button>' +
    '</div>';
  }).join('');
}

async function kickOne(short) {
  if (!(await cConfirm('确定踢出该设备？用户需重新登录。'))) return;
  var j = await api('/users/kick', {method:'POST', body: JSON.stringify({id: +UID, token_short: short})});
  if (j.code === 1) { toast('已踢出'); loadDevices(); }
  else toast('失败：' + (j.msg || ''));
}

async function kickAll() {
  if (!(await cConfirm('⚠️ 踢出该用户所有设备？所有 APP 需重新登录。'))) return;
  if (!(await cConfirm('再次确认：真的要全踢？'))) return;
  var j = await api('/users/kick_all', {method:'POST', body: JSON.stringify({id: +UID})});
  if (j.code === 1) { toast('已全踢'); loadDevices(); }
  else toast('失败：' + (j.msg || ''));
}

window.kickOne = kickOne;
window.kickAll = kickAll;
loadDevices(); }
  else toast('失败：' + (j.msg||''));
}

async function grantPlan() {
  var plan_id = +document.getElementById('g_plan').value;
  var sel = document.getElementById('g_days');
  var days = +sel.value;
  if (days === 0) days = +document.getElementById('g_custom').value;
  if (!plan_id) { toast('请选择套餐'); return; }
  if (!days || days <= 0) { toast('请输入有效天数'); return; }
  await api('/users/grant', {method:'POST', body: JSON.stringify({id: U.id, plan_id: plan_id, days: days})});
  toast('已开通 ' + days + ' 天');
  load();
}

async function addDays(d) {
  await api('/users/add-days', {method:'POST', body: JSON.stringify({id: U.id, days: d})});
  toast('已加 ' + d + ' 天');
  load();
}

async function resetTraffic() {
  if (!(await cConfirm('确定重置该用户流量？'))) return;
  await api('/users/reset-traffic', {method:'POST', body: JSON.stringify({id: U.id})});
  toast('已重置流量');
  load();
}

async function setBan(banned) {
  if (!(await cConfirm(banned ? '确定封禁该用户？' : '确定解除封禁？'))) return;
  await api('/users/ban', {method:'POST', body: JSON.stringify({id: U.id, banned: banned})});
  toast(banned ? '已封禁' : '已解封');
  load();
}

async function delUser() {
  if (!(await cConfirm('⚠️ 删除用户 ' + U.email + '？此操作不可恢复！'))) return;
  if (!(await cConfirm('再次确认：真的要删除？'))) return;
  await api('/users/delete', {method:'POST', body: JSON.stringify({id: U.id})});
  toast('已删除');
  setTimeout(function(){ location.href = 'users.html'; }, 500);
}

function editRemark() {
  var nv = prompt('输入备注（留空则清除）', U.remark || '');
  if (nv === null) return;
  var map = JSON.parse(localStorage.getItem('lynli_remarks') || '{}');
  map[U.id] = nv;
  localStorage.setItem('lynli_remarks', JSON.stringify(map));
  U.remark = nv;
  toast('已保存备注');
}

function editProfile() {
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>编辑资料</h2>' +
    '<label>昵称</label><input id="p_nick" value="' + (U.nickname || '') + '">' +
    '<label>数字 ID</label><input id="p_sid" type="number" placeholder="如 6398" value="' + (U.short_id || '') + '">' +
    '<label>邮箱</label><input id="p_email" type="email" value="' + (U.email || '') + '">' +
    '<label>新密码（留空不改）</label><input id="p_pw" type="password" placeholder="不修改则留空">' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="saveProfile()">保存</button>' +
    '</div></div></div>';
}

async function saveProfile() {
  var body = {
    id: U.id,
    nickname: document.getElementById('p_nick').value.trim(),
    short_id: document.getElementById('p_sid').value.trim(),
    email: document.getElementById('p_email').value.trim(),
    password: document.getElementById('p_pw').value
  };
  if (!body.email) { toast('邮箱不能为空'); return; }
  await api('/users/update', {method:'POST', body: JSON.stringify(body)});
  toast('已保存');
  closeModal();
  load();
}

load();
