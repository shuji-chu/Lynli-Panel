if (!checkAuth()) throw 0;
renderShell('home');

const MOCK_LIST = [
  {ver: 'v1.0.0', channel: '官网', count: 520, last: '10-10 12:30'},
  {ver: 'v1.0.0', channel: '应用商店', count: 322, last: '10-12 09:15'}
];

async function load() {
  const box = document.getElementById('content');
  let list = MOCK_LIST;
  if (!MOCK) {
    const j = await api('/downloads');
    if (j.code !== 1) { box.innerHTML = '<div class="empty">加载失败</div>'; return; }
    list = j.data;
  }
  let h = '<div class="section-title">共 <span class="count">' + list.length + '</span> 条下载记录</div>';
  if (!list.length) h += '<div class="empty">暂无下载记录</div>';
  for (const r of list) {
    h += '<div class="p-card"><div class="name">' + r.ver + ' · ' + r.channel + '</div>'
       + '<div class="desc">下载 ' + r.count + ' 次</div>'
       + '<div class="desc">最近 ' + r.last + '</div></div>';
  }
  box.innerHTML = h;
}
load();
