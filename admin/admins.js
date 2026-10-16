if (!checkAuth()) throw 0;
renderShell('home');

let list = [];

async function load() {
  const j = await api('/admins');
  if (j.code !== 1) return;
  list = j.data || [];
  document.getElementById('count').innerHTML = '共 <b>' + list.length + '</b> 位管理员';
  const box = document.getElementById('admList');
  if (!list.length) { box.innerHTML = '<div class="empty">暂无管理员</div>'; return; }
  box.innerHTML = list.map(a => {
    const initial = (a.email || '?').slice(0, 1).toUpperCase();
    return '<div class="adm-card">' +
      '<div class="adm-row1">' +
        '<div class="adm-avatar">' + initial + '</div>' +
        '<div class="adm-info"><div class="adm-mail">' + a.email + '</div>' +
          '<div class="adm-id">ID #' + a.id + '</div></div>' +
        '<button class="adm-del" onclick="delAdmin(' + a.id + ',\'' + a.email.replace(/'/g, "\\'") + '\')">删除</button>' +
        '<button class="adm-del" style="margin-left:6px;color:#1a73e8;border-color:#c9e0ff" onclick="changePw(' + a.id + ',\'' + a.email.replace(/'/g, "\\'") + '\')">改密码</button>' +
      '</div>' +
      '<div class="adm-foot">创建于 ' + fmtDate(a.created_at) + '</div>' +
    '</div>';
  }).join('');
}

function editAdmin() {
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>新增管理员账号</h2>' +
    '<label>邮箱</label><input id="a_email" type="email" placeholder="登录账号">' +
    '<label>密码</label><input id="a_pw" type="password" placeholder="登录密码">' +
    '<label>确认密码</label><input id="a_pw2" type="password">' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="saveAdmin()">创建</button>' +
    '</div></div></div>';
}

async function saveAdmin() {
  const email = document.getElementById('a_email').value.trim();
  const pw = document.getElementById('a_pw').value;
  const pw2 = document.getElementById('a_pw2').value;
  if (!email) { toast('请填邮箱'); return; }
  if (!pw) { toast('请填密码'); return; }
  if (pw !== pw2) { toast('两次密码不一致'); return; }
  const j = await api('/admins/save', {method: 'POST', body: JSON.stringify({email, password: pw})});
  if (j.code === 1) { toast('已创建'); closeModal(); load(); }
  else toast(j.msg || '失败');
}

async function delAdmin(id, email) {
  if (!(await cConfirm('确定删除 ' + email + '？'))) return;
  await api('/admins/delete', {method: 'POST', body: JSON.stringify({id})});
  toast('已删除');
  load();
}



function changePw(id, email) {
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>修改密码</h2>' +
    '<div style="font-size:12px;color:#888;margin-bottom:14px">账号：' + email + '</div>' +
    '<label>新密码</label><input id="cp_pw" type="password">' +
    '<label>确认密码</label><input id="cp_pw2" type="password">' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="doChangePw(' + id + ',\'' + email + '\')">保存</button>' +
    '</div></div></div>';
}
async function doChangePw(id, email) {
  const pw = document.getElementById('cp_pw').value;
  const pw2 = document.getElementById('cp_pw2').value;
  if (!pw) { toast('请输入新密码'); return; }
  if (pw !== pw2) { toast('两次密码不一致'); return; }
  const cur = JSON.parse(localStorage.getItem('lynli_custom_pw') || '{}');
  cur[email] = pw;
  localStorage.setItem('lynli_custom_pw', JSON.stringify(cur));
  await api('/admins/password', {method:'POST', body: JSON.stringify({id, password: pw})});
  toast('已修改');
  closeModal();
}

load();