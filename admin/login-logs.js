if (!checkAuth()) throw 0;
renderShell('login-logs');
var QID = new URLSearchParams(location.search).get('id') || '';
function fmtTs(t){ if(!t) return ''; var d=new Date(t*1000); var p=function(n){return String(n).padStart(2,'0');}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }
async function load() {
  var url = '/login_logs' + (QID ? ('?id=' + QID) : '');
  var j = await api(url);
  var box = document.getElementById('logs');
  if (j.code !== 1 || !j.data) { box.innerHTML = '<div class="tempty">加载失败</div>'; return; }
  if (!j.data.length) { box.innerHTML = '<div class="tempty">暂无登录记录<br>用户下次登录后会出现</div>'; return; }
  box.innerHTML = j.data.map(function(r){
    return '<div class="ll-item">' +
      '<div class="ll-row1"><span>' + (r.email||'') + '</span><span style="color:#64748B;font-weight:400">' + fmtTs(r.created_at) + '</span></div>' +
      '<div class="ll-row2">IP: ' + (r.ip||'—') + '</div>' +
      '<div class="ll-row2" style="margin-top:2px">' + (r.ua||'') + '</div>' +
    '</div>';
  }).join('');
}
load();
