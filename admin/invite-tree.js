if (!checkAuth()) throw 0;
renderShell('invite-tree');
function fmtMoney(c){ return '¥' + ((c||0)/100).toFixed(2); }
function fmtTime(t){ if(!t) return '—'; var d=new Date(t*1000); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function renderNode(n, depth) {
  if (!n) return '';
  var kids = (n.children||[]).map(function(c){ return renderNode(c, depth+1); }).join('');
  var inner = kids ? '<div class="tchildren">' + kids + '</div>' : '';
  return '<div>' +
    '<div class="tnode" onclick="location.href=\'user.html?id=' + n.id + '\'">' +
      '<div class="av">' + ((n.avatar && n.avatar.startsWith('data:image'))
          ? '<img src="' + n.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
          : (n.nickname || n.email || '?').slice(0,1).toUpperCase()) + '</div>' +
      '<div class="info">' +
        '<div class="nm">' + (n.nickname || n.email) + (n.short_id ? ' <span style="color:#2E5BFF;font-size:11px">ID:' + n.short_id + '</span>' : '') + '</div>' +
        '<div class="sub">注册 ' + fmtTime(n.created_at) + (n.children && n.children.length ? ' · 下级 ' + n.children.length + ' 人' : '') + '</div>' +
      '</div>' +
      '<div class="cm">' + (n.commission_total ? '已赚 ' + fmtMoney(n.commission_total) : '') + '</div>' +
    '</div>' + inner +
  '</div>';
}
async function load() {
  var j = await api('/invites/tree');
  var box = document.getElementById('tree');
  if (j.code !== 1 || !j.data || !j.data.length) {
    box.innerHTML = '<div class="tempty">暂无邀请关系<br>用户注册时填邀请码后显示</div>';
    return;
  }
  box.innerHTML = j.data.map(function(t){ return renderNode(t, 0); }).join('');
}
load();
