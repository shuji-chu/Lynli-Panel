
if (!checkAuth()) throw 0;
renderShell('home');

var currentFile = null;

async function load() {
  var j = await api('/banners');
  if (j.code !== 1) {
    document.getElementById('bnList').innerHTML = '<div class="empty">加载失败</div>';
    return;
  }
  var list = j.data || [];
  document.getElementById('count').innerHTML = '共 <b>' + list.length + '</b> 条广告';
  var box = document.getElementById('bnList');
  if (!list.length) { box.innerHTML = '<div class="empty">暂无广告<br>点右下角 ＋ 发布第一条</div>'; return; }
  box.innerHTML = list.map(cardHTML).join('');
}

function mediaHTML(b) {
  var src = b.media || b.image_url || '';
  if (!src) return '<div class="ph">未设置媒体</div>';
  if (b.type === 'video') {
    return '<video src="' + src + '" muted autoplay loop playsinline></video>';
  }
  return '<img src="' + src + '" onerror="this.style.display=\'none\'">';
}

function captionHTML(b) {
  if (!b.title && !b.subtitle) return '';
  return '<div class="bn-caption">' +
    (b.title ? '<div class="t">' + b.title + '</div>' : '') +
    (b.subtitle ? '<div class="s">' + b.subtitle + '</div>' : '') +
  '</div>';
}

function cardHTML(b) {
  var typeTag = b.type === 'video' ? '视频' : '图片';
  return '<div class="bn-card">' +
    '<div class="bn-media">' + mediaHTML(b) +
      '<div class="bn-type-tag">' + typeTag + '</div>' +
      captionHTML(b) +
    '</div>' +
    '<div class="bn-body">' +
      '<div class="bn-row1">' +
        '<div class="bn-status ' + (b.show ? 'on' : 'off') + '">' + (b.show ? '显示中' : '已隐藏') + '</div>' +
        '<div class="bn-sort">排序 ' + b.sort + '</div>' +
      '</div>' +
      (b.link ? '<div class="bn-link">→ ' + b.link + '</div>' : '<div class="bn-link none">→ 无跳转链接</div>') +
      '<div class="bn-actions">' +
        '<button class="edit" onclick=\'editBanner(' + JSON.stringify(b).replace(/'/g, "&#39;") + ')\'>编辑</button>' +
        '<button class="del" onclick="delBanner(' + b.id + ')">删除</button>' +
      '</div>' +
    '</div></div>';
}

function editBanner(b) {
  b = b || {type: 'image', show: 1, sort: 1};
  currentFile = null;
  var media = b.media || b.image_url || '';
  document.getElementById('modal').innerHTML =
    '<div class="sheet-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">' +
    '<h2>' + (b.id ? '编辑' : '新增') + '广告</h2>' +
    '<label>类型</label><select id="b_type"><option value="image"' + (b.type !== 'video' ? ' selected' : '') + '>图片</option><option value="video"' + (b.type === 'video' ? ' selected' : '') + '>视频</option></select>' +
    '<label>媒体（选文件 或 填 URL）</label>' +
    '<input type="file" id="b_file" accept="image/*,video/*" style="margin-bottom:6px" onchange="uploadFile(this)">' +
    '<div id="b_upload_tip" style="font-size:12px;color:#888;margin-bottom:8px"></div>' +
    '<input id="b_media" value="' + media + '" placeholder="选择文件后自动填入，或手填 https://...">' +
    '<label>文案标题</label><input id="b_title" value="' + (b.title || '') + '" placeholder="如：新用户首月 5 折">' +
    '<label>文案副标题</label><input id="b_subtitle" value="' + (b.subtitle || '') + '">' +
    '<label>跳转链接（可选）</label><input id="b_link" value="' + (b.link || '') + '">' +
    '<div class="grid2">' +
      '<div><label>排序</label><input id="b_sort" type="number" value="' + (b.sort || 1) + '"></div>' +
      '<div><label>显示(0/1)</label><input id="b_show" type="number" value="' + (b.show == null ? 1 : b.show) + '"></div>' +
    '</div>' +
    '<div class="btn-row">' +
      '<button class="btn-cancel" onclick="closeModal()">取消</button>' +
      '<button class="btn-primary" onclick="saveBanner(' + (b.id || 0) + ')">保存</button>' +
    '</div></div></div>';
}

async function uploadFile(input) {
  var f = input.files && input.files[0];
  if (!f) return;
  var tip = document.getElementById('b_upload_tip');

  tip.textContent = '读取中...';
  var dataUrl;

  if (f.type.indexOf('image/') === 0) {
    dataUrl = await compressImage(f, 1600, 0.82);
    if (!dataUrl) { tip.textContent = '图片读取失败'; return; }
  } else {
    if (f.size > 3 * 1024 * 1024) { toast('视频超过 3MB，请用外链'); input.value=''; tip.textContent=''; return; }
    dataUrl = await readAsDataURL(f);
  }

  tip.textContent = '上传中...';
  var j = await api('/upload', {method:'POST', body: JSON.stringify({name: f.name, data: dataUrl})});
  if (j.code === 1 && j.data && j.data.url) {
    document.getElementById('b_media').value = j.data.url;
    tip.textContent = '上传成功：' + j.data.url;
    toast('上传成功');
  } else {
    tip.textContent = '上传失败：' + (j.msg || '未知错误');
    toast('上传失败');
  }
}

function readAsDataURL(file) {
  return new Promise(function(resolve) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.onerror = function() { resolve(null); };
    r.readAsDataURL(file);
  });
}

function compressImage(file, maxW, quality) {
  return new Promise(function(resolve) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function() { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function readAsDataURL(file) {
  return new Promise(function(resolve) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.onerror = function() { resolve(null); };
    r.readAsDataURL(file);
  });
}

function compressImage(file, maxW, quality) {
  return new Promise(function(resolve) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function() { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function saveBanner(id) {
  var b = {
    id: id || null,
    type: document.getElementById('b_type').value,
    media: document.getElementById('b_media').value.trim(),
    image_url: document.getElementById('b_media').value.trim(),
    title: document.getElementById('b_title').value.trim(),
    subtitle: document.getElementById('b_subtitle').value.trim(),
    link: document.getElementById('b_link').value.trim(),
    sort: +document.getElementById('b_sort').value,
    show: +document.getElementById('b_show').value
  };
  if (!b.media) { toast('请填媒体 URL'); return; }
  var j = await api('/banners', {method: 'POST', body: JSON.stringify(b)});
  if (j.code === 1) { toast('已保存'); closeModal(); load(); }
}

async function delBanner(id) {
  if (!(await cConfirm('确定删除？'))) return;
  await api('/banners/delete', {method: 'POST', body: JSON.stringify({id})});
  toast('已删除');
  load();
}

load();
