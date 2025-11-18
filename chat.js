import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  get,
  update,
  remove,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);
const messagesDiv = $("messages");

let uid = "";
let displayName = "";
let userColor = "#0078ff";
let avatar = "";
let isAdmin = false;
let isMod = false;

let currentChannel = "general";
let typingTimer = null;
const TENOR_KEY = "LIVDSRZULELA";

let profilesCache = {};

/* Helpers */
const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
const b64d = (s) => {
  try { return decodeURIComponent(escape(atob(s))); }
  catch { return s; }
};
const el = (t,c)=>{const e=document.createElement(t);if(c)e.className=c;return e;};
const initial = (n)=> (n||"?").trim().charAt(0).toUpperCase();
function colorFromName(name){
  const pal=["#f43f5e","#ef4444","#f97316","#f59e0b","#10b981","#06b6d4","#3b82f6","#8b5cf6","#a855f7","#ec4899"];
  let code=0;(name||"").toUpperCase().split("").forEach(ch=>code+=ch.charCodeAt(0));
  return pal[code%pal.length];
}
function sanitizeChannelName(name){
  return (name||"").trimStart().toLowerCase().replace(/[^a-z0-9\-_]/g,"").slice(0,25);
}

/* Profiles cache */
onValue(ref(db,"profiles"),snap=>{
  profilesCache=snap.val()||{};
});

/* Ensure #general exists */
async function ensureGeneralExists(){
  const metaRef=ref(db,"channelsMeta/general");
  const snap=await get(metaRef);
  if(!snap.exists()){
    await set(metaRef,{
      creator:"system",
      desc:"General chat",
      createdAt:Date.now(),
      private:false,
      members:{},
      theme:{bgColor:"#fafafa",bgImage:""}
    });
    await set(ref(db,"channels/general/messages"),{});
  }
}

/* Roles */
function watchRoles(){
  if(!uid)return;
  onValue(ref(db,"roles/"+uid),snap=>{
    const role=snap.val();
    isAdmin = role==="admin";
    isMod   = role==="mod" || role==="moderator";
    refreshChannelControls();
  });
}

/* Presence */
function roomKey(){
  return `channel:${currentChannel}`;
}
function startPresence(){
  if(!uid)return;
  const userRef=ref(db,"presence/"+uid);
  const connectedRef=ref(db,".info/connected");

  onValue(connectedRef,snap=>{
    if(snap.val()===false)return;
    onDisconnect(userRef).remove().then(()=>{
      set(userRef,{online:true,room:roomKey(),at:serverTimestamp()});
    });
  });

  onValue(ref(db,"presence"),snap=>{
    const val=snap.val()||{};
    $("users-list").innerHTML="";
    Object.entries(val).forEach(([id,info])=>{
      const prof=profilesCache[id];
      if(!prof)return;
      if(!info?.online)return;
      if(info.room!==roomKey())return;
      const age=Date.now()-(info.at||0);
      if(age>60000)return;

      const li=el("li","user-item");
      if(prof.avatar){
        const img=el("img","avatar");img.src=prof.avatar;li.appendChild(img);
      }else{
        const a=el("div","avatar");a.textContent=initial(prof.username||id);a.style.background=prof.color||colorFromName(prof.username||id);li.appendChild(a);
      }
      const nm=el("div","name");nm.textContent=prof.username||id;li.appendChild(nm);
      const bd=el("div","badge");bd.textContent=id===uid?"you":"online";li.appendChild(bd);
      $("users-list").appendChild(li);
    });
  });
}

/* Channels */
$("add-channel-btn").onclick = addChannel;
$("delete-channel-btn").onclick = deleteChannel;

async function addChannel(){
  // Max ONE own channel (besides general)
  const metaSnap=await get(ref(db,"channelsMeta"));
  if(metaSnap.exists()){
    const meta=metaSnap.val();
    for(const ch in meta){
      if(ch==="general")continue;
      if(meta[ch].creator===uid){
        alert("You can only create ONE channel.");
        return;
      }
    }
  }

  const desired=prompt("Channel name (letters, numbers, - or _):","");
  if(!desired)return;
  const clean=sanitizeChannelName(desired);
  if(!clean)return alert("Invalid channel name.");

  await set(ref(db,`channels/${clean}/messages`),{});
  await set(ref(db,`channelsMeta/${clean}`),{
    creator:uid,
    desc:"",
    createdAt:Date.now(),
    private:false,
    members:{},
    theme:{bgColor:"#fafafa",bgImage:""}
  });

  refreshChannelList();
  switchToChannel(clean);
}

function deleteChannel(){
  if(currentChannel==="general" && !isAdmin){
    alert("Only admin can delete #general (not recommended).");
    return;
  }
  const metaRef=ref(db,`channelsMeta/${currentChannel}`);
  get(metaRef).then(snap=>{
    const meta=snap.val();
    if(!meta)return;
    const owner=meta.creator===uid;
    if(!owner && !isAdmin && !isMod){
      alert("Only owner/admin can delete this channel.");
      return;
    }
    if(!confirm(`Delete #${currentChannel}?`))return;
    Promise.all([
      remove(ref(db,`channels/${currentChannel}`)),
      remove(metaRef)
    ]).then(()=>{
      refreshChannelList();
      switchToChannel("general");
    }).catch(()=>alert("Failed to delete channel"));
  });
}

function refreshChannelList(){
  onValue(ref(db,"channelsMeta"),snap=>{
    const meta=snap.val()||{};
    const list=$("channels-list");
    list.innerHTML="";

    Object.entries(meta)
      .sort(([a],[b])=>a.localeCompare(b))
      .forEach(([name,info])=>{
        if(info.private && !info.members?.[uid] && !isAdmin && !isMod)return;
        const li=el("li","item");
        if(name===currentChannel)li.classList.add("active");
        li.onclick=()=>switchToChannel(name);
        const hash=el("div","hash");hash.textContent="#";
        const nm=el("div","name");nm.textContent=name;
        li.append(hash,nm);
        list.appendChild(li);
      });

    refreshChannelControls();
  });
}

function switchToChannel(name){
  currentChannel=name;
  $("room-pill-prefix").textContent="#";
  $("room-pill-name").textContent=name;
  $("room-name-label").textContent="#"+name;

  if(uid){
    update(ref(db,"presence/"+uid),{room:roomKey(),at:serverTimestamp()}).catch(()=>{});
  }

  attachMessages();
  loadTheme();
  refreshChannelControls();
}

/* Theme */
$("theme-btn").onclick=()=>{
  const metaRef=ref(db,`channelsMeta/${currentChannel}`);
  get(metaRef).then(snap=>{
    const meta=snap.val();
    if(!meta)return;
    const owner=meta.creator===uid;
    if(!owner && !isAdmin && !isMod){
      alert("Only owner/admin can edit theme.");
      return;
    }
    const theme=meta.theme||{};
    $("theme-color").value=theme.bgColor||"#fafafa";
    $("upload-bg-btn").dataset.bg=theme.bgImage||"";
    $("theme-modal").showModal();
  });
};
$("theme-close").onclick=()=>$("theme-modal").close();
$("upload-bg-btn").onclick=()=>$("theme-image").click();
$("theme-image").onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  const data=await fileToDataURL(f);
  const tiny=await downscaleDataURL(data,1600,1600,0.85);
  $("upload-bg-btn").dataset.bg=tiny;
};
$("theme-save").onclick=()=>{
  const color=$("theme-color").value||"#fafafa";
  const img=$("upload-bg-btn").dataset.bg||"";
  update(ref(db,`channelsMeta/${currentChannel}/theme`),{bgColor:color,bgImage:img})
    .then(()=>{loadTheme();$("theme-modal").close();})
    .catch(()=>alert("Failed to save theme"));
};
function loadTheme(){
  get(ref(db,`channelsMeta/${currentChannel}/theme`)).then(snap=>{
    const t=snap.val()||{};
    messagesDiv.style.background=t.bgColor||"#fafafa";
    if(t.bgImage){
      messagesDiv.style.backgroundImage=`url(${t.bgImage})`;
      messagesDiv.style.backgroundSize="cover";
      messagesDiv.style.backgroundPosition="center";
    }else{
      messagesDiv.style.backgroundImage="none";
    }
  });
}
function refreshChannelControls(){
  const themeBtn=$("theme-btn");
  const delBtn=$("delete-channel-btn");
  if(!themeBtn||!delBtn)return;

  get(ref(db,`channelsMeta/${currentChannel}`)).then(snap=>{
    const meta=snap.val()||{};
    const owner=meta.creator===uid;
    const allowed=owner||isAdmin||isMod;
    themeBtn.style.display=allowed?"inline-block":"none";
    delBtn.style.display=allowed?"inline-block":"none";
  });
}

/* Messages */
function messagesPath(){
  return `channels/${currentChannel}/messages`;
}
function attachMessages(){
  onValue(ref(db,messagesPath()),snap=>{
    messagesDiv.innerHTML="";
    const val=snap.val()||{};
    Object.values(val).forEach(m=>renderMessage(m));
    messagesDiv.scrollTop=messagesDiv.scrollHeight;
  });
}
function renderMessage(m){
  const wrap=el("div","message");
  if(m.userId===uid)wrap.classList.add("self");
  const prof=profilesCache[m.userId]||{};
  const dispName=prof.username||m.displayName||m.userId||"unknown";

  if(prof.avatar){
    const img=el("img","avatar");img.src=prof.avatar;wrap.appendChild(img);
  }else{
    const a=el("div","avatar");a.textContent=initial(dispName);a.style.background=prof.color||colorFromName(dispName);wrap.appendChild(a);
  }

  const box=el("div","msg-content");
  if(m.userId===uid){box.style.background=userColor;box.style.color="#fff";}
  else if(prof.color){box.style.background=prof.color;box.style.color="#fff";}

  const head=el("div","msg-header");
  const t=m.timestamp?new Date(m.timestamp).toLocaleTimeString():"";
  head.innerHTML=`${dispName} <span class="timestamp">${t}</span>`;
  box.appendChild(head);

  if(m.type==="image"){
    const em=el("div","embed");const im=el("img");im.src=m.url;em.appendChild(im);box.appendChild(em);
  }else if(m.type==="gif"){
    const em=el("div","embed");const im=el("img");im.src=m.gif;em.appendChild(im);box.appendChild(em);
  }else{
    const text=b64d(m.text||"");box.appendChild(autoEmbed(text));
  }

  wrap.appendChild(box);
  messagesDiv.appendChild(wrap);
}

/* Send + typing */
$("send-btn").onclick=sendMessage;
$("user-input").addEventListener("keydown",e=>{
  if(e.key==="Enter")sendMessage();
  setTyping(true);
});
function sendMessage(){
  const txt=$("user-input").value.trim();
  if(!txt)return;
  const msgRef=push(ref(db,messagesPath()));
  set(msgRef,{type:"text",text:b64e(txt),userId:uid,displayName,timestamp:Date.now()})
    .then(()=>{$("user-input").value="";});
}
function setTyping(state){
  if(!uid)return;
  const tRef=ref(db,`typing/${currentChannel}/${uid}`);
  set(tRef,state).catch(()=>{});
  clearTimeout(typingTimer);
  if(state){
    typingTimer=setTimeout(()=>{set(tRef,false).catch(()=>{});},1200);
  }
}
onValue(ref(db,`typing/${currentChannel}`),snap=>{
  const map=snap.val()||{};
  const others=Object.keys(map).filter(k=>k!==uid&&map[k]);
  $("typing-indicator").style.display=others.length?"block":"none";
});

/* Images & GIFs */
$("img-btn").onclick=()=>$("image-upload").click();
$("image-upload").onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  const data=await fileToDataURL(f);
  const msgRef=push(ref(db,messagesPath()));
  set(msgRef,{type:"image",url:data,userId:uid,displayName,timestamp:Date.now()});
};
$("gif-btn").onclick=()=>$("gif-modal").showModal();
$("gif-close").onclick=()=>$("gif-modal").close();
$("gif-search-btn").onclick=()=>loadGifs($("gif-search").value||"funny");
$("gif-search").addEventListener("keypress",e=>{if(e.key==="Enter")loadGifs($("gif-search").value||"funny");});
function loadGifs(q){
  $("gif-grid").innerHTML="Loading...";
  fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&client_key=simple-chat&limit=24`)
    .then(r=>r.json())
    .then(json=>{
      $("gif-grid").innerHTML="";
      (json.results||[]).forEach(item=>{
        const url=item.media_formats?.gif?.url||item.media_formats?.tinygif?.url;
        if(!url)return;
        const img=el("img","gif-thumb");img.src=url;img.onclick=()=>sendGif(url);$("gif-grid").appendChild(img);
      });
    }).catch(()=>{$("gif-grid").innerHTML="Failed to load GIFs.";});
}
function sendGif(url){
  const msgRef=push(ref(db,messagesPath()));
  set(msgRef,{type:"gif",gif:url,userId:uid,displayName,timestamp:Date.now()});
  $("gif-modal").close();
}

/* Embeds */
function autoEmbed(text){
  const container=el("div");
  const linked=text.replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  const p=el("div");p.innerHTML=linked;container.appendChild(p);

  const yt=text.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w\-]+)/i);
  if(yt&&yt[1]){
    const em=el("div","embed");const ifr=el("iframe");
    ifr.src=`https://www.youtube.com/embed/${yt[1]}`;
    ifr.width="360";ifr.height="203";ifr.frameBorder="0";
    em.appendChild(ifr);container.appendChild(em);
  }

  if(/\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(text)){
    const em=el("div","embed");const im=el("img");im.src=text;em.appendChild(im);container.appendChild(em);
  }
  return container;
}

/* Utils */
function fileToDataURL(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);
  });
}
function downscaleDataURL(dataURL,maxW,maxH,quality=0.9){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const s=Math.min(maxW/img.width,maxH/img.height,1);
      const w=Math.round(img.width*s),h=Math.round(img.height*s);
      const c=document.createElement("canvas");c.width=w;c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      res(c.toDataURL("image/jpeg",quality));
    };
    img.src=dataURL;
  });
}

/* Profile modal */
$("edit-profile-btn").onclick=()=>{
  $("profile-username").value=displayName;
  $("profile-username").disabled=true;
  $("profile-color").value=userColor;
  $("profile-preview").src=avatar||"";
  $("profile-modal").showModal();
};
$("profile-cancel").onclick=()=>$("profile-modal").close();
$("profile-file").onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  const data=await fileToDataURL(f);
  const small=await downscaleDataURL(data,96,96,0.85);
  avatar=small;
  $("profile-preview").src=small;
};
$("profile-form").onsubmit=async ev=>{
  ev.preventDefault();
  userColor=$("profile-color").value||userColor;
  await update(ref(db,"profiles/"+uid),{color:userColor,avatar});
  $("profile-modal").close();
};

/* Logout */
$("logout-btn").onclick=()=>signOut(auth).then(()=>{window.location.href="login.html";});

/* Start with auth */
onAuthStateChanged(auth, async (user)=>{
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;

  const profSnap = await get(ref(db, "profiles/" + uid));
  if (profSnap.exists()) {
    const p = profSnap.val();
    displayName = p.username || (user.email ? user.email.split("@")[0] : "User");
    userColor = p.color || userColor;
    avatar = p.avatar || "";
  } else {
    displayName = user.email ? user.email.split("@")[0] : "User";
    await set(ref(db, "profiles/" + uid), {
      username: displayName,
      color: userColor,
      avatar: "",
      email: user.email || ""
    });
  }

  await ensureGeneralExists();
  $("app").style.display = "grid";

  startPresence();
  watchRoles();
  refreshChannelList();
  switchToChannel("general");
});



