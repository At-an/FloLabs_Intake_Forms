/*!
 * FloLabs forms loader (Contact Us, Newsletter).
 * Usage on a FloLabs website:
 *   <div data-flolabs-form="contact-us" data-site="robocollective"></div>
 *   <script src="https://forms.flolabsinnovations.com/embed.js" async></script>
 * Turns each placeholder into an auto-resizing iframe. Only height messages from the
 * forms origin are accepted.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script || !script.src) return;
  var origin = new URL(script.src).origin;

  var FORMS = {
    'contact-us': { title: 'Contact FloLabs', minHeight: 640 },
    newsletter: { title: 'FloLabs newsletter', minHeight: 200 },
  };
  var frames = [];

  function mount(placeholder) {
    if (placeholder.getAttribute('data-flolabs-mounted')) return;
    var form = placeholder.getAttribute('data-flolabs-form');
    var config = Object.prototype.hasOwnProperty.call(FORMS, form) ? FORMS[form] : null;
    if (!config) return;

    var iframe = document.createElement('iframe');
    iframe.src = origin + '/embed/' + form + '?site=' + encodeURIComponent(placeholder.getAttribute('data-site') || '');
    iframe.title = config.title;
    iframe.loading = 'lazy';
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.cssText = 'display:block;width:100%;border:0;overflow:hidden;height:' + config.minHeight + 'px;';
    placeholder.setAttribute('data-flolabs-mounted', 'true');
    placeholder.appendChild(iframe);
    frames.push(iframe);
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.origin !== origin || !data || data.source !== 'flolabs-form' || data.type !== 'height') return;
    var height = Math.min(Math.max(Number(data.height) || 0, 80), 4000);
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) frames[i].style.height = height + 'px';
    }
  });

  function mountAll() {
    var placeholders = document.querySelectorAll('[data-flolabs-form]');
    for (var i = 0; i < placeholders.length; i++) mount(placeholders[i]);
  }

  mountAll();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
})();
