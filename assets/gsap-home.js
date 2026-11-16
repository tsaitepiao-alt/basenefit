/* gsap-home.js — basenefit 首頁 GSAP 動效
   安全原則：
   ・GSAP 沒載入（CDN 被擋／離線）→ 直接 return，網頁完全不受影響
   ・prefers-reduced-motion → 不做任何動畫
   ・只在 #page-home 上作用，其他頁面（含 iframe 3D）完全不碰
   ・單頁路由切換時 refresh，避免 ScrollTrigger 用舊版面計算 */
(function () {
  if (!window.gsap || !window.ScrollTrigger) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  gsap.registerPlugin(ScrollTrigger);

  var home = document.getElementById('page-home');
  if (!home) return;
  var built = false;

  function build() {
    if (built) { ScrollTrigger.refresh(); return; }
    built = true;

    if (!reduce) {
      /* ① 首頁進場：眉標 → 主標 → 說明 → 本壘板動畫 */
      var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      var eb = home.querySelector('.eyebrow');
      var h1 = home.querySelector('h1');
      var lead = home.querySelector('.lead');
      var hero = home.querySelector('.hero-anim');
      /* 只用位移與縮放，不動 opacity：這站主執行緒很忙，若先設 opacity:0
         而 ticker 被卡住，使用者會看到整塊空白（實測踩過） */
      if (eb) tl.from(eb, { y: 14, duration: .5 });
      if (h1) tl.from(h1, { y: 24, duration: .65 }, '-=.32');
      if (lead) tl.from(lead, { y: 18, duration: .55 }, '-=.42');
      if (hero) tl.from(hero, { y: 26, scale: .96, duration: .75 }, '-=.34');

      /* ② 首頁卡片：進入畫面時淡入上移 */
      var cards = home.querySelectorAll('.card');
      if (cards.length) {
        ScrollTrigger.batch(cards, {
          start: 'top 92%',
          once: true,
          onEnter: function (batch) {
            gsap.fromTo(batch, { y: 26, autoAlpha: 0 },
              { y: 0, autoAlpha: 1, duration: .7, stagger: .1, ease: 'power3.out', overwrite: true });
          }
        });
      }

      /* ③ 本壘板場景視差（滾動時緩緩上移） */
      if (hero) {
        gsap.to(hero, {
          y: -36, ease: 'none',
          scrollTrigger: { trigger: home, start: 'top top', end: '+=620', scrub: .6 }
        });
      }
    }

    /* 保險：3.5 秒後把卡片殘留的 opacity/visibility 清掉，任何情況都不會留白 */
    setTimeout(function () {
      var cs = home.querySelectorAll('.card');
      for (var i = 0; i < cs.length; i++) {
        if (parseFloat(getComputedStyle(cs[i]).opacity) < 0.9) {
          gsap.set(cs[i], { clearProps: 'opacity,visibility,transform' });
        }
      }
      ScrollTrigger.refresh();
    }, 3500);

    ScrollTrigger.refresh();
  }

  function whenShown() {
    if (home.classList.contains('show') || getComputedStyle(home).display !== 'none') { build(); return; }
    var mo = new MutationObserver(function () {
      if (home.classList.contains('show')) { mo.disconnect(); build(); }
    });
    mo.observe(home, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenShown);
  else whenShown();

  addEventListener('hashchange', function () { setTimeout(function () { ScrollTrigger.refresh(); }, 120); });
  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
