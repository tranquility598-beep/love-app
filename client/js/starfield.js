/**
 * Улучшенный анимированный космический фон с лучистыми звездами
 */
(function() {
  const canvas = document.createElement('canvas');
  canvas.id = 'starfield-canvas';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  
  let width, height;
  let stars = [];
  let nebulae = [];
  const numStars = 300; // Больше звезд для заполнения всего экрана
  const numNebulae = 3; // Меньше туманностей чтобы не мешали
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;
  let autoRotation = 0; // Автоматическое вращение камеры
  let screenRotation = 0; // Вращение всего экрана

  function init() {
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    resize();
    createStars();
    createNebulae();
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
    let starsWithRays = 0;
    const maxStarsWithRays = 5; // Максимум 5 звезд с лучами
    
    for (let i = 0; i < numStars; i++) {
      // Распределение звезд по всему пространству включая края
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * 2500; // Квадратный корень для равномерного распределения по площади
      
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      // Разные размеры звезд - почти все маленькие, только 5 с лучами
      let starSize, hasRays;
      
      if (starsWithRays < maxStarsWithRays && Math.random() < 0.02) {
        // Только 5 звезд будут с лучами (большие)
        starSize = 0.9 + Math.random() * 0.6;
        hasRays = true;
        starsWithRays++;
      } else {
        // Все остальные - маленькие без лучей
        starSize = 0.2 + Math.random() * 0.4;
        hasRays = false;
      }
      
      stars.push({
        x: x,
        y: y,
        z: Math.random() * 2500, // Дальше от камеры
        pz: Math.random() * 2500,
        type: 'white',
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.06,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        baseSize: starSize,
        hasRays: hasRays
      });
    }
  }

  function createNebulae() {
    nebulae = [];
    for (let i = 0; i < numNebulae; i++) {
      nebulae.push({
        x: Math.random() * 2000 - 1000,
        y: Math.random() * 2000 - 1000,
        z: 1700 + Math.random() * 300, // Дальше от камеры
        size: 150 + Math.random() * 200, // Меньше размер
        color: Math.random() < 0.5 ? 'purple' : 'blue',
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.001
      });
    }
  }

  function onMouseMove(e) {
    // Камера поворачивается в сторону мыши
    mouseX = (e.clientX - width / 2) * 0.15;
    mouseY = (e.clientY - height / 2) * 0.15;
  }

  function drawNebula(nebula, cx, cy) {
    const factor = 400;
    const x = (nebula.x * factor / nebula.z) + cx - targetX * 0.5;
    const y = (nebula.y * factor / nebula.z) + cy - targetY * 0.5;
    const size = (nebula.size * factor / nebula.z);
    
    if (size < 10) return;

    nebula.rotation += nebula.rotationSpeed;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
    
    if (nebula.color === 'purple') {
      gradient.addColorStop(0, 'rgba(138, 43, 226, 0.08)');
      gradient.addColorStop(0.5, 'rgba(75, 0, 130, 0.04)');
      gradient.addColorStop(1, 'rgba(75, 0, 130, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(0, 100, 255, 0.06)');
      gradient.addColorStop(0.5, 'rgba(0, 50, 150, 0.03)');
      gradient.addColorStop(1, 'rgba(0, 50, 150, 0)');
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(nebula.rotation);
    ctx.fillStyle = gradient;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    ctx.restore();
  }

  function getStarColor(star, intensity) {
    const twinkle = Math.sin(star.twinkle) * 0.2 + 0.8; // Меньше мерцание, больше яркости
    const i = intensity * twinkle;
    
    switch(star.type) {
      case 'blue':
        return { r: i * 0.8, g: i * 0.95, b: i, glow: 'rgba(150, 200, 255, 1)' };
      case 'yellow':
        return { r: i, g: i * 0.95, b: i * 0.7, glow: 'rgba(255, 240, 150, 0.9)' };
      case 'red':
        return { r: i, g: i * 0.7, b: i * 0.6, glow: 'rgba(255, 150, 150, 0.8)' };
      default:
        return { r: i, g: i, b: i, glow: 'rgba(255, 255, 255, 1)' };
    }
  }

  // Рисуем звезду с лучами (четкие лучи с легким свечением)
  function drawStarWithRays(x, y, size, color, rotation, twinkle) {
    const alpha = twinkle * 0.2 + 0.8;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Основное тело звезды (яркий центр без blur)
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
    
    // Рисуем 4 основных луча (крестик) - четкие и яркие
    const rayLength = size * 6;
    const rayWidth = size * 0.3;
    
    // Горизонтальный луч
    const gradientH = ctx.createLinearGradient(-rayLength, 0, rayLength, 0);
    gradientH.addColorStop(0, `rgba(255, 255, 255, 0)`);
    gradientH.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.9})`);
    gradientH.addColorStop(1, `rgba(255, 255, 255, 0)`);
    
    ctx.fillStyle = gradientH;
    ctx.fillRect(-rayLength, -rayWidth / 2, rayLength * 2, rayWidth);
    
    // Вертикальный луч
    const gradientV = ctx.createLinearGradient(0, -rayLength, 0, rayLength);
    gradientV.addColorStop(0, `rgba(255, 255, 255, 0)`);
    gradientV.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.9})`);
    gradientV.addColorStop(1, `rgba(255, 255, 255, 0)`);
    
    ctx.fillStyle = gradientV;
    ctx.fillRect(-rayWidth / 2, -rayLength, rayWidth, rayLength * 2);
    
    // Диагональные лучи (тоньше)
    ctx.rotate(Math.PI / 4);
    const thinRayWidth = rayWidth * 0.5;
    const thinRayLength = rayLength * 0.7;
    
    const gradientD1 = ctx.createLinearGradient(-thinRayLength, 0, thinRayLength, 0);
    gradientD1.addColorStop(0, `rgba(255, 255, 255, 0)`);
    gradientD1.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.6})`);
    gradientD1.addColorStop(1, `rgba(255, 255, 255, 0)`);
    
    ctx.fillStyle = gradientD1;
    ctx.fillRect(-thinRayLength, -thinRayWidth / 2, thinRayLength * 2, thinRayWidth);
    
    const gradientD2 = ctx.createLinearGradient(0, -thinRayLength, 0, thinRayLength);
    gradientD2.addColorStop(0, `rgba(255, 255, 255, 0)`);
    gradientD2.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.6})`);
    gradientD2.addColorStop(1, `rgba(255, 255, 255, 0)`);
    
    ctx.fillStyle = gradientD2;
    ctx.fillRect(-thinRayWidth / 2, -thinRayLength, thinRayWidth, thinRayLength * 2);
    
    // Легкое свечение вокруг звезды
    const glowGradient = ctx.createRadialGradient(0, 0, size * 0.8, 0, 0, size * 2.5);
    glowGradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.3})`);
    glowGradient.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.1})`);
    glowGradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
    
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(0, 0, size * 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  function animate() {
    if (!document.body.classList.contains('space-theme')) {
      requestAnimationFrame(animate);
      return;
    }

    // Четкий фон для звезд без следов
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; 
    ctx.fillRect(0, 0, width, height);

    // Вращение всего экрана (медленнее)
    screenRotation += 0.0003;

    // Автоматическое плавное вращение камеры вправо
    autoRotation += 0.1;
    const autoX = Math.cos(autoRotation * 0.01) * 50;
    const autoY = Math.sin(autoRotation * 0.01) * 50;

    // Компенсируем вращение экрана для управления мышью
    const cos = Math.cos(-screenRotation);
    const sin = Math.sin(-screenRotation);
    const rotatedMouseX = mouseX * cos - mouseY * sin;
    const rotatedMouseY = mouseX * sin + mouseY * cos;

    // Плавное движение камеры за мышью + автовращение
    targetX += (rotatedMouseX + autoX - targetX) * 0.05;
    targetY += (rotatedMouseY + autoY - targetY) * 0.05;

    const cx = width / 2;
    const cy = height / 2;
    
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(screenRotation);
    ctx.translate(-width / 2, -height / 2);

    // Рисуем туманности (более прозрачные)
    for (let i = 0; i < numNebulae; i++) {
      drawNebula(nebulae[i], cx, cy);
    }

    // Рисуем звезды
    for (let i = 0; i < numStars; i++) {
      let star = stars[i];
      star.pz = star.z;
      
      // Обновляем только мерцание (без вращения)
      star.twinkle += star.twinkleSpeed;
      
      // Медленная скорость полета вперед
      star.z -= 1;
      
      if (star.z <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * 2500;
        
        star.x = Math.cos(angle) * radius;
        star.y = Math.sin(angle) * radius;
        star.z = 2500;
        star.pz = 2500;
      }

      const factor = 400;
      
      // Камера двигается, звезды остаются на месте (инвертируем смещение)
      const x = (star.x * factor / star.z) + cx - targetX;
      const y = (star.y * factor / star.z) + cy - targetY;
      
      const px = (star.x * factor / star.pz) + cx - targetX;
      const py = (star.y * factor / star.pz) + cy - targetY;

      const size = Math.max(0.2, (1 - star.z / 2500) * star.baseSize * 10);
      const intensity = Math.min(255, Math.max(0, parseInt((1 - star.z / 2500) * 280)));
      const twinkle = Math.sin(star.twinkle) * 0.3 + 0.7; // Более заметное мерцание
      
      const color = getStarColor(star, intensity);

      // Рисуем звезды с лучами или без в зависимости от hasRays
      if (star.hasRays && size > 0.4) {
        // Крупные звезды с лучами (без вращения)
        drawStarWithRays(x, y, size, color, 0, twinkle);
      } else {
        // Мелкие звезды без лучей - просто яркие точки
        ctx.beginPath();
        ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
        ctx.fill();
        
        // Легкое свечение для мелких звезд
        const smallGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.5);
        smallGlow.addColorStop(0, `rgba(255, 255, 255, ${twinkle * 0.3})`);
        smallGlow.addColorStop(1, `rgba(255, 255, 255, 0)`);
        ctx.fillStyle = smallGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.restore();
    
    requestAnimationFrame(animate);
  }

  setTimeout(init, 50);
})();
