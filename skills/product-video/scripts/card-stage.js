// Stages copies of real cards over the page and animates their parts: an `eval` step runs
//   (<this file>)('assemble' | 'explode', '<card selector>', <count>, '<background>')
// `assemble` builds each card from its parts; `explode` tilts one card and parts its layers in
// depth. Part selectors are an example theme's; another product names its own in `parts`.
(async (mode, srcSel, count, bg) => {
  const E = 'cubic-bezier(.2,.9,.15,1)';
  const POP = 'cubic-bezier(.34,1.56,.64,1)';
  const src = [...document.querySelectorAll(srcSel)].slice(0, count);
  const stage = document.createElement('div');
  stage.id = 'pv-stage';
  stage.style.cssText = `position:fixed;inset:0;z-index:2147483600;background:${bg};display:flex;align-items:center;justify-content:center;gap:48px;perspective:1100px`;
  document.body.append(stage);
  const w = mode === 'explode' ? 520 : 410;
  const cards = src.map((c) => {
    const holder = document.createElement('div');
    holder.style.cssText = `width:${w}px;container-type:inline-size;transform-style:preserve-3d`;
    const clone = c.cloneNode(true);
    clone.style.width = '100%';
    clone.style.maxWidth = 'none';
    holder.append(clone);
    stage.append(holder);
    return { holder, clone };
  });
  await Promise.all([...stage.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  const parts = (card) => ({
    media: card.querySelector('.card-product__media-frame'),
    ribbon: card.querySelector('.card-product__ribbon'),
    seal: card.querySelector('.badge, [class*="seal"]'),
    type: card.querySelector('.card-product__type'),
    vendor: card.querySelector('.card-product__vendor'),
    title: card.querySelector('.card-product__title'),
    excerpt: card.querySelector('.card-product__excerpt'),
    metrics: [...card.querySelectorAll('.product-metric')],
    price: card.querySelector('.card-product__price'),
    buy: card.querySelector('.card-product__buy'),
  });
  const anim = (el, frames, opts) => el && el.animate(frames, { fill: 'both', ...opts });
  if (mode === 'assemble') {
    cards.forEach(({ clone }, i) => {
      const p = parts(clone);
      const d = i * 140;
      anim(p.media, [{ opacity: 0, transform: 'translateY(90px) scale(.86)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: d, easing: E });
      anim(p.ribbon, [{ opacity: 0, transform: 'translate(-60%,-40%) rotate(-12deg)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: d + 650, easing: E });
      anim(p.seal, [{ opacity: 0, transform: 'scale(0) rotate(-120deg)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: d + 750, easing: POP });
      [p.type, p.vendor, p.title, p.excerpt].forEach((el, k) => anim(el, [{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: d + 820 + k * 90, easing: E }));
      p.metrics.forEach((m, k) => {
        anim(m, [{ opacity: 0, transform: 'translateX(-24px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: d + 1050 + k * 110, easing: E });
        m.querySelectorAll('.product-metric__fill').forEach((f) => anim(f, [{ transform: 'scaleX(0)', transformOrigin: 'left' }, { transform: 'scaleX(1)', transformOrigin: 'left' }], { duration: 800, delay: d + 1150 + k * 110, easing: E }));
        m.querySelectorAll('.product-metric__dot').forEach((dot, n) => anim(dot, [{ transform: 'scale(0)' }, { transform: 'none' }], { duration: 420, delay: d + 1150 + k * 110 + n * 60, easing: POP }));
      });
      anim(p.price, [{ opacity: 0, transform: 'translateY(40px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: d + 1250, easing: POP });
      anim(p.buy, [{ opacity: 0, transform: 'translateY(40px) scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: d + 1350, easing: POP });
    });
  } else {
    // Exploded view: the card tilts, its layers part along depth and sideways, hold, then close.
    const { holder, clone } = cards[0];
    const p = parts(clone);
    // Depth only survives when every box between the card and a part keeps 3D and does not clip.
    // A gallery card scrolls its photos in a track that loses its place once it moves in 3D:
    // show the current photo as one still image instead.
    const frame = p.media;
    const first = frame?.querySelector('img');
    if (first) {
      const still = new Image();
      still.src = first.currentSrc || first.src;
      still.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
      frame.querySelectorAll('.card-product__media-track, .card-product__media-zones').forEach((n) => (n.style.visibility = 'hidden'));
      frame.style.position = 'relative';
      frame.append(still);
      await still.decode().catch(() => {});
    }
    const path = [clone, ...clone.querySelectorAll('.card-product__frame, .card-media, .card-product__media, .card-product__details, .card-product__buy')];
    for (const el of path) { el.style.transformStyle = 'preserve-3d'; el.style.overflow = 'visible'; }
    const T = 1400, H = 1700;
    anim(holder, [{ transform: 'rotateX(0) rotateY(0) scale(1)' }, { transform: 'rotateX(26deg) rotateY(-30deg) scale(.82)', offset: .3 }, { transform: 'rotateX(26deg) rotateY(-30deg) scale(.82)', offset: .7 }, { transform: 'none' }], { duration: T * 2 + H, delay: 300, easing: 'cubic-bezier(.65,0,.35,1)' });
    const away = (el, to, z, k = 0) => anim(el, [{ transform: 'none' }, { transform: `${to} translateZ(${z}px)`, offset: .3 }, { transform: `${to} translateZ(${z}px)`, offset: .7 }, { transform: 'none' }], { duration: T * 2 + H, delay: 300 + k * 40, easing: 'cubic-bezier(.65,0,.35,1)' });
    [p.media].forEach((el) => el && (el.style.transformStyle = 'preserve-3d'));
    const details = clone.querySelector('.card-product__details');
    away(p.media, 'translate(0,0)', 40);
    away(p.ribbon, 'translate(-30px,-40px)', 260, 1);
    away(p.seal, 'translate(30px,-50px)', 360, 2);
    away(details, 'translate(0,20px)', 160, 3);
    p.metrics.forEach((m, k) => away(m, 'translate(0,10px)', 60 + k * 50, 5 + k));
    away(p.price, 'translate(-20px,30px)', 200, 7);
    away(p.buy, 'translate(30px,30px)', 280, 8);
  }
  return cards.length;
})
