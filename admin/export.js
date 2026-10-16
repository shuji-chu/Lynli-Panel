if (!checkAuth()) throw 0;
renderShell('export');

const ITEMS = [
  { name: '用户', api: '/users', file: 'users.csv',
    cols: [['id','ID'],['email','邮箱'],['nickname','昵称'],['short_id','数字ID'],
           ['plan_id','套餐ID'],['expired_at','到期时间'],['transfer_enable','总流量(字节)'],
           ['u','上行'],['d','下行'],['created_at','注册时间'],['banned','封禁']] },
  { name: '订单', api: '/orders', file: 'orders.csv',
    cols: [['trade_no','订单号'],['user_id','用户ID'],['plan_id','套餐ID'],['period','周期'],
           ['total_amount','金额(分)'],['status','状态'],['method','支付方式'],['created_at','创建时间']] },
  { name: '提现', api: '/withdrawals', file: 'withdrawals.csv',
    cols: [['id','ID'],['user_id','用户ID'],['amount','金额'],['method','方式'],
           ['status','状态'],['created_at','申请时间'],['reviewed_at','审核时间']] },
  { name: '操作日志', api: '/logs', file: 'logs.csv',
    cols: [['id','ID'],['admin','操作人'],['action','动作'],['target','目标'],
           ['detail','详情'],['ip','IP'],['ua','UA'],['created_at','时间']] }
];

function ts(v) {
  if (!v || v < 100000) return '';
  const d = new Date(v * 1000);
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}

function toCsv(rows, cols) {
  const esc = v => {
    if (v == null) return '';
    v = String(v).replace(/"/g,'""');
    return '"'+v+'"';
  };
  const head = cols.map(c => esc(c[1])).join(',');
  const body = rows.map(r => cols.map(c => {
    let v = r[c[0]];
    if (/time|created_at|expired_at|reviewed_at|updated_at/.test(c[0])) v = ts(v);
    return esc(v);
  }).join(',')).join('\n');
  return '\ufeff' + head + '\n' + body;
}

function download(name, text) {
  const blob = new Blob([text], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function render() {
  document.getElementById('grid').innerHTML = ITEMS.map((it, i) =>
    '<div class="exp-card">' +
      '<div class="name">' + it.name + '</div>' +
      '<div class="desc">' + it.cols.length + ' 列 · ' + it.file + '</div>' +
      '<button onclick="doExport(' + i + ')">下载 CSV</button>' +
    '</div>'
  ).join('');
}

async function doExport(i) {
  const it = ITEMS[i];
  try {
    const j = await api(it.api);
    if (j.code !== 1) { toast('拉取失败'); return; }
    const rows = j.data || [];
    if (!rows.length) { toast('无数据'); return; }
    download(it.file, toCsv(rows, it.cols));
    toast('已导出 ' + rows.length + ' 条');
  } catch (e) {
    toast('导出失败');
  }
}
window.doExport = doExport;

render();
