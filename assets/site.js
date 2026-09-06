(function () {
  // Mobile nav
  var b = document.querySelector('.burger'), m = document.getElementById('mnav');
  if (b && m) {
    b.addEventListener('click', function () {
      var open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!open));
      m.hidden = open;
      b.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    });
  }

  // Vercel analytics helper
  function track(name, props) { try { window.va && window.va('event', { name: name, data: props || {} }); } catch (e) {} }
  document.querySelectorAll('a[href^="https://wa.me"]').forEach(function (a) { a.addEventListener('click', function () { track('whatsapp_click', { path: location.pathname }); }); });
  document.querySelectorAll('a[href^="tel:"]').forEach(function (a) { a.addEventListener('click', function () { track('call_click', { path: location.pathname }); }); });

  // UTM capture (kept for the enquiry form)
  try {
    var q = new URLSearchParams(location.search), utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k); });
    if (Object.keys(utm).length) sessionStorage.setItem('z_utm', JSON.stringify(utm));
  } catch (e) {}

  // Enquiry form
  var f = document.getElementById('enquiry');
  if (!f) return;
  var msg = f.querySelector('.form-msg'), btn = f.querySelector('button[type=submit]');
  var dateEl = f.querySelector('[name=event_date]');
  if (dateEl) { var t = new Date(); t.setDate(t.getDate() + 1); dateEl.min = t.toISOString().slice(0, 10); }

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    var data = {}, ok = true;
    f.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    ['name', 'organisation', 'phone', 'event_type', 'event_date', 'guests'].forEach(function (k) {
      var el = f.elements[k];
      if (!el.value.trim()) { el.setAttribute('aria-invalid', 'true'); ok = false; }
    });
    var phone = f.elements.phone.value.replace(/[^\d]/g, '');
    if (phone.length < 10) { f.elements.phone.setAttribute('aria-invalid', 'true'); ok = false; }
    if (!ok) { msg.className = 'form-msg err'; msg.textContent = 'Please fill the starred fields (a 10-digit mobile number helps us reach you on WhatsApp).'; return; }

    new FormData(f).forEach(function (v, k) { if (k === 'meals') { (data.meals = data.meals || []).push(v); } else { data[k] = v; } });
    data.source_path = location.pathname;
    try { data.utm = JSON.parse(sessionStorage.getItem('z_utm') || '{}'); } catch (e) { data.utm = {}; }

    btn.disabled = true; btn.textContent = 'Sending…';
    fetch('https://xhcpbdhdasajtlfevkko.supabase.co/functions/v1/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'Could not send');
        track('enquiry_submitted', { event_type: data.event_type, guests: Number(data.guests) || 0 });
        location.href = '/thanks';
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = 'Send enquiry';
        msg.className = 'form-msg err';
        msg.textContent = 'Sorry, that did not go through (' + e.message + '). Please WhatsApp us on +91 88010 91203.';
      });
  });
})();
