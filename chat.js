// Simple Chat+ (secure admin from Firebase, real presence, optimized channels)
// Features: profiles (global), avatars/colors, themes per channel, owner/admin controls,
// images, Tenor GIFs, timestamps, link embeds, scrollable messages.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue, get, update, remove,
  onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ================= Firebase ================= */
const firebaseConfig = {
  apiKey: "AIzaSyBi9MKK_bhjIymbvoe1WNjZYHfhzaC_EHQ",
  authDomain: "localwebchat.firebaseapp.com",
  databaseURL: "https://localwebchat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "localwebchat",
  storageBucket: "localwebchat.firebasestorage.app",
  messagingSenderId: "508495711943",
  appId: "1:508495711943:web:fb438f6a1fd138b29cf8e2",
  measurementId: "G-G6YGYZP6YS"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

/* ================ Admin creds from DB ================ */
/* Expect in your DB:
config: {
  admin: { username: "BKHorn", password: "eyfuv337" }
}
*/
let ADMIN_USERNAME = "";
let ADMIN_PASSWORD = "";
get(ref(db, "config/admin")).then(snap => {
  const data = snap.val() || {};
  ADMIN_USERNAME = data.username || "";
  ADMIN_PASSWORD = data.password || "";
});

/* ================= State & helpers ================= */
let isAdmin = false;
let username = "";
let userColor = "#0078ff";
let avatar   = "";
let currentChannel = localStorage.getItem("chatChannel") || "general";
let typingTimer = null;
const TENOR_KEY = "LIVDSRZULELA"; // demo

const $ = id => document.getElementById(id);
const messagesDiv = $("messages");

const b64e = s => btoa(unescape(encodeURIComponent(s)));
const b64d = s => { try { return decodeURIComponent(escape(atob(s))); } catch { return s; } };
const el = (t,c)=>{const e=document.createElement(t); if(c) e.className=c; return e;};
const initial = n => (n||"?").trim().charAt(0).toUpperCase();
function colorFromName(name){
  const pal=["#f43f5e","#ef4444","#f97316","#f59e0b","#10b981","#06b6d4","#3b82f6","#8b5cf6","#a855f7","#ec4899"];
  let code=0; (name||"").toUpperCase().split("").forEach(ch=>code+=ch.charCodeAt(0));
  return pal[code%pal.length];
}
function sanitizeChannelName(name){
  return (name||"")
    .trimStart()               // prevents first-letter loss if user typed a space
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g,"")
    .slice(0,25);
}

/* ================= Profiles ================= */
let profilesCache = {};
onValue(ref(db,"profiles"), snap=>{
  profilesCache = snap.val() || {};
});

function saveProfile(){
  const profile = { username, color: userColor, avatar };
  localStorage.setItem("chatProfile", JSON.stringify(profile));
  return set(ref(db, `profiles/${username}`), profile);
}

/* ================= Auth flow ================= */
const saved = JSON.parse(localStorage.getItem("chatProfile")||"{}");
if (saved.username){
  username = saved.username;
  userColor = saved.color || userColor;
  avatar = saved.avatar || "";
  $("auth-panel").style.display="none";
  $("app").style.display="grid";
  startApp();
}

$("join-btn").onclick = async ()=>{
  username = $("username-input").value.trim();
  if (!username) return alert("Pick a username");
  await saveProfile();
  $("auth-panel").style.display="none";
  $("app").style.display="grid";
  startApp();
};
$("guest-btn").onclick = async ()=>{
  username = "Guest"+Math.floor(Math.random()*9000+1000);
  await saveProfile();
  $("auth-panel").style.display="none";
  $("app").style.display="grid";
  startApp();
};

/* Profile modal */
$("edit-profile-btn").onclick = ()=>{
  $("profile-username").value = username;
  $("profile-color").value = userColor;
  $("profile-preview").src = avatar || "";
  $("profile-modal").showModal();
};
$("profile-cancel").onclick = ()=> $("profile-modal").close();
$("profile-file").onchange = async (e)=>{
  const f = e.target.files?.[0]; if (!f) return;
  const data = await fileToDataURL(f);
  const small = await downscaleDataURL(data, 96, 96, 0.85);
  avatar = small;
  $("profile-preview").src = small;
};
$("profile-form").onsubmit = async (ev)=>{
  ev.preventDefault();
  const newName  = $("profile-username").value.trim() || username;
  const newColor = $("profile-color").value || userColor;

  // if username changed, update state + presence
  const nameChanged = newName !== username;
  username = newName;
  userColor = newColor;

  await saveProfile();
  if (nameChanged) startPresence(); // refresh presence path
  $("profile-modal").close();
};

/* ================ Admin button ================ */
document.addEventListener("DOMContentLoaded", ()=>{
  const adm = $("admin-login-btn");
  if (!adm) return;
  adm.onclick = async ()=>{
    const u = prompt("Admin username:");
    if (!u) return;
    const p = prompt("Admin password:");
    // Compare against values loaded from DB
    if (u === ADMIN_USERNAME && p === ADMIN_PASSWORD){
      isAdmin = true;
      alert("Admin mode enabled");
      refreshChannelControls();
    } else {
      alert("Wrong admin login");
    }
  };
});

/* ================= Presence (actual online) ================= */
function startPresence(){
  if (!username) return;
  const userRef = ref(db, `presence/${username}`);
  const connectedRef = ref(db, ".info/connected");

  onValue(connectedRef, (snap)=>{
    if (snap.val() === false) return;
    onDisconnect(userRef).remove().then(()=>{
      set(userRef, { online:true, room: currentChannel, at: serverTimestamp() });
    });
  });

  // online list = only users in current room, presence nodes auto-removed on disconnect
  onValue(ref(db,"presence"), (snap)=>{
    const val = snap.val() || {};
    $("users-list").innerHTML = "";
    Object.keys(val).forEach((name)=>{
      const u = val[name];
      if (!u || !u.online) return;
      if (u.room !== currentChannel) return;

      const li = el("li","user-item");
      const profile = profilesCache[name] || {};
      if (profile.avatar){
        const img = el("img","avatar"); img.src = profile.avatar; li.appendChild(img);
      } else {
        const a = el("div","avatar"); a.textContent = initial(name); a.style.background = profile.color || colorFromName(name); li.appendChild(a);
      }
      const nm = el("div","name"); nm.textContent = name; li.appendChild(nm);
      const bd = el("div","badge"); bd.textContent = (name===username)?"you":"online"; li.appendChild(bd);

      $("users-list").appendChild(li);
    });
  });
}

/* ================= Channels ================= */
$("add-channel-btn").onclick = addChannel;
$("delete-channel-btn").onclick = deleteChannel;

function addChannel(){
  const desired = prompt("Channel name (letters, numbers, - or _):","my-channel");
  if (!desired) return;
  const clean = sanitizeChannelName(desired);
  if (!clean) return alert("Invalid channel name");

  // create if not exists
  Promise.all([
    set(ref(db, `channels/${clean}/messages`), {}),
    update(ref(db, `channelsMeta/${clean}`), {
      creator: profilesCache[username]?.username || username,
      desc: "",
      theme: { bgColor: "#fafafa", bgImage: "" },
      createdAt: Date.now()
    })
  ]).then(()=>{
    refreshChannelList();
    switchChannel(clean);
  }).catch(()=> alert("Failed to create channel"));
}

function deleteChannel(){
  get(ref(db, `channelsMeta/${currentChannel}`)).then((snap)=>{
    const meta = snap.val();
    if (!meta) return;
    if (meta.creator !== username && !isAdmin) return alert("Only the owner or admin can delete this channel.");
    if (!confirm(`Delete #${currentChannel}?`)) return;

    Promise.all([
      remove(ref(db, `channels/${currentChannel}`)),
      remove(ref(db, `channelsMeta/${currentChannel}`))
    ]).then(()=>{
      refreshChannelList();
      switchChannel("general");
    });
  });
}

function refreshChannelList(){
  onValue(ref(db,"channelsMeta"), (snap)=>{
    const meta = snap.val() || {};
    const list = $("channels-list");
    list.innerHTML = "";

    Object.keys(meta).sort().forEach((name)=>{
      const li = el("li","item");
      if (name === currentChannel) li.classList.add("active");
      li.onclick = ()=> switchChannel(name);

      const hash = el("div","hash"); hash.textContent = "#";
      const nm   = el("div","name"); nm.textContent = name;
      li.append(hash, nm);
      list.appendChild(li);
    });

    refreshChannelControls();
  });
}

function refreshChannelControls(){
  get(ref(db, `channelsMeta/${currentChannel}`)).then((snap)=>{
    const meta = snap.val() || {};
    const allowed = (meta.creator === username) || isAdmin;
    $("theme-btn").style.display = allowed ? "inline-block" : "none";
    $("delete-channel-btn").style.display = allowed ? "inline-block" : "none";
  });
}

function switchChannel(name){
  if (!name) return;
  currentChannel = name;
  localStorage.setItem("chatChannel", name);
  $("room-pill-name").textContent = name;
  $("room-name-label").textContent = name;

  // update presence room
  set(ref(db, `presence/${username}`), { online:true, room: currentChannel, at: serverTimestamp() }).catch(()=>{});

  attachMessages();
  loadTheme();
  refreshChannelControls();
}

/* ================= Theme per channel ================= */
$("theme-btn").onclick = ()=>{
  get(ref(db, `channelsMeta/${currentChannel}`)).then((snap)=>{
    const meta = snap.val();
    if (!meta) return;
    if (meta.creator !== username && !isAdmin) return alert("Only the owner or admin can edit theme.");
    const theme = meta.theme || {};
    $("theme-color").value = theme.bgColor || "#fafafa";
    if (theme.bgImage) $("upload-bg-btn").dataset.bg = theme.bgImage;
    $("theme-modal").showModal();
  });
};
$("theme-close").onclick = ()=> $("theme-modal").close();
$("upload-bg-btn").onclick = ()=> $("theme-image").click();
$("theme-image").onchange = async (e)=>{
  const f = e.target.files?.[0]; if (!f) return;
  const data = await fileToDataURL(f);
  const tiny = await downscaleDataURL(data, 1600, 1600, 0.85);
  $("upload-bg-btn").dataset.bg = tiny;
};
$("theme-save").onclick = ()=>{
  const color = $("theme-color").value || "#fafafa";
  const img   = $("upload-bg-btn").dataset.bg || "";
  update(ref(db, `channelsMeta/${currentChannel}/theme`), { bgColor: color, bgImage: img })
    .then(()=>{ loadTheme(); $("theme-modal").close(); })
    .catch(()=> alert("Failed to save theme"));
};
function loadTheme(){
  get(ref(db, `channelsMeta/${currentChannel}/theme`)).then((snap)=>{
    const t = snap.val() || {};
    messagesDiv.style.background = t.bgColor || "#fafafa";
    if (t.bgImage){
      messagesDiv.style.backgroundImage = `url(${t.bgImage})`;
      messagesDiv.style.backgroundSize = "cover";
      messagesDiv.style.backgroundPosition = "center";
    } else {
      messagesDiv.style.backgroundImage = "none";
    }
  });
}

/* ================= Messages ================= */
function attachMessages(){
  onValue(ref(db, `channels/${currentChannel}/messages`), (snap)=>{
    messagesDiv.innerHTML = "";
    const obj = snap.val() || {};
    Object.values(obj).forEach(renderMessage);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

function renderMessage(m){
  const wrap = el("div","message");
  if (m.username === username) wrap.classList.add("self");

  const prof = profilesCache[m.username] || {};
  if (prof.avatar){
    const img = el("img","avatar"); img.src = prof.avatar; wrap.appendChild(img);
  } else {
    const a = el("div","avatar"); a.textContent = initial(m.username); a.style.background = prof.color || colorFromName(m.username); wrap.appendChild(a);
  }

  const box = el("div","msg-content");
  if (m.username === username){ box.style.background = userColor; box.style.color = "#fff"; }
  else if (prof.color){ box.style.background = prof.color; box.style.color = "#fff"; }

  const head = el("div","msg-header");
  const t = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
  head.innerHTML = `${m.username || "system"} <span class="timestamp">${t}</span>`;
  box.appendChild(head);

  if (m.type === "image"){
    const em = el("div","embed"); const im = el("img"); im.src = m.url; em.appendChild(im); box.appendChild(em);
  } else if (m.type === "gif"){
    const em = el("div","embed"); const im = el("img"); im.src = m.gif; em.appendChild(im); box.appendChild(em);
  } else {
    const text = b64d(m.text || "");
    box.appendChild(autoEmbed(text));
  }

  wrap.appendChild(box);
  messagesDiv.appendChild(wrap);
}

/* Send + typing */
$("send-btn").onclick = sendMessage;
$("user-input").addEventListener("keydown", (e)=>{
  if (e.key === "Enter") sendMessage();
  setTyping(true);
});
function sendMessage(){
  const txt = $("user-input").value.trim();
  if (!txt) return;
  const msgRef = push(ref(db, `channels/${currentChannel}/messages`));
  set(msgRef, { type:"text", text:b64e(txt), username, timestamp: Date.now() })
    .then(()=> $("user-input").value = "");
}
function setTyping(state){
  set(ref(db, `typing/${currentChannel}/${username}`), state).catch(()=>{});
  clearTimeout(typingTimer);
  if (state) typingTimer = setTimeout(()=> set(ref(db, `typing/${currentChannel}/${username}`), false), 1200);
}
onValue(ref(db, `typing/${currentChannel}`), (snap)=>{
  const map = snap.val() || {};
  const others = Object.keys(map).filter(n=> n!==username && map[n]);
  $("typing-indicator").style.display = others.length ? "block" : "none";
});

/* ================= Images & GIFs ================= */
$("img-btn").onclick = ()=> $("image-upload").click();
$("image-upload").onchange = async (e)=>{
  const f = e.target.files?.[0]; if (!f) return;
  const data = await fileToDataURL(f);
  const msgRef = push(ref(db, `channels/${currentChannel}/messages`));
  set(msgRef, { type:"image", url:data, username, timestamp: Date.now() });
};

$("gif-btn").onclick = ()=>{
  $("gif-modal").showModal();
  if (!$("gif-search").value) loadGifs("trending");
};
$("gif-close").onclick = ()=> $("gif-modal").close();
$("gif-search-btn").onclick = ()=> loadGifs($("gif-search").value || "funny");
$("gif-search").addEventListener("keypress", (e)=>{ if(e.key==="Enter") loadGifs($("gif-search").value || "funny"); });

function loadGifs(q){
  $("gif-grid").innerHTML = "Loading...";
  fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&client_key=simple-chat&limit=24`)
    .then(r=>r.json())
    .then(json=>{
      $("gif-grid").innerHTML="";
      (json.results||[]).forEach(item=>{
        const url = item.media_formats?.gif?.url || item.media_formats?.tinygif?.url;
        if (!url) return;
        const img = el("img","gif-thumb"); img.src = url; img.onclick = ()=> sendGif(url);
        $("gif-grid").appendChild(img);
      });
    })
    .catch(()=> $("gif-grid").innerHTML="Failed to load GIFs.");
}
function sendGif(url){
  const msgRef = push(ref(db, `channels/${currentChannel}/messages`));
  set(msgRef, { type:"gif", gif:url, username, timestamp: Date.now() });
  $("gif-modal").close();
}

/* ================= Embeds ================= */
function autoEmbed(text){
  const container = el("div");
  const linked = text.replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  const p = el("div"); p.innerHTML = linked; container.appendChild(p);

  const yt = text.match(/(?:youtube\.com\/watch\\?v=|youtu\.be\/)([\\w\\-]+)/i);
  if (yt && yt[1]){
    const em = el("div","embed"); const ifr = el("iframe");
    ifr.src = `https://www.youtube.com/embed/${yt[1]}`;
    ifr.width = "360"; ifr.height = "203"; ifr.frameBorder = "0";
    em.appendChild(ifr); container.appendChild(em);
  }

  if (/\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(text)){
    const em = el("div","embed"); const im = el("img"); im.src = text; em.appendChild(im); container.appendChild(em);
  }
  return container;
}

/* ================= Utils ================= */
function fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }
function downscaleDataURL(dataURL,maxW,maxH,quality=0.9){
  return new Promise(res=>{
    const img = new Image();
    img.onload = ()=>{
      const s = Math.min(maxW/img.width, maxH/img.height, 1);
      const w = Math.round(img.width*s), h = Math.round(img.height*s);
      const c = document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      res(c.toDataURL("image/jpeg", quality));
    };
    img.src = dataURL;
  });
}

/* ================= Start ================= */
function startApp(){
  saveProfile();
  startPresence();
  refreshChannelList();
  switchChannel(currentChannel);
}
