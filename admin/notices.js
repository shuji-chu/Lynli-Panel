if (!checkAuth()) throw 0;
renderShell('home');

const TYPE_LABEL = { normal: '公告', activity: '活动', update: '更新' };
const DISPLAY_LABEL = { popup: '弹窗', banner: '横幅', reddot: '红点' };

let plansCache = [];

async function loadPlans() {
  try {
    const j = await api('/plans');
    plansCache = (j && j.data) || [];
  } catch (_) { plansCache = []; }
}

async function load() {
  const j = await api('/notices');
  if (j.code !== 1) return;
  const list = j.data || [];
  const box = document.getElementById('noList');
  if (!list.length) { box.innerHTML = '<div class="empty">暂无公告<br>点右下角 ＋ 发布第一条</div>'; return; }
  const now = Math.floor(Date.now() / 1000);
  box.innerHTML = list.map(n => {
    const active = n.status && n.start_at <= now && n.end_at >= now;
    const pin = n.pinned ? '<span class="no-type" style="background:#fff3cd;color:#d97706">📌 置顶</span>' : '';
    const disp = '<span class="no-type" style="background:#eef4ff;color:#2E5BFF">' + (DISPLAY_LABEL[n.display] || '横幅') + '</span>';
    const tgt = n.target_plan
      ? '<span class="no-type" style="background:#f0fdf4;color:#16a34a">仅 #' + n.target_plan + '</span>'
      : '<span class="no-type" style="background:#f5f5f5;color:#666">全部用户</span>';
    const reads = n.read_count
      ? '<span class="no-type" style="background:#f5f3ff;color:#7c3aed">已读 ' + n.read_count + '</span>'
      : '';
    return '<div class="no-card' + (n.status ? '' : ' off') + '">' +
      '<div class="no-head">' +
        pin +
        '<span class="no-type ' + n.type + '">' + (TYPE_LABEL[n.type] || '公告') + '</span>' +
        disp + tgt + reads +
        '<span class="no-status ' + (n.status ? 'on' : 'off') + '" style="margin-left:auto">' + (n.status ? '已发布' : '已下架') + '</span>' +
      '</div>' +
      '<div class="no-title">' + n.title + '</div>' +
      '<div class="no-content">' + n.content + '</div>' +
      '<div class="no-time">' + fmtDate(n.start_at) + ' 至 ' + fmtDate(n.end_at) + (active ? '（生效中）' : '') + '</div>' +
      '<div class="no-actions">' +
        '<button class="toggle" onclick="toggleNotice(' + n.id + ',' + (n.status ? 0 : 1) + ')">' + (n.status ? '下架' : '发布') + '</button>' +
        '<button class="edit" onclick=\'editNotice(' + JSON.stringify(n).replace(/'/g, "&#39;") + ')\'>编辑</button>' +
        '<button class="del" onclick="delNotice(' + n.id + ')">删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function editNotice(n) {
  n = n || {type: 'normal', status: 1, display: 'banner', pinned: 0, target_plan: 0};
  const today = new Date().toISOString().slice(0, 10);
  const start = n.start_at ? new Date(n.start_at * 1000).toISOString().slice(0, 10) : today;
  const end = n.end_at ? new Date(n.end_at * 1000).toISOString().slice(0, 10) : new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);

  const typeOpts = ['normal', 'activity', 'update'].map(t =>
    '<option value="' + t + '"' + (n.type === t ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>').join('');
  const dispOpts = ['banner', 'popup', 'reddot'].map(d =>
    '<option value="' + d + '"' + (n.display === d ? ' selected' : '') + '>' + DISPLAY_LABEL[d] + '</option>').join('');
  const planOpts = '<option value="0">全部用户</option>' + plansCache.map(p =>
    '<option value="' + p.id + '"' + (n.target_plan === p.id ? ' selected' : '') + '>' + p.name + ' 用户</option>').join('');

  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>' + (n.id ? '编辑' : '发布') + '公告</h2>' +
    '<label>类型</label><select id="n_type">' + typeOpts + '</select>' +
    '<label>标题</label><input id="n_title" value="' + (n.title || '') + '" placeholder="如：系统维护通知">' +
    '<label>内容</label>' +
    '<textarea id="n_content" rows="5" style="width:100%;padding:10px;border:1px solid #eaeaea;border-radius:8px;font-size:13px;font-family:inherit">' + (n.content || '') + '</textarea>' +
    '<label style="margin-top:14px">展示方式</label><select id="n_display">' + dispOpts + '</select>' +
    '<label>定向用户</label><select id="n_target">' + planOpts + '</select>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-top:14px">' +
      '<input id="n_pinned" type="checkbox"' + (n.pinned ? ' checked' : '') + ' style="width:18px;height:18px">' +
      '<label style="margin:0">📌 置顶（列表排最前）</label>' +
    '</div>' +
    '<div class="grid2" style="margin-top:14px">' +
      '<div><label>开始</label><input id="n_start" type="date" value="' + start + '"></div>' +
      '<div><label>结束</label><input id="n_end" type="date" value="' + end + '"></div>' +
    '</div>' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="saveNotice(' + (n.id || 0) + ')">保存</button>' +
    '</div></div></div>';
}

async function saveNotice(id) {
  const body = {
    id: id || null,
    type: document.getElementById('n_type').value,
    title: document.getElementById('n_title').value.trim(),
    content: document.getElementById('n_content').value.trim(),
    display: document.getElementById('n_display').value,
    target_plan: +document.getElementById('n_target').value || 0,
    pinned: document.getElementById('n_pinned').checked ? 1 : 0,
    start_at: Math.floor(new Date(document.getElementById('n_start').value + 'T00:00:00').getTime() / 1000),
    end_at: Math.floor(new Date(document.getElementById('n_end').value + 'T23:59:59').getTime() / 1000),
    status: 1
  };
  if (!body.title || !body.content) { toast('请填标题和内容'); return; }
  if (body.end_at < body.start_at) { toast('结束时间不能早于开始'); return; }
  const j = await api('/notices', {method: 'POST', body: JSON.stringify(body)});
  if (j.code === 1) { toast('已保存'); closeModal(); load(); }
  else { toast('失败：' + (j.msg || '')); }
}

async function toggleNotice(id, status) {
  await api('/notices', {method: 'POST', body: JSON.stringify({id, status})});
  toast(status ? '已发布' : '已下架');
  load();
}

async function delNotice(id) {
  if (!(await cConfirm('确定删除？'))) return;
  await api('/notices/delete', {method: 'POST', body: JSON.stringify({id})});
  toast('已删除');
  load();
}

loadPlans().then(load);
