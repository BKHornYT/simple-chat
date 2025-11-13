// Discord-like Simple Chat+
// Case-insensitive usernames, roles-based admin/mod, private channels, DMs,
// presence, themes, GIFs, images, embeds, typing.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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

/* ========= Firebase =========*/
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
const db = getDatabase(app);

/* ========= State ========= */
let userId = "";        // lowercase ID for DB paths
let displayName = "";   // pretty username
let userColor = "#0078ff";
let avatar = "";
let isAdmin = false;
let isMod = false;

let currentRoom = { type: "channel", id: "general" }; // {type:"channel"|"dm", id:string}
let typingTimer = null;
const TENOR_KEY = "LIVDSRZULELA";

const $ = (id) => document.getElementById(id);
const messagesDiv = $("messages");

/* ========= Device ID ========= */
let deviceId = localStorage.getItem("deviceId");
if (!deviceId) {
  if (window.crypto?.randomUUID) deviceId = crypto.randomUUID();
  else deviceId = Date.now() + "-" + Math.random();
  localStorage.setItem("deviceId", deviceId);
}

/* ========= Helpers ========= */
const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
const b64d = (s) => {
  try { return decodeURIComponent(escape(atob(s))); }
  catch { return s; }
};
const el = (t, c) => {
  const e = document.createElement(t);
  if (c) e.className = c;
  return e;
};
const initial = (n) => (n || "?").trim().charAt(0).toUpperCase();
function colorFromName(name) {
  const pal = ["#f43f5e","#ef4444","#f97316","#f59e0b","#10b981","#06b6d4","#3b82f6","#8b5cf6","#a855f7","#ec4899"];
  let code = 0;
  (name || "").toUpperCase().split("").forEach(ch => code += ch.charCodeAt(0));
  return pal[code % pal.length];
}
function sanitizeChannelName(name) {
  return (name || "")
    .trimStart()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, "")
    .slice(0, 25);
}
function roomKey() {
  if (currentRoom.type === "channel") return `channel:${currentRoom.id}`;
  return `dm:${currentRoom.id}`;
}

/* ========= Profiles ========= */
let profilesCache = {};
onValue(ref(db, "profiles"), snap => {
  profilesCache = snap.val() || {};
});

async function saveProfile() {
  const profile = {
    userId,
    username: displayName,
    color: userColor,
    avatar,
    deviceId
  };
  localStorage.setItem("chatSession", JSON.stringify(profile));
  await set(ref(db, `profiles/${userId}`), profile);
}

/* ========= Roles ========= */
function watchRoles() {
  if (!userId) return;
  onValue(ref(db, `roles/${userId}`), snap => {
    const role = snap.val();
    isAdmin = role === "admin";
    isMod = role === "mod" || role === "moderator";
    refreshChannelControls();
  });
}

/* ========= Auth ========= */
const saved = JSON.parse(localStorage.getItem("chatSession") || "{}");
if (saved.userId) {
  userId = saved.userId;
  displayName = saved.username;
  userColor = saved.color || userColor;
  avatar = saved.avatar || "";
  $("auth-panel").style.display = "none";
  $("app").style.display = "grid";
  startApp();
}

async function usernameTakenByOtherDevice(lower) {
  const snap = await get(ref(db, `profiles/${lower}`));
  if (!snap.exists()) return false;
  const data = snap.val() || {};
  if (!data.deviceId) return true;
  return data.deviceId !== deviceId;
}

$("join-btn").onclick = async () => {
  const raw = $("username-input").value.trim();
  if (!raw) return alert("Enter a username.");
  const lower = raw.toLowerCase();

  if (await usernameTakenByOtherDevice(lower)) {
    alert("That username is already taken.");
    return;
  }

  userId = lower;
  displayName = raw;
  await saveProfile();

  $("auth-panel").style.display = "none";
  $("app").style.display = "grid";

  startApp();
};

/* Profile modal */
$("edit-profile-btn").onclick = () => {
  $("profile-username").value = displayName;
  $("profile-username").disabled = true;
  $("profile-color").value = userColor;
  $("profile-preview").src = avatar || "";
  $("profile-modal").showModal();
};
$("profile-cancel").onclick = () => $("profile-modal").close();
$("profile-file").onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const data = await fileToDataURL(f);
  const small = await downscaleDataURL(data, 96, 96, 0.85);
  avatar = small;
  $("profile-preview").src = small;
};
$("profile-form").onsubmit = async (ev) => {
  ev.preventDefault();
  userColor = $("profile-color").value || userColor;
  await saveProfile();
  $("profile-modal").close();
};

/* ========= Presence ========= */
function startPresence() {
  if (!userId) return;
  const userRef = ref(db, `presence/${userId}`);
  const connectedRef = ref(db, ".info/connected");

  onValue(connectedRef, snap => {
    if (snap.val() === false) return;
    onDisconnect(userRef).remove().then(() => {
      set(userRef, {
        online: true,
        room: roomKey(),
        at: serverTimestamp(),
        deviceId
      });
    });
  });

  onValue(ref(db, "presence"), snap => {
    const val = snap.val() || {};
    $("users-list").innerHTML = "";

    Object.entries(val).forEach(([id, info]) => {
      const prof = profilesCache[id];
      if (!prof) return;
      if (!info?.online) return;
      if (info.room !== roomKey()) return;
      const ageMs = Date.now() - (info.at || 0);
      if (ageMs > 60000) return;

      const li = el("li", "user-item");

      if (prof.avatar) {
        const img = el("img", "avatar");
        img.src = prof.avatar;
        li.appendChild(img);
      } else {
        const a = el("div", "avatar");
        a.textContent = initial(prof.username || id);
        a.style.background = prof.color || colorFromName(prof.username || id);
        li.appendChild(a);
      }

      const nm = el("div", "name");
      nm.textContent = prof.username || id;
      li.appendChild(nm);

      const bd = el("div", "badge");
      bd.textContent = id === userId ? "you" : "online";
      li.appendChild(bd);

      $("users-list").appendChild(li);
    });
  });
}

/* ========= Channels & DMs ========= */
$("add-channel-btn").onclick = addChannel;
$("delete-channel-btn").onclick = deleteChannel;
$("new-dm-btn").onclick = startNewDm;

function addChannel() {
  const desired = prompt("Channel name (letters, numbers, - or _):", "general-2");
  if (!desired) return;
  const clean = sanitizeChannelName(desired);
  if (!clean) return alert("Invalid channel name.");

  const metaRef = ref(db, `channelsMeta/${clean}`);
  get(metaRef).then(snap => {
    if (snap.exists()) {
      switchToChannel(clean);
      return;
    }
    const isPrivate = confirm("Make this channel private? (OK = yes / Cancel = public)");
    const members = {};
    members[userId] = true;

    Promise.all([
      set(ref(db, `channels/${clean}/messages`), {}),
      set(metaRef, {
        creator: userId,
        desc: "",
        theme: { bgColor: "#fafafa", bgImage: "" },
        createdAt: Date.now(),
        private: isPrivate,
        members
      })
    ]).then(() => {
      refreshChannelList();
      switchToChannel(clean);
    }).catch(() => alert("Failed to create channel"));
  });
}

function deleteChannel() {
  if (currentRoom.type !== "channel") return alert("You can only delete channels.");
  const metaRef = ref(db, `channelsMeta/${currentRoom.id}`);
  get(metaRef).then(snap => {
    const meta = snap.val();
    if (!meta) return;
    const owner = meta.creator === userId;
    if (!owner && !isAdmin && !isMod) return alert("Only the owner or an admin can delete this channel.");
    if (!confirm(`Delete #${currentRoom.id}?`)) return;

    Promise.all([
      remove(ref(db, `channels/${currentRoom.id}`)),
      remove(metaRef)
    ]).then(() => {
      refreshChannelList();
      switchToChannel("general");
    }).catch(() => alert("Failed to delete channel"));
  });
}

function refreshChannelList() {
  onValue(ref(db, "channelsMeta"), snap => {
    const meta = snap.val() || {};
    const list = $("channels-list");
    list.innerHTML = "";

    Object.entries(meta)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([name, info]) => {
        if (info.private && !info.members?.[userId] && !isAdmin && !isMod) return;

        const li = el("li", "item");
        if (currentRoom.type === "channel" && currentRoom.id === name) li.classList.add("active");
        li.onclick = () => switchToChannel(name);

        const hash = el("div", "hash");
        hash.textContent = "#";
        const nm = el("div", "name");
        nm.textContent = name;

        li.append(hash, nm);
        list.appendChild(li);
      });

    refreshChannelControls();
  });
}

/* DMs Index: dmsIndex/{userId}/{otherId} = roomId */
function startNewDm() {
  const targetName = prompt("DM who? (username, case-insensitive)");
  if (!targetName) return;
  const lower = targetName.trim().toLowerCase();
  if (!lower) return;
  if (lower === userId) return alert("You can't DM yourself.");

  get(ref(db, `profiles/${lower}`)).then(snap => {
    if (!snap.exists()) {
      alert("User not found.");
      return;
    }
    const other = lower;
    const me = userId;
    const key = me < other ? `${me}__${other}` : `${other}__${me}`;
    const roomId = `dm_${key}`;

    const myIndex = ref(db, `dmsIndex/${me}/${other}`);
    const theirIndex = ref(db, `dmsIndex/${other}/${me}`);

    Promise.all([
      set(myIndex, roomId),
      set(theirIndex, roomId),
      update(ref(db, `dmsMeta/${roomId}`), {
        users: { [me]: true, [other]: true },
        updatedAt: Date.now()
      })
    ]).then(() => {
      switchToDm(roomId, other);
    });
  });
}

function watchDmList() {
  if (!userId) return;
  onValue(ref(db, `dmsIndex/${userId}`), snap => {
    const val = snap.val() || {};
    const list = $("dm-list");
    list.innerHTML = "";

    Object.entries(val).forEach(([otherId, roomId]) => {
      const prof = profilesCache[otherId];
      const li = el("li", "item");
      if (currentRoom.type === "dm" && currentRoom.id === roomId) li.classList.add("active");
      li.onclick = () => switchToDm(roomId, otherId);

      const av = el("div", "dm-avatar");
      av.textContent = initial(prof?.username || otherId);
      const nm = el("div", "name");
      nm.textContent = prof?.username || otherId;

      li.append(av, nm);
      list.appendChild(li);
    });
  });
}

/* ========= Switch room ========= */
function switchToChannel(name) {
  currentRoom = { type: "channel", id: name };
  $("room-pill-prefix").textContent = "#";
  $("room-pill-name").textContent = name;
  $("room-name-label").textContent = `#${name}`;

  if (userId) {
    update(ref(db, `presence/${userId}`), {
      room: roomKey(),
      at: serverTimestamp()
    }).catch(() => {});
  }

  attachMessages();
  loadTheme();
  refreshChannelControls();
}

function switchToDm(roomId, otherId) {
  currentRoom = { type: "dm", id: roomId };
  const prof = profilesCache[otherId];
  const label = prof?.username || otherId;
  $("room-pill-prefix").textContent = "@";
  $("room-pill-name").textContent = label;
  $("room-name-label").textContent = `@${label}`;

  if (userId) {
    update(ref(db, `presence/${userId}`), {
      room: roomKey(),
      at: serverTimestamp()
    }).catch(() => {});
  }

  attachMessages();
  messagesDiv.style.backgroundImage = "none";
  messagesDiv.style.backgroundColor = "#fafafa";
  $("theme-btn").style.display = "none";
  $("delete-channel-btn").style.display = isAdmin || isMod ? "inline-block" : "none";
}

/* ========= Theme ========= */
$("theme-btn").onclick = () => {
  if (currentRoom.type !== "channel") {
    alert("Themes only apply to channels.");
    return;
  }
  const metaRef = ref(db, `channelsMeta/${currentRoom.id}`);
  get(metaRef).then(snap => {
    const meta = snap.val();
    if (!meta) return;
    const owner = meta.creator === userId;
    if (!owner && !isAdmin && !isMod) {
      alert("Only the owner or admin can edit theme.");
      return;
    }
    const theme = meta.theme || {};
    $("theme-color").value = theme.bgColor || "#fafafa";
    $("upload-bg-btn").dataset.bg = theme.bgImage || "";
    $("theme-modal").showModal();
  });
};
$("theme-close").onclick = () => $("theme-modal").close();
$("upload-bg-btn").onclick = () => $("theme-image").click();
$("theme-image").onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const data = await fileToDataURL(f);
  const tiny = await downscaleDataURL(data, 1600, 1600, 0.85);
  $("upload-bg-btn").dataset.bg = tiny;
};
$("theme-save").onclick = () => {
  if (currentRoom.type !== "channel") return;
  const color = $("theme-color").value || "#fafafa";
  const img = $("upload-bg-btn").dataset.bg || "";
  update(ref(db, `channelsMeta/${currentRoom.id}/theme`), {
    bgColor: color,
    bgImage: img
  }).then(() => {
    loadTheme();
    $("theme-modal").close();
  }).catch(() => alert("Failed to save theme"));
};

function loadTheme() {
  if (currentRoom.type !== "channel") return;
  get(ref(db, `channelsMeta/${currentRoom.id}/theme`)).then(snap => {
    const t = snap.val() || {};
    messagesDiv.style.background = t.bgColor || "#fafafa";
    if (t.bgImage) {
      messagesDiv.style.backgroundImage = `url(${t.bgImage})`;
      messagesDiv.style.backgroundSize = "cover";
      messagesDiv.style.backgroundPosition = "center";
    } else {
      messagesDiv.style.backgroundImage = "none";
    }
  });
}

function refreshChannelControls() {
  const themeBtn = $("theme-btn");
  const delBtn = $("delete-channel-btn");
  if (!themeBtn || !delBtn) return;

  if (currentRoom.type !== "channel") {
    themeBtn.style.display = "none";
    delBtn.style.display = (isAdmin || isMod) ? "inline-block" : "none";
    return;
  }

  get(ref(db, `channelsMeta/${currentRoom.id}`)).then(snap => {
    const meta = snap.val() || {};
    const owner = meta.creator === userId;
    const allowed = owner || isAdmin || isMod;
    themeBtn.style.display = allowed ? "inline-block" : "none";
    delBtn.style.display = allowed ? "inline-block" : "none";
  });
}

/* ========= Messages ========= */
function messagesPath() {
  if (currentRoom.type === "channel") {
    return `channels/${currentRoom.id}/messages`;
  }
  return `dms/${currentRoom.id}/messages`;
}

function attachMessages() {
  onValue(ref(db, messagesPath()), snap => {
    messagesDiv.innerHTML = "";
    snap.forEach(child => {
      const id = child.key;
      const m = child.val();
      renderMessage(id, m);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

function renderMessage(id, m) {
  const wrap = el("div", "message");
  if (m.userId === userId) wrap.classList.add("self");

  const prof = profilesCache[m.userId] || {};
  const dispName = prof.username || m.displayName || m.userId || "unknown";

  if (prof.avatar) {
    const img = el("img", "avatar");
    img.src = prof.avatar;
    wrap.appendChild(img);
  } else {
    const a = el("div", "avatar");
    a.textContent = initial(dispName);
    a.style.background = prof.color || colorFromName(dispName);
    wrap.appendChild(a);
  }

  const box = el("div", "msg-content");
  if (m.userId === userId) {
    box.style.background = userColor;
    box.style.color = "#fff";
  } else if (prof.color) {
    box.style.background = prof.color;
    box.style.color = "#fff";
  }

  const head = el("div", "msg-header");
  const t = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
  head.innerHTML = `${dispName} <span class="timestamp">${t}</span>`;
  box.appendChild(head);

  if (m.type === "image") {
    const em = el("div", "embed");
    const im = el("img");
    im.src = m.url;
    em.appendChild(im);
    box.appendChild(em);
  } else if (m.type === "gif") {
    const em = el("div", "embed");
    const im = el("img");
    im.src = m.gif;
    em.appendChild(im);
    box.appendChild(em);
  } else {
    const text = b64d(m.text || "");
    box.appendChild(autoEmbed(text));
  }

  wrap.appendChild(box);
  messagesDiv.appendChild(wrap);
}

/* ========= Send + typing ========= */
$("send-btn").onclick = sendMessage;
$("user-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
  setTyping(true);
});

function sendMessage() {
  const txt = $("user-input").value.trim();
  if (!txt) return;
  const msgRef = push(ref(db, messagesPath()));
  set(msgRef, {
    type: "text",
    text: b64e(txt),
    userId,
    displayName,
    timestamp: Date.now()
  }).then(() => {
    $("user-input").value = "";
  });
}

function setTyping(state) {
  if (!userId) return;
  const tRef = ref(db, `typing/${roomKey()}/${userId}`);
  set(tRef, state).catch(() => {});
  clearTimeout(typingTimer);
  if (state) {
    typingTimer = setTimeout(() => {
      set(tRef, false).catch(() => {});
    }, 1200);
  }
}

onValue(ref(db, `typing/${roomKey()}`), snap => {
  const map = snap.val() || {};
  const others = Object.keys(map).filter(k => k !== userId && map[k]);
  $("typing-indicator").style.display = others.length ? "block" : "none";
});

/* ========= Images & GIFs ========= */
$("img-btn").onclick = () => $("image-upload").click();
$("image-upload").onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const data = await fileToDataURL(f);
  const msgRef = push(ref(db, messagesPath()));
  set(msgRef, {
    type: "image",
    url: data,
    userId,
    displayName,
    timestamp: Date.now()
  });
};

$("gif-btn").onclick = () => {
  $("gif-modal").showModal();
  if (!$("gif-search").value) loadGifs("trending");
};
$("gif-close").onclick = () => $("gif-modal").close();
$("gif-search-btn").onclick = () => loadGifs($("gif-search").value || "funny");
$("gif-search").addEventListener("keypress", (e) => {
  if (e.key === "Enter") loadGifs($("gif-search").value || "funny");
});

function loadGifs(q) {
  $("gif-grid").innerHTML = "Loading...";
  fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&client_key=simple-chat&limit=24`)
    .then(r => r.json())
    .then(json => {
      $("gif-grid").innerHTML = "";
      (json.results || []).forEach(item => {
        const url = item.media_formats?.gif?.url || item.media_formats?.tinygif?.url;
        if (!url) return;
        const img = el("img", "gif-thumb");
        img.src = url;
        img.onclick = () => sendGif(url);
        $("gif-grid").appendChild(img);
      });
    })
    .catch(() => {
      $("gif-grid").innerHTML = "Failed to load GIFs.";
    });
}

function sendGif(url) {
  const msgRef = push(ref(db, messagesPath()));
  set(msgRef, {
    type: "gif",
    gif: url,
    userId,
    displayName,
    timestamp: Date.now()
  });
  $("gif-modal").close();
}

/* ========= Embeds ========= */
function autoEmbed(text) {
  const container = el("div");
  const linked = text.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );
  const p = el("div");
  p.innerHTML = linked;
  container.appendChild(p);

  const yt = text.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w\-]+)/i);
  if (yt && yt[1]) {
    const em = el("div", "embed");
    const ifr = el("iframe");
    ifr.src = `https://www.youtube.com/embed/${yt[1]}`;
    ifr.width = "360";
    ifr.height = "203";
    ifr.frameBorder = "0";
    em.appendChild(ifr);
    container.appendChild(em);
  }

  if (/\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(text)) {
    const em = el("div", "embed");
    const im = el("img");
    im.src = text;
    em.appendChild(im);
    container.appendChild(em);
  }

  return container;
}

/* ========= Utils ========= */
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function downscaleDataURL(dataURL, maxW, maxH, quality = 0.9) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", quality));
    };
    img.src = dataURL;
  });
}

/* ========= Start ========= */
function startApp() {
  watchRoles();
  startPresence();
  refreshChannelList();
  watchDmList();
  switchToChannel(currentRoom.id || "general");
}
