/* Ember Foundry — the site's behaviour: language, header, embers, day/night slider, fog of war,
   showreel, gallery, downloads from release.json, counters. No dependencies. */
(() => {
  "use strict";

  const doc = document.documentElement;
  setTimeout(() => doc.classList.add("hero-ready"), 2600);
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const connection = navigator.connection || {};
  const saveData = Boolean(connection.saveData) || /(^|-)2g$/.test(connection.effectiveType || "");
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
  };
  const I18N = window.EF_I18N || { en: {}, dyn: { ru: {}, en: {} } };
  const live = $("[data-live]");
  const say = (text) => { if (live) { live.textContent = ""; setTimeout(() => { live.textContent = text; }, 30); } };

  /* ---------------------------------------------------------------- language */
  let lang = "ru";
  const originals = new Map();
  const dyn = (key) => (I18N.dyn[lang] || {})[key] || (I18N.dyn.ru || {})[key] || key;

  function remember(el) {
    if (!originals.has(el)) {
      originals.set(el, {
        text: el.textContent,
        html: el.innerHTML,
        alt: el.getAttribute("alt"),
        aria: el.getAttribute("aria-label"),
        caption: el.getAttribute("data-caption"),
      });
    }
    return originals.get(el);
  }

  function pickLang() {
    const asked = new URLSearchParams(location.search).get("lang");
    if (asked === "ru" || asked === "en") return asked;
    const saved = store.get("ef-lang");
    if (saved === "ru" || saved === "en") return saved;
    const langs = navigator.languages || [navigator.language || "ru"];
    return langs.some((l) => /^(ru|uk|be|kk)\b/i.test(l)) ? "ru" : "en";
  }

  function applyLang(next, persist) {
    lang = next;
    const dict = lang === "en" ? I18N.en : null;
    const tr = (key, fallback) => (dict && dict[key] != null ? dict[key] : fallback);
    $$("[data-i18n]").forEach((el) => { el.textContent = tr(el.dataset.i18n, remember(el).text); });
    $$("[data-i18n-html]").forEach((el) => { el.innerHTML = tr(el.dataset.i18nHtml, remember(el).html); });
    $$("[data-i18n-alt]").forEach((el) => { el.setAttribute("alt", tr(el.dataset.i18nAlt, remember(el).alt)); });
    $$("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", tr(el.dataset.i18nAria, remember(el).aria)); });
    $$("[data-i18n-caption]").forEach((el) => { el.setAttribute("data-caption", tr(el.dataset.i18nCaption, remember(el).caption)); });
    if (!originals.has(doc)) originals.set(doc, { title: document.title, description: $('meta[name="description"]').content });
    document.title = tr("meta.title", originals.get(doc).title);
    $('meta[name="description"]').content = tr("meta.description", originals.get(doc).description);
    doc.lang = lang;
    const toggle = $("[data-lang-toggle]");
    toggle.textContent = dyn("langLabel");
    toggle.setAttribute("aria-label", dyn("langSwitch"));
    toggle.setAttribute("lang", lang === "en" ? "ru" : "en");
    if (persist) store.set("ef-lang", lang);
    document.dispatchEvent(new CustomEvent("ef:lang"));
  }

  $("[data-lang-toggle]").addEventListener("click", () => {
    applyLang(lang === "en" ? "ru" : "en", true);
    const url = new URL(location.href);
    url.searchParams.set("lang", lang);
    history.replaceState(null, "", url);
  });

  /* ---------------------------------------------------------------- header and menu */
  const header = $("[data-header]");
  new IntersectionObserver(([entry]) => header.classList.toggle("is-solid", !entry.isIntersecting))
    .observe($(".header-sentinel"));

  const burger = $("[data-burger]");
  const nav = $("#site-nav");
  function setMenu(open, focusBack) {
    burger.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    header.classList.toggle("menu-open", open);
    if (!open && focusBack) burger.focus();
  }
  burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("is-open")) setMenu(false, true); });
  document.addEventListener("click", (e) => { if (nav.classList.contains("is-open") && !header.contains(e.target)) setMenu(false); });
  nav.addEventListener("focusout", (e) => { if (nav.classList.contains("is-open") && !header.contains(e.relatedTarget)) setMenu(false); });

  const navLinks = $$('.site-nav a[href^="#"]');
  const sectionFor = new Map(navLinks.map((a) => [$(a.getAttribute("href")), a]));
  const seen = new Set();
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)));
    const current = [...sectionFor.keys()].find((s) => seen.has(s));
    navLinks.forEach((a) => {
      if (sectionFor.get(current) === a) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sectionFor.forEach((_, section) => section && navObserver.observe(section));

  /* ---------------------------------------------------------------- reveal on scroll */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      revealObserver.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  $$(".reveal").forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    if (siblings.length > 1) el.style.setProperty("--delay", `${Math.min(siblings.indexOf(el), 6) * 0.07}s`);
    revealObserver.observe(el);
  });

  /* ---------------------------------------------------------------- embers */
  function emberSprite() {
    const size = 64;
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = size;
    const g = sprite.getContext("2d");
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,240,200,1)");
    grad.addColorStop(0.18, "rgba(255,196,110,.95)");
    grad.addColorStop(0.45, "rgba(255,140,60,.35)");
    grad.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return sprite;
  }

  function embers(canvas) {
    const ctx = canvas.getContext("2d");
    const sprite = emberSprite();
    let w = 0, h = 0, parts = [], running = false, last = 0, visible = false;
    const spawn = (anywhere) => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 12,
      size: 5 + Math.random() * 13,
      vy: 14 + Math.random() * 34,
      vx: -8 + Math.random() * 16,
      phase: Math.random() * Math.PI * 2,
      sway: 0.5 + Math.random() * 1.3,
      life: 0,
      max: 6 + Math.random() * 8,
      flicker: 2 + Math.random() * 5,
    });
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(Math.min(80, (w * h) / 17000));
      while (parts.length < target) parts.push(spawn(true));
      parts.length = target;
    }
    function draw(dt) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        p.life += dt;
        p.y -= p.vy * dt;
        p.x += (p.vx + Math.sin(p.phase + p.life * p.sway) * 14) * dt;
        const t = p.life / p.max;
        const fade = t < 0.15 ? t / 0.15 : t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1;
        const flicker = 0.75 + 0.25 * Math.sin(p.life * p.flicker * 3 + p.phase);
        ctx.globalAlpha = Math.max(0, fade * flicker * 0.9);
        const s = p.size * (0.8 + 0.2 * flicker);
        ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
        if (t >= 1 || p.y < -20) Object.assign(p, spawn(false));
      }
      ctx.globalAlpha = 1;
    }
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      draw(dt);
      requestAnimationFrame(frame);
    }
    function update() {
      const should = visible && !document.hidden;
      if (should && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
      if (!should) running = false;
    }
    resize();
    if (reduceMotion) { draw(0); return; }
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); }).observe(canvas);
    document.addEventListener("visibilitychange", update);
  }
  $$("[data-embers]").forEach(embers);

  /* ---------------------------------------------------------------- hero video */
  const heroVideo = $("[data-hero-video]");
  const videoToggle = $("[data-video-toggle]");
  function setToggle(playing) {
    videoToggle.setAttribute("aria-pressed", String(!playing));
    $("use", videoToggle).setAttribute("href", playing ? "#i-pause" : "#i-play");
    $(".visually-hidden", videoToggle).textContent = playing ? dyn("videoPause") : dyn("videoPlay");
  }
  function startHeroVideo() {
    if (!heroVideo || reduceMotion || saveData || window.innerWidth < 720) return;
    $$("source", heroVideo).forEach((s) => { s.src = s.dataset.src; });
    heroVideo.load();
    heroVideo.addEventListener("playing", () => {
      heroVideo.classList.add("is-playing");
      videoToggle.hidden = false;
      setToggle(true);
    }, { once: true });
    // A soft dip into the still at the loop point instead of a hard cut.
    heroVideo.addEventListener("timeupdate", () => {
      if (heroVideo.duration && heroVideo.duration - heroVideo.currentTime < 0.8) heroVideo.classList.add("is-dim");
    });
    heroVideo.addEventListener("ended", () => {
      heroVideo.currentTime = 0;
      heroVideo.play().catch(() => {});
      setTimeout(() => heroVideo.classList.remove("is-dim"), 120);
    });
    heroVideo.play().catch(() => { /* autoplay refused: the still stays */ });
    new IntersectionObserver(([e]) => {
      if (videoToggle.getAttribute("aria-pressed") === "true") return;
      if (e.isIntersecting) heroVideo.play().catch(() => {}); else heroVideo.pause();
    }).observe(heroVideo);
  }
  videoToggle.addEventListener("click", () => {
    if (heroVideo.paused) { heroVideo.play().catch(() => {}); setToggle(true); }
    else { heroVideo.pause(); setToggle(false); }
  });
  document.addEventListener("ef:lang", () => { if (!videoToggle.hidden) setToggle(!heroVideo.paused); });
  if (document.readyState === "complete") setTimeout(startHeroVideo, 300);
  else addEventListener("load", () => setTimeout(startHeroVideo, 300), { once: true });

  /* ---------------------------------------------------------------- day / night slider */
  const compare = $("[data-compare]");
  if (compare) {
    const range = $(".compare-range", compare);
    let touched = false, dragging = false;
    const set = (value) => {
      const p = Math.max(0, Math.min(100, value));
      compare.style.setProperty("--pos", `${p}%`);
      range.value = String(Math.round(p));
      range.setAttribute("aria-valuetext", dyn("dnValue").replace("{p}", Math.round(p)));
    };
    const fromPointer = (e) => {
      const rect = compare.getBoundingClientRect();
      set(((e.clientX - rect.left) / rect.width) * 100);
    };
    compare.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      touched = dragging = true;
      compare.setPointerCapture(e.pointerId);
      compare.classList.add("is-dragging");
      fromPointer(e);
    });
    compare.addEventListener("pointermove", (e) => { if (dragging) fromPointer(e); });
    const stop = () => { dragging = false; compare.classList.remove("is-dragging"); };
    compare.addEventListener("pointerup", stop);
    compare.addEventListener("pointercancel", stop);
    compare.addEventListener("click", () => range.focus({ preventScroll: true }));
    range.style.pointerEvents = "none";
    range.addEventListener("input", () => { touched = true; set(Number(range.value)); });
    document.addEventListener("ef:lang", () => set(Number(range.value)));
    set(50);
    // On first sight the dusk sweeps across once: noon on the left, then night, then back to the middle.
    if (!reduceMotion) {
      const sweep = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        sweep.disconnect();
        const keys = [[0, 50], [900, 86], [2300, 14], [3200, 50]];
        const start = performance.now();
        const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
        const step = (now) => {
          if (touched) return;
          const t = now - start;
          let i = 0;
          while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
          const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
          set(p0 + (p1 - p0) * ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))));
          if (t < keys[keys.length - 1][0]) requestAnimationFrame(step);
        };
        setTimeout(() => requestAnimationFrame(step), 350);
      }, { threshold: 0.55 });
      sweep.observe(compare);
    }
  }

  /* ---------------------------------------------------------------- fog of war */
  function fogOfWar(frame) {
    const canvas = $(".fog", frame);
    const ctx = canvas.getContext("2d");
    const hint = $(".fog-hint span", frame);
    let w = 0, h = 0, dpr = 1, cleared = 0, auto = null, touchedAt = 0, ready = false;

    function clouds() {
      // Soft white-green banks, as the game's fog of war draws them around a new expedition.
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(196, 210, 200, 0.94)";
      ctx.fillRect(0, 0, w, h);
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 70; i++) {
        const x = rand() * w, y = rand() * h, r = (0.08 + rand() * 0.2) * Math.max(w, h);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const light = rand() > 0.45;
        g.addColorStop(0, light ? "rgba(236,242,236,.55)" : "rgba(150,170,165,.35)");
        g.addColorStop(1, "rgba(200,212,204,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // The castle's own light: a clearing around the keep at the start.
      reveal(w * 0.5, h * 0.52, Math.min(w, h) * 0.2, 1);
      cleared = 0;
    }
    function reveal(x, y, radius, strength = 0.9) {
      ctx.globalCompositeOperation = "destination-out";
      const g = ctx.createRadialGradient(x, y, radius * 0.35, x, y, radius);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = frame.clientWidth; h = frame.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clouds();
      frame.classList.remove("is-cleared");
      ready = true;
    }
    function brush(x, y) {
      reveal(x, y, Math.max(46, Math.min(w, h) * 0.13));
      cleared += 1;
      if (cleared > 26) frame.classList.add("is-cleared");
    }
    let lastPoint = null;
    function trail(x, y) {
      // Fill the gaps of a fast move so the trail stays whole, like a scout walking cell by cell.
      if (lastPoint) {
        const dx = x - lastPoint[0], dy = y - lastPoint[1];
        const steps = Math.min(12, Math.floor(Math.hypot(dx, dy) / 24));
        for (let i = 1; i <= steps; i++) brush(lastPoint[0] + (dx * i) / (steps + 1), lastPoint[1] + (dy * i) / (steps + 1));
      }
      brush(x, y);
      lastPoint = [x, y];
    }
    frame.addEventListener("pointermove", (e) => {
      if (!ready) return;
      const rect = frame.getBoundingClientRect();
      touchedAt = performance.now();
      stopAuto();
      trail(e.clientX - rect.left, e.clientY - rect.top);
    });
    frame.addEventListener("pointerleave", () => { lastPoint = null; });
    frame.addEventListener("pointerdown", (e) => {
      const rect = frame.getBoundingClientRect();
      touchedAt = performance.now();
      stopAuto();
      lastPoint = null;
      trail(e.clientX - rect.left, e.clientY - rect.top);
    });
    function stopAuto() { if (auto) { cancelAnimationFrame(auto); auto = null; } }
    function scout() {
      // Untouched for a while: a scout walks out of the castle on its own, in a widening loop.
      const start = performance.now();
      let prev = null;
      const step = (now) => {
        const t = (now - start) / 1000;
        if (t > 7) { auto = null; return; }
        const radius = Math.min(w, h) * (0.12 + t * 0.04);
        const angle = t * 1.6;
        const x = w * 0.5 + Math.cos(angle) * radius * 1.5, y = h * 0.52 + Math.sin(angle) * radius;
        if (prev) lastPoint = prev;
        trail(x, y);
        prev = [x, y];
        lastPoint = null;
        auto = requestAnimationFrame(step);
      };
      auto = requestAnimationFrame(step);
    }
    new ResizeObserver(() => resize()).observe(frame);
    if (!reduceMotion) {
      let timer = null;
      new IntersectionObserver(([e]) => {
        clearTimeout(timer);
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          timer = setTimeout(() => { if (performance.now() - touchedAt > 2500 && !frame.classList.contains("is-cleared")) scout(); }, 2600);
        } else {
          stopAuto();
        }
      }, { threshold: [0, 0.6] }).observe(frame);
    }
    const touchHint = () => { if (matchMedia("(hover: none)").matches && hint) hint.textContent = dyn("fogTouch"); };
    touchHint();
    document.addEventListener("ef:lang", touchHint);
  }
  $$("[data-fog]").forEach(fogOfWar);

  /* ---------------------------------------------------------------- showreel */
  const player = $("[data-player]");
  if (player) {
    const video = $("video", player);
    $("[data-player-start]", player).addEventListener("click", () => {
      player.classList.add("is-playing");
      video.play().catch(() => player.classList.remove("is-playing"));
      video.focus({ preventScroll: true });
    });
    video.addEventListener("play", () => player.classList.add("is-playing"));
  }

  /* ---------------------------------------------------------------- gallery lightbox */
  const box = $("[data-lightbox]");
  const shots = $$("[data-gallery] [data-full]");
  const boxImg = $("[data-lightbox-img]");
  const boxCaption = $("[data-lightbox-caption]");
  let index = -1, opener = null;
  const full = (name) => `assets/img/${name}-1920.webp`;
  function show(i) {
    index = (i + shots.length) % shots.length;
    const shot = shots[index];
    boxImg.classList.add("is-loading");
    boxImg.onload = () => boxImg.classList.remove("is-loading");
    boxImg.src = full(shot.dataset.full);
    boxImg.alt = $("img", shot).alt;
    boxCaption.textContent = `${shot.dataset.caption} · ${dyn("shotOf").replace("{i}", index + 1).replace("{n}", shots.length)}`;
    [index - 1, index + 1].forEach((j) => { new Image().src = full(shots[(j + shots.length) % shots.length].dataset.full); });
  }
  function openBox(i, from) {
    opener = from;
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add("is-open"));
    document.body.style.overflow = "hidden";
    show(i);
    $("[data-lightbox-close]").focus();
  }
  function closeBox() {
    box.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(() => { box.hidden = true; boxImg.removeAttribute("src"); }, 250);
    if (opener) opener.focus();
  }
  shots.forEach((shot, i) => shot.addEventListener("click", () => openBox(i, shot)));
  $("[data-lightbox-close]").addEventListener("click", closeBox);
  $("[data-lightbox-prev]").addEventListener("click", () => show(index - 1));
  $("[data-lightbox-next]").addEventListener("click", () => show(index + 1));
  box.addEventListener("click", (e) => { if (e.target === box || e.target.tagName === "FIGURE") closeBox(); });
  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") closeBox();
    else if (e.key === "ArrowLeft") show(index - 1);
    else if (e.key === "ArrowRight") show(index + 1);
    else if (e.key === "Tab") {
      const focusables = $$("button", box);
      const at = focusables.indexOf(document.activeElement);
      e.preventDefault();
      focusables[(at + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
    }
  });
  let swipeX = null;
  box.addEventListener("pointerdown", (e) => { swipeX = e.clientX; });
  box.addEventListener("pointerup", (e) => {
    if (swipeX == null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
  document.addEventListener("ef:lang", () => { if (!box.hidden) show(index); });

  /* ---------------------------------------------------------------- downloads */
  function detectPlatform() {
    const ua = navigator.userAgent || "";
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    const iPadOS = /Mac/i.test(platform) && navigator.maxTouchPoints > 1;
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS) return "mobile";
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
    if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return "macos";
    return "other";
  }
  const platform = detectPlatform();
  let release = null;

  const mb = (bytes) => `${Math.round(bytes / 1048576)} ${dyn("mb")}`;
  const dateText = (iso) => {
    try { return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00Z`)); }
    catch { return iso; }
  };

  function renderRelease() {
    const card = (os) => $(`.dl-card[data-platform="${os}"]`);
    ["windows", "macos"].forEach((os) => {
      card(os).classList.toggle("is-recommended", platform === os);
      card(os).setAttribute("data-badge", dyn("badge"));
    });
    if (!release) return;
    $$('[data-release="version"]').forEach((el) => { el.textContent = release.version; });
    $$('[data-release="date"]').forEach((el) => { el.textContent = release.date ? dateText(release.date) : ""; });
    ["windows", "macos"].forEach((os) => {
      const asset = release.assets && release.assets[os];
      if (!asset) return;
      $$(`[data-asset="${os}"]`).forEach((a) => { a.href = asset.url; });
      $$(`[data-file="${os}"]`).forEach((el) => { el.textContent = asset.name; });
      $$(`[data-size="${os}"]`).forEach((el) => { el.textContent = mb(asset.bytes); });
      $$(`[data-sha="${os}"]`).forEach((el) => { el.textContent = asset.sha256; });
    });
    if (release.releases_url) $$("[data-releases-link]").forEach((a) => { a.href = release.releases_url; });
    const primary = release.assets && release.assets[platform];
    $$("[data-primary-download]").forEach((a) => {
      const label = $("[data-primary-label]", a);
      if (primary) {
        a.href = primary.url;
        label.textContent = platform === "windows" ? dyn("dlWin") : dyn("dlMac");
      } else {
        a.href = "#download";
        label.textContent = dyn("dlAny");
      }
    });
  }

  fetch("release.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`release.json ${r.status}`))))
    .then((data) => { release = data; renderRelease(); })
    .catch((err) => { console.warn("Ember Foundry: release info unavailable", err); renderRelease(); });
  document.addEventListener("ef:lang", renderRelease);

  if (platform === "mobile") $("[data-mobile-note]").hidden = false;

  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); say(done); }
    catch { say(dyn("copyFail")); }
  }
  $("[data-copy-link]").addEventListener("click", () => {
    const url = new URL(location.href);
    url.hash = "download";
    copy(url.toString(), dyn("linkCopied"));
  });
  $$("[data-copy-sha]").forEach((btn) => btn.addEventListener("click", () => {
    copy($(`[data-sha="${btn.dataset.copySha}"]`).textContent.trim(), dyn("copied"));
    const label = btn.textContent;
    btn.textContent = dyn("copied");
    setTimeout(() => { btn.textContent = label; }, 1600);
  }));

  /* ---------------------------------------------------------------- counters */
  const counted = new WeakSet();
  function count(el) {
    const target = Number(el.dataset.count);
    const fmt = () => new Intl.NumberFormat(lang === "en" ? "en-US" : "ru-RU");
    if (reduceMotion) { el.textContent = fmt().format(target); return; }
    const start = performance.now(), duration = 1500;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = fmt().format(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const countObserver = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting || counted.has(e.target)) return;
    counted.add(e.target);
    count(e.target);
  }), { threshold: 0.6 });
  $$("[data-count]").forEach((el) => countObserver.observe(el));
  document.addEventListener("ef:lang", () => $$("[data-count]").forEach((el) => {
    if (counted.has(el)) el.textContent = new Intl.NumberFormat(lang === "en" ? "en-US" : "ru-RU").format(Number(el.dataset.count));
  }));

  applyLang(pickLang(), false);
})();
