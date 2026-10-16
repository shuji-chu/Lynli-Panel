if (!checkAuth()) throw 0;
renderShell('home');

let tab = 'codes';
const URL_Q = new URLSearchParams(location.search).get('q') || '';

function switchTab(t) {
  tab = t;
  document.querySelectorAll('.inv-tabs .tab').forEach(el =>
    el.classList.toggle('on', el.dataset.t === t));
  load();
}

function codeCard(v) {
  const on = v.status === 1;
  const rate = v.rate || 15;
  const up = rate > 15 ? '<span class="iv-rate-up">已上调</span>' : '';
  return '<div class="iv-card">' +
    '<div class="iv-head">' +
      '<div class="iv-code" onclick="copyText(\'' + v.code + '\')">' + v.code + '　📋</div>' +
      '<div class="iv-badge ' + (on ? 'on' : 'off') + '">' + (on ? '启用' : '禁用') + '</div>' +
    '</div>' +
    '<div class="iv-email">' + (v.email || ('用户' + v.user_id)) + '<span class="iv-bind">永久绑定</span></div>' +
    '<div class="iv-rate">' +
      '<span class="iv-rate-lab">分成比例</span>' +
      '<span class="iv-rate-val">' + rate + '%</span>' + up +
      '<button class="iv-rate-btn" onclick="setRate(' + v.id + ',' + rate + ')">调整</button>' +
    '</div>' +
    '<div class="iv-grid">' +
      '<div class="it"><div class="k">访问</div><div class="v">' + v.pv + '</div></div>' +
      '<div class="it"><div class="k">注册</div><div class="v">' + v.signups + '</div></div>' +
      '<div class="it"><div class="k">已返利</div><div class="v">' + fmtMoney(v.reward) + '</div></div>' +
    '</div>' +
  '</div>';
}

function cashCard(w) {
  const map = {
    0: {cls: 'pending', t: '待审核'},
    1: {cls: 'done', t: '已打款'},
    2: {cls: 'reject', t: '已拒绝'}
  };
  const m = map[w.status] || map[0];
  const btn = w.status === 0 ?
    '<div class="iv-actions">' +
      '<button class="no" onclick="reviewCash(' + w.id + ',2)">拒绝</button>' +
      '<button class="yes" onclick="reviewCash(' + w.id + ',1)">通过打款</button>' +
    '</div>' : '';
  return '<div class="iv-cash">' +
    '<div class="iv-cash-top">' +
      '<div><div class="iv-cash-amt">' + fmtMoney(w.amount) + '</div>' +
      '<div class="iv-cash-user">' + (w.email || ('用户' + w.user_id)) + '</div></div>' +
      '<div class="iv-tag ' + m.cls + '">' + m.t + '</div>' +
    '</div>' +
    '<div class="iv-info">' +
      '<div class="row"><span class="rk">方式</span><span class="rv">' + (w.method === 'usdt' ? 'USDT' : '支付宝') + '</span></div>' +
      '<div class="row"><span class="rk">账号</span><span class="rv">' + w.account + '</span></div>' +
      '<div class="row"><span class="rk">申请时间</span><span class="rv">' + fmtTime(w.created_at) + '</span></div>' +
    '</div>' + btn +
  '</div>';
}

async function load() {
  const box = document.getElementById('invBody');
  if (tab === 'codes') {
    const j = await api('/invites');
    if (j.code !== 1) { box.innerHTML = '<div class="empty">加载失败</div>'; return; }
    const src = URL_Q ? j.data.filter(v => v.code.includes(URL_Q) || (v.email || '').includes(URL_Q)) : j.data;
    box.innerHTML = searchTag() + (src.length ? src.map(codeCard).join('') : '<div class="empty">暂无邀请码</div>');
  } else {
    const j = await api('/withdrawals');
    if (j.code !== 1) { box.innerHTML = '<div class="empty">加载失败</div>'; return; }
    const pending = j.data.filter(w => w.status === 0).length;
    const b = document.getElementById('cashBadge');
    if (b) b.textContent = pending ? pending : '';
    box.innerHTML = j.data.length ? j.data.map(cashCard).join('') : '<div class="empty">暂无提现申请</div>';
  }
}

function setRate(id, cur) {
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>调整分成比例</h2>' +
    '<div style="font-size:12px;color:#888;margin-bottom:16px">默认 15%。上调后只影响之后产生的返利，已结清的不追溯。</div>' +
    '<label>新比例（%）</label><input id="r_val" type="number" min="15" max="100" step="1" value="' + cur + '">' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="saveRate(' + id + ')">保存</button>' +
    '</div></div></div>';
}

async function saveRate(id) {
  const v = +document.getElementById('r_val').value;
  if (!v || v < 15 || v > 100) { toast('比例需在 15–100 之间'); return; }
  await api('/invites/set-rate', {method:'POST', body: JSON.stringify({id, rate:v})});
  toast('已调整到 ' + v + '%');
  closeModal();
  load();
}

async function reviewCash(id, status) {
  if (status === 1 && !confirm('确认已打款？')) return;
  if (status === 2 && !confirm('确认拒绝？')) return;
  await api('/withdrawals/review', {method:'POST', body: JSON.stringify({id, status})});
  toast(status === 1 ? '已通过' : '已拒绝');
  load();
}

load();
