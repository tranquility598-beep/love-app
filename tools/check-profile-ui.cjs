// Run: node node_modules/electron/cli.js tools/check-profile-ui.cjs
// This harness uses local fixture APIs, a hidden renderer and muted audio.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { buildView } = require('../server/utils/profilePageView');
const { renderPage, renderPreviewFragment } = require('../server/utils/profilePageHtml');
const { capabilitiesFor } = require('../server/config/profileTiers');
const { mountProfileEffects } = require('../server/utils/profileEffects');
const ProfilePage = require('../server/models/ProfilePage');
const ROOT = path.resolve(__dirname, '..');
const output = path.join(ROOT, '.tmp-profile-visuals');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'electron-data'));
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('mute-audio');
const errors = [];
const checks = [];
// Isolated fixture server and hidden renderer: no production data or credentials.
const user = { _id: '000000000000000000000001', username: 'vexel', nickname: 'Vexel', avatar: null, createdAt: new Date('2026-04-01'), badges: ['early_supporter'], mood: '', listening: '', hobbies: [], status: 'online' };
const page = new ProfilePage({ user: user._id, enabled: true, displayName: 'Vexel', headline: 'Музыка. Дизайн. Ночной город.', bio: 'Музыка, дизайн и немного ночного города.\nМоё маленькое пространство в интернете.', theme: 'midnight', layout: 'stack', effect: 'stars', avatarFrame: 'ring', links: [{label:'Telegram',url:'https://t.me/vexel',icon:'telegram'}, {label:'YouTube',url:'https://youtube.com/@vexel',icon:'youtube'}, {label:'Мой плейлист',url:'https://open.spotify.com',icon:'spotify'}] }).toObject();
const api = express();
api.use(express.json());
let origin;
const options = () => ({nonce:'local-preview',canonical:origin+'/u/vexel',ogImageUrl:null,siteUrl:'https://loveapp.chat'});
const response = () => ({page,account:user,capabilities:capabilitiesFor('premium'),locked:[],urls:{long:'https://me.loveapp.chat/u/vexel',short:'https://me.loveapp.chat/vexel',shortAvailable:true}});

api.get('/assets/silence.wav',(_req,res)=>{
 const wav=Buffer.alloc(16044);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);res.type('audio/wav').send(wav);
});
api.get('/assets/banner.svg', (_req,res) => res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="420" viewBox="0 0 1100 420"><defs><linearGradient id="b" x2="0" y2="1"><stop stop-color="#494949"/><stop offset="1" stop-color="#121212"/></linearGradient></defs><path fill="url(#b)" d="M0 0h1100v420H0z"/><circle cx="765" cy="103" r="48" fill="#bdbdbd"/><path d="m0 350 170-230 240 230 170-150 220 150 140-190 160 190v70H0z" fill="#292929"/><path d="m0 420 230-150 240 120 180-80 160 90 290-160v180z" fill="#0c0c0c"/></svg>'));
api.use('/build', express.static(path.join(ROOT,'profile-page/build')));
api.post('/api/profile-page/session',(_req,res)=>res.json({token:'local-fixture-token',expiresIn:1800}));
api.get('/api/profile-page',(_req,res)=>res.json(response()));
api.put('/api/profile-page',(req,res)=>{Object.assign(page,req.body);res.json(response())});
api.post('/api/profile-page/preview',(req,res)=>res.json(renderPreviewFragment(buildView({...page,...req.body},user,'premium'),options())));
api.get('/api/profile-page/stats',(_req,res)=>res.json({days:[],total:128}));
api.get('/u/vexel',(_req,res)=>res.type('html').send(renderPage(buildView(page,user,'premium'),options())));
api.get('/app-test',(_req,res)=>res.type('html').send(fs.readFileSync(path.join(ROOT,'client/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')));
api.use(express.static(path.join(ROOT,'client')));
api.get('/build',(_req,res)=>res.sendFile(path.join(ROOT,'profile-page/build/index.html')));
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function screenshot(win,name){fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG())}
app.whenReady().then(async()=>{
 const server=api.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;page.banner=origin+'/assets/banner.svg';
 await new Promise((resolve,reject)=>{
  const request=http.get(origin+'/build/effects.js',res=>{
   res.resume();
   try { assert.equal(res.statusCode,200);assert.match(res.headers['content-type'],/javascript/);resolve(); } catch(error){reject(error)}
  });
  request.setTimeout(5000,()=>request.destroy(new Error('Effects asset request timed out')));
  request.on('error',reject);
 });
 const win=new BrowserWindow({show:false,width:1500,height:1050,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});
 win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message)});
 await win.loadURL(origin+'/build#code=local-fixture');await wait(1800);
 await screenshot(win,'builder-desktop');
 assert.equal(await win.webContents.executeJavaScript(`document.documentElement.scrollWidth <= innerWidth`),true);
 console.log('Builder layout',await win.webContents.executeJavaScript(`JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,editorVisible:!document.getElementById('editor').hidden,previewCanvas:document.querySelector('.preview-live')?.shadowRoot?.querySelectorAll('canvas').length})`));
 await win.webContents.executeJavaScript(`document.querySelector('[data-section="appearance"]').click()`);await wait(250);await screenshot(win,'builder-appearance');
 await win.webContents.executeJavaScript(`document.getElementById('size-wide').click()`);await wait(200);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.preview-live').clientWidth`),960);
 console.log('Desktop preview',await win.webContents.executeJavaScript(`document.querySelector('.preview-live').clientWidth`));
 win.setSize(390,844);await win.webContents.executeJavaScript(`document.querySelector('[data-section="profile"]').click()`);await wait(250);await screenshot(win,'builder-mobile');
 assert.equal(await win.webContents.executeJavaScript(`document.documentElement.scrollWidth <= innerWidth`),true);
 console.log('Mobile layout',await win.webContents.executeJavaScript(`JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})`));
 win.setSize(1280,960);await win.loadURL(origin+'/u/vexel');await wait(500);await screenshot(win,'profile-desktop');
 console.log('Public effects',await win.webContents.executeJavaScript(`JSON.stringify({canvas:document.querySelectorAll('.pf-fx').length,width:document.querySelector('.pf-fx')?.clientWidth})`));
 win.setSize(390,844);await wait(250);await screenshot(win,'profile-mobile');
 page.effect='none';await win.loadURL(origin+'/u/vexel');await wait(150);console.log('No-effect canvas',await win.webContents.executeJavaScript(`document.querySelectorAll('.pf-fx').length`));


 page.layout='card';win.setSize(1280,960);await win.loadURL(origin+'/u/vexel');await wait(400);await screenshot(win,'profile-card-desktop');page.layout='stack';
 page.effect='stars';page.music={url:origin+'/assets/silence.wav',title:'Midnight radio',artist:'Love Wave',volume:0};
 win.setSize(1280,960);await win.loadURL(origin+'/u/vexel');await wait(200);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.pf-fx').length`),0);
 await win.webContents.executeJavaScript(`document.getElementById('pf-enter').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));`,true);await wait(750);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.pf-fx').length`),1);
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('pf-player-volume').value`),'0');
 await screenshot(win,'profile-music-desktop');
 await win.loadURL(origin+'/build#code=local-fixture');await wait(500);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.preview-live').shadowRoot.querySelectorAll('canvas').length`),0);
 await win.webContents.executeJavaScript(`document.querySelector('.preview-live').shadowRoot.getElementById('pf-enter').click()`,true);await wait(150);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.preview-live').shadowRoot.querySelectorAll('canvas').length`),1);
 assert.equal(await win.webContents.executeJavaScript(`!!document.querySelector('.preview-live').shadowRoot.getElementById('pf-player-volume')`),true);
 checks.push('public page and preview: music controls, zero volume, reveal once, one effect layer');

 // Real settings controller against a delayed API: feedback, drafts, and uploads.
 win.setSize(1280,960);await win.loadURL(origin+'/app-test');
 await win.webContents.executeJavaScript(`
  window.console.warn = () => {};
  window.ownProfileData={name:'Original',username:'@testfriend',bio:'Initial bio',statusText:'',listening:'',mood:'tea',avatarUrl:''};
  window.currentUser={_id:'test-user',username:'testfriend',nickname:'Original',email:'test@example.test',hobbies:[],hasPassword:true};
  window.myHobbies=[];window.moodIcons=[{name:'tea',svg:'<svg></svg>'}];
  window.settingsManager={get:()=>null,saveSetting:()=>{}};
  window.showToast=()=>{};
  window.fetch=async()=>new Response('{}',{headers:{'Content-Type':'application/json'}});
  window.__profileCalls=0;window.__uploadCalls=0;
  window.UsersAPI={updateProfile:payload=>{window.__profileCalls++;window.__submitted=payload;return new Promise(resolve=>{window.__finishProfile=()=>resolve({user:{_id:'test-user',...payload}})})},uploadAvatar:async()=>{window.__uploadCalls++;throw new Error('Avatar upload unavailable')}};void 0;
 `);
 await win.webContents.executeJavaScript(fs.readFileSync(path.join(ROOT,'client/js/new/settings-ui.js'),'utf8'));
 await win.webContents.executeJavaScript(`document.dispatchEvent(new Event('DOMContentLoaded'));`);

 await win.webContents.executeJavaScript(`
  var profileTestInput=document.getElementById('lvs-input-name');profileTestInput.value='Saved name';profileTestInput.dispatchEvent(new Event('input'));
  document.getElementById('lvs-save-btn').click();
 `);
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('lvs-save-btn').textContent`),'Сохраняем…');
 await win.webContents.executeJavaScript(`document.getElementById('lvs-save-btn').dispatchEvent(new MouseEvent('click'));var profileTestInput=document.getElementById('lvs-input-name');profileTestInput.value='Newer draft';profileTestInput.dispatchEvent(new Event('input'));window.__finishProfile();`);
 await wait(80);
 assert.equal(await win.webContents.executeJavaScript(`window.__profileCalls`),1);
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('lvs-input-name').value`),'Newer draft');
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('lvs-save-bar').classList.contains('visible')`),true);
 assert.equal(await win.webContents.executeJavaScript(`window.currentUser.nickname`),'Saved name');
 await win.webContents.executeJavaScript(`window.__pendingAvatarFile=new File(['test-avatar'],'avatar.png',{type:'image/png'});document.getElementById('lvs-save-btn').click();`);
 await wait(60);
 assert.equal(await win.webContents.executeJavaScript(`window.__profileCalls`),1);
 assert.equal(await win.webContents.executeJavaScript(`Boolean(window.__pendingAvatarFile)`),true);
 assert.match(await win.webContents.executeJavaScript(`document.getElementById('lvs-save-status').textContent`),/Avatar upload unavailable/);
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('lvs-save-btn').disabled`),false);
 checks.push('settings: immediate feedback, single request, newer drafts preserved, failed avatar preserved');
 console.log('UI checks',JSON.stringify(checks));

 console.log('Renderer errors',JSON.stringify(errors));
 assert.deepEqual(errors,[]);
 win.destroy();server.close();app.quit();
}).catch(e=>{console.error(e);console.error('Renderer errors',JSON.stringify(errors));app.exit(1)});
