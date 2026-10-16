if (!checkAuth()) throw 0;
renderShell('home');

var allCodes = [];

async function load() {
  var j = await api('/redeem_codes');
  if (j.code !== 1) {
    document.getElementById('codeList').innerHTML = '<div class="empty">加载失败</div>';
    return;
  }
  allCodes = j.data || [];

  var total = allCodes.length;
  var active = allCodes.filter(function(x){ return x.enabled && (x.total_limit === 0 || x.used_count < x.total_limit); }).length;
  var used = allCodes.reduce(function(s,x){ return s + (x.used_count || 0); }, 0);

  document.getElementById('statBox').innerHTML =
    '<div class="rd-sc"><div class="k">总数</div><div class="v">' + total + '</div></div>' +
    '<div class="rd-sc"><div class="k">可用</div><div class="v g">' + active + '</div></div>' +
    '<div class="rd-sc"><div class="k">已用</div><div class="v b">' + used + '</div></div>';

  var box = document.getElementById('codeList');
  if (!allCodes.length) { box.innerHTML = '<div class="empty">暂无兑换码<br>点右下角 ＋ 生成</div>'; return; }
  box.innerHTML = allCodes.map(cardHTML).join('');
}

function statusOf(c) {
  if (!c.enabled) return {cls: 'off', txt: '已停用'};
  if (c.total_limit > 0 && c.used_count >= c.total_limit) return {cls: 'used', txt: '已用完'};
  if (c.expire_at && c.expire_at < Math.floor(Date.now()/1000)) return {cls: 'used', txt: '已过期'};
  return {cls: 'on', txt: '可用'};
}

function fmtDate(ts) {
  if (!ts) return '永久';
  var d = new Date(ts * 1000);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function cardHTML(c) {
  var s = statusOf(c);
  var limitTxt = c.total_limit === 0 ? '不限' : (c.used_count + ' / ' + c.total_limit);
  return '<div class="rd-card' + (c.enabled ? '' : ' off') + '">' +
    '<div class="rd-row1">' +
      '<div class="rd-code" onclick="copyText(\'' + c.code + '\')">' + c.code + '　📋</div>' +
      '<div class="rd-status ' + s.cls + '">' + s.txt + '</div>' +
    '</div>' +
    '<div class="rd-info">' +
      '奖励：<b>' + (c.reward_gb || 0) + ' GB</b> + <b>' + (c.reward_days || 0) + ' 天</b><br>' +
      '使用：<b>' + limitTxt + '</b>　有效期：<b>' + fmtDate(c.expire_at) + '</b>' +
    '</div>' +
    '<div class="rd-acts">' +
      '<button class="cp" onclick="copyText(\'' + c.code + '\')">复制</button>' +
      '<button class="tg" onclick="toggleCode(' + c.id + ',' + (c.enabled ? 0 : 1) + ')">' + (c.enabled ? '停用' : '启用') + '</button>' +
      '<button class="del" onclick="delCode(' + c.id + ')">删除</button>' +
    '</div>' +
  '</div>';
}

function showGen() {
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>批量生成兑换码</h2>' +
    '<div class="ac-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="ac-row"><label>数量</label><input id="g_count" type="number" value="10" min="1" max="500"></div>' +
      '<div class="ac-row"><label>前缀</label><input id="g_prefix" value="LYN"></div>' +
      '<div class="ac-row"><label>奖励流量 (GB)</label><input id="g_gb" type="number" step="0.1" value="5"></div>' +
      '<div class="ac-row"><label>奖励时长 (天)</label><input id="g_days" type="number" value="3"></div>' +
      '<div class="ac-row"><label>总数限制 (0 不限)</label><input id="g_limit" type="number" value="0"></div>' +
      '<div class="ac-row"><label>有效期 (天, 0 永久)</label><input id="g_exp" type="number" value="30"></div>' +
    '</div>' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="doGen()">生成</button>' +
    '</div></div></div>';
}

async function doGen() {
  var body = {
    count: +document.getElementById('g_count').value || 1,
    prefix: document.getElementById('g_prefix').value.trim() || 'LYN',
    reward_gb: +document.getElementById('g_gb').value || 0,
    reward_days: +document.getElementById('g_days').value || 0,
    total_limit: +document.getElementById('g_limit').value || 0,
    expire_days: +document.getElementById('g_exp').value || 0
  };
  if (body.count > 500) { toast('一次最多 500 个'); return; }
  var j = await api('/redeem_codes', {method: 'POST', body: JSON.stringify(body)});
  if (j.code === 1) {
    toast('已生成 ' + body.count + ' 个');
    closeModal();
    load();
  } else toast('生成失败');
}

async function toggleCode(id, enabled) {
  await api('/redeem_codes/toggle', {method: 'POST', body: JSON.stringify({id: id, enabled: enabled})});
  toast(enabled ? '已启用' : '已停用');
  load();
}

async function delCode(id) {
  if (!(await cConfirm('确定删除？'))) return;
  await api('/redeem_codes/delete', {method: 'POST', body: JSON.stringify({id: id})});
  toast('已删除');
  load();
}

load();
