
if (!checkAuth()) throw 0;
renderShell('plans');

var allPlans = [];
var filter = 'all';

function setFilter(f) {
  filter = f;
  document.querySelectorAll('.plans-filter .pf').forEach(function(el){
    el.classList.toggle('on', el.dataset.f === f);
  });
  render();
}

function planCard(p) {
  var gb = p.transfer_enable ? Math.round(p.transfer_enable / 1073741824) : 0;
  var typ = (p.type === 'onetime') ? '一次性' : '包月';
  var tagline = p.tagline || p.content || '';
  var feats = [];
  if (p.features) {
    if (Array.isArray(p.features)) feats = p.features;
    else {
      try { feats = JSON.parse(p.features); } catch(e) { feats = []; }
    }
  }
  var featsHTML = feats.map(function(f){ return '<li>' + f + '</li>'; }).join('');
  return '<div class="plan-card" onclick="editPlan(' + p.id + ')">' +
    '<div class="plan-head">' +
      '<div><span class="plan-name">' + (p.name || '') + '</span></div>' +
      '<div class="plan-badge ' + (p.show ? 'on' : 'off') + '">' + (p.show ? '上架' : '下架') + '</div>' +
    '</div>' +
    '<div class="plan-tag">' + typ + (tagline ? ' · ' + tagline : '') + '</div>' +
    '<div class="plan-main"><span class="num">' + fmtMoney(p.month_price) + '</span><span class="unit">/ 月</span></div>' +
    '<div class="plan-kv">' +
      '<div class="it"><div class="k">流量</div><div class="v">' + gb + ' GB</div></div>' +
      '<div class="it"><div class="k">速度</div><div class="v">' + (p.speed || '—') + '</div></div>' +
      '<div class="it"><div class="k">季付</div><div class="v">' + fmtMoney(p.quarter_price) + '</div></div>' +
    '</div>' +
    (featsHTML ? '<ul class="plan-feats">' + featsHTML + '</ul>' : '') +
  '</div>';
}

function render() {
  var list = allPlans;
  if (filter === 'monthly') list = allPlans.filter(function(p){ return (p.type || 'monthly') === 'monthly'; });
  if (filter === 'onetime') list = allPlans.filter(function(p){ return p.type === 'onetime'; });
  var box = document.getElementById('planList');
  if (!list.length) { box.innerHTML = '<div class="empty">暂无套餐</div>'; return; }
  box.innerHTML = list.map(planCard).join('');
}

function updateCounts() {
  var m = 0, o = 0;
  allPlans.forEach(function(p){
    if (p.type === 'onetime') o++;
    else m++;
  });
  document.querySelector('.pf[data-f="all"] .c').textContent = allPlans.length;
  document.querySelector('.pf[data-f="monthly"] .c').textContent = m;
  document.querySelector('.pf[data-f="onetime"] .c').textContent = o;
}

async function load() {
  var j = await api('/plans');
  if (j.code !== 1) {
    document.getElementById('planList').innerHTML = '<div class="empty">加载失败：' + (j.msg || '未知') + '</div>';
    return;
  }
  allPlans = j.data || [];
  updateCounts();
  render();
}

function editPlan(id) {
  var p = null;
  for (var i = 0; i < allPlans.length; i++) {
    if (allPlans[i].id === id) { p = allPlans[i]; break; }
  }
  if (!p) return;
  var feats = [];
  if (Array.isArray(p.features)) feats = p.features;
  else if (typeof p.features === 'string' && p.features) {
    try { feats = JSON.parse(p.features); } catch(e) { feats = []; }
  }
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>编辑套餐</h2>' +
    '<label>套餐名</label><input id="f_name" value="' + (p.name || '') + '">' +
    '<label>副标题</label><input id="f_tagline" value="' + (p.tagline || '') + '">' +
    '<label>流量(GB)</label><input id="f_gb" type="number" value="' + (p.transfer_enable ? (p.transfer_enable/1073741824).toFixed(0) : '') + '">' +
    '<label>月付(元)</label><input id="f_month" type="number" step="0.01" value="' + ((p.month_price||0)/100).toFixed(2) + '">' +
    '<label>速度</label><input id="f_speed" value="' + (p.speed || '') + '">' +
    '<label>类型</label><select id="f_type"><option value="monthly"' + ((p.type||'monthly')==='monthly'?' selected':'') + '>包月</option><option value="onetime"' + (p.type==='onetime'?' selected':'') + '>一次性</option></select>' +
    '<label>特性（一行一条）</label>' +
    '<textarea id="f_feats" rows="4" style="width:100%;padding:10px;border:1px solid #eaeaea;border-radius:8px;font-size:13px">' + feats.join(String.fromCharCode(10)) + '</textarea>' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="savePlan(' + p.id + ')">保存</button>' +
    '</div></div></div>';
}

async function savePlan(id) {
  var feats = document.getElementById('f_feats').value.split(String.fromCharCode(10)).map(function(s){ return s.trim(); }).filter(Boolean);
  var b = {
    id: id,
    name: document.getElementById('f_name').value,
    tagline: document.getElementById('f_tagline').value,
    content: document.getElementById('f_tagline').value,
    type: document.getElementById('f_type').value,
    transfer_enable: Math.round(+document.getElementById('f_gb').value * 1073741824),
    month_price: Math.round(+document.getElementById('f_month').value * 100),
    quarter_price: 0, half_year_price: 0, year_price: 0,
    speed: document.getElementById('f_speed').value,
    hot: 0, sort: id, show: 1,
    features: feats
  };
  var j = await api('/plans', {method: 'POST', body: JSON.stringify(b)});
  if (j.code === 1) { toast('已保存'); closeModal(); load(); }
}

load();
