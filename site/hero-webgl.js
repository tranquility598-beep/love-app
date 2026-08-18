/* ============================================================================
   hero-webgl.js — настоящая 3D-сцена героя (WebGL через Three.js)
   ----------------------------------------------------------------------------
   Загружается как ES-модуль только на index.html. Всё монохромное: белые
   линии и точки на чёрном, никакого цвета и никаких текстур.

   Что в сцене:
     · каркасный икосаэдр (wireframe) — медленно вращается сам
     · внутренняя сфера-каркас — вращается в противоход, даёт «объём»
     · облако точек — реагирует на курсор и на скролл

   Дисциплина производительности:
     · devicePixelRatio ограничен 2
     · рендер останавливается, когда герой уходит из вьюпорта
     · при уходе со страницы всё освобождается через dispose()
     · на тач-устройствах и при prefers-reduced-motion модуль не запускается
       вовсе — остаётся CSS-фолбэк .hero-orb
   ========================================================================== */

const canvas = document.getElementById("hero-canvas");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;

/* Ранний выход: на телефоне и при отключённой анимации 3D не нужен. */
if (canvas && !reduced && !coarse) {
  try {
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js");
    start(THREE);
  } catch (e) {
    /* CDN недоступен — молча остаёмся на CSS-орбе. Консоль не засоряем. */
  }
}

function start(THREE) {
  const host = canvas.parentElement;
  let w = host.clientWidth;
  let h = host.clientHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
  camera.position.set(0, 0, 7.4);

  /* Группа объекта. Её положение и масштаб считает layout() — см. ниже,
     фиксированных мировых координат здесь больше нет. */
  const group = new THREE.Group();
  scene.add(group);

  const disposables = [];
  function track(...items) { items.forEach((i) => disposables.push(i)); }

  /* --- 1. Внешний каркас: икосаэдр 2-го порядка -------------------------- */
  const shellGeo = new THREE.IcosahedronGeometry(2.05, 2);
  const shellWire = new THREE.WireframeGeometry(shellGeo);
  const shellMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.16
  });
  const shell = new THREE.LineSegments(shellWire, shellMat);
  group.add(shell);
  track(shellGeo, shellWire, shellMat);

  /* --- 2. Внутренняя сфера: тонкая сетка, вращение в противоход ---------- */
  const coreGeo = new THREE.SphereGeometry(1.24, 26, 18);
  const coreWire = new THREE.WireframeGeometry(coreGeo);
  const coreMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.075
  });
  const core = new THREE.LineSegments(coreWire, coreMat);
  group.add(core);
  track(coreGeo, coreWire, coreMat);

  /* --- 3. Ядро: почти чёрная сфера, чтобы дальние линии не просвечивали -- */
  const massGeo = new THREE.SphereGeometry(1.18, 32, 24);
  const massMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const mass = new THREE.Mesh(massGeo, massMat);
  group.add(mass);
  track(massGeo, massMat);

  /* --- 4. Облако точек вокруг объекта ----------------------------------- */
  const COUNT = 620;
  const pos = new Float32Array(COUNT * 3);
  /* Детерминированное распределение: без Math.random, чтобы картинка была
     одинаковой при каждой загрузке (и на скриншотах тоже). */
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const t = i / COUNT;
    const r = 2.6 + t * 2.9;
    const phi = Math.acos(1 - 2 * ((i + 0.5) / COUNT));
    const theta = GOLDEN * i;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.62;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.019, transparent: true, opacity: 0.5, sizeAttenuation: true
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);
  track(dustGeo, dustMat);

  /* --- Раскладка кадра ---------------------------------------------------
     Здесь была настоящая ошибка: смещение объекта задавалось фиксированным
     числом в мировых единицах (2.15), а видимая полуширина сцены зависит от
     соотношения сторон кадра — halfH * (w/h). На ультравайде кадр становится
     низким и широким, полуширина падает до 3.79, а край каркаса всё так же
     просит 2.15 + 2.05 = 4.20 — и правый бок сферы срезало ровно на 100px.
     Теперь и позиция, и размер считаются от текстовой колонки, а в кадр
     объект попадает целиком по построению, а не по совпадению. */
  const HALF_H = Math.tan((42 / 2) * Math.PI / 180) * camera.position.z;
  const R = 2.05;               /* радиус внешнего каркаса */
  let baseScale = 1;

  function layout() {
    w = host.clientWidth;
    h = host.clientHeight;
    if (!w || !h) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);

    const halfW = HALF_H * (w / h);
    const col = document.querySelector(".hero-inner");
    const cw = col ? col.getBoundingClientRect().width : Math.min(w, 1180);

    /* Размер: диаметр привязан к колонке, а не к экрану. Иначе на широком
       мониторе объект раздувается вместе с кадром и съедает композицию. */
    const wantR = Math.min(cw * 0.335, 430);
    baseScale = (wantR / (w / 2)) * halfW / R;

    /* Позиция: центр правее центра колонки на 0.28 её ширины — та же
       пропорция, что была на 1440, только выраженная в долях, а не в
       мировых единицах. Ниже 780px колонка занимает экран целиком,
       объект уходит под текст и вниз. */
    const offPx = w > 780 ? cw * 0.28 : 0;
    let x = (offPx / w) * 2 * halfW;
    const lim = halfW - R * baseScale - 0.08;   /* страховка от срезания */
    group.position.x = x > lim ? Math.max(0, lim) : x;
    group.position.y = w > 780 ? 0 : -0.4;

    /* Пыль растягиваем до краёв кадра: на ультравайде она заполняет фланги,
       которые иначе остаются пустой чернотой. */
    dust.scale.setScalar(Math.max(1, halfW / 4.5));
  }
  layout();

  /* --- Ввод: курсор и скролл -------------------------------------------- */
  let tgX = 0, tgY = 0, curX = 0, curY = 0, scrollN = 0;

  function onMouse(e) {
    tgX = (e.clientX / window.innerWidth - 0.5) * 2;
    tgY = (e.clientY / window.innerHeight - 0.5) * 2;
  }
  function onScroll() {
    const r = host.getBoundingClientRect();
    /* 0 — герой на месте, 1 — герой полностью ушёл вверх */
    scrollN = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
  }
  window.addEventListener("mousemove", onMouse, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* --- Пауза за пределами вьюпорта -------------------------------------- */
  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !raf) loop();
  }, { rootMargin: "120px" });
  io.observe(host);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && visible && !raf) loop();
  });

  /* --- Ресайз ----------------------------------------------------------- */
  let rz;
  function onResize() {
    clearTimeout(rz);
    rz = setTimeout(layout, 150);
  }
  window.addEventListener("resize", onResize, { passive: true });

  /* --- Цикл рендера ----------------------------------------------------- */
  let raf = 0;
  let t = 0;
  function loop() {
    if (!visible || document.hidden) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    t += 0.005;

    /* Плавное догоняние курсора: объект не дёргается за мышью. */
    curX += (tgX - curX) * 0.045;
    curY += (tgY - curY) * 0.045;

    shell.rotation.y = t * 0.62 + curX * 0.34;
    shell.rotation.x = Math.sin(t * 0.5) * 0.16 - curY * 0.22;
    core.rotation.y = -t * 0.95;
    core.rotation.z = t * 0.28;

    /* Скролл уводит объект в глубину и гасит — экспозиция «закрывается».
       Масштаб — базовый из layout() и поверх него убывание по скроллу. */
    const z = -scrollN * 3.1;
    group.position.z = z;
    group.scale.setScalar(baseScale * (1 - scrollN * 0.16));
    shellMat.opacity = 0.16 * (1 - scrollN * 0.85);
    coreMat.opacity = 0.075 * (1 - scrollN * 0.85);

    dust.rotation.y = t * 0.13 + curX * 0.1;
    dust.rotation.x = -curY * 0.07;
    dustMat.opacity = 0.5 * (1 - scrollN * 0.9);

    renderer.render(scene, camera);
  }

  /* Первый кадр — и только после него показываем canvas, чтобы не было
     вспышки пустого прямоугольника. */
  renderer.render(scene, camera);
  canvas.classList.add("is-ready");
  document.documentElement.classList.add("webgl-on");
  loop();

  /* --- Освобождение ресурсов ------------------------------------------- */
  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    io.disconnect();
    window.removeEventListener("mousemove", onMouse);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    disposables.forEach((d) => d.dispose && d.dispose());
    renderer.dispose();
  }
  window.addEventListener("pagehide", destroy, { once: true });
}
