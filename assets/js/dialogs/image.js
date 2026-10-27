// Диалог кнопки «Изображение»: файл с диска или адрес, подпись и ширина.
(function () {
  function selectedSource() {
    var checked = document.querySelector('input[name="image-source"]:checked');
    return checked ? checked.value : 'file';
  }

  function setSource(value) {
    document.querySelectorAll('input[name="image-source"]').forEach(function (input) {
      input.checked = input.value === value;
    });
    var file = selectedSource() === 'file';
    document.getElementById('image-file-row').hidden = !file;
    document.getElementById('image-url-row').hidden = file;
  }

  function isUrl(text) {
    return /^https?:\/\/\S+$/i.test(text);
  }

  function isFileRef(text) {
    if (/^[A-Za-z]:[\\/]/.test(text)) return true;
    if (text.indexOf('\\\\') === 0 || text.indexOf('//') === 0) return true;
    if (/^file:/i.test(text)) return true;
    var imageName = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(text);
    if (imageName && /[\\/]/.test(text)) return true;
    return imageName && !/\s/.test(text);
  }

  window.insertImage = function () {
    if (window.wrapSelectionAsImage && window.wrapSelectionAsImage()) return;
    var ctx = window.imageInsertContext ? window.imageInsertContext() : { text: '' };
    var text = (ctx.text || '').trim();
    var url = document.getElementById('image-url');
    var file = document.getElementById('image-file');
    var caption = document.getElementById('image-caption');
    url.value = '';
    file.value = '';
    if (isUrl(text)) {
      setSource('url');
      url.value = text;
      caption.value = '';
    } else if (isFileRef(text)) {
      setSource('file');
      file.value = text;
      caption.value = '';
    } else {
      setSource('file');
      caption.value = text || 'подпись';
    }
    window.fillMediaSizeSelect('image-size', window.getMediaSizeDefault('image'));
    openModal('image-config-overlay');
  };

  document.querySelectorAll('input[name="image-source"]').forEach(function (input) {
    input.addEventListener('change', function () {
      setSource(input.value);
    });
  });

  document.getElementById('image-browse').addEventListener('click', function () {
    window.callApi('pick_image').then(function (path) {
      if (path) document.getElementById('image-file').value = path;
    });
  });

  document.getElementById('image-insert').addEventListener('click', function () {
    var dest = selectedSource() === 'url'
      ? document.getElementById('image-url').value.trim()
      : document.getElementById('image-file').value.trim().replace(/\\/g, '/');
    dest = dest.replace(/>/g, '');
    var caption = document.getElementById('image-caption').value
      .replace(/[\[\]]/g, '')
      .replace(/\r?\n/g, ' ');
    var width = window.getMediaSizeSelectValue('image-size', 'image');
    var markdown = '![' + caption + '](<' + dest + '>){width=' + width + 'px}';
    if (window.replaceSelection) window.replaceSelection(markdown);
    closeModal('image-config-overlay');
  });
})();
