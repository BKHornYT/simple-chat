import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, push, set, onChildAdded, onValue, update, off,
  serverTimestamp, onDisconnect, get, child, remove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* ---------------- Firebase ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBi9MKK_bhjIymbvoe1WNjZYHfhzaC_EHQ",
  authDomain: "localwebchat.firebaseapp.com",
  databaseURL: "https://localwebchat-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "localwebchat",
  storageBucket: "localwebchat.firebasestorage.app",
  messagingSenderId: "508495711943",
  appId: "1:508495711943:web:fb438f6a1fd138b29cf8e2",
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

/* ---------------- Elements ---------------- */
const authPanel  = document.getElementById("auth-panel");
const appEl      = document.getElementById("app");
const usernameIn = document.getElementById("username-input");
const joinBtn    = document.getElementById("join-btn");

const channelsList = document.getElementById("channels-list");
const addChannelBtn= document.getElementById("add-channel-btn");
const delChannelBtn= document.getElementById("delete-channel-btn");
const usersList  = document.getElementById("users-list");

const roomNameLabel = document.getElementById("room-name-label");
const roomPillName  = document.getElementById("room-pill-name");

const messagesDiv= document.getElementById("messages");
const userInput  = document.getElementById("user-input");
const sendBtn    = document.getElementById("send-btn");
const typingEl   = document.getElementById("typing-indicator");
const gifBtn     = document.getElementById("gif-btn");

const editBtn    = document.getElementById("edit-profile-btn");
const modal      = document.getElementById("profile-modal");
const modalForm  = document.getElementById("profile-form");
const modalName  = document.getElementById("profile-username");
const modalColor = document.getElementById("profile-color");
const modalFile  = document.getElementById("profile-file");
const modalPrev  = document.getElementById("profile-preview");

const gifModal   = document.getElementById("gif-modal");
const gifSearch  = document.getElementById("gif-search");
const gifSearchBtn = document.getElementById("gif-search-btn");
const gifGrid    = document.getElementById("gif-grid");
const gifClose   = document.getElementById("gif-close");

/* ---------------- State ---------------- */
let username = localStorage.getItem("chatUsername") || "";
let accent   = localStorage.getItem("chatAccent")   || "#0078ff";
let avatar   = localStorage.getItem("chatAvatar")   || "";
let typingTimer;
let currentChannel = localStorage.getItem("chatChannel") || "global";
let profiles = {};
let presenceCache = {};
let activeMsgRef = null;
let activeMsgCb  = null;

/* Tenor API key (public test key works) */
const TENOR_KEY = "LIVDSRZULELA"; // Tenor demo key
const ts = () => new Date().toLocaleTimeString();
const el = (t,c)=>{const e=document.createElement(t); if(c) e.className=c; return e;};
const initial = n => (n||"?").trim().charAt(0).toUpperCase();

/* base64 helpers (Unicode-safe) */
const b64e = s => btoa(unescape(encodeURIComponent(s)));
const b64d = s => decodeURIComponent(escape(atob(s)));

/* ---------- Profiles (everyone sees avatars/colors) ---------- */
onValue(ref(db,"profiles"), snap=>{
  profiles = snap.val() || {};
  renderOnlineList();
});

/* ---------- Channels (public, but one per user) ---------- */
function listenChannels(){
  onValue(ref(db,"channelsMeta"), snap=>{
    const meta = snap.val() || {};
    renderChannelList(Object.keys(meta).sort(), meta);
  });
}
function renderChannelList(names, meta){
  channelsList.innerHTML = "";
  names.forEach(name=>{
    const li = el("li","item"+(name===currentChannel?" active":""));
    const hash = el("div","hash"); hash.textContent="#";
    const label= el("div","name"); label.textContent=name;
    li.append(hash,label);
    li.onclick = ()=> switchChannel(name);
    channelsList.appendChild(li);
  });

  // toggle delete button if owner
  const owner = meta?.[currentChannel]?.creator;
  delChannelBtn.style.display = (owner && owner===username) ? "inline-block" : "none";
}
async function ensureChannelExists(name){
  const path = ref(db, `channelsMeta/${name}`);
  const snap = await get(path);
  if (!snap.exists()){
    await set(path, { createdAt: serverTimestamp(), creator: username });
    await set(ref(db, `channelOwners/${username}`), { channel: name });
  }
}

/* ---------- Presence ---------- */
function startPresence(){
  const meRef = ref(db, `presence/${username}`);
  update(meRef, { online:true, room:currentChannel, at: serverTimestamp() });
  onDisconnect(meRef).update({ online:false, at: serverTimestamp() });

  onValue(ref(db,"presence"), snap=>{
    presenceCache = snap.val() || {};
    renderOnlineList();
  });
}
function renderOnlineList(){
  usersList.innerHTML = "";
  Object.entries(presenceCache).forEach(([name,info])=>{
    if (!info.online || info.room!==currentChannel) return;
    const li = el("li","user-item");
    const prof = profiles?.[name] || {};
    if (prof.avatar){
      const img = document.createElement("img");
      img.src = prof.avatar; img.className="avatar"; li.appendChild(img);
    } else {
      const a = el("div","avatar");
      a.style.background = prof.color || colorFromName(name);
      a.textContent = initial(name); li.appendChild(a);
    }
    const nm = el("div","name"); nm.textContent=name; li.appendChild(nm);
    const badge = el("div","badge"); badge.textContent = name===username?"you":"online"; li.appendChild(badge);
    usersList.appendChild(li);
  });
}
function colorFromName(name){
  const palette=["#f43f5e","#ef4444","#f97316","#f59e0b","#10b981","#06b6d4","#3b82f6","#8b5cf6","#a855f7","#ec4899"];
  const code=(name||"X").toUpperCase().split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  return palette[code%palette.length];
}

/* ---------- Messages (per channel) ---------- */
function attachMessages(channel){
  if (activeMsgRef && activeMsgCb){ off(activeMsgRef,"child_added",activeMsgCb); }
  messagesDiv.innerHTML = "";

  const msgRef = ref(db, `channels/${channel}/messages`);
  const cb = snap=>{
    const m = snap.val();
    const prof = profiles?.[m.username] || {};
    messagesDiv.appendChild(renderMessage(m, prof));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  };
  onChildAdded(msgRef, cb);
  activeMsgRef = msgRef; activeMsgCb = cb;
}

function renderMessage(m, prof){
  const wrap = el("div", "message"+(m.username===username?" self":""));

  // avatar
  if (prof?.avatar){
    const img = document.createElement("img");
    img.src = prof.avatar; img.className="avatar"; wrap.appendChild(img);
  } else {
    const av = el("div","avatar");
    av.style.background = prof?.color || colorFromName(m.username);
    av.textContent = initial(m.username);
    wrap.appendChild(av);
  }

  // bubble
  const box = el("div","msg-content");
  if (m.username===username){
    box.style.background = (profiles?.[username]?.color || accent);
    box.style.color = "#fff";
  }
  const head = el("div","msg-header");
  head.innerHTML = `${m.username} <span class="timestamp">${m.timestamp}</span>`;
  const body = document.createElement("div");

  if (m.type === "gif") {
    const embed = el("div","embed");
    const g = document.createElement("img");
    g.src = m.url;
    embed.appendChild(g);
    body.appendChild(embed);
  } else {
    // decode base64 text
    const text = safeDecode(m.text);
    // autolink + embeds (basic)
    body.appendChild(autoEmbed(text));
  }

  box.append(head, body);
  wrap.appendChild(box);
  return wrap;
}

function sendText(){
  const raw = userInput.value.trim();
  if (!raw || !currentChannel) return;
  const msgRef = push(ref(db, `channels/${currentChannel}/messages`));
  set(msgRef, { type:"text", text: b64e(raw), username, timestamp: ts() });
  userInput.value="";
}
sendBtn.onclick = sendText;
userInput.addEventListener("keypress", e=>{ if(e.key==="Enter") sendText(); });

/* ---------- Typing (per channel) ---------- */
function setTyping(state){ set(ref(db, `typing/${currentChannel}/${username}`), !!state); }
function watchTyping(){
  onValue(ref(db, `typing/${currentChannel}`), snap=>{
    const all = snap.val() || {};
    const someone = Object.entries(all).some(([n,v])=> n!==username && v===true);
    typingEl.style.display = someone ? "block" : "none";
  });
}
userInput.addEventListener("input", ()=>{
  setTyping(true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(()=> setTyping(false), 800);
});

/* ---------- Channel switching ---------- */
async function switchChannel(name){
  if (!name) return;
  await ensureChannelExists(name);
  currentChannel = name;
  localStorage.setItem("chatChannel", currentChannel);
  roomNameLabel.textContent = name;
  roomPillName.textContent  = name;
  update(ref(db, `presence/${username}`), { online:true, room:currentChannel, at: serverTimestamp() });
  attachMessages(currentChannel);
  watchTyping();
  // refresh delete button visibility (owner only)
  const metaSnap = await get(ref(db, `channelsMeta/${currentChannel}`));
  const owner = metaSnap.val()?.creator;
  delChannelBtn.style.display = owner===username ? "inline-block" : "none";
}

/* ---------- Add/Delete Channel with one-per-user rule ---------- */
addChannelBtn.onclick = async ()=>{
  const desired = prompt("New channel name (letters, numbers, - or _):","my-channel");
  if (!desired) return;
  const clean = desired.toLowerCase().replace(/[^a-z0-9\-_]/g,"").slice(1,25) || "channel";

  // check ownership
  const ownSnap = await get(ref(db, `channelOwners/${username}`));
  const existing = ownSnap.val()?.channel;

  if (existing && existing !== clean){
    // delete old channel (both meta + messages) if you own it
    await remove(ref(db, `channels/${existing}`)).catch(()=>{});
    await remove(ref(db, `channelsMeta/${existing}`)).catch(()=>{});
  }

  await ensureChannelExists(clean);
  await switchChannel(clean);
};

delChannelBtn.onclick = async ()=>{
  const meta = (await get(ref(db, `channelsMeta/${currentChannel}`))).val();
  if (!meta || meta.creator !== username) return alert("Only the channel owner can delete this channel.");
  if (!confirm(`Delete #${currentChannel}? This removes all its messages.`)) return;

  await remove(ref(db, `channels/${currentChannel}`)).catch(()=>{});
  await remove(ref(db, `channelsMeta/${currentChannel}`)).catch(()=>{});
  const ownSnap = await get(ref(db, `channelOwners/${username}`));
  if (ownSnap.val()?.channel === currentChannel){
    await remove(ref(db, `channelOwners/${username}`)).catch(()=>{});
  }
  await switchChannel("global");
};

/* ---------- Login / join ---------- */
if (username) usernameIn.value = username;

joinBtn.onclick = async ()=>{
  const name = (usernameIn.value || "").trim();
  if (!name) return alert("Choose a username.");
  username = name;
  localStorage.setItem("chatUsername", username);

  // ensure profile exists
  const profSnap = await get(child(ref(db,"profiles"), username));
  if (!profSnap.exists()){
    await set(ref(db, `profiles/${username}`), {
      color: accent || colorFromName(username),
      avatar: avatar || ""
    });
  }

  authPanel.style.display="none";
  appEl.style.display="grid";

  await ensureChannelExists(currentChannel);
  startPresence();
  listenChannels();
  await switchChannel(currentChannel);
};

/* ---------- Profile modal (save to DB so everyone sees) ---------- */
editBtn.onclick = ()=>{
  modalName.value  = username || "";
  const pc = profiles?.[username]?.color || accent || "#0078ff";
  const pa = profiles?.[username]?.avatar || avatar || "";
  modalColor.value = pc;
  modalPrev.src    = pa || "";
  modal.showModal();
};
document.getElementById("profile-cancel").onclick = ()=> modal.close();

modalForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const newName  = (document.getElementById("profile-username").value || "").trim() || username;
  const newColor = (document.getElementById("profile-color").value || "#0078ff");
  const newAvatar= modalPrev.src?.startsWith("data:") ? modalPrev.src : (profiles?.[username]?.avatar || avatar || "");

  if (newName !== username){
    update(ref(db, `presence/${username}`), { online:false, at: serverTimestamp() }).catch(()=>{});
  }
  await set(ref(db, `profiles/${newName}`), { color:newColor, avatar:newAvatar });

  username = newName; accent = newColor; avatar = newAvatar;
  localStorage.setItem("chatUsername", username);
  localStorage.setItem("chatAccent", accent);
  localStorage.setItem("chatAvatar", avatar);

  update(ref(db, `presence/${username}`), { online:true, room:currentChannel, at: serverTimestamp() }).catch(()=>{});
  modal.close();
});

/* avatar upload (compress) */
document.getElementById("profile-file").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0]; if (!file) return;
  const dataUrl = await fileToDataURL(file);
  const tiny = await downscaleDataURL(dataUrl, 96, 96, 0.8);
  document.getElementById("profile-preview").src = tiny;
});

/* ---------- GIF picker (Tenor) ---------- */
gifBtn.onclick = ()=> { gifModal.showModal(); gifSearch.focus(); if(!gifSearch.value) fetchGifs("funny"); };
gifClose.onclick = ()=> gifModal.close();
gifSearchBtn.onclick = ()=> fetchGifs(gifSearch.value || "funny");
gifSearch.addEventListener("keypress", e=>{ if(e.key==="Enter") fetchGifs(gifSearch.value||"funny"); });

async function fetchGifs(query){
  gifGrid.innerHTML = "Loading…";
  try{
    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&client_key=simple-chat&limit=24&media_filter=gif,tinygif`;
    const res = await fetch(url);
    const json = await res.json();
    gifGrid.innerHTML = "";
    (json.results||[]).forEach(item=>{
      const media = item.media_formats?.tinygif?.url || item.media_formats?.gif?.url;
      if(!media) return;
      const img = document.createElement("img");
      img.src = media;
      img.onclick = ()=> sendGif(media);
      gifGrid.appendChild(img);
    });
  }catch(e){
    gifGrid.innerHTML = "Failed to load GIFs.";
  }
}
function sendGif(url){
  if (!currentChannel) return;
  const msgRef = push(ref(db, `channels/${currentChannel}/messages`));
  set(msgRef, { type:"gif", url, username, timestamp: ts() });
  gifModal.close();
}

/* ---------- Embeds & helpers ---------- */
function autoEmbed(text){
  const container = document.createElement("div");

  // basic autolink
  const linked = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const p = document.createElement("div"); p.innerHTML = linked;
  container.appendChild(p);

  // YouTube
  const yt = text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w\-]+)/);
  if (yt && yt[1]) {
    const wrap = el("div","embed");
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${yt[1]}`;
    wrap.appendChild(iframe);
    container.appendChild(wrap);
  }

  // direct image/gif
  if (/\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(text)) {
    const wrap = el("div","embed");
    const img = document.createElement("img");
    img.src = text;
    wrap.appendChild(img);
    container.appendChild(wrap);
  }

  return container;
}

function safeDecode(s){ try{ return b64d(s); }catch{ return s; } }
function fileToDataURL(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}
function downscaleDataURL(dataURL, maxW, maxH, quality=0.8){
  return new Promise((res)=>{
    const img=new Image();
    img.onload=()=>{
      const s=Math.min(maxW/img.width, maxH/img.height, 1);
      const w=Math.round(img.width*s), h=Math.round(img.height*s);
      const c=document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      res(c.toDataURL("image/jpeg", quality));
    };
    img.src=dataURL;
  });
}
