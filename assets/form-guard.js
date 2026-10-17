/* Cloudflare Turnstile + fill time for public forms (Caspian Studio form-protection standard).
   Plain script, no build step. Include with <script src="/assets/form-guard.js"></script>
   (no defer) before the page script that uses it.

   TURNSTILE_SITEKEY: the Caspian Studio client site key goes here, once.
   While it is empty the widget is not rendered and forms behave as before
   (honeypot and fill time are still sent).

   Usage:
     var guard = FormGuard.create(document.getElementById('some-empty-div-inside-the-form'));
     ... on submit:  body.ms = guard.elapsed(); body.turnstile = await guard.token();
     ... after:      guard.reset();
*/
(function () {
  var TURNSTILE_SITEKEY = "";
  var SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  var loader = null;

  function load() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!loader) {
      loader = new Promise(function (resolve) {
        var s = document.createElement("script");
        s.src = SRC;
        s.async = true;
        s.onload = function () { resolve(window.turnstile || null); };
        s.onerror = function () { loader = null; resolve(null); };
        document.head.appendChild(s);
      });
    }
    return loader;
  }

  function create(el) {
    var st = { token: "", id: null, shownAt: Date.now(), active: false };
    if (TURNSTILE_SITEKEY && el) {
      st.active = true;
      load().then(function (ts) {
        if (!ts) { st.active = false; return; }
        st.id = ts.render(el, {
          sitekey: TURNSTILE_SITEKEY,
          appearance: "interaction-only",
          callback: function (t) { st.token = t; },
          "expired-callback": function () { st.token = ""; },
          "error-callback": function () { st.token = ""; }
        });
      });
    }
    return {
      elapsed: function () { return Date.now() - st.shownAt; },
      token: function () {
        if (!st.active) return Promise.resolve("");
        var end = Date.now() + 8000;
        return new Promise(function (resolve) {
          (function poll() {
            if (st.token || Date.now() >= end) return resolve(st.token);
            setTimeout(poll, 200);
          })();
        });
      },
      reset: function () {
        st.token = "";
        if (st.id !== null && window.turnstile) { try { window.turnstile.reset(st.id); } catch (e) {} }
      }
    };
  }

  window.FormGuard = {
    sitekey: TURNSTILE_SITEKEY,
    create: create,
    HUMAN_CHECK_FAILED: "We could not confirm this was sent by a person. Please refresh the page and try again."
  };
})();
