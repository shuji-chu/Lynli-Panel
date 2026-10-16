if (!checkAuth()) throw 0;
renderShell('home');

const a = getAdmin();
const ROLE = {super:'超级管理员', operator:'运营', service:'客服'};

document.getElementById('avatar').textContent = (a.name || '管').replace(/\s/g,'').slice(0,1);
document.getElementById('pname').textContent = a.name || '—';
document.getElementById('prole').textContent = ROLE[a.role] || '管理员';
document.getElementById('pemail').textContent = a.email || '—';
document.getElementById('prole2').textContent = ROLE[a.role] || '管理员';
document.getElementById('plogin').textContent = a.loginAt ? new Date(a.loginAt).toLocaleString('zh-CN') : '—';
document.getElementById('n_name').value = a.name || '';

function saveName() {
  const nv = document.getElementById('n_name').value.trim();
  if (!nv) { toast('昵称不能为空'); return; }
  a.name = nv;
  localStorage.setItem('lynli_admin', JSON.stringify(a));
  toast('已保存昵称');
  setTimeout(() => location.reload(), 500);
}

function savePassword() {
  const old = document.getElementById('n_old').value;
  const pw = document.getElementById('n_pw').value;
  const pw2 = document.getElementById('n_pw2').value;
  if (!old || !pw) { toast('请填完整'); return; }
  if (pw !== pw2) { toast('两次密码不一致'); return; }
  const cur = JSON.parse(localStorage.getItem('lynli_custom_pw') || '{}');
  if (cur[a.email] && cur[a.email] !== old) { toast('原密码错误'); return; }
  if (!cur[a.email] && old !== 'change-me' && old !== 'change-me') { toast('原密码错误'); return; }
  cur[a.email] = pw;
  localStorage.setItem('lynli_custom_pw', JSON.stringify(cur));
  toast('密码已修改（下次登录用新密码）');
  document.getElementById('n_old').value = '';
  document.getElementById('n_pw').value = '';
  document.getElementById('n_pw2').value = '';
}
