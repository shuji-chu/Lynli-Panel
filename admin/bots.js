if (!checkAuth()) throw 0;
renderShell('home');

const LOGO_TEXT = { safew: 'S', mivra: 'M', telegram: 'T' };

async function load() {
  const [bj, sj] = await Promise.all([
    api('/bots'),
    api('/bot_stats')
  ]);
  if (bj.code !== 1) return;
  const list = bj.data || [];
  const stats = sj.code === 1 ? sj.data : {};

  let todaySign = 0, activeAgents = 0, todayIncome = 0, totalUsers = 0;
  Object.values(stats).forEach(s => {
    todaySign    += s.today_sign    || 0;
    activeAgents += s.active_agents || 0;
    todayIncome  += s.today_income  || 0;
    totalUsers   += s.total         || 0;
  });

  document.getElementById('summary').innerHTML =
    '<div class="bt-sum-card"><div class="k">📅 今日签到</div><div class="v b">' + todaySign + '</div></div>' +
    '<div class="bt-sum-card"><div class="k">👑 活跃代理</div><div class="v">' + activeAgents + '</div></div>' +
    '<div class="bt-sum-card"><div class="k">👥 总用户</div><div class="v">' + totalUsers + '</div></div>' +
    '<div class="bt-sum-card"><div class="k">💰 今日收入</div><div class="v g">¥' + todayIncome.toFixed(2) + '</div></div>';

  const box = document.getElementById('botList');
  if (!list.length) { box.innerHTML = '<div class="empty">暂无渠道</div>'; return; }

  box.innerHTML = list.map(b => {
    return '<div class="bt-card' + (b.status ? '' : ' off') + '">' +
      '<div class="bt-row1">' +
        '<div class="bt-logo"><img src="icons/' + b.key + '.jpg" alt=""></div>' +
        '<div class="bt-info">' +
          '<div class="bt-name">' + b.name + '</div>' +
          '<div class="bt-handle" onclick="copyText(\'' + b.handle + '\')">' + b.handle + '　📋</div>' +
        '</div>' +
        '<div class="bt-status ' + (b.online ? 'on' : 'off') + '">' +
          '<span class="dot"></span>' + (b.online ? '在线' : '离线') + '</div>' +
      '</div>' +
      '<div class="bt-stats">' +
        '<div class="it"><div class="k">今日消息</div><div class="v">' + b.msgs_today + '</div></div>' +
        '<div class="it"><div class="k">累计消息</div><div class="v">' + b.msgs_total + '</div></div>' +
        '<div class="it"><div class="k">客服人数</div><div class="v">' + b.staff + '</div></div>' +
      '</div>' +
      '<div class="bt-actions">' +
        '<button class="open" onclick="go(\'bots-users.html?bot=' + b.key + '\')">查看用户 →</button>' +
        '<button class="toggle' + (b.status ? '' : ' off') + '" onclick="toggleBot(' + b.id + ',' + (b.status ? 0 : 1) + ')">' + (b.status ? '停用' : '启用') + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function toggleBot(id, status) {
  if (!(await cConfirm(status ? '确定启用该渠道？' : '确定停用该渠道？'))) return;
  await api('/bots/toggle', {method:'POST', body: JSON.stringify({id, status})});
  toast(status ? '已启用' : '已停用');
  load();
}

load();
