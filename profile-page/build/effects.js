// Shared by public pages and the live editor. No external assets or libraries.
// kind is one effect id or a list of them: several effects share one container.
function mountProfileEffects(container, kind) {
  if (Array.isArray(kind)) {
    const unique = kind.filter((id, index) => typeof id === 'string' && kind.indexOf(id) === index).slice(0, 4);
    const disposers = unique.map(id => mountProfileEffects(container, id));
    let released = false;
    return () => { if (released) return; released = true; disposers.forEach(fn => fn()); };
  }
  const doc = container.ownerDocument, win = doc.defaultView;
  const supported = ['particles','stars','rain','snow','comets','trail','bokeh','glow','aurora','constellation','grain',
    'ripple','hearts','sparkles','fireflies','petals','waves','scanlines','metal','haze','noise'];
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (motion?.matches || !supported.includes(kind)) return () => {};
  const target = container === doc.body ? win : (container.getRootNode().host || container);
  // pointerleave does not bubble: a public page leaves <html>, not window.
  // The editor instead leaves its shadow host, even when the pointer stays in the window.
  const leaveTarget = container === doc.body ? doc.documentElement : target;
  const cleanups = [];
  let frame = null, disposed = false;
  function listen(node, event, handler, options) { node.addEventListener(event, handler, options); cleanups.push(() => node.removeEventListener(event, handler, options)); }
  function schedule(callback) { if (!disposed) frame = win.requestAnimationFrame(time => { frame = null; if (!disposed) callback(time); }); }
  // glow and scanlines are pure CSS layers; the rest draw on their own canvas.
  const cssLayer = kind === 'glow' || kind === 'scanlines';
  const surface = doc.createElement(cssLayer ? 'div' : 'canvas');
  surface.className = kind === 'glow' ? 'pf-glow' : kind === 'scanlines' ? 'pf-scan'
    : (kind === 'trail' || kind === 'ripple' ? 'pf-fx pf-fx--trail' : 'pf-fx');
  surface.setAttribute('aria-hidden','true'); container.appendChild(surface);
  function dispose() { if (disposed) return; disposed = true; if (frame !== null) win.cancelAnimationFrame(frame); frame = null; cleanups.forEach(fn => fn()); surface.remove(); }
  if (motion?.addEventListener) listen(motion, 'change', event => { if (event.matches) dispose(); });
  if (kind === 'scanlines') return dispose;
  function point(event) { const box = surface.getBoundingClientRect(); return { x:(event.clientX-box.left)*surface.clientWidth/(box.width||1), y:(event.clientY-box.top)*surface.clientHeight/(box.height||1) }; }
  if (kind === 'glow') {
    let cursor;
    function hideGlow() { if (frame !== null) win.cancelAnimationFrame(frame); frame = null; surface.classList.remove('is-on'); }
    listen(target,'pointermove',event => { if (doc.hidden || event.pointerType === 'touch') return; cursor = point(event); surface.classList.add('is-on'); if (frame === null) schedule(() => { surface.style.setProperty('--gx',cursor.x+'px'); surface.style.setProperty('--gy',cursor.y+'px'); }); },{passive:true});
    listen(leaveTarget,'pointerleave',hideGlow);
    listen(win, 'blur', hideGlow);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) hideGlow(); });
    return dispose;
  }
  const ctx = surface.getContext('2d'); if (!ctx) return dispose;
  const style = win.getComputedStyle(container);
  const read = name => (style.getPropertyValue(name) || '').trim();
  // Own effect colors (--fx-1/--fx-2) win over the page accent.
  const color = read('--fx-1') || read('--accent') || '#e8e8e8';
  const colorTo = read('--fx-2') || read('--accent-to') || color;
  const tints = [color, colorTo];
  const lowPower = (win.navigator.hardwareConcurrency||8)<=4 || (win.navigator.deviceMemory||8)<=4;
  const dpr = Math.min(win.devicePixelRatio||1,lowPower?1.25:1.75);
  const random = (a,b) => a+Math.random()*(b-a), tau = Math.PI*2;
  if (kind === 'trail') return startCursorRibbon();
  if (kind === 'ripple') return startRipples();
  const falling = ['rain','snow','petals'].includes(kind), floating = ['stars','constellation','fireflies','sparkles'].includes(kind);
  let width=1,height=1,particles=[],last=0,elapsed=0,parallax={x:0,y:0},cursor={x:0,y:0,active:false};
  let meteors=[],nextMeteor=1.2,sprites=[],sparks=[],lastSpark=null;
  function sprite(tint) {
    const node=doc.createElement('canvas');node.width=node.height=96;
    const brush=node.getContext('2d');if (!brush) return node;
    const gradient=brush.createRadialGradient(48,48,0,48,48,48);
    gradient.addColorStop(0,tint);gradient.addColorStop(.18,tint);gradient.addColorStop(1,'transparent');
    brush.fillStyle=gradient;brush.fillRect(0,0,96,96);return node;
  }
  function spawn(initial=true) {
    const depth=random(.2,1);
    return {x:random(-40,width+40),y:initial||floating?random(-30,height+30):(falling?-30:height+30),depth,radius:random(.45,1.35)*depth+.2,
      phase:random(0,tau),alpha:random(.18,.65),pulse:random(.2,.7),tint:Math.random()<.5?0:1,
      rot:random(0,tau),spin:random(-1.2,1.2),vx:random(-1,1),vy:random(-1,1),life:random(0,1),span:random(1.4,3.2)};
  }
  function resize() {
    width=Math.max(1,surface.clientWidth);height=Math.max(1,surface.clientHeight);
    surface.width=Math.round(width*dpr);surface.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const densities={particles:45,stars:100,rain:110,snow:70,bokeh:14,comets:70,constellation:50,trail:0,aurora:0,grain:0,
      hearts:16,sparkles:28,fireflies:22,petals:26,waves:0,metal:0,haze:0,noise:0};
    const area=Math.min(2.2,Math.max(.45,width*height/700000));
    particles=Array.from({length:Math.round(densities[kind]*area*(lowPower ? .65 : 1))},()=>spawn());
  }
  resize();listen(win,'resize',resize,{passive:true});
  if (win.ResizeObserver) { const observer=new win.ResizeObserver(resize);observer.observe(container);cleanups.push(()=>observer.disconnect()); }
  listen(target,'pointermove',event => {
    cursor={...point(event),active:true};
    // Sparkles also leave a short glittering wake behind the cursor.
    if (kind==='sparkles' && event.pointerType!=='touch') {
      if (!lastSpark || Math.hypot(cursor.x-lastSpark.x,cursor.y-lastSpark.y)>14) {
        lastSpark={x:cursor.x,y:cursor.y};
        sparks.push({x:cursor.x,y:cursor.y,vx:random(-18,18),vy:random(-26,6),life:0,span:random(.5,.9),size:random(2.5,5),rot:random(0,tau),tint:Math.random()<.5?0:1});
        if (sparks.length>40) sparks.shift();
      }
    }
  },{passive:true});
  listen(leaveTarget,'pointerleave',()=>{cursor.active=false;lastSpark=null;});
  function dot(x,y,radius,alpha,glow=false,tint=0) {
    ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
    if(glow)ctx.drawImage(sprites[tint]||sprites[0],x-radius*6,y-radius*6,radius*12,radius*12);
    ctx.fillStyle=tints[tint]||color;
    ctx.beginPath();ctx.arc(x,y,radius,0,tau);ctx.fill();
  }
  // Particles drift away from the pointer: the page answers the visitor's hand.
  function repel(p,dt,reach=120,force=90) {
    if(!cursor.active)return;
    const dx=p.x-cursor.x,dy=p.y-cursor.y,distance=Math.hypot(dx,dy);
    if(distance<1||distance>reach)return;
    const push=(1-distance/reach)*force*dt;p.x+=dx/distance*push;p.y+=dy/distance*push;
  }
  function stars(dt,time) {
    particles.forEach(p=>{
      p.x+=dt*p.depth*.7;if(p.x>width+20)p.x=-20;
      const x=p.x+parallax.x*p.depth*10,y=p.y+parallax.y*p.depth*10;
      const alpha=p.alpha*(.6+Math.sin(time*p.pulse+p.phase)*.4);
      const tint=p.depth>.6?p.tint:0;
      dot(x,y,p.radius,alpha,p.depth>.83,tint);
      if(p.depth>.92){ctx.strokeStyle=tints[tint];ctx.globalAlpha=alpha*.35;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();}
    });ctx.strokeStyle=color;
  }
  function shootingStars(dt,time) {
    if(time>=nextMeteor){nextMeteor=time+random(2.4,5.5);meteors.push({x:random(width*.2,width*1.25),y:random(-50,height*.25),life:0,duration:random(1,1.8),length:random(70,150)});}
    meteors=meteors.filter(p=>p.life<p.duration);
    meteors.forEach(p=>{
      p.life+=dt;p.x-=230*dt;p.y+=160*dt;
      const alpha=Math.sin(Math.PI*Math.min(1,p.life/p.duration))*.8;
      const tx=p.x+p.length,ty=p.y-p.length*.7,g=ctx.createLinearGradient(tx,ty,p.x,p.y);
      g.addColorStop(0,'transparent');g.addColorStop(.6,colorTo);g.addColorStop(1,color);ctx.strokeStyle=g;ctx.globalAlpha=alpha;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(p.x,p.y);ctx.stroke();dot(p.x,p.y,1.1,alpha,true);
    });ctx.strokeStyle=color;
  }
  function weather(dt,time) {
    // Wind follows the pointer a little, so snow and rain lean with the visitor.
    const wind=parallax.x*40;
    particles.forEach((p,i)=>{
      if(kind==='rain'){
        const speed=180+p.depth*420;p.x-=(speed*.16-wind)*dt;p.y+=speed*dt;
        const length=9+p.depth*25,g=ctx.createLinearGradient(p.x,p.y,p.x+length*.16,p.y-length);
        g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.strokeStyle=g;ctx.globalAlpha=p.alpha*.42;ctx.lineWidth=.45+p.depth*.6;
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+length*.16,p.y-length);ctx.stroke();
      }else{
        p.y+=(12+p.depth*28)*dt;p.x+=(Math.sin(time*.45+p.phase)*14+4+wind*.6)*dt*p.depth;
        repel(p,dt,90,60);
        // Near flakes are larger and softer, far ones are small sharp points.
        dot(p.x,p.y,.7+p.depth*1.8,p.alpha*(.55+p.depth*.4),p.depth>.7,p.depth>.85?p.tint:0);
      }
      if(p.y>height+35||p.x< -45||p.x>width+45)particles[i]=spawn(false);
    });ctx.strokeStyle=color;
  }
  function dust(dt,time) {
    particles.forEach((p,i)=>{
      p.y-=(4+p.depth*12)*dt;p.x+=Math.sin(time*.2+p.phase)*4*dt;repel(p,dt);
      const fade=Math.min(1,Math.max(0,(height-p.y)/80),Math.max(0,p.y/70));
      dot(p.x+parallax.x*p.depth*8,p.y,p.radius,p.alpha*fade*(.65+Math.sin(time*.4+p.phase)*.25),p.depth>.6,p.tint);
      if(p.y< -20)particles[i]=spawn(false);
    });
  }
  function bokeh(dt,time) {
    particles.forEach((p,i)=>{
      p.y-=(2+p.depth*7)*dt;const r=20+p.depth*60,x=p.x+Math.sin(time*.12+p.phase)*30+parallax.x*12;
      ctx.globalAlpha=.035+(.5+Math.sin(time*.2+p.phase)*.5)*.055;ctx.drawImage(sprites[p.tint]||sprites[0],x-r,p.y-r,r*2,r*2);
      if(p.y< -r*2)particles[i]=spawn(false);
    });
  }
  function heartShape(x,y,size,rot) {
    // Path points are transformed when added, so fill() after restore() keeps the shape.
    ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.scale(size/16,size/16);
    ctx.beginPath();ctx.moveTo(0,6);ctx.bezierCurveTo(-9,-.5,-7,-10,0,-4.6);ctx.bezierCurveTo(7,-10,9,-.5,0,6);ctx.closePath();
    ctx.restore();
  }
  function hearts(dt,time) {
    particles.forEach((p,i)=>{
      p.y-=(10+p.depth*22)*dt;p.x+=Math.sin(time*.7+p.phase)*10*dt;repel(p,dt,110,70);
      const fade=Math.min(1,Math.max(0,(height-p.y)/120),Math.max(0,p.y/140));
      const size=5+p.depth*12;
      if(p.depth>.75){ctx.globalAlpha=fade*.12;ctx.drawImage(sprites[p.tint]||sprites[0],p.x-size*2,p.y-size*2,size*4,size*4);}
      ctx.globalAlpha=fade*(.18+p.depth*.4);ctx.fillStyle=tints[p.tint];
      heartShape(p.x+parallax.x*p.depth*10,p.y,size,Math.sin(time*.9+p.phase)*.35);ctx.fill();
      if(p.y< -30)particles[i]=spawn(false);
    });
  }
  function star4(x,y,size,rot) {
    ctx.beginPath();
    for(let k=0;k<8;k++){const r=k%2===0?size:size*.22,a=rot+k*Math.PI/4;if(k===0)ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);else ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}
    ctx.closePath();
  }
  function sparkles(dt,time) {
    particles.forEach((p,i)=>{
      p.life+=dt/p.span;
      if(p.life>=1){particles[i]=spawn(true);particles[i].life=0;return;}
      const glint=Math.sin(Math.PI*p.life),size=(2+p.depth*6)*glint;
      ctx.globalAlpha=glint*(.25+p.depth*.55);ctx.fillStyle=tints[p.tint];
      star4(p.x+parallax.x*p.depth*14,p.y+parallax.y*p.depth*14,size,p.rot+time*.4*p.spin);ctx.fill();
    });
    sparks=sparks.filter(s=>s.life<s.span);
    sparks.forEach(s=>{
      s.life+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=40*dt;
      const k=1-s.life/s.span;ctx.globalAlpha=k*.9;ctx.fillStyle=tints[s.tint];
      star4(s.x,s.y,s.size*k+.5,s.rot+s.life*3);ctx.fill();
    });
  }
  function fireflies(dt,time) {
    particles.forEach(p=>{
      p.x+=(Math.sin(time*.31+p.phase)*16+p.vx*7)*dt;p.y+=(Math.cos(time*.27+p.phase*1.3)*13+p.vy*6)*dt;
      // A curious swarm: fireflies close to the pointer drift towards it.
      if(cursor.active){const dx=cursor.x-p.x,dy=cursor.y-p.y,d=Math.hypot(dx,dy);if(d<200&&d>20){p.x+=dx/d*14*dt;p.y+=dy/d*14*dt;}}
      if(p.x< -30)p.x=width+30;if(p.x>width+30)p.x=-30;if(p.y< -30)p.y=height+30;if(p.y>height+30)p.y=-30;
      const blink=Math.pow(Math.max(0,Math.sin(time*p.pulse*2.4+p.phase)),2);
      const r=6+p.depth*10;
      ctx.globalAlpha=.08+blink*.5;ctx.drawImage(sprites[p.tint]||sprites[0],p.x-r*2,p.y-r*2,r*4,r*4);
      dot(p.x,p.y,.8+p.depth*.8,.25+blink*.75,false,p.tint);
    });
  }
  function petals(dt,time) {
    const wind=parallax.x*30;
    particles.forEach((p,i)=>{
      p.y+=(16+p.depth*30)*dt;p.x+=(Math.sin(time*.8+p.phase)*24+8+wind)*dt;p.rot+=p.spin*dt;repel(p,dt,100,60);
      const size=4+p.depth*7,flip=Math.cos(time*1.7+p.phase);
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.scale(.35+Math.abs(flip)*.65,1);
      ctx.globalAlpha=.22+p.depth*.4;ctx.fillStyle=tints[p.tint];
      ctx.beginPath();ctx.ellipse?.(0,0,size,size*.55,0,0,tau);ctx.fill();
      ctx.globalAlpha*=.5;ctx.strokeStyle=tints[1-p.tint];ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(-size*.8,0);ctx.lineTo(size*.8,0);ctx.stroke();
      ctx.restore();
      if(p.y>height+30||p.x>width+40)particles[i]=spawn(false);
    });
  }
  function waves(time) {
    // Thin silk lines across the lower half, slowly breathing and following the pointer.
    for(let layer=0;layer<6;layer++){
      const base=height*(.52+layer*.075)+parallax.y*18*(layer+1)/6,amp=26+layer*9;
      const g=ctx.createLinearGradient(0,0,width,0);
      g.addColorStop(0,'transparent');g.addColorStop(.25,layer%2?colorTo:color);g.addColorStop(.75,layer%2?color:colorTo);g.addColorStop(1,'transparent');
      ctx.strokeStyle=g;ctx.globalAlpha=.2-layer*.022;ctx.lineWidth=layer===0?1.4:1;ctx.beginPath();
      for(let x=-20;x<=width+20;x+=14){
        const y=base+Math.sin(x*.0045+time*.42+layer*.85)*amp+Math.sin(x*.012-time*.27+layer*1.7)*amp*.25;
        if(x===-20)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }ctx.strokeStyle=color;
  }
  function startRipples() {
    // Event driven: nothing runs until the visitor taps or clicks.
    const duration = 950;
    let w = 1, h = 1, rings = [];
    function resizeRipples() {
      w = Math.max(1, surface.clientWidth);h = Math.max(1, surface.clientHeight);
      surface.width = Math.round(w * dpr);surface.height = Math.round(h * dpr);ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw(time) {
      ctx.clearRect(0, 0, w, h);
      rings = rings.filter(ring => time - ring.start < duration);
      rings.forEach(ring => {
        const k = Math.max(0, (time - ring.start) / duration), ease = 1 - Math.pow(1 - k, 3);
        for (let wave = 0; wave < 2; wave++) {
          const local = Math.max(0, ease - wave * .18);
          if (!local) continue;
          ctx.globalAlpha = (1 - k) * (wave ? .28 : .55);
          ctx.strokeStyle = tints[(ring.tint + wave) % 2];
          ctx.lineWidth = 1.6 * (1 - k) + .4;
          ctx.beginPath();ctx.arc(ring.x, ring.y, 6 + local * 86, 0, tau);ctx.stroke();
        }
        ctx.globalAlpha = Math.max(0, .35 - k);ctx.fillStyle = color;
        ctx.beginPath();ctx.arc(ring.x, ring.y, 3 * (1 - k) + 1, 0, tau);ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (rings.length) schedule(draw);
    }
    resizeRipples();
    listen(win, 'resize', resizeRipples, { passive: true });
    if (win.ResizeObserver) {
      const observer = new win.ResizeObserver(resizeRipples);observer.observe(container);
      cleanups.push(() => observer.disconnect());
    }
    let tint = 0;
    listen(target, 'pointerdown', event => {
      if (doc.hidden) return;
      const at = point(event);
      rings.push({ ...at, start: win.performance.now(), tint: tint = 1 - tint });
      if (rings.length > 8) rings.shift();
      if (frame === null) schedule(draw);
    }, { passive: true });
    listen(doc, 'visibilitychange', () => { if (doc.hidden) { rings = [];ctx.clearRect(0, 0, w, h); } });
    return dispose;
  }
  function startCursorRibbon() {
    // Настройки шлейфа приходят переменными страницы (--trail-*); без них —
    // прежний вид: цвета эффектов, обычная толщина, 560 мс, со свечением.
    const lifetime = Math.min(1600, Math.max(200, Number(read('--trail-life')) || 560));
    const thickness = Math.min(3, Math.max(.4, Number(read('--trail-width')) || 1));
    const glow = read('--trail-glow') !== '0';
    const color = read('--trail-1') || tints[0];
    const colorTo = read('--trail-2') || tints[1];
    const maxPoints = Math.round((lowPower ? 72 : 112) * Math.max(1, lifetime / 560));
    const coreColor = style.getPropertyValue('--text').trim() || '#fff';
    let viewportWidth = 1, viewportHeight = 1, points = [], previous = null, section = 0;
    // Мышь остановилась — шлейф сразу втягивается к курсору, хвост первым, и
    // исчезает за retract мс. Одного возраста точек для этого мало: при
    // быстром движении лимит maxPoints оставляет только свежие точки, и
    // шлейф стоял целиком ещё полсекунды, прежде чем начать гаснуть.
    const retract = lifetime * .6, idleAfter = 40, edge = .2;
    let lastSample = 0, idle = false;
    const pulledAt = time => Math.max(0, time - lastSample - idleAfter) / retract;
    // u — место точки в шлейфе в момент остановки: 0 — хвост, 1 — курсор.
    const idleFade = (p, pulled) => Math.max(0, Math.min(1, (p.u + edge - pulled * (1 + edge)) / edge));

    // Мышь снова поехала: втягивание переводим в обычный возраст точек, чтобы
    // полупогасший хвост не вспыхнул обратно.
    function settleIdle(time) {
      const pulled = pulledAt(time);
      points = points.filter(p => {
        const fade = idleFade(p, pulled);
        delete p.u;
        if (fade <= 0) return false;
        if (fade < 1) {
          const life = Math.min(1 - (time - p.time) / lifetime, fade / 4);
          p.time = time - (1 - life) * lifetime;
        }
        return time - p.time < lifetime;
      });
      idle = false;
    }

    function clear() {
      points = [];previous = null;section++;idle = false;
      if (frame !== null) { win.cancelAnimationFrame(frame);frame = null; }
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    }
    function resizeRibbon() {
      viewportWidth = Math.max(1, surface.clientWidth);
      viewportHeight = Math.max(1, surface.clientHeight);
      surface.width = Math.round(viewportWidth * dpr);
      surface.height = Math.round(viewportHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clear();
    }
    function sample(event) {
      if (event.pointerType === 'touch' || doc.hidden) return;
      const position = point(event);
      const time = Number(event.timeStamp) || win.performance.now();
      const distance = previous ? Math.hypot(position.x - previous.x, position.y - previous.y) : 0;
      if (previous && distance < .7) return;
      if (idle) settleIdle(time);
      lastSample = time;
      // Leaving a window, switching tabs or resizing never draws a diagonal
      // connection from the last cursor position to the next entry point.
      if (previous && distance > Math.max(viewportWidth, viewportHeight) * .8 && time - previous.time > 100) { section++;previous = null; }
      const speed = previous ? distance / Math.max(1, time - previous.time) : 0;
      const stroke = previous ? previous.stroke * .65 + (1 + Math.min(1.9, speed * .65)) * .35 : .8;
      const next = { ...position, time, stroke, section };
      if (previous) {
        const steps = Math.min(24, Math.max(1, Math.ceil(distance / 6)));
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          points.push({
            x: previous.x + (next.x - previous.x) * t,
            y: previous.y + (next.y - previous.y) * t,
            time: previous.time + (next.time - previous.time) * t,
            stroke: previous.stroke + (next.stroke - previous.stroke) * t,
            section
          });
        }
      } else points.push(next);
      previous = next;
      if (points.length > maxPoints) points.splice(0, points.length - maxPoints);
      if (frame === null) schedule(drawRibbon);
    }
    function drawRibbon(time) {
      if (doc.hidden) { clear();return; }
      points = points.filter(p => time - p.time < lifetime);
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);
      if (points.length < 2) return;
      if (!idle && time - lastSample > idleAfter) {
        idle = true;
        points.forEach((p, i) => { p.u = i / (points.length - 1); });
      }
      const pulled = idle ? pulledAt(time) : 0;
      const first = points[0], lastPoint = points[points.length - 1];
      const gradient = ctx.createLinearGradient(first.x, first.y, lastPoint.x + .01, lastPoint.y + .01);
      gradient.addColorStop(0, color);gradient.addColorStop(.7, colorTo);gradient.addColorStop(1, coreColor);
      ctx.save();ctx.lineCap = 'round';ctx.lineJoin = 'round';
      // Three narrow layers: diffuse halo, colored ribbon, crisp inner filament.
      for (let pass = 0; pass < 3; pass++) {
        ctx.strokeStyle = pass === 0 ? color : (pass === 1 ? gradient : coreColor);
        if (pass === 0 && !glow) continue;
        ctx.shadowColor = color;ctx.shadowBlur = pass === 0 && !lowPower ? 6 : 0;
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          if (a.section !== b.section) continue;
          const before = points[i - 1]?.section === a.section ? points[i - 1] : a;
          const after = points[i + 2]?.section === b.section ? points[i + 2] : b;
          // Хвост втягивается вслед за курсором: старые точки истекают первыми,
          // а каждая гаснет только в последней четверти своей жизни. Раньше
          // прозрачность зависела от возраста целиком — остановили мышь, и весь
          // шлейф тускнел разом на месте.
          const life = Math.max(0, Math.min(1, 1 - (time - b.time) / lifetime));
          const fade = idle ? Math.min(Math.min(1, life * 4), idleFade(b, pulled)) : Math.min(1, life * 4);
          if (fade <= 0) continue;
          const taper = Math.pow((i + 1) / points.length, .65);
          const width = Math.max(.15, b.stroke * taper * thickness);
          ctx.globalAlpha = fade * taper * [ .13, .48, .8 ][pass];
          ctx.lineWidth = pass === 0 ? width * 3.8 : (pass === 1 ? width : Math.max(.3, width * .28));
          // Catmull–Rom tangents preserve continuous curves across samples.
          ctx.beginPath();ctx.moveTo(a.x, a.y);
          ctx.bezierCurveTo(a.x + (b.x - before.x) / 6, a.y + (b.y - before.y) / 6,
            b.x - (after.x - a.x) / 6, b.y - (after.y - a.y) / 6, b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (points.some(p => time - p.time < lifetime - 16 && (!idle || idleFade(p, pulled) > 0))) schedule(drawRibbon);
      // Последний кадр мог оставить почти прозрачный штрих — без стирания он
      // так и висел на экране, потому что следующих кадров уже не будет.
      else ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    }
    resizeRibbon();
    listen(win, 'resize', resizeRibbon, { passive: true });
    if (win.ResizeObserver) {
      const observer = new win.ResizeObserver(resizeRibbon);observer.observe(container);
      cleanups.push(() => observer.disconnect());
    }
    listen(target, 'pointermove', event => {
      const samples = event.getCoalescedEvents?.();
      if (samples?.length) samples.slice(-8).forEach(sample);
      else sample(event);
    }, { passive: true });
    listen(leaveTarget, 'pointerleave', () => { previous = null;section++; });
    listen(target, 'pointercancel', clear);
    listen(win, 'blur', clear);
    listen(target, 'scroll', clear, { passive: true });
    listen(doc, 'visibilitychange', () => { if (doc.hidden) clear(); });
    return dispose;
  }
  function aurora(time) {
    ctx.save();ctx.globalCompositeOperation='screen';ctx.filter='blur(34px)';
    for(let layer=0;layer<3;layer++){
      const middle=height*(.2+layer*.24)+parallax.y*30,spread=Math.max(70,height*.16);
      const gradient=ctx.createLinearGradient(0,0,width,height);
      gradient.addColorStop(0,'transparent');gradient.addColorStop(.3,layer===2?colorTo:color);gradient.addColorStop(.65,layer===1?colorTo:color);gradient.addColorStop(1,'transparent');
      ctx.strokeStyle=gradient;ctx.globalAlpha=.075+layer*.012;ctx.lineWidth=spread;ctx.lineCap='round';ctx.beginPath();
      for(let x=-150;x<=width+160;x+=16){
        const wave=Math.sin(x/(width*.7)*Math.PI+time*.13+layer*1.4)*spread*.65+Math.sin(x/width*5+time*.08)*25;
        if(x===-150)ctx.moveTo(x,middle+wave);else ctx.lineTo(x,middle+wave);
      }ctx.stroke();
    }ctx.restore();ctx.fillStyle=color;
  }
  // Live backgrounds: a small plasma field (about 96 px wide) recomputed each
  // frame and stretched to the screen with smoothing — soft, cheap, no WebGL.
  function toRgb(value, fallback) {
    const hex = /^#([0-9a-f]{6})$/i.exec(String(value || '').trim());
    if (hex) { const n = parseInt(hex[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    const fn = /rgba?\(([^)]+)\)/.exec(String(value || ''));
    if (fn) { const parts = fn[1].split(',').slice(0, 3).map(Number); if (parts.every(Number.isFinite)) return parts; }
    return fallback;
  }
  let field = null, fieldCtx = null, fieldImage = null;
  function live(time) {
    const fw = lowPower ? 64 : 96, fh = Math.max(24, Math.round(fw * height / Math.max(1, width)));
    if (!field || field.width !== fw || field.height !== fh) {
      field = doc.createElement('canvas');field.width = fw;field.height = fh;
      fieldCtx = field.getContext('2d');fieldImage = fieldCtx && fieldCtx.createImageData(fw, fh);
    }
    if (!fieldCtx || !fieldImage) return;
    const data = fieldImage.data, a = toRgb(color, [220, 220, 220]), b = toRgb(colorTo, a);
    const bg = toRgb(read('--bg'), [10, 10, 10]), ink = toRgb(read('--text'), [240, 240, 240]);
    const sway = Math.sin(time * .11) * .8, drift = Math.cos(time * .15) * .8;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const u = x / fw * 3.4 + parallax.x * .6, v = y / fw * 3.4 + parallax.y * .6;
        const n = (Math.sin(u * 1.6 + time * .32) + Math.sin(v * 1.9 - time * .26) + Math.sin((u + v) * 1.2 + time * .21)
          + Math.sin(Math.hypot(u - 1.7 + sway, v - 1.2 + drift) * 2.6 - time * .45)) / 4;
        const i = (y * fw + x) * 4;
        let r, g, bl, alpha;
        if (kind === 'metal') {
          // Хром: узкие яркие блики на мягком тёмном теле, чуть в цвет акцента.
          const band = Math.abs(Math.sin(n * Math.PI * 2.4)), shine = Math.pow(band, 3), body = (n + 1) / 2;
          // Блики приглушены: поверх идёт текст, и светлая полоса не должна
          // съедать приглушённые подписи.
          const k = .04 + body * .1 + shine * .3;
          r = bg[0] + (ink[0] - bg[0]) * k;g = bg[1] + (ink[1] - bg[1]) * k;bl = bg[2] + (ink[2] - bg[2]) * k;
          r += (a[0] - r) * .1;g += (a[1] - g) * .1;bl += (a[2] - bl) * .1;alpha = 235;
        } else if (kind === 'haze') {
          // Дымка: медленные облака двух цветов поверх фона темы.
          const k0 = (n + 1) / 2, k = k0 * k0 * (3 - 2 * k0);
          r = a[0] + (b[0] - a[0]) * k;g = a[1] + (b[1] - a[1]) * k;bl = a[2] + (b[2] - a[2]) * k;alpha = 255 * (.06 + .26 * k);
        } else {
          // Шум: текучее зерно низкого контраста.
          const k = Math.min(1, Math.max(0, (n + 1) / 2 + (Math.random() - .5) * .22));
          const mixk = .04 + k * .16;
          r = bg[0] + (ink[0] - bg[0]) * mixk;g = bg[1] + (ink[1] - bg[1]) * mixk;bl = bg[2] + (ink[2] - bg[2]) * mixk;alpha = 200;
        }
        data[i] = r;data[i + 1] = g;data[i + 2] = bl;data[i + 3] = alpha;
      }
    }
    fieldCtx.putImageData(fieldImage, 0, 0);
    ctx.imageSmoothingEnabled = true;ctx.globalAlpha = 1;
    ctx.drawImage(field, 0, 0, width, height);
  }
  // Noise is allocated once and reused, rather than generated per frame.
  let noiseTiles;
  if(kind==='grain')noiseTiles=Array.from({length:3},()=>{
    const tile=doc.createElement('canvas');tile.width=tile.height=128;const brush=tile.getContext('2d');if(!brush)return tile;
    const data=brush.createImageData(128,128);
    for(let i=0;i<data.data.length;i+=4){const value=Math.random()>.5?255:0;data.data[i]=data.data[i+1]=data.data[i+2]=value;data.data[i+3]=Math.random()*30;}
    brush.putImageData(data,0,0);return tile;
  });
  function tick(time) {
    if(doc.hidden||disposed)return;schedule(tick);
    const interval=kind==='grain'?110:(lowPower||['metal','haze','noise'].includes(kind)?1000/30:1000/60);if(last&&time-last<interval-1)return;
    const dt=last?Math.min(.05,(time-last)/1000):.016;last=time;elapsed+=dt;
    parallax.x+=((cursor.active?cursor.x/width-.5:0)-parallax.x)*Math.min(1,dt*3);
    parallax.y+=((cursor.active?cursor.y/height-.5:0)-parallax.y)*Math.min(1,dt*3);
    ctx.clearRect(0,0,width,height);ctx.globalAlpha=1;ctx.fillStyle=color;ctx.strokeStyle=color;
    if (!sprites.length) sprites=[sprite(color),sprite(colorTo)];
    if(['stars','comets','constellation'].includes(kind))stars(dt,elapsed);
    if(kind==='comets')shootingStars(dt,elapsed);
    else if(kind==='rain'||kind==='snow')weather(dt,elapsed);
    else if(kind==='particles')dust(dt,elapsed);
    else if(kind==='bokeh')bokeh(dt,elapsed);
    else if(kind==='aurora')aurora(elapsed);
    else if(kind==='hearts')hearts(dt,elapsed);
    else if(kind==='sparkles')sparkles(dt,elapsed);
    else if(kind==='fireflies')fireflies(dt,elapsed);
    else if(kind==='petals')petals(dt,elapsed);
    else if(kind==='waves')waves(elapsed);
    else if(kind==='metal'||kind==='haze'||kind==='noise')live(elapsed);
    else if(kind==='constellation'){
      ctx.strokeStyle=color;
      for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){
        const a=particles[i],b=particles[j],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance>115)continue;
        ctx.globalAlpha=(1-distance/115)*.16;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(a.x+parallax.x*a.depth*10,a.y+parallax.y*a.depth*10);ctx.lineTo(b.x+parallax.x*b.depth*10,b.y+parallax.y*b.depth*10);ctx.stroke();
      }
      // The pointer becomes one more star: nearby points reach out to it.
      if(cursor.active){
        ctx.strokeStyle=colorTo;
        particles.forEach(p=>{
          const x=p.x+parallax.x*p.depth*10,y=p.y+parallax.y*p.depth*10,distance=Math.hypot(x-cursor.x,y-cursor.y);
          if(distance>150)return;
          ctx.globalAlpha=(1-distance/150)*.38;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(cursor.x,cursor.y);ctx.lineTo(x,y);ctx.stroke();
        });
      }
    }else if(kind==='grain'){
      const pattern=ctx.createPattern(noiseTiles[Math.floor(time/110)%3],'repeat');if(pattern){ctx.globalAlpha=.5;ctx.fillStyle=pattern;ctx.fillRect(0,0,width,height);}
    }ctx.globalAlpha=1;
  }
  listen(doc,'visibilitychange',()=>{
    if(doc.hidden&&frame!==null){win.cancelAnimationFrame(frame);frame=null;}
    else if(!doc.hidden&&frame===null){last=0;schedule(tick);}
  });
  if (!doc.hidden) schedule(tick);return dispose;
}
const profileEffects=Object.freeze({mountProfileEffects});
if(typeof module!=='undefined'&&module.exports)module.exports=profileEffects;
else globalThis.LoveProfileEffects=profileEffects;
