if (!checkAuth()) throw 0;
renderShell('home');

const ACTION = {
  ban:      {icon:'🚫', txt:'封禁用户'},
  unban:    {icon:'✅', txt:'解除封禁'},
  grant:    {icon:'🎁', txt:'开通/续期'},
  add_days: {icon:'📅', txt:'加时长'},
  reset:    {icon:'🔄', txt:'重置流量'},
  withdraw: {icon:'💸', txt:'审核提现'},
  wallet_review: {icon:'💰', txt:'钱包审核'},
  notice:   {icon:'📢', txt:'发布公告'},
  banner:   {icon:'🖼', txt:'广告位变更'},
  plan:     {icon:'💰', txt:'套餐变更'},
  admin:    {icon:'🛡', txt:'管理员变更'},
  update_user: {icon:'✏️', txt:'修改用户'},
  batch_add_days: {icon:'📅', txt:'批量加天数'},
  batch_reset_traffic: {icon:'🔄', txt:'批量重置流量'},
  batch_ban: {icon:'🚫', txt:'批量封禁'},
  batch_unban: {icon:'✅', txt:'批量解封'},
  batch_delete: {icon:'🗑', txt:'批量删除'},
  order_void: {icon:'❌', txt:'订单作废'},
  order_mark_paid: {icon:'✅', txt:'订单标记已付'},
  order_refund: {icon:'↩️', txt:'订单退款'}
};

function fmtTime(ts) {
  if (!ts) return '';
  var d = new Date(ts * 1000);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' +
         String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
}

let allLogs = [];

async function load() {
  const j = await api('/logs');
  if (j.code !== 1) return;
  allLogs = j.data || [];
  render();
}

function render() {
  const box = document.getElementById('lgList');
  if (!allLogs.length) { box.innerHTML = '<div class="empty">暂无操作记录</div>'; return; }
  box.innerHTML = allLogs.map(l => {
    const a = ACTION[l.action] || {icon:'📝', txt: l.action};
    var ipLine = (l.ip || l.ua) ?
      '<div class="lg-ip" onclick="copyText(\'' + (l.ip||'') + '\')" style="font-size:11px;color:#1a73e8;margin-top:4px;word-break:break-all;cursor:pointer">IP：' + (l.ip || '—') + '</div>' : '';
    var uaLine = l.ua ?
      '<div class="lg-ua" style="font-size:11px;color:#aaa;margin-top:2px;word-break:break-all;line-height:1.5">' + l.ua.substring(0, 120) + (l.ua.length > 120 ? '…' : '') + '</div>' : '';
    return '<div class="lg-item" style="flex-direction:column;gap:6px">' +
      '<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<div class="lg-icon">' + a.icon + '</div>' +
        '<div class="lg-body" style="flex:1;min-width:0">' +
          '<div class="lg-line"><b>' + (l.admin || '管理员') + '</b> ' + a.txt + '</div>' +
          '<div class="lg-target">' + (l.target || '') + (l.detail ? ' · ' + l.detail : '') + '</div>' +
          '<div class="lg-time">' + fmtTime(l.created_at) + '</div>' +
        '</div>' +
      '</div>' +
      ipLine + uaLine +
    '</div>';
  }).join('');
}

load();
