if (!checkAuth()) throw 0;
renderShell('home');

var allCfg = {};

async function load() {
  var j = await api('/payment_configs');
  if (j.code !== 1) {
    document.getElementById('payList').innerHTML = '<div class="empty">加载失败</div>';
    return;
  }
  (j.data || []).forEach(function(x){ allCfg[x.channel] = x; });
  render();
}

function alipayCard() {
  var x = allCfg.alipay || {enabled: 0, cfg: {}};
  var c = x.cfg || {};
  return '<div class="pay-card" data-ch="alipay">' +
    '<div class="pay-head">' +
      '<div class="pay-logo alipay">支</div>' +
      '<div class="pay-title"><div class="n">支付宝</div><div class="s">nzzf.org 通道</div></div>' +
      '<div class="pay-sw' + (x.enabled ? ' on' : '') + '" onclick="this.classList.toggle(\'on\')"></div>' +
    '</div>' +
    '<div class="pay-row"><label>商户 PID</label><input class="f-pid" value="' + (c.pid || '') + '"></div>' +
    '<div class="pay-row"><label>下单接口</label><input class="f-create" value="' + (c.create_url || '') + '"></div>' +
    '<div class="pay-row"><label>查询接口</label><input class="f-query" value="' + (c.query_url || '') + '"></div>' +
    '<div class="pay-row"><label>异步通知</label><input class="f-notify" value="' + (c.notify_url || '') + '"></div>' +
    '<div class="pay-row"><label>同步返回</label><input class="f-return" value="' + (c.return_url || '') + '"></div>' +
    '<div class="pay-row"><label>私钥路径（服务器）</label><input class="f-key" value="' + (c.private_key_file || '') + '"></div>' +
    '<button class="pay-save" onclick="saveCard(\'alipay\')">保存支付宝配置</button>' +
  '</div>';
}

function usdtCard() {
  var x = allCfg.usdt || {enabled: 0, cfg: {}};
  var c = x.cfg || {};
  return '<div class="pay-card" data-ch="usdt">' +
    '<div class="pay-head">' +
      '<div class="pay-logo usdt">₮</div>' +
      '<div class="pay-title"><div class="n">USDT 链上收款</div><div class="s">TronGrid 监听到账</div></div>' +
      '<div class="pay-sw' + (x.enabled ? ' on' : '') + '" onclick="this.classList.toggle(\'on\')"></div>' +
    '</div>' +
    '<div class="pay-tip">用户在 APP 扫码付款到下面的 TRC20 地址。后端每 30 秒扫一次链上交易，到账自动开通。</div>' +
    '<div class="pay-row"><label>网络</label><input class="f-network" value="' + (c.network || 'TRC20') + '" placeholder="TRC20"></div>' +
    '<div class="pay-row"><label>收款地址</label><input class="f-address" value="' + (c.address || '') + '" placeholder="TJqAeg..."></div>' +
    '<div class="pay-row"><label>TronGrid API</label><input class="f-trongrid" value="' + (c.trongrid_api || 'https://api.trongrid.io') + '"></div>' +
    '<div class="pay-row"><label>TronGrid Key（可选）</label><input class="f-key2" value="' + (c.trongrid_key || '') + '"></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="pay-row"><label>最低金额 (USDT)</label><input class="f-min" type="number" step="0.01" value="' + (c.min_amount || 1) + '"></div>' +
      '<div class="pay-row"><label>汇率 (¥/USDT)</label><input class="f-rate" type="number" step="0.01" value="' + (c.rate || 7.15) + '"></div>' +
    '</div>' +
    '<button class="pay-save" onclick="saveCard(\'usdt\')">保存 USDT 配置</button>' +
  '</div>';
}

function render() {
  document.getElementById('payList').innerHTML = alipayCard() + usdtCard();
}

async function saveCard(ch) {
  var card = document.querySelector('.pay-card[data-ch="' + ch + '"]');
  var cfg, enabled;
  if (ch === 'alipay') {
    cfg = {
      pid: card.querySelector('.f-pid').value.trim(),
      create_url: card.querySelector('.f-create').value.trim(),
      query_url: card.querySelector('.f-query').value.trim(),
      notify_url: card.querySelector('.f-notify').value.trim(),
      return_url: card.querySelector('.f-return').value.trim(),
      private_key_file: card.querySelector('.f-key').value.trim()
    };
  } else {
    cfg = {
      network: card.querySelector('.f-network').value.trim(),
      address: card.querySelector('.f-address').value.trim(),
      trongrid_api: card.querySelector('.f-trongrid').value.trim(),
      trongrid_key: card.querySelector('.f-key2').value.trim(),
      min_amount: parseFloat(card.querySelector('.f-min').value) || 0,
      rate: parseFloat(card.querySelector('.f-rate').value) || 0
    };
  }
  enabled = card.querySelector('.pay-sw').classList.contains('on') ? 1 : 0;
  var j = await api('/payment_configs', {method: 'POST', body: JSON.stringify({channel: ch, enabled: enabled, cfg: cfg})});
  if (j.code === 1) toast(ch + ' 已保存');
  else toast('保存失败');
}

load();
