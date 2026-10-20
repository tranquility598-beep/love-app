// Shared by public pages and the live editor. No external assets or libraries.
function mountProfileEffects(container, kind) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const supported = ['particles','stars','rain','snow','comets','trail','bokeh','glow','aurora','constellation','grain'];
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
  const surface = doc.createElement(kind === 'glow' ? 'div' : 'canvas');
  surface.className = kind === 'glow' ? 'pf-glow' : (kind === 'trail' ? 'pf-fx pf-fx--trail' : 'pf-fx');
  surface.setAttribute('aria-hidden','true'); container.appendChild(surface);
  function dispose() { if (disposed) return; disposed = true; if (frame !== null) win.cancelAnimationFrame(frame); frame = null; cleanups.forEach(fn => fn()); surface.remove(); }
  if (motion?.addEventListener) listen(motion, 'change', event => { if (event.matches) dispose(); });
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
  const color = style.getPropertyValue('--accent').trim() || '#e8e8e8';
  const colorTo = style.getPropertyValue('--accent-to').trim() || color;
  const lowPower = (win.navigator.hardwareConcurrency||8)<=4 || (win.navigator.deviceMemory||8)<=4;
  const dpr = Math.min(win.devicePixelRatio||1,lowPower?1.25:1.75);
  const random = (a,b) => a+Math.random()*(b-a), tau = Math.PI*2;
  if (kind === 'trail') return startCursorRibbon();
  let width=1,height=1,particles=[],last=0,elapsed=0,parallax={x:0,y:0},cursor={x:0,y:0,active:false};
  let meteors=[],nextMeteor=1.2,glowSprite;
  function sprite() {
    const node=doc.createElement('canvas');node.width=node.height=96;
    const brush=node.getContext('2d');if (!brush) return node;
    const gradient=brush.createRadialGradient(48,48,0,48,48,48);
    gradient.addColorStop(0,color);gradient.addColorStop(.18,color);gradient.addColorStop(1,'transparent');
    brush.fillStyle=gradient;brush.fillRect(0,0,96,96);return node;
  }
  function spawn(initial=true) {
    const depth=random(.2,1);
    return {x:random(-40,width+40),y:initial?random(-30,height+30):(['rain','snow'].includes(kind)?-30:height+30),depth,radius:random(.45,1.35)*depth+.2,phase:random(0,tau),alpha:random(.18,.65),pulse:random(.2,.7)};
  }
  function resize() {
    width=Math.max(1,surface.clientWidth);height=Math.max(1,surface.clientHeight);
    surface.width=Math.round(width*dpr);surface.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const densities={particles:45,stars:100,rain:110,snow:70,bokeh:14,comets:70,constellation:50,trail:0,aurora:0,grain:0};
    const area=Math.min(2.2,Math.max(.45,width*height/700000));
    particles=Array.from({length:Math.round(densities[kind]*area*(lowPower ? .65 : 1))},()=>spawn());
  }
  resize();listen(win,'resize',resize,{passive:true});
  if (win.ResizeObserver) { const observer=new win.ResizeObserver(resize);observer.observe(container);cleanups.push(()=>observer.disconnect()); }
  listen(target,'pointermove',event => {
    cursor={...point(event),active:true};
  },{passive:true});
  listen(leaveTarget,'pointerleave',()=>{cursor.active=false;});
  function dot(x,y,radius,alpha,glow=false) {
    ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
    if(glow)ctx.drawImage(glowSprite,x-radius*6,y-radius*6,radius*12,radius*12);
    ctx.beginPath();ctx.arc(x,y,radius,0,tau);ctx.fill();
  }
  function stars(dt,time) {
    particles.forEach(p=>{
      p.x+=dt*p.depth*.7;if(p.x>width+20)p.x=-20;
      const x=p.x+parallax.x*p.depth*10,y=p.y+parallax.y*p.depth*10;
      const alpha=p.alpha*(.6+Math.sin(time*p.pulse+p.phase)*.4);
      dot(x,y,p.radius,alpha,p.depth>.83);
      if(p.depth>.92){ctx.globalAlpha=alpha*.35;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();}
    });
  }
  function shootingStars(dt,time) {
    if(time>=nextMeteor){nextMeteor=time+random(2.4,5.5);meteors.push({x:random(width*.2,width*1.25),y:random(-50,height*.25),life:0,duration:random(1,1.8),length:random(70,150)});}
    meteors=meteors.filter(p=>p.life<p.duration);
    meteors.forEach(p=>{
      p.life+=dt;p.x-=230*dt;p.y+=160*dt;
      const alpha=Math.sin(Math.PI*Math.min(1,p.life/p.duration))*.8;
      const tx=p.x+p.length,ty=p.y-p.length*.7,g=ctx.createLinearGradient(tx,ty,p.x,p.y);
      g.addColorStop(0,'transparent');g.addColorStop(1,color);ctx.strokeStyle=g;ctx.globalAlpha=alpha;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(p.x,p.y);ctx.stroke();dot(p.x,p.y,1.1,alpha,true);
    });ctx.strokeStyle=color;
  }
  function weather(dt,time) {
    particles.forEach((p,i)=>{
      if(kind==='rain'){
        const speed=180+p.depth*420;p.x-=speed*.16*dt;p.y+=speed*dt;
        const length=9+p.depth*25,g=ctx.createLinearGradient(p.x,p.y,p.x+length*.16,p.y-length);
        g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.strokeStyle=g;ctx.globalAlpha=p.alpha*.42;ctx.lineWidth=.45+p.depth*.6;
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+length*.16,p.y-length);ctx.stroke();
      }else{
        p.y+=(12+p.depth*28)*dt;p.x+=(Math.sin(time*.45+p.phase)*14+4)*dt*p.depth;
        dot(p.x,p.y,.7+p.depth*1.8,p.alpha*.8,p.depth>.82);
      }
      if(p.y>height+35||p.x< -45)particles[i]=spawn(false);
    });ctx.strokeStyle=color;
  }
  function dust(dt,time) {
    particles.forEach((p,i)=>{
      p.y-=(4+p.depth*12)*dt;p.x+=Math.sin(time*.2+p.phase)*4*dt;
      const fade=Math.min(1,Math.max(0,(height-p.y)/80),Math.max(0,p.y/70));
      dot(p.x+parallax.x*p.depth*8,p.y,p.radius,p.alpha*fade*(.65+Math.sin(time*.4+p.phase)*.25),p.depth>.6);
      if(p.y< -20)particles[i]=spawn(false);
    });
  }
  function bokeh(dt,time) {
    particles.forEach((p,i)=>{
      p.y-=(2+p.depth*7)*dt;const r=20+p.depth*60,x=p.x+Math.sin(time*.12+p.phase)*30+parallax.x*12;
      ctx.globalAlpha=.035+(.5+Math.sin(time*.2+p.phase)*.5)*.055;ctx.drawImage(glowSprite,x-r,p.y-r,r*2,r*2);
      if(p.y< -r*2)particles[i]=spawn(false);
    });
  }
  function startCursorRibbon() {
    const lifetime = 560;
    const maxPoints = lowPower ? 72 : 112;
    const coreColor = style.getPropertyValue('--text').trim() || '#fff';
    let viewportWidth = 1, viewportHeight = 1, points = [], previous = null, section = 0;

    function clear() {
      points = [];previous = null;section++;
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
      const first = points[0], lastPoint = points[points.length - 1];
      const gradient = ctx.createLinearGradient(first.x, first.y, lastPoint.x + .01, lastPoint.y + .01);
      gradient.addColorStop(0, color);gradient.addColorStop(.7, colorTo);gradient.addColorStop(1, coreColor);
      ctx.save();ctx.lineCap = 'round';ctx.lineJoin = 'round';
      // Three narrow layers: diffuse halo, colored ribbon, crisp inner filament.
      for (let pass = 0; pass < 3; pass++) {
        ctx.strokeStyle = pass === 0 ? color : (pass === 1 ? gradient : coreColor);
        ctx.shadowColor = color;ctx.shadowBlur = pass === 0 && !lowPower ? 6 : 0;
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          if (a.section !== b.section) continue;
          const before = points[i - 1]?.section === a.section ? points[i - 1] : a;
          const after = points[i + 2]?.section === b.section ? points[i + 2] : b;
          const age = Math.max(0, Math.min(1, 1 - (time - b.time) / lifetime));
          const taper = Math.pow((i + 1) / points.length, .65);
          const width = Math.max(.15, b.stroke * taper);
          ctx.globalAlpha = Math.pow(age, 1.7) * taper * [ .13, .48, .8 ][pass];
          ctx.lineWidth = pass === 0 ? width * 3.8 : (pass === 1 ? width : Math.max(.3, width * .28));
          // Catmull–Rom tangents preserve continuous curves across samples.
          ctx.beginPath();ctx.moveTo(a.x, a.y);
          ctx.bezierCurveTo(a.x + (b.x - before.x) / 6, a.y + (b.y - before.y) / 6,
            b.x - (after.x - a.x) / 6, b.y - (after.y - a.y) / 6, b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (points.some(p => time - p.time < lifetime - 16)) schedule(drawRibbon);
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
      const middle=height*(.2+layer*.24),spread=Math.max(70,height*.16);
      const gradient=ctx.createLinearGradient(0,0,width,height);
      gradient.addColorStop(0,'transparent');gradient.addColorStop(.3,color);gradient.addColorStop(.65,layer===1?colorTo:color);gradient.addColorStop(1,'transparent');
      ctx.strokeStyle=gradient;ctx.globalAlpha=.075+layer*.012;ctx.lineWidth=spread;ctx.lineCap='round';ctx.beginPath();
      for(let x=-150;x<=width+160;x+=16){
        const wave=Math.sin(x/(width*.7)*Math.PI+time*.13+layer*1.4)*spread*.65+Math.sin(x/width*5+time*.08)*25;
        if(x===-150)ctx.moveTo(x,middle+wave);else ctx.lineTo(x,middle+wave);
      }ctx.stroke();
    }ctx.restore();ctx.fillStyle=color;
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
    const interval=kind==='grain'?110:(lowPower?1000/30:1000/60);if(last&&time-last<interval-1)return;
    const dt=last?Math.min(.05,(time-last)/1000):.016;last=time;elapsed+=dt;
    parallax.x+=((cursor.active?cursor.x/width-.5:0)-parallax.x)*Math.min(1,dt*3);
    parallax.y+=((cursor.active?cursor.y/height-.5:0)-parallax.y)*Math.min(1,dt*3);
    ctx.clearRect(0,0,width,height);ctx.globalAlpha=1;ctx.fillStyle=color;ctx.strokeStyle=color;
    if (!glowSprite) glowSprite=sprite();
    if(['stars','comets','constellation'].includes(kind))stars(dt,elapsed);
    if(kind==='comets')shootingStars(dt,elapsed);
    else if(kind==='rain'||kind==='snow')weather(dt,elapsed);
    else if(kind==='particles')dust(dt,elapsed);
    else if(kind==='bokeh')bokeh(dt,elapsed);
    else if(kind==='aurora')aurora(elapsed);
    else if(kind==='constellation'){
      for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){
        const a=particles[i],b=particles[j],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance>115)continue;
        ctx.globalAlpha=(1-distance/115)*.16;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(a.x+parallax.x*a.depth*10,a.y+parallax.y*a.depth*10);ctx.lineTo(b.x+parallax.x*b.depth*10,b.y+parallax.y*b.depth*10);ctx.stroke();
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
