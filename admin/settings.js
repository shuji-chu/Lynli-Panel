if (!checkAuth()) throw 0;
renderShell('settings');

var S = {};

var SCHEMA = [
  { title: '站点信息', rows: [
    { k: '站点名称', id: 'site_name', type: 'text' },
    { k: '官网地址', id: 'website_url', type: 'text' },
    { k: 'APP 下载链接', id: 'app_download_url', type: 'text' }
  ]},
  { title: '客服联系', rows: [
    { k: '客服链接', id: 'kefu_url', type: 'text', sub: '点客服按钮跳转' },
    { k: 'Telegram', id: 'telegram_url', type: 'text' }
  ]},
  { title: '注册与邀请', rows: [
    { k: '允许注册', id: 'register_open', type: 'switch' },
    { k: '邀请功能', id: 'invite_enable', type: 'switch' },
    { k: '佣金比例', id: 'invite_rate', type: 'number', sub: '单位 %，例如 15' },
    { k: '邀请奖励流量', id: 'invite_reward_gb', type: 'number', sub: '单位 GB，双方各得' }
  ]},
  { title: '系统维护', rows: [
    { k: '维护模式', id: 'maintenance', type: 'switch' },
    { k: '维护公告', id: 'maintenance_notice', type: 'textarea' },
    { k: '全局通知', id: 'global_notice', type: 'textarea', sub: 'APP 内弹窗展示' }
  ]},
  { title: '佣金比例', rows: [
    { k: '一级佣金', id: 'commission_lv1', type: 'number', sub: '直接邀请人 %' },
    { k: '二级佣金', id: 'commission_lv2', type: 'number', sub: '间接上级 %' },
    { k: '三级佣金', id: 'commission_lv3', type: 'number', sub: '三级上级 %' }
  ]},
  { title: '版本控制', rows: [
    { k: '强制更新', id: 'force_update', type: 'switch' },
    { k: '最新版本', id: 'latest_version', type: 'text', sub: '如 v0.6.1' }
  ]}
];

function sw(id, val) {
  var on = val === '1' ? ' on' : '';
  return '<div class="switch' + on + '" data-id="' + id + '" onclick="toggleSw(this)"></div>';
}

function render() {
  var html = SCHEMA.map(function(g) {
    return '<div class="set-group"><h3>' + g.title + '</h3>' +
      g.rows.map(function(r) {
        var v = S[r.id] || '';
        var input;
        if (r.type === 'switch') input = sw(r.id, v);
        else if (r.type === 'textarea') input = '<textarea data-id="' + r.id + '">' + v + '</textarea>';
        else input = '<input type="' + (r.type === 'number' ? 'number' : 'text') + '" data-id="' + r.id + '" value="' + v.replace(/"/g,'&quot;') + '">';
        return '<div class="set-row">' +
          '<div class="k">' + r.k + (r.sub ? '<div class="sub">' + r.sub + '</div>' : '') + '</div>' +
          input +
        '</div>';
      }).join('') +
    '</div>';
  }).join('');
  document.getElementById('form').innerHTML = html;
}

function toggleSw(el) { el.classList.toggle('on'); }

async function load() {
  var j = await api('/settings');
  if (j.code !== 1) { toast('加载失败'); return; }
  S = j.data || {};
  render();
}

async function save() {
  var items = {};
  document.querySelectorAll('[data-id]').forEach(function(el) {
    var id = el.dataset.id;
    if (el.classList.contains('switch')) {
      items[id] = el.classList.contains('on') ? '1' : '0';
    } else {
      items[id] = (el.value || '').trim();
    }
  });
  var j = await api('/settings', { method: 'POST', body: JSON.stringify({ items: items }) });
  if (j.code === 1) { toast('已保存'); S = items; }
  else { toast('失败：' + (j.msg || '')); }
}
window.toggleSw = toggleSw;
window.save = save;

load();
