/**
 * Анимированный космический фон: полет через звезды с эффектом параллакса.
 */
(function() {
  const canvas = document.createElement('canvas');
  canvas.id = 'starfield-canvas';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  
  let width, height;
  let stars = [];
  const numStars = 600; // Количество звезд
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;

  function init() {
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    resize();
    createStars();
    requestAnimationFrame(animate);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * 2000 - 1000,
        y: Math.random() * 2000 - 1000,
        z: Math.random() * 2000,
        pz: Math.random() * 2000
      });
    }
  }

  function onMouseMove(e) {
    mouseX = (e.clientX - width / 2) * 0.8;
    mouseY = (e.clientY - height / 2) * 0.8;
  }

  function animate() {
    if (!document.body.classList.contains('space-theme')) {
      requestAnimationFrame(animate);
      return;
    }

    // Полупрозрачная заливка для создания короткого шлейфа
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; 
    ctx.fillRect(0, 0, width, height);

    // Плавный параллакс за мышью
    targetX += (mouseX - targetX) * 0.05;
    targetY += (mouseY - targetY) * 0.05;

    const cx = width / 2;
    const cy = height / 2;

    for (let i = 0; i < numStars; i++) {
      let star = stars[i];
      star.pz = star.z;
      
      // Скорость полета вперед
      star.z -= 3; 
      
      // Если звезда пролетела мимо камеры, респауним её вдали
      if (star.z <= 0) {
        star.x = Math.random() * 2000 - 1000;
        star.y = Math.random() * 2000 - 1000;
        star.z = 2000;
        star.pz = 2000;
      }

      // 3D проекция
      const factor = 400; // Поле зрения (FOV)
      
      // Добавляем смещение камеры (параллакс) — чем ближе звезда, тем сильнее смещается
      const parallaxFactor1 = (1 - star.z / 2000) * 0.5;
      const x = (star.x * factor / star.z) + cx + targetX * parallaxFactor1;
      const y = (star.y * factor / star.z) + cy + targetY * parallaxFactor1;
      
      const parallaxFactor2 = (1 - star.pz / 2000) * 0.5;
      const px = (star.x * factor / star.pz) + cx + targetX * parallaxFactor2;
      const py = (star.y * factor / star.pz) + cy + targetY * parallaxFactor2;

      // Размер и яркость зависят от расстояния
      const size = Math.max(0.1, (1 - star.z / 2000) * 2.5);
      const intensity = Math.min(255, Math.max(0, parseInt((1 - star.z / 2000) * 255)));
      
      // Для далеких звезд цвет немного с синевой, для ближних — белый
      const r = intensity;
      const g = intensity;
      const b = Math.min(255, intensity + 20);

      // Рисуем шлейф от предыдущей позиции к новой
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.lineWidth = size;
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Ближним звездам добавляем свечение
      if (size > 1.2) {
        ctx.beginPath();
        ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
        ctx.fill();
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(200, 220, 255, 0.8)';
      } else {
        ctx.shadowBlur = 0;
      }
    }
    
    ctx.shadowBlur = 0;
    requestAnimationFrame(animate);
  }

  // Запуск после небольшой задержки, чтобы DOM успел прогрузиться
  setTimeout(init, 50);
})();
