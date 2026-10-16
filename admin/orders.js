if (!checkAuth()) throw 0;
renderShell('orders');

var URL_Q = new URLSearchParams(location.search).get('q') || '';
var URL_FILTER = new URLSearchParams(location.search).get('filter') || '';
var oSort = 'time_desc';
var timer = null;
var _lastList = [];

function setSort(v) { oSort = v; renderList(); }

function visibleOrders(list) {
  var now = Math.floor(Date.now() / 1000);
  var src = list.slice();
  if (URL_Q) src = src.filter(function(o){ return (o.trade_no || '').indexOf(URL_Q) > -1; });
  var out = src.filter(function(o){
    if (URL_FILTER === 'pending') return o.status === 0;
    return true;
  });
  if (oSort === 'amount_desc') out.sort(function(a,b){ return b.total_amount - a.total_amount; });
  else if (oSort === 'paid_first') out.sort(function(a,b){ return b.status - a.status; });
  else out.sort(function(a,b){ return b.created_at - a.created_at; });
  return out;
}

function fmtRemain(created_at) {
  var now = Math.floor(Date.now() / 1000);
  var left = 600 - (now - created_at);
  if (left < 0) left = 0;
  var m = String(Math.floor(left / 60)).padStart(2, '0');
  var s = String(left % 60).padStart(2, '0');
  return m + ':' + s;
}

function orderCard(o) {
  var paid = o.status === 1;
  var st = paid ? '已支付' : '待支付';
  var cls = paid ? 'active' : 'none';
  var mLabel = o.method === 'usdt' ? 'USDT' : (o.method === 'alipay' ? '支付宝' : '—');
  var remain = paid ? '' :
    '<div class="stat" style="color:#e74c3c"><div class="k">剩余</div><div class="v" data-remain="' + o.created_at + '">' + fmtRemain(o.created_at) + '</div></div>';

  return '<div class="u-card">' +
    '<div class="row1">' +
      '<div class="email" style="font-size:13px" onclick="copyText(\'' + o.trade_no + '\')">' + o.trade_no + '  📋</div>' +
      '<div class="tag ' + cls + '">' + st + '</div>' +
    '</div>' +
    '<div class="stats">' +
      '<div class="stat"><div class="k">用户</div><div class="v" style="font-size:11px;word-break:break-all">' + (o.user_email || ('#' + o.user_id)) + '</div></div>' +
      '<div class="stat"><div class="k">金额</div><div class="v">' + fmtMoney(o.total_amount) + '</div></div>' +
      '<div class="stat"><div class="k">方式</div><div class="v">' + mLabel + '</div></div>' +
      '<div class="stat"><div class="k">时间</div><div class="v">' + fmtTime(o.created_at) + '</div></div>' +
      remain +
    '</div>' +
    '<div class="ord-actions">' +
      (o.status === 0 ? '<button class="oa-pay" onclick="event.stopPropagation();manualPay(\'' + o.trade_no + '\')">标记已付</button>' : '') +
      (o.status === 1 ? '<button class="oa-refund" onclick="event.stopPropagation();refund(\'' + o.trade_no + '\')">退款</button>' : '') +
      '<button class="oa-cancel" onclick="event.stopPropagation();voidOrder(\'' + o.trade_no + '\')">作废</button>' +
    '</div>' +
  '</div>';
}

function renderList() {
  var box = document.getElementById('orderList');
  if (!box) return;
  var list = visibleOrders(_lastList);
  var h = '<div class="section-title" style="display:flex;align-items:center;justify-content:space-between">共 <span class="count">' + list.length + '</span> 条订单<span style="font-size:12px;color:#1a73e8;cursor:pointer" onclick="exportOrders()">导出 CSV</span></div>';
  if (!list.length) h += '<div class="empty">暂无订单</div>';
  for (var i = 0; i < list.length; i++) h += orderCard(list[i]);
  box.innerHTML = h;
}

async function load() {
  var j = await api('/orders');
  if (j.code !== 1) {
    document.getElementById('content').innerHTML = '<div class="empty">加载失败</div>';
    return;
  }
  _lastList = j.data || [];
  var title = '<div style="display:flex;gap:8px;margin-bottom:12px">' +
    '<select id="oSort" onchange="setSort(this.value)" style="flex:1;padding:9px 12px;border:1px solid #eaeaea;border-radius:10px;font-size:13px;background:#fff">' +
      '<option value="time_desc"' + (oSort==='time_desc'?' selected':'') + '>最新订单</option>' +
      '<option value="amount_desc"' + (oSort==='amount_desc'?' selected':'') + '>金额最高</option>' +
      '<option value="paid_first"' + (oSort==='paid_first'?' selected':'') + '>已付优先</option>' +
    '</select></div>';
  document.getElementById('content').innerHTML = title + '<div id="orderList"></div>';
  renderList();

  clearInterval(timer);
  timer = setInterval(function(){
    var now = Math.floor(Date.now() / 1000);
    document.querySelectorAll('[data-remain]').forEach(function(el){
      var created = +el.dataset.remain;
      var left = 600 - (now - created);
      if (left < 0) left = 0;
      var m = String(Math.floor(left / 60)).padStart(2, '0');
      var s = String(left % 60).padStart(2, '0');
      el.textContent = m + ':' + s;
    });
  }, 1000);
}

async function manualPay(trade_no) {
  if (!(await cConfirm('确认标记该订单已支付？'))) return;
  await api('/orders/mark-paid', {method:'POST', body: JSON.stringify({trade_no})});
  toast('已标记');
  load();
}
async function refund(trade_no) {
  if (!(await cConfirm('确认退款？'))) return;
  await api('/orders/refund', {method:'POST', body: JSON.stringify({trade_no})});
  toast('已退款');
  load();
}
async function voidOrder(trade_no) {
  if (!(await cConfirm('确认作废？'))) return;
  await api('/orders/void', {method:'POST', body: JSON.stringify({trade_no})});
  toast('已作废');
  load();
}

function exportOrders() {
  api('/orders').then(function(r){
    if (r.code !== 1) return;
    var rows = [['订单号','用户ID','套餐ID','周期','支付方式','金额(元)','状态','创建时间']];
    for (var i = 0; i < r.data.length; i++) {
      var o = r.data[i];
      rows.push([o.trade_no, o.user_id, o.plan_id, o.period, o.method || '', (o.total_amount/100).toFixed(2), o.status === 1 ? '已支付' : '待支付', fmtTime(o.created_at)]);
    }
    var csv = '\ufeff' + rows.map(function(row){ return row.map(function(c){ return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join(String.fromCharCode(10));
    var blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'orders_' + Date.now() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    toast('已导出');
  });
}

load();
