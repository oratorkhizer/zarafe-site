/* The cloche lifts. Scroll progress p (0..1) through the tall .zc section drives every value,
   so the scene also plays backwards. Reduced motion gets a still layout (.zc-flat). */
(function () {
  var el = document.querySelector('.zc');
  if (!el) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clipOK = window.CSS && CSS.supports && (CSS.supports('clip-path', 'inset(1px round 2px)') || CSS.supports('-webkit-clip-path', 'inset(1px round 2px)'));
  if (reduce || !clipOK) { el.classList.add('zc-flat'); return; }

  var stage = el.querySelector('.zc-stage'), frame = el.querySelector('.zc-frame'), shadow = el.querySelector('.zc-shadow');
  var dish = el.querySelector('.zc-dish'), under = el.querySelector('.zc-under'), rim = el.querySelector('.zc-rim'), copy = el.querySelector('.zc-copy');
  var hdr = document.querySelector('.hdr');
  var FU = 0.51, FV = 0.50, FR = 0.27; // the handi inside the photo: centre and radius, as fractions of the photo width/height

  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var out = function (t) { return 1 - Math.pow(1 - t, 3); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var L = null;
  function layout() {
    var h = hdr ? hdr.offsetHeight : 0;
    el.style.setProperty('--hdr', h + 'px');
    var W = stage.clientWidth, H = stage.clientHeight, g = 16;
    var stacked = W < 900;
    var fw, fx, fy, cx, cy, cw;
    if (stacked) {
      fw = Math.min(W - 2 * g, (H * (H < 640 ? 0.33 : 0.4)) * 4 / 3, 620);
      fx = (W - fw) / 2; fy = H < 640 ? 52 : 58;
      cw = Math.min(W - 2 * g, 560); cx = (W - cw) / 2; cy = fy + fw * .75 + 18;
    } else {
      fw = Math.min(W * 0.5, (H - 100) * 4 / 3, 760);
      cw = Math.min(420, W - fw - 3 * 40);
      fx = Math.max(g, (W - (fw + 56 + cw)) / 2); fy = (H - fw * .75) / 2;
      cx = fx + fw + 56; cy = null;
    }
    var s = stacked ? Math.min(W * 0.52, H * 0.3, 230) : Math.min(H * 0.34, 290);
    L = { W: W, H: H, fw: fw, fh: fw * .75, fx: fx, fy: fy, s: s, dx: W / 2, dy: H * (stacked ? .58 : .6), stacked: stacked };
    frame.style.width = shadow.style.width = fw + 'px';
    frame.style.height = shadow.style.height = (fw * .75) + 'px';
    shadow.style.transform = 'translate(' + fx + 'px,' + fy + 'px)';
    copy.style.setProperty('--cx', cx + 'px');
    copy.style.setProperty('--cw', cw + 'px');
    copy.style.setProperty('--cy', stacked ? cy + 'px' : '50%');
    copy.style.marginTop = stacked ? '0' : (-copy.offsetHeight / 2) + 'px';
    dish.style.setProperty('--s', s + 'px'); under.style.setProperty('--s', s + 'px');
  }

  var ticking = false, last = -1;
  function frameFn() {
    ticking = false;
    var total = el.offsetHeight - stage.offsetHeight;
    var top = el.getBoundingClientRect().top - (hdr ? hdr.offsetHeight : 0);
    var p = clamp(-top / total, 0, 1);
    // on a phone the floating WhatsApp button would sit on top of the end buttons, so it steps aside while they show
    var bottom = el.getBoundingClientRect().bottom;
    document.body.classList.toggle('zc-cta-on', L.stacked && p > .79 && bottom > window.innerHeight * .5);
    if (Math.abs(p - last) < .0004) return;
    last = p;
    var s = L.s, st = stage.style, ds = dish.style;

    st.setProperty('--hint', (1 - seg(p, .01, .06)).toFixed(3));
    el.querySelector('.zc-title').style.setProperty('--t', (1 - seg(p, .22, .36)).toFixed(3));

    // 1. the lid lifts and tilts away, then leaves the frame
    var l = ease(seg(p, .08, .36)), o = ease(seg(p, .36, .5));
    ds.setProperty('--dx', L.dx + 'px');
    ds.setProperty('--dy', L.dy + 'px');
    under.style.setProperty('--dx', L.dx + 'px'); under.style.setProperty('--dy', L.dy + 'px');
    ds.setProperty('--lx', (s * .3 * l + L.W * .35 * o) + 'px');
    ds.setProperty('--ly', (-s * 1.05 * l - L.H * .55 * o) + 'px');
    ds.setProperty('--lr', (-17 * l - 14 * o) + 'deg');
    ds.setProperty('--lo', (1 - o).toFixed(3));
    ds.setProperty('--lso', (1 - out(seg(p, .08, .24))).toFixed(3));

    // 2. steam and a warm glow rise from the dish
    var sp = seg(p, .12, .62);
    ds.setProperty('--steam', Math.sin(sp * Math.PI).toFixed(3));
    ds.setProperty('--rise', (-s * 1.4 * sp) + 'px');
    ds.setProperty('--sc', (1 + .9 * sp).toFixed(3));
    ds.setProperty('--glow', (seg(p, .1, .3) * (1 - seg(p, .45, .62))).toFixed(3));
    under.style.setProperty('--tray', (1 - seg(p, .48, .62)).toFixed(3));

    // 3. the dish opens out into the full photo
    var e = ease(seg(p, .5, .78));
    var z0 = (s * .5 * .97) / (FR * L.fw), z = lerp(z0, 1, e);   // start scale: the handi just fills the plate
    var grow = out(seg(p, .1, .34));
    var R = s * lerp(.4, .5, grow) + s * .06 * e;             // radius on screen before it opens out
    var ccx = L.dx, ccy = L.dy + s * .04;                       // dish centre on screen
    var fu = FU * L.fw, fv = FV * L.fh;
    var sx = ccx - (fu - L.fw / 2) * z0, sy = ccy - (fv - L.fh / 2) * z0;    // frame centre at the start
    var ex = L.fx + L.fw / 2, ey = L.fy + L.fh / 2;                          // frame centre at the end
    var mx = lerp(sx, ex, e), my = lerp(sy, ey, e);
    frame.style.transform = 'translate(' + (mx - L.fw / 2) + 'px,' + (my - L.fh / 2) + 'px) scale(' + z.toFixed(4) + ')';
    var r = R / z0;
    var it = Math.max(0, fv - r), ib = Math.max(0, L.fh - fv - r), il = Math.max(0, fu - r), ir = Math.max(0, L.fw - fu - r);
    var fs = frame.style;
    fs.setProperty('--it', lerp(it, 0, e) + 'px');
    fs.setProperty('--ib', lerp(ib, 0, e) + 'px');
    fs.setProperty('--il', lerp(il, 0, e) + 'px');
    fs.setProperty('--ir', lerp(ir, 0, e) + 'px');
    fs.setProperty('--rr', lerp(r, 14 / z, e) + 'px');

    // the plate rim around the revealed dish, gone once it opens out
    var rr = R + s * .07;
    rim.style.transform = 'translate(' + (-rr) + 'px,' + (s * .04 - rr) + 'px)';
    rim.style.width = rim.style.height = (2 * rr) + 'px';
    rim.style.opacity = (seg(p, .14, .3) * (1 - seg(p, .5, .6))).toFixed(3);

    // 4. caption, then the enquiry call to action
    var cap = seg(p, .74, .82);
    st.setProperty('--cap', cap.toFixed(3));
    fs.setProperty('--cap', cap.toFixed(3));
    var co = ease(seg(p, .78, .9));
    copy.style.setProperty('--co', co.toFixed(3));
    copy.style.setProperty('--cv', co > .02 ? 'visible' : 'hidden');
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frameFn); } }
  function onResize() { layout(); last = -1; onScroll(); }
  layout();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
  frameFn();
})();
