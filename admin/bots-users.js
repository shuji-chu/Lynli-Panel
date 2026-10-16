if (!checkAuth()) throw 0;
renderShell('home');

const Q = new URLSearchParams(location.search);
const BOT = Q.get('bot') || 'safew';
const BOT_NAME = { safew:'SafeW', mivra:'Mivra', qingtian:'晴天（TG）' };

let allUsers = [];

async function load() {
  const [us, st] = await Promise.all([
    api('/bot_users?bot=' + BOT),
    api('/bot_stats?bot=' + BOT)
  ]);
  allUsers = us.code === 1 ? us.data : [];
  const s = st.code === 1 ? st.data : {};

  document.getElementById('summary').innerHTML =
    '<div class="bu-summary">' +
    '<div class="bu-sum-card"><div class="k">👥 ' + (BOT_NAME[BOT] || BOT) + ' 用户</div><div class="v">' + (s.total || 0) + '</div></div>' +
    '<div class="bu-sum-card"><div class="k">📅 今日签到</div><div class="v b">' + (s.today_sign || 0) + '</div></div>' +
    '<div class="bu-sum-card"><div class="k">💎 付费用户</div><div class="v">' + (s.paid_users || 0) + '</div></div>' +
    '<div class="bu-sum-card"><div class="k">💰 今日收入</div><div class="v g">¥' + (s.today_income || 0).toFixed(2) + '</div></div>' +
    '<div class="bu-sum-card"><div class="k">📋 总订单</div><div class="v">' + (s.total_orders || 0) + '</div></div>' +
    '<div class="bu-sum-card"><div class="k">📋 今日订单</div><div class="v">' + (s.today_orders || 0) + '</div></div>' +
    '</div>';

  render();
}

function statusOf(u) {
  const now = Math.floor(Date.now() / 1000);
  if (!u.activated) return {cls: 'banned', txt: '已封禁'};
  if (!u.expire || u.expire === 0) return {cls: 'none', txt: '无套餐'};
  if (u.expire < now) return {cls: 'expired', txt: '已过期'};
  return {cls: 'active', txt: '正常'};
}

function daysLeft(u) {
  if (!u.expire) return '';
  const now = Math.floor(Date.now() / 1000);
  const d = Math.floor((u.expire - now) / 86400);
  if (d < 0) return '已过期 ' + (-d) + ' 天';
  return '剩 ' + d + ' 天';
}

function render() {
  const kw = (document.getElementById('kw').value || '').trim().toLowerCase();
  let list = allUsers;
  if (kw) list = list.filter(u => (u.nickname || '').toLowerCase().includes(kw) || String(u.tg_id).includes(kw));
  const box = document.getElementById('userList');
  if (!list.length) { box.innerHTML = '<div class="empty">暂无用户</div>'; return; }
  box.innerHTML = list.map(u => {
    const s = statusOf(u);
    const name = u.nickname || '未设置昵称';
    const traffic = (u.traffic_mb / 1024).toFixed(2) + ' GB';
    const expire = u.expire ? fmtDate(u.expire) : '—';
    return '<div class="bu-user ' + (u.activated ? '' : 'banned') + '" onclick=\'openUser(' + JSON.stringify(u).replace(/'/g, "&#39;") + ')\'>' +
      '<div class="bu-user-row1">' +
        '<div><div class="bu-user-name">' + name + '</div>' +
        '<div class="bu-user-id" onclick="event.stopPropagation();copyText(\'' + u.tg_id + '\')">ID ' + u.tg_id + '　📋</div></div>' +
        '<div class="bu-tag ' + s.cls + '">' + s.txt + '</div>' +
      '</div>' +
      '<div class="bu-stats">' +
        '<div><div class="k">流量</div><div class="v">' + traffic + '</div></div>' +
        '<div><div class="k">到期</div><div class="v">' + expire + (u.expire ? '<div style="font-size:10px;color:#e74c3c">' + daysLeft(u) + '</div>' : '') + '</div></div>' +
        '<div><div class="k">最后签到</div><div class="v" style="font-size:12px">' + (u.last_sign || '—') + '</div></div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openUser(u) {
  const s = statusOf(u);
  const credRow = u.suser
    ? '<div class="ud-row"><div class="ud-k">账号</div><div class="ud-v" onclick="copyText(\'' + u.suser + '\')">' + u.suser + '　📋</div></div>' +
      '<div class="ud-row"><div class="ud-k">密码</div><div class="ud-v" onclick="copyText(\'' + u.spass + '\')">' + u.spass + '　📋</div></div>'
    : '<div class="ud-row"><div class="ud-k">凭证</div><div class="ud-v" style="color:#999">未分配</div></div>';

  const inviteRow = (u.inviter || u.invite_count)
    ? '<div class="ud-row"><div class="ud-k">邀请人</div><div class="ud-v">' + (u.inviter || '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">邀请数</div><div class="ud-v">' + (u.invite_count || 0) + '</div></div>'
    : '';

  const balanceRow = u.balance != null
    ? '<div class="ud-row"><div class="ud-k">余额</div><div class="ud-v">' + (u.balance || 0).toFixed(2) + '</div></div>'
    : '';

  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>' + (u.nickname || '用户 ' + u.tg_id) + '</h2>' +
    '<div class="u-detail">' +
      '<div class="ud-row"><div class="ud-k">来源</div><div class="ud-v">' + (BOT_NAME[BOT] || BOT) + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">数字 ID</div><div class="ud-v" onclick="copyText(\'' + u.tg_id + '\')">' + u.tg_id + '　📋</div></div>' +
      '<div class="ud-row"><div class="ud-k">状态</div><div class="ud-v"><span class="bu-tag ' + s.cls + '">' + s.txt + '</span></div></div>' +
      '<div class="ud-row"><div class="ud-k">已用流量</div><div class="ud-v">' + (u.traffic_mb / 1024).toFixed(2) + ' GB</div></div>' +
      '<div class="ud-row"><div class="ud-k">到期</div><div class="ud-v">' + (u.expire ? fmtDate(u.expire) + '　' + daysLeft(u) : '—') + '</div></div>' +
      '<div class="ud-row"><div class="ud-k">最后签到</div><div class="ud-v">' + (u.last_sign || '—') + '</div></div>' +
      credRow + inviteRow + balanceRow +
    '</div>' +
    '<div class="op-sec">' +
      '<div class="op-sec-title">快捷操作</div>' +
      '<div class="op-row">' +
        (u.activated
          ? '<button class="op-btn danger" onclick="setBan(\'' + u.tg_id + '\',0)">封禁用户</button>'
          : '<button class="op-btn primary" onclick="setBan(\'' + u.tg_id + '\',1)">解除封禁</button>') +
        '<button class="op-btn" onclick="resetTraffic(\'' + u.tg_id + '\')">重置流量</button>' +
      '</div>' +
    '</div>' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">关闭</button>' +
    '</div></div></div>';
}

async function setBan(tg_id, activated) {
  const tip = activated ? '确定解除封禁？' : '确定封禁该用户？';
  if (!(await cConfirm(tip))) return;
  await api('/bot_users/ban', {method:'POST', body: JSON.stringify({bot: BOT, tg_id, activated})});
  toast(activated ? '已解封' : '已封禁');
  closeModal();
  load();
}

async function resetTraffic(tg_id) {
  if (!(await cConfirm('确定重置该用户流量？'))) return;
  await api('/bot_users/reset-traffic', {method:'POST', body: JSON.stringify({bot: BOT, tg_id})});
  toast('已重置');
  closeModal();
  load();
}

document.addEventListener('input', e => { if (e.target.id === 'kw') render(); });

load();
