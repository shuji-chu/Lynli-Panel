if (!checkAuth()) throw 0;
renderShell('mail');

let currentTab = 'send';
let tplCache = [];

function switchTab(t) {
  currentTab = t;
  document.querySelectorAll('.mg-tabs .mt').forEach(function(el, i){
    el.classList.toggle('on', (i === 0 && t === 'send') || (i === 1 && t === 'tpl'));
  });
  document.getElementById('tabSend').style.display = (t === 'send') ? '' : 'none';
  document.getElementById('tabTpl').style.display = (t === 'tpl') ? '' : 'none';
  if (t === 'tpl') loadTpl();
}
window.switchTab = switchTab;

async function sendMail() {
  var subject = (document.getElementById('subject').value || '').trim();
  var body = (document.getElementById('body').value || '').trim();
  var target = document.getElementById('target').value;
  if (!subject || !body) { toast('请填写主题和正文'); return; }
  if (!(await cConfirm('确定给「' + document.getElementById('target').selectedOptions[0].text + '」群发此邮件？'))) return;
  var j = await api('/mail/send', { method: 'POST', body: JSON.stringify({subject:subject, body:body, target:target}) });
  if (j.code === 1) { toast('已提交，正在后台发送 ' + j.data.queued + ' 封'); }
  else { toast('失败：' + (j.msg || '')); }
}
window.sendMail = sendMail;

// ============ 模板库 ============
async function loadTpl() {
  var j = await api('/mail/templates');
  var list = (j.code === 1) ? (j.data || []) : [];
  tplCache = list;
  var box = document.getElementById('tplList');
  if (!list.length) {
    box.innerHTML = '<div class="tpl-item" style="text-align:center;color:#94A3B8">暂无模板</div>';
    return;
  }
  box.innerHTML = list.map(function(t){
    return '<div class="tpl-item">' +
      '<div class="tpl-row1">' +
        '<div class="tpl-name">' + (t.name || t.key) + '</div>' +
        '<div class="tpl-key">' + t.key + '</div>' +
      '</div>' +
      '<div class="tpl-subj">' + (t.subject || '') + '</div>' +
      '<div class="tpl-actions">' +
        '<button class="tpl-btn use" onclick=\'useTpl("' + t.key + '")\'>用它群发</button>' +
        '<button class="tpl-btn" onclick=\'openTplEditor("' + t.key + '")\'>编辑</button>' +
        '<button class="tpl-btn del" onclick=\'delTpl("' + t.key + '")\'>删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}
window.loadTpl = loadTpl;

function useTpl(key) {
  var t = tplCache.find(function(x){ return x.key === key; });
  if (!t) return;
  switchTab('send');
  document.getElementById('subject').value = t.subject || '';
  document.getElementById('body').value = t.body || '';
  toast('已载入模板，检查后点"立即群发"');
}
window.useTpl = useTpl;

function openTplEditor(key) {
  var t = key ? tplCache.find(function(x){ return x.key === key; }) : {key:'', name:'', subject:'', body:''};
  if (!t) return;
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>' + (key ? '编辑模板' : '新建模板') + '</h2>' +
    '<label>Key（英文标识，唯一）</label><input id="t_key" value="' + (t.key||'') + '"' + (key?' readonly':'') + ' placeholder="welcome / renew / promo">' +
    '<label>显示名</label><input id="t_name" value="' + (t.name||'') + '" placeholder="欢迎新用户">' +
    '<label>邮件主题</label><input id="t_subject" value="' + (t.subject||'') + '">' +
    '<label>HTML 正文</label><textarea id="t_body" rows="8" style="width:100%;padding:10px;border:1px solid #eaeaea;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box">' + (t.body||'') + '</textarea>' +
    '<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="saveTpl()">保存</button>' +
    '</div></div></div>';
}
window.openTplEditor = openTplEditor;

async function saveTpl() {
  var body = {
    key: document.getElementById('t_key').value.trim(),
    name: document.getElementById('t_name').value.trim(),
    subject: document.getElementById('t_subject').value.trim(),
    body: document.getElementById('t_body').value
  };
  if (!body.key || !body.subject) { toast('key 和主题必填'); return; }
  var j = await api('/mail/templates/save', {method:'POST', body: JSON.stringify(body)});
  if (j.code === 1) { toast('已保存'); closeModal(); loadTpl(); }
  else { toast('失败：' + (j.msg||'')); }
}
window.saveTpl = saveTpl;

async function delTpl(key) {
  if (!(await cConfirm('确定删除模板 ' + key + '？'))) return;
  var j = await api('/mail/templates/delete', {method:'POST', body: JSON.stringify({key: key})});
  if (j.code === 1) { toast('已删除'); loadTpl(); }
  else { toast('失败'); }
}
window.delTpl = delTpl;
