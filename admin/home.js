if (!checkAuth()) throw 0;
renderShell('home');

function switchTab(el) {
  document.querySelectorAll('.dash-tabs .tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
}

function renderStats(d) {
  const cards = [
    {k:'总用户',   v:d.total_users,     to:'users.html'},
    {k:'今日新增', v:d.today_users,     to:'users.html'},
    {k:'APP 下载', v:d.total_downloads, to:'downloads.html'},
    {k:'今日下载', v:d.today_downloads, to:'downloads.html'},
    {k:'总订单',   v:d.total_orders,    to:'orders.html'},
    {k:'今日订单', v:d.today_orders,    to:'orders.html'}
  ];
  document.getElementById('statGrid').innerHTML = cards.map(c =>
    `<div class="stat-card" onclick="go('${c.to}')">
      <div class="k">${c.k}</div>
      <div class="v">${c.v == null ? '—' : c.v}</div>
    </div>`).join('');

  const f = c => c == null ? '—' : '¥' + (c/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('todayUsdt').textContent   = f(d.today_usdt);
  document.getElementById('todayAlipay').textContent = f(d.today_alipay);
  document.getElementById('todayTotal').textContent  = f((d.today_usdt||0)+(d.today_alipay||0));
  document.getElementById('allUsdt').textContent     = f(d.all_usdt);
  document.getElementById('allAlipay').textContent   = f(d.all_alipay);

  const now = new Date();
  document.getElementById('todayDate').textContent =
    String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
}

api('/dashboard').then(j => renderStats(j.code === 1 ? j.data : {}));


// ===== 深度指标 =====
async function loadDeep() {
  var box = document.getElementById('deepGrid');
  if (!box) return;
  var j = await api('/stats/overview');
  if (j.code !== 1) { box.innerHTML = ''; return; }
  var d = j.data || {};

  var pct = function(v){ return (v==null?0:v).toFixed(1)+'%'; };
  var yuan = function(v){ return '¥'+(v==null?0:v).toFixed(2); };

  var cards = [
    { k:'付费转化率', v: pct(d.conversion_rate), sub: d.paid_users+' / '+d.users_total+' 用户', to:'users.html' },
    { k:'ARPU',       v: yuan(d.arpu),           sub:'人均收入',                       to:'orders.html' },
    { k:'ARPPU',      v: yuan(d.arppu),          sub:'付费用户人均',                    to:'orders.html' },
    { k:'复购率',     v: pct(d.repeat_rate),     sub: d.repeat_users+' 位复购',         to:'orders.html' },
    { k:'7 日留存',   v: pct(d.retention_7d),    sub:'样本 '+d.cohort_7d+' 人',         to:'users.html' },
    { k:'邀请占比',   v: pct(d.invite_ratio),    sub:'邀请 '+d.invited_users+' / 自然 '+d.organic_users, to:'invites.html' }
  ];

  box.innerHTML = cards.map(function(c){
    return '<div class="stat-card" onclick="go(\''+c.to+'\')">' +
      '<div class="k">'+c.k+'</div>' +
      '<div class="v">'+c.v+'</div>' +
      '<div class="k" style="font-size:11px;font-weight:400;margin-top:2px;color:#999">'+c.sub+'</div>' +
    '</div>';
  }).join('');
}
loadDeep();


// ===== APP 当前轮播广告预览 =====
let adList = [], adIdx = 0, adTimer = null;

async function loadAds() {
  const j = await api('/banners');
  if (j.code !== 1) return;
  adList = (j.data || []).filter(b => b.show);
  renderAds();
}

function mediaSlot(b, i) {
  const on = i === 0 ? ' on' : '';
  if (b.type === 'video') {
    return '<video class="ad-media' + on + '" data-i="' + i + '" src="' + b.media + '" muted autoplay loop playsinline></video>';
  }
  return '<img class="ad-media' + on + '" data-i="' + i + '" src="' + b.media + '">';
}

function capSlot(b, i) {
  if (!b.title && !b.subtitle) return '';
  return '<div class="ad-cap' + (i === 0 ? ' on' : '') + '" data-i="' + i + '">' +
    (b.title ? '<div class="t">' + b.title + '</div>' : '') +
    (b.subtitle ? '<div class="s">' + b.subtitle + '</div>' : '') +
  '</div>';
}

function renderAds() {
  const box = document.getElementById('adPreview');
  if (!box) return;
  const head = '<div class="ad-sec-head"><div class="ad-sec-title">APP 轮播广告</div>' +
    '<div class="ad-sec-more" onclick="go(\'banners.html\')">管理 →</div></div>';

  if (!adList.length) {
    box.innerHTML = '<div class="ad-sec">' + head +
      '<div class="ad-box"><div class="ad-empty"><div>📷</div><div>暂无广告，去添加</div></div></div></div>';
    return;
  }
  const medias = adList.map(mediaSlot).join('');
  const caps = adList.map(capSlot).join('');
  const dots = adList.map((_, i) =>
    '<div class="d' + (i === 0 ? ' on' : '') + '" data-i="' + i + '"></div>').join('');
  box.innerHTML = '<div class="ad-sec">' + head +
    '<div class="ad-box" onclick="clickAd()">' + medias + caps + '</div>' +
    '<div class="ad-dots">' + dots + '</div></div>';

  clearInterval(adTimer);
  if (adList.length > 1) adTimer = setInterval(nextAd, 4000);
}

function nextAd() {
  adIdx = (adIdx + 1) % adList.length;
  document.querySelectorAll('.ad-media').forEach(el => {
    const on = +el.dataset.i === adIdx;
    el.classList.toggle('on', on);
    if (el.tagName === 'VIDEO') { on ? el.play().catch(()=>{}) : el.pause(); }
  });
  document.querySelectorAll('.ad-cap').forEach(el =>
    el.classList.toggle('on', +el.dataset.i === adIdx));
  document.querySelectorAll('.ad-dots .d').forEach(el =>
    el.classList.toggle('on', +el.dataset.i === adIdx));
}

function clickAd() {
  const b = adList[adIdx];
  if (b && b.link) window.open(b.link, '_blank');
}

loadAds();


// ===== 搜索跳转 =====
function doSearch() {
  const kw = (document.getElementById('kw').value || '').trim();
  if (!kw) { toast('输入邮箱 / 订单号 / 邀请码'); return; }
  if (kw.includes('@')) {
    go('users.html?q=' + encodeURIComponent(kw));
  } else if (/^LY/i.test(kw)) {
    go('orders.html?q=' + encodeURIComponent(kw));
  } else if (/^LYN/i.test(kw) || /^[A-Z0-9]{4,10}$/.test(kw)) {
    go('invites.html?q=' + encodeURIComponent(kw));
  } else {
    go('users.html?q=' + encodeURIComponent(kw));
  }
}
window.doSearch = doSearch;
document.addEventListener('DOMContentLoaded', () => {
  const kw = document.getElementById('kw');
  if (kw) kw.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
});

// ===== 趋势图表 =====
var trendData = [];
var chartMode = 'income';

async function loadTrend() {
  var j = await api('/stats/trend?days=30');
  if (j.code !== 1) return;
  trendData = j.data || [];
  renderChart();
}

function switchChart(k) {
  chartMode = k;
  document.querySelectorAll('.chart-tabs .ct').forEach(function(el){
    el.classList.toggle('on', el.dataset.k === k);
  });
  renderChart();
}

function renderChart() {
  var box = document.getElementById('trendChart');
  if (!box) return;
  if (!trendData.length) {
    box.innerHTML = '<div style="color:#aaa;font-size:12px;padding:20px 0;text-align:center;width:100%">暂无数据</div>';
    return;
  }
  var vals = trendData.map(function(d){ return d[chartMode] || 0; });
  var max = Math.max.apply(null, vals.concat([1]));
  box.innerHTML = trendData.map(function(d, i){
    var v = d[chartMode] || 0;
    var h = Math.max(2, Math.round(v / max * 90));
    return '<div class="bar" style="height:' + h + 'px" title="' + d.date + ': ' + v + '"></div>';
  }).join('');

  var total = vals.reduce(function(a,b){ return a+b; }, 0);
  var avg = (total / vals.length).toFixed(1);
  var peak = Math.max.apply(null, vals);
  var label = {income: '元', users: '人', orders: '单'}[chartMode] || '';
  document.getElementById('chartSum').innerHTML =
    '<div class="it"><div class="k">累计</div><div class="v">' + (chartMode === 'income' ? '¥' : '') + total.toFixed(chartMode === 'income' ? 2 : 0) + label + '</div></div>' +
    '<div class="it"><div class="k">日均</div><div class="v">' + avg + label + '</div></div>' +
    '<div class="it"><div class="k">最高</div><div class="v">' + peak + label + '</div></div>';
}

loadTrend();


// ===== 待办事项 =====
async function loadTodo() {
  var box = document.getElementById('todoBox');
  if (!box) return;
  var j = await api('/todo');
  if (j.code !== 1) { box.innerHTML = ''; return; }
  var d = j.data || {};

  var items = [
    { k: '待处理订单',   v: d.pending_orders,      to: 'orders.html?filter=pending' },
    { k: '待审核提现',   v: d.pending_withdraw, to: 'withdrawals.html' },
    { k: '未读工单',     v: d.pending_ticket,      to: 'chat.html' },
    { k: '即将过期用户',   v: d.expiring_users,       to: 'users.html?expired=1' }
  ].filter(function(it){ return it.v > 0; });

  if (!items.length) { box.innerHTML = ''; return; }

  box.innerHTML = '<div class="todo-box">' +
    '<div class="todo-head">待办事项</div>' +
    '<div class="todo-list">' +
    items.map(function(it){
      return '<div class="todo-item" onclick="go(\'' + it.to + '\')">' +
        '<span>' + it.k + '</span>' +
        '<span class="num">' + it.v + '</span>' +
      '</div>';
    }).join('') +
    '</div></div>';
}

loadTodo();
