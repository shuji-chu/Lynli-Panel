const API = '/api/v1/admin';
const MOCK = false;   // ← 接后端后改成 false

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
function getToken() { return localStorage.getItem('admin_token') || ''; }
function getAdmin() {
  try { return JSON.parse(localStorage.getItem('lynli_admin') || '{}'); }
  catch (e) { return {}; }
}
function checkAuth() {
  const a = getAdmin();
  if (!a.email && !getToken()) { location.href = 'index.html'; return false; }
  return true;
}
function logout() {
  if (!confirm('确定退出登录？')) return;
  localStorage.removeItem('admin_token');
  localStorage.removeItem('lynli_admin');
  localStorage.removeItem('lynli_remember');
  location.href = 'index.html';
}

const MOCK_DB = {
  '/todo': {pending_withdraw:1, pending_ticket:2, expiring_users:3},

  '/logs': [
    {id:1, admin:'小初', action:'ban',      target:'bob@lynli.com',  detail:'封禁用户',        created_at:Math.floor(Date.now()/1000)-3600},
    {id:2, admin:'小初', action:'grant',    target:'demo@lynli.com', detail:'开通月付 30 天',   created_at:Math.floor(Date.now()/1000)-7200},
    {id:3, admin:'王总', action:'withdraw', target:'demo@lynli.com', detail:'审核提现 ¥30 通过', created_at:Math.floor(Date.now()/1000)-86400}
  ],
  '/quick_replies': [
    {id:1, text:'您好，请问遇到什么问题了呢？'},
    {id:2, text:'好的，我马上帮您处理，请稍等。'},
    {id:3, text:'已经为您处理完成，还有其他问题吗？'},
    {id:4, text:'您的订阅快到期了，续费请点 APP 首页「购买订阅」。'},
    {id:5, text:'如需退款请提供订单号，我们会尽快审核。'}
  ],

  '/bot_users': {
    safew: [
      {tg_id:'11237436', nickname:'睡不醒的宝', traffic_mb:1725, expire:1791820800, suser:'u890d64', spass:'t3e2fageptd8', last_sign:'2026-10-12', activated:1, inviter:0, invite_count:0, balance:0},
      {tg_id:'14492605', nickname:'SOCKS5高速代理', traffic_mb:0, expire:0, suser:'', spass:'', last_sign:'2026-10-11', activated:1, inviter:0, invite_count:0, balance:0},
      {tg_id:'14666717', nickname:'星汇国际代理乐GG', traffic_mb:0, expire:0, suser:'', spass:'', last_sign:'2026-10-09', activated:1, inviter:0, invite_count:0, balance:0},
      {tg_id:'10793999', nickname:'囡囡', traffic_mb:0, expire:0, suser:'', spass:'', last_sign:'2026-10-04', activated:1, inviter:0, invite_count:0, balance:0},
      {tg_id:'14553757', nickname:'ZZZ', traffic_mb:0, expire:0, suser:'', spass:'', last_sign:'2026-10-01', activated:1, inviter:0, invite_count:0, balance:0},
      {tg_id:'14051706', nickname:'', traffic_mb:0, expire:0, suser:'', spass:'', last_sign:'2026-10-03', activated:1, inviter:0, invite_count:0, balance:0},
      {tg_id:'14941094', nickname:'大海的味道', traffic_mb:0, expire:0, suser:'', spass:'', last_sign:'', activated:1, inviter:0, invite_count:0, balance:0}
    ],
    mivra: [
      {tg_id:'1780243559', nickname:'晴天', traffic_mb:1778, expire:1791767360, suser:'ub90d67', spass:'cfpwybgvbfmw', last_sign:'2026-10-11', activated:1, inviter:'1780243568', invite_count:0, balance:0},
      {tg_id:'1780243568', nickname:'vpn88', traffic_mb:0, expire:0, suser:'', spass:'', last_sign:'2026-10-10', activated:1, inviter:0, invite_count:1, balance:0.625},
      {tg_id:'1780243238', nickname:'天涯', traffic_mb:0, expire:0, suser:'', spass:'', last_sign:'', activated:1, inviter:0, invite_count:0, balance:0}
    ],
    qingtian: [
      {tg_id:'10001', nickname:'qingtian_user', traffic_mb:500, expire:1790000000, suser:'ub90d67', spass:'cfpwybgvbfmw', last_sign:'2026-10-12', activated:1, inviter:'10000', invite_count:3, balance:12.5},
      {tg_id:'10002', nickname:'tg_agent_01', traffic_mb:2100, expire:1791500000, suser:'u920a12', spass:'kbm7tqsv', last_sign:'2026-10-12', activated:1, inviter:'10001', invite_count:1, balance:5.2}
    ]
  },
  '/bot_stats': {
    safew:    {total:31, today_sign:9,  active_agents:14, paid_users:0, total_orders:0, today_orders:0, today_income:0, total_income:0},
    mivra:    {total:22, today_sign:6,  active_agents:8,  paid_users:0, total_orders:0, today_orders:0, today_income:0, total_income:0},
    qingtian: {total:18, today_sign:4,  active_agents:3,  paid_users:0, total_orders:0, today_orders:0, today_income:0, total_income:0}
  },

  '/bots': [
    {id:1, key:'safew',    name:'SafeW',     handle:'@qishe77',    link:'https://safew.example.com/qishe77',    online:true,  msgs_today:38, msgs_total:1240, staff:2, status:1},
    {id:2, key:'mivra',    name:'Mivra',     handle:'@vpn88',      link:'https://mivra.example.com/vpn88',      online:true,  msgs_today:22, msgs_total:806,  staff:1, status:1},
    {id:3, key:'telegram', name:'Telegram',  handle:'@qingtian_boss', link:'https://t.me/qingtian_boss',        online:false, msgs_today:0,  msgs_total:2130, staff:3, status:0}
  ],

  '/nodes': [
    {id:1, name:'香港 01', region:'HK', host:'hk1.lynli.com', online:186, accounts:210, traffic_today:107374182400, load:23, status:1},
    {id:2, name:'香港 02', region:'HK', host:'hk2.lynli.com', online:142, accounts:160, traffic_today:83886080000,  load:18, status:1},
    {id:3, name:'日本 01', region:'JP', host:'jp1.lynli.com', online:98,  accounts:105, traffic_today:64424509440,  load:31, status:1},
    {id:4, name:'美国 01', region:'US', host:'us1.lynli.com', online:0,   accounts:0,   traffic_today:0,            load:0,  status:0},
    {id:5, name:'新加坡 01', region:'SG', host:'sg1.lynli.com', online:57, accounts:70, traffic_today:32212254720, load:12, status:1}
  ],
  '/notices': [
    {id:1, type:'normal', title:'系统维护通知', content:'10 月 15 日凌晨 2:00-4:00 香港节点例行维护，期间可能短暂断线，敬请谅解。', start_at:Math.floor(Date.now()/1000), end_at:Math.floor(Date.now()/1000)+86400*7, status:1, created_at:Math.floor(Date.now()/1000)-3600},
    {id:2, type:'activity', title:'双十一活动', content:'11 月 1-11 日，年付套餐 8 折优惠，新老用户同享。', start_at:Math.floor(Date.now()/1000)+86400*15, end_at:Math.floor(Date.now()/1000)+86400*26, status:1, created_at:Math.floor(Date.now()/1000)-7200},
    {id:3, type:'update', title:'v1.0.1 版本更新', content:'修复部分机型闪退，优化连接速度。', start_at:Math.floor(Date.now()/1000)-86400, end_at:Math.floor(Date.now()/1000)+86400*30, status:1, created_at:Math.floor(Date.now()/1000)-86400}
  ],

  '/invites': [
    {id:1, code:'LYN8A2K', user_id:1, email:'demo@lynli.com',  pv:48, signups:6, reward:6000, rate:15, status:1, created_at:1760000000},
    {id:2, code:'LYNQ7X9', user_id:2, email:'alice@lynli.com', pv:12, signups:2, reward:2000, rate:15, status:1, created_at:1760100000},
    {id:3, code:'LYN3M5P', user_id:3, email:'bob@lynli.com',   pv:0,  signups:0, reward:0,    rate:15, status:0, created_at:1760200000}
  ],
  '/withdrawals': [
    {id:1, user_id:1, email:'demo@lynli.com',  amount:3000, method:'alipay', account:'xiaochu@163.com', status:0, created_at:1760300000},
    {id:2, user_id:2, email:'alice@lynli.com', amount:1000, method:'usdt',   account:'TQn9...8xKz',     status:1, created_at:1760200000}
  ],

  '/users': [
    {id:1, email:'demo@lynli.com',  nickname:'小初',  plan_id:1, node_id:1, node_user:'u890d64', node_pass:'t3e2fageptd8', expired_at: 1799999999, u:1073741824, d:5368709120, banned:0, created_at:Math.floor(Date.now()/1000) - 86400*200},
    {id:2, email:'alice@lynli.com', nickname:'Alice', plan_id:2, node_id:2, node_user:'ub90d67', node_pass:'cfpwybgvbfmw', expired_at: 1762000000, u:2147483648, d:10737418240, banned:0, created_at:Math.floor(Date.now()/1000) - 86400*100},
    {id:3, email:'bob@lynli.com',   nickname:'',      plan_id:0, node_id:0, node_user:'',         node_pass:'',           expired_at: 0,          u:0,          d:0,          banned:1, created_at:Math.floor(Date.now()/1000) - 3600*3}
  ],
  '/plans': [
    {id:1, type:'monthly', name:'轻量', tagline:'包月 200G', price:1800, transfer_gb:200, speed:'300 Mbps', hot:false, features:['解锁流媒体','Simple 中转隧道','赠送 EMBY 影视库','不限制设备'], sort:1, show:1},
    {id:2, type:'monthly', name:'冲浪', tagline:'包月 500G', price:3800, transfer_gb:500, speed:'500 Mbps', hot:false, features:['解锁流媒体','Simple 中转隧道','赠送 EMBY 影视库','不限制设备'], sort:2, show:1},
    {id:3, type:'monthly', name:'豪华', tagline:'包月 800G', price:5800, transfer_gb:800, speed:'800 Mbps', hot:true,  features:['解锁流媒体','Simple 中转隧道','赠送 EMBY 影视库','不限制设备'], sort:3, show:1},
    {id:4, type:'monthly', name:'大师', tagline:'包月 1200G', price:7800, transfer_gb:1200, speed:'1000 Mbps', hot:false, features:['解锁流媒体','Simple 中转隧道','赠送 EMBY 影视库','不限制设备'], sort:4, show:1},
    {id:5, type:'onetime', name:'轻量', tagline:'不限时 1000G', price:13800, transfer_gb:1000, speed:'300 Mbps', hot:false, features:['解锁流媒体','Simple 中转隧道','不限制设备'], sort:5, show:1},
    {id:6, type:'onetime', name:'冲浪', tagline:'不限时 2000G', price:25800, transfer_gb:2000, speed:'500 Mbps', hot:false, features:['解锁流媒体','Simple 中转隧道','不限制设备'], sort:6, show:1},
    {id:7, type:'onetime', name:'高级', tagline:'不限时 3000G', price:36800, transfer_gb:3000, speed:'800 Mbps', hot:true,  features:['解锁流媒体','Simple 中转隧道','不限制设备'], sort:7, show:1},
    {id:8, type:'onetime', name:'豪华', tagline:'不限时 6000G', price:68800, transfer_gb:6000, speed:'1000 Mbps', hot:false, features:['解锁流媒体','Simple 中转隧道','不限制设备'], sort:8, show:1},
    {id:9, type:'onetime', name:'大师', tagline:'不限时 9000G', price:89800, transfer_gb:9000, speed:'1000 Mbps', hot:false, features:['解锁流媒体','Simple 中转隧道','不限制设备'], sort:9, show:1}
  ],
  '/orders': [
    {id:1, trade_no:'LY20261012001', user_id:1, plan_id:1, period:'month', method:'alipay', total_amount:1500,  status:1, created_at:Math.floor(Date.now()/1000) - 3600*2},
    {id:2, trade_no:'LY20261012002', user_id:2, plan_id:2, period:'year',  method:'usdt',   total_amount:28000, status:1, created_at:Math.floor(Date.now()/1000) - 3600*8},
    {id:3, trade_no:'LY20261012003', user_id:1, plan_id:2, period:'month', method:'alipay', total_amount:3000,  status:1, created_at:Math.floor(Date.now()/1000) - 3600*24},
    {id:4, trade_no:'LY20261012004', user_id:3, plan_id:1, period:'year',  method:'alipay', total_amount:1500,  status:0, created_at:Math.floor(Date.now()/1000) - 120}
  ],
  '/banners': [
    {id:1, type:'image', media:'https://via.placeholder.com/900x300/e94a8a/fff?text=Netflix+解锁', title:'流媒体全解锁', subtitle:'Netflix / Disney+ / HBO 稳定不掉线', link:'https://example.com/plans', sort:1, show:1},
    {id:2, type:'image', media:'https://via.placeholder.com/900x300/1a73e8/fff?text=新用户福利', title:'新用户首月 5 折', subtitle:'限时活动，先到先得', link:'https://example.com/new', sort:2, show:1},
    {id:3, type:'video', media:'https://www.w3schools.com/html/mov_bbb.mp4', title:'产品演示', subtitle:'30 秒看懂怎么用', link:'', sort:3, show:1},
    {id:4, type:'image', media:'https://via.placeholder.com/900x300/0a9f52/fff?text=已隐藏', title:'已下架', subtitle:'', link:'', sort:4, show:0}
  ],
  '/admins': [
    {id:1, email:'xiaochu520@lynli.com', nickname:'小初',   role:'super',   created_at:1760000000},
    {id:2, email:'boss@lynli.com',       nickname:'王总',   role:'partner', created_at:1760050000},
    {id:3, email:'work@lynli.com',       nickname:'小李',   role:'staff',   created_at:1760100000}
  ],
  '/ticket/list': [
    {id:1, user_id:1, email:'demo@lynli.com',  handoff:0, updated_at:1760300000},
    {id:2, user_id:2, email:'alice@lynli.com', handoff:1, updated_at:1760310000}
  ],
  '/ticket/messages': [
    {id:1, ticket_id:1, sender:'user',  content:'你好，我的订阅到期了怎么续费？', created_at:1760300000},
    {id:2, ticket_id:1, sender:'ai',    content:'您好，可以直接在 APP 内购买套餐哦～', created_at:1760300010},
    {id:3, ticket_id:1, sender:'user',  content:'好的谢谢', created_at:1760300020}
  ],
  '/downloads': [
    {id:1, ver:'v1.0.0', channel:'官网',     count:520, last:'10-10 12:30'},
    {id:2, ver:'v1.0.0', channel:'应用商店', count:322, last:'10-12 09:15'}
  ],
  '/dashboard': {
    total_users: 128, today_users: 3,
    total_downloads: 842, today_downloads: 12,
    total_orders: 46, today_orders: 5,
    today_usdt: 120000, today_alipay: 48000,
    all_usdt: 840000, all_alipay: 320000
  }
};

function buildDashboard() {
  const users = MOCK_DB['/users'] || [];
  const orders = MOCK_DB['/orders'] || [];
  const dls = MOCK_DB['/downloads'] || [];
  const t0 = Math.floor(new Date().setHours(0,0,0,0)/1000);
  const paid = orders.filter(o => o.status === 1);
  const sum = (arr) => arr.reduce((s, x) => s + (x.total_amount || 0), 0);
  return {
    total_users: users.length,
    today_users: users.filter(u => u.created_at >= t0).length,
    total_downloads: dls.reduce((s, d) => s + (d.count || 0), 0),
    today_downloads: 0,
    total_orders: orders.length,
    today_orders: orders.filter(o => o.created_at >= t0).length,
    today_usdt: sum(paid.filter(o => o.method === 'usdt' && o.created_at >= t0)),
    today_alipay: sum(paid.filter(o => o.method === 'alipay' && o.created_at >= t0)),
    all_usdt: sum(paid.filter(o => o.method === 'usdt')),
    all_alipay: sum(paid.filter(o => o.method === 'alipay'))
  };
}

// 后端已经做好的接口，走真数据；其他走假数据
const REAL_PATHS = [
  // 用户
  '/users', '/users/grant', '/users/add-days', '/users/reset-traffic',
  '/users/ban', '/users/delete', '/users/update',
  // 套餐
  '/plans', '/plans/delete',
  // 订单
  '/orders', '/orders/mark-paid', '/orders/refund', '/orders/void',
  // 广告
  '/banners', '/banners/delete',
  // 首页
  '/dashboard', '/todo',
  // 管理员
  '/admins', '/admins/save', '/admins/delete', '/admins/password',
  // 邀请 / 提现
  '/invites', '/invites/set-rate', '/withdrawals', '/withdrawals/review',
  // 公告
  '/notices', '/notices/delete',
  // 日志
  '/logs',
  // 客服
  '/ticket/list', '/ticket/messages', '/ticket/handoff', '/ticket/reply',
  // 机器人
  '/bots', '/bots/toggle', '/bot_users', '/bot_stats',
  // 节点
  '/nodes', '/nodes/stats', '/nodes/clients', '/nodes/add-client', '/nodes/del-client',
  // 活动
  '/activities', '/activities/delete',
  // 兑换码
  '/redeem_codes', '/redeem_codes/toggle', '/redeem_codes/delete',
  // 支付配置
  '/payment_configs',
  // 上传
  '/upload'
];

async function api(path, opts = {}) {
  const key = path.split('?')[0];
  const useReal = !MOCK || REAL_PATHS.includes(key);
  if (!useReal) {
    const qs = path.split('?')[1];
    const q = new URLSearchParams(qs || '');
    if (key === '/dashboard') return {code: 1, data: buildDashboard()};
    if (key === '/bot_users') {
      const bot = q.get('bot');
      return {code: 1, data: (MOCK_DB['/bot_users'][bot] || [])};
    }
    if (key === '/bot_stats') {
      const bot = q.get('bot');
      if (bot) return {code: 1, data: MOCK_DB['/bot_stats'][bot] || {}};
      return {code: 1, data: MOCK_DB['/bot_stats']};
    }
    const data = MOCK_DB[key];
    if (data) return {code: 1, data: Array.isArray(data) ? data : data};
    return {code: 1, data: []};
  }
  const res = await fetch(API + path, {
    ...opts,
    headers: {'Content-Type':'application/json','Authorization':getToken(), ...(opts.headers||{})}
  });
  if (res.status === 401) { console.warn('401', path); return {code: 0, msg: '未授权'}; }
  return res.json();
}

function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function fmtSize(bytes) {
  if (!bytes) return '0 GB';
  const g = bytes/1024/1024/1024;
  if (g >= 1024) return (g/1024).toFixed(1)+' TB';
  return g.toFixed(1)+' GB';
}
function fmtMoney(cents) {
  if (cents == null) return '-';
  return '¥' + (cents/100).toFixed(2);
}

function renderShell(active) {
  const a = getAdmin();
  const name = a.name || '管理员';
  const roleMap = {super:'超级管理员', operator:'运营', service:'客服'};
  const roleText = roleMap[a.role] || '管理员';
  const initial = (name.replace(/\s/g,'').slice(0,1)) || '管';

  const bar = document.getElementById('topbar');
  if (bar) bar.innerHTML =
    '<div class="brand"><div class="mini"><img src="logo.png" alt=""></div>Lynli</div>' +
    '<button class="user-btn" onclick="toggleMenu()">' + initial + '</button>';

  const old = document.getElementById('menu');
  if (old) old.remove();

  // 遮罩
  let mask = document.getElementById('menuMask');
  if (!mask) {
    mask = document.createElement('div');
    mask.className = 'menu-mask';
    mask.id = 'menuMask';
    mask.onclick = closeMenu;
    document.body.appendChild(mask);
  }

  const oldMenu = document.getElementById('menu');
  if (oldMenu) oldMenu.remove();

  const m = document.createElement('div');
  m.className = 'menu hidden';
  m.id = 'menu';

  function ic(path) {
    return '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></span>';
  }
  const I = {
    ad:     '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    bell:   '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    invite: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    act:    '<path d="M12 2l3 6 6 .5-4.5 4 1.3 6-5.8-3-5.8 3 1.3-6L3 8.5 9 8z"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    coupon: '<circle cx="9" cy="9" r="6"/><path d="M21 21l-6-6"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
    cash:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h6M9 14h6"/>',
    node:   '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/>',
    server: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
    bot:    '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/>',
    pay:    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    log:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    admin:  '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/>',
    me:     '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
    out:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'
  };

  m.innerHTML =
    '<div class="mhead">' +
      '<div class="who">' + (a.email || '未登录') + '</div>' +
      '<div class="role">' + roleText + '</div>' +
    '</div>' +

    '<div class="msec">运营</div>' +
    '<div class="mi" onclick="go(\'banners.html\')">' + ic(I.ad) + '广告位管理</div>' +
    '<div class="mi" onclick="go(\'notices.html\')">' + ic(I.bell) + '公告推送</div>' +
    '<div class="mi" onclick="go(\'invites.html\')">' + ic(I.invite) + '邀请管理</div>' +
    '<div class="mi" onclick="go(\'invite-tree.html\')">' + ic(I.invite) + '邀请树</div>' +
    '<div class="mi" onclick="go(\'activities.html\')">' + ic(I.act) + '活动配置</div>' +
    '<div class="mi" onclick="go(\'redeem.html\')">' + ic(I.ticket) + '兑换码</div>' +
    '<div class="mi" onclick="go(\'coupons.html\')">' + ic(I.coupon) + '优惠码</div>' +
    '<div class="mi" onclick="go(\'mail.html\')">' + ic(I.bell) + '邮件群发</div>' +

    '<div class="msec">审核</div>' +
    '<div class="mi" onclick="go(\'withdraw.html\')">' + ic(I.cash) + '提现审核</div>' +
    '<div class="mi" onclick="go(\'wallet-review.html\')">' + ic(I.wallet) + '钱包审核</div>' +

    '<div class="msec">服务器</div>' +
    '<div class="mi" onclick="go(\'nodes.html\')">' + ic(I.node) + '节点管理</div>' +
    '<div class="mi" onclick="go(\'servers.html\')">' + ic(I.server) + '服务器管理</div>' +
    '<div class="mi" onclick="go(\'bots.html\')">' + ic(I.bot) + '机器人渠道</div>' +

    '<div class="msec">系统</div>' +
    '<div class="mi" onclick="go(\'payment.html\')">' + ic(I.pay) + '支付配置</div>' +
    '<div class="mi" onclick="go(\'logs.html\')">' + ic(I.log) + '操作日志</div>' +
    '<div class="mi" onclick="go(\'login-logs.html\')">' + ic(I.log) + '登录记录</div>' +
    '<div class="mi" onclick="go(\'settings.html\')">' + ic(I.me) + '系统设置</div>' +
    '<div class="mi" onclick="go(\'export.html\')">' + ic(I.log) + '报表导出</div>' +
    '<div class="mi" onclick="go(\'admins.html\')">' + ic(I.admin) + '管理员管理</div>' +
    '<div class="mi" onclick="go(\'personal.html\')">' + ic(I.me) + '个人设置</div>' +

    '<div class="sep"></div>' +
    '<div class="mi danger" onclick="logout()">' + ic(I.out) + '退出登录</div>';

  document.body.appendChild(m);

  // 按角色隐藏菜单（客服只能看客服，运营不能看管理员/支付）
  try {
    const role = (a.role || 'service');
    if (role === 'service') {
      // 客服：只保留 审核 里的工单相关（暂时全隐藏，等工单页做）
      m.querySelectorAll('.mi').forEach(function(el){
        const t = el.textContent || '';
        const allow = ['退出登录'].includes(t);
        if (!allow) el.style.display = 'none';
      });
      m.querySelectorAll('.msec').forEach(function(el){ el.style.display = 'none'; });
    } else if (role === 'operator') {
      // 运营：不能看 管理员管理 / 支付配置
      m.querySelectorAll('.mi').forEach(function(el){
        const t = el.textContent || '';
        if (t.indexOf('管理员') > -1 || t.indexOf('支付配置') > -1) el.style.display = 'none';
      });
    }
  } catch (_) {}

  const tabs = document.getElementById('tabs');
  if (tabs) tabs.innerHTML =
    '<div class="t '+(active==='home'?'active':'')+'" onclick="go(\'home.html\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span>首页</span></div>' +
    '<div class="t '+(active==='users'?'active':'')+'" onclick="go(\'users.html\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><span>用户</span></div>' +
    '<div class="t '+(active==='plans'?'active':'')+'" onclick="go(\'plans.html\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg><span>套餐</span></div>' +
    '<div class="t '+(active==='orders'?'active':'')+'" onclick="go(\'orders.html\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span>订单</span></div>' +
    '<div class="t '+(active==='chat'?'active':'')+'" onclick="go(\'chat.html\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>客服</span></div>';
}
function toggleMenu() {
  const m = document.getElementById('menu');
  const mask = document.getElementById('menuMask');
  if (!m) return;
  const isOpen = m.classList.contains('on') || !m.classList.contains('hidden');
  if (isOpen) { closeMenu(); return; }
  m.classList.remove('hidden');
  m.classList.add('on');
  if (mask) mask.classList.add('on');
}

function closeMenu() {
  const m = document.getElementById('menu');
  const mask = document.getElementById('menuMask');
  if (m) { m.classList.remove('on'); m.classList.add('hidden'); }
  if (mask) mask.classList.remove('on');
}
function go(url) { location.href = url; }

function copyText(txt) {
  if (!txt) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).then(() => toast('已复制：' + txt)).catch(() => fallbackCopy(txt));
  } else {
    fallbackCopy(txt);
  }
}
function fallbackCopy(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('已复制：' + txt); } catch (e) { toast('复制失败'); }
  ta.remove();
}
function closeModal() { document.getElementById('modal').innerHTML = ''; }

function searchTag() {
  const q = new URLSearchParams(location.search).get('q');
  if (!q) return '';
  return '<div class="search-tag">搜索：<b>' + q + '</b><span class="x" onclick="clearSearch()">×</span></div>';
}
function clearSearch() { location.href = location.pathname; }

// ===== 自定义确认弹窗（替代浏览器自带 confirm） =====
function showConfirm(msg, onOk, onCancel) {
  var box = document.getElementById('customConfirm');
  if (!box) {
    box = document.createElement('div');
    box.id = 'customConfirm';
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:none;align-items:center;justify-content:center;padding:24px;';
    box.innerHTML = '<div style="background:#fff;border-radius:16px;padding:22px 20px;max-width:340px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.2)">' +
      '<div id="ccMsg" style="font-size:15px;color:#111;line-height:1.6;margin-bottom:18px;word-break:break-all"></div>' +
      '<div style="display:flex;gap:10px">' +
        '<button id="ccNo" style="flex:1;padding:12px;border-radius:10px;font-size:14px;font-weight:600;background:#f2f4f8;color:#333;border:none">取消</button>' +
        '<button id="ccYes" style="flex:1;padding:12px;border-radius:10px;font-size:14px;font-weight:600;background:#2E5BFF;color:#fff;border:none">确定</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(box);
  }
  document.getElementById('ccMsg').textContent = msg;
  box.style.display = 'flex';
  var done = false;
  document.getElementById('ccYes').onclick = function() {
    if (done) return; done = true;
    box.style.display = 'none';
    if (onOk) onOk();
  };
  document.getElementById('ccNo').onclick = function() {
    if (done) return; done = true;
    box.style.display = 'none';
    if (onCancel) onCancel();
  };
}

// 包一层，返回 Promise
function cConfirm(msg) {
  return new Promise(function(resolve) {
    showConfirm(msg, function(){ resolve(true); }, function(){ resolve(false); });
  });
}
