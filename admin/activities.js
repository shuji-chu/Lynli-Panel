if (!checkAuth()) throw 0;
renderShell('home');

var BOTS = [
  {key: 'safew',    name: 'SafeW',    sub: '签单机器人'},
  {key: 'mivra',    name: 'Mivra',    sub: 'Mivra 机器人'},
  {key: 'qingtian', name: '晴天（TG）', sub: 'Telegram 机器人'}
];
var allData = [];

async function load() {
  var j = await api('/activities');
  if (j.code !== 1) {
    document.getElementById('acList').innerHTML = '<div class="empty">加载失败</div>';
    return;
  }
  allData = j.data || [];
  var box = document.getElementById('acList');
  box.innerHTML = BOTS.map(function(b){
    var a = allData.filter(function(x){ return x.bot === b.key; })[0];
    if (!a) a = {bot: b.key, name: '', enabled: 1, reward_gb: 5, reward_days: 3, require_channel: 1, channel_url: '', once_per_user: 1, id: null};
    return cardHTML(b, a);
  }).join('');
}

function cardHTML(b, a) {
  var logo = 'icons/' + (b.key === 'qingtian' ? 'telegram' : b.key) + '.jpg';
  return '<div class="ac-card" data-bot="' + b.key + '">' +
    '<div class="ac-head">' +
      '<div class="ac-logo"><img src="' + logo + '" onerror="this.style.display=\'none\'"></div>' +
      '<div class="ac-title"><div class="n">' + b.name + '</div><div class="s">' + b.sub + '</div></div>' +
      '<div class="ac-switch' + (a.enabled ? ' on' : '') + '" onclick="toggleSwitch(this)"></div>' +
    '</div>' +
    '<div class="ac-row">' +
      '<label>活动名称</label>' +
      '<input class="a-name" value="' + (a.name || '') + '" placeholder="如：新用户关注频道领 5GB / 3天">' +
    '</div>' +
    '<div class="ac-grid">' +
      '<div class="ac-row"><label>奖励流量 (GB)</label><input class="a-gb" type="number" step="0.1" value="' + (a.reward_gb || 0) + '"></div>' +
      '<div class="ac-row"><label>奖励时长 (天)</label><input class="a-days" type="number" value="' + (a.reward_days || 0) + '"></div>' +
    '</div>' +
    '<div class="ac-inline">' +
      '<span class="lab">要求关注频道</span>' +
      '<div class="ac-switch' + (a.require_channel ? ' on' : '') + '" data-k="require_channel" onclick="toggleSwitch(this)"></div>' +
    '</div>' +
    '<div class="ac-row" style="margin-top:10px">' +
      '<label>频道链接</label>' +
      '<input class="a-url" value="' + (a.channel_url || '') + '" placeholder="https://t.me/xxx">' +
    '</div>' +
    '<div class="ac-inline">' +
      '<span class="lab">每人限领一次</span>' +
      '<div class="ac-switch' + (a.once_per_user ? ' on' : '') + '" data-k="once_per_user" onclick="toggleSwitch(this)"></div>' +
    '</div>' +
    '<button class="ac-save" onclick="saveCard(\'' + b.key + '\')">保存 ' + b.name + '</button>' +
  '</div>';
}

function toggleSwitch(el) {
  el.classList.toggle('on');
}

async function saveCard(botKey) {
  var card = document.querySelector('.ac-card[data-bot="' + botKey + '"]');
  var a = allData.filter(function(x){ return x.bot === botKey; })[0] || {};
  var body = {
    id: a.id || null,
    bot: botKey,
    name: card.querySelector('.a-name').value.trim(),
    reward_gb: parseFloat(card.querySelector('.a-gb').value) || 0,
    reward_days: parseInt(card.querySelector('.a-days').value) || 0,
    channel_url: card.querySelector('.a-url').value.trim(),
    enabled: card.querySelector('.ac-head .ac-switch').classList.contains('on') ? 1 : 0,
    require_channel: card.querySelector('[data-k="require_channel"]').classList.contains('on') ? 1 : 0,
    once_per_user: card.querySelector('[data-k="once_per_user"]').classList.contains('on') ? 1 : 0,
    key: 'new_user_trial'
  };
  var j = await api('/activities', {method: 'POST', body: JSON.stringify(body)});
  if (j.code === 1) { toast(botKey + ' 已保存'); load(); }
  else toast('保存失败');
}

load();
