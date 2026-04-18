const AUTH_TOKEN = 'demo-token';

const SUBS_FAVS = [
  { name: 'r/funymore', color: '#ff4500', count: 156 },
  { name: 'r/breakingnews', color: '#0079d3', count: 12 },
  { name: 'r/darkweb', color: '#e84393', count: '' },
  { name: 'r/gamingfun', color: '#6c5ce7', count: '08' },
];
const SUBS_FEEDS = [
  { name: 'r/404', color: '#00b894', count: '04' },
  { name: 'r/gaming', color: '#6c5ce7', count: '' },
  { name: 'r/pics', color: '#fdcb6e', count: 32 },
  { name: 'r/gifs', color: '#e17055', count: '' },
];

function renderSubs(list, containerId) {
  const el = document.getElementById(containerId);
  el.innerHTML = list.map(s => `
    <a class="sub-item" href="#">
      <div class="sub-icon" style="background:${s.color}">${s.name.charAt(2).toUpperCase()}</div>
      <span class="sub-name">${s.name}</span>
      ${s.count ? `<span class="sub-count">${s.count}</span>` : ''}
    </a>
  `).join('');
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function esc(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function randomVotes() {
  return Math.floor(Math.random() * 900) + 10;
}

function timeAgo() {
  const units = ['hours','minutes','days'];
  return Math.floor(Math.random()*12+1) + ' ' + units[Math.floor(Math.random()*3)] + ' ago';
}

function renderUsers(users = []) {
  const el = document.getElementById('usersList');
  if (!users.length) { el.innerHTML = '<p style="padding:8px 12px;font-size:0.82rem;color:var(--text-4)">No users</p>'; return; }
  el.innerHTML = users.map(u => `
    <a class="sub-item" href="#">
      <div class="sub-icon" style="background:${['#0079d3','#ff4500','#6c5ce7','#00b894','#e84393'][Math.floor(Math.random()*5)]}">${(u.name||'U').charAt(0).toUpperCase()}</div>
      <span class="sub-name">u/${esc(u.username||'unknown')}</span>
    </a>
  `).join('');

  document.getElementById('memberCount').textContent = users.length;
  document.getElementById('onlineCount').textContent = Math.max(1, Math.floor(users.length * 0.6));
}

function renderPosts(posts = []) {
  const el = document.getElementById('postsList');
  if (!posts.length) {
    el.innerHTML = `<div class="posts-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
      <div>No posts yet — be the first to share something!</div>
    </div>`;
    return;
  }

  el.innerHTML = posts.map((post, i) => {
    const author = post.authorId;
    const name = esc(author?.name || 'Unknown');
    const handle = esc(author?.username || 'unknown');
    const votes = randomVotes();
    const time = timeAgo();

    return `
    <div class="post-card" style="animation-delay:${i*0.05}s">
      <div class="vote-strip">
        <button class="vote-btn up" onclick="vote(this,1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <span class="vote-count">${votes}</span>
        <button class="vote-btn down" onclick="vote(this,-1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="post-body">
        <div class="post-meta">
          <span class="post-sub">r/general</span>
          <span class="post-dot">·</span>
          <span>Posted by</span>
          <span class="post-author">u/${handle}</span>
          <span class="post-dot">·</span>
          <span>${time}</span>
        </div>
        <div class="post-title">${esc(post.title)}</div>
        <p class="post-text">${esc(post.content)}</p>
        <div class="post-actions">
          <button class="post-action">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            ${Math.floor(Math.random()*800)+10}
          </button>
          <button class="post-action">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button class="post-action">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            Save
          </button>
          <button class="post-action">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function vote(btn, dir) {
  const strip = btn.closest('.vote-strip');
  const countEl = strip.querySelector('.vote-count');
  let val = parseInt(countEl.textContent) || 0;

  if (dir === 1) {
    const upBtn = strip.querySelector('.up');
    const isVoted = upBtn.classList.toggle('voted');
    strip.querySelector('.down').classList.remove('voted');
    countEl.textContent = isVoted ? val + 1 : val - 1;
  } else {
    const downBtn = strip.querySelector('.down');
    const isVoted = downBtn.classList.toggle('voted');
    strip.querySelector('.up').classList.remove('voted');
    countEl.textContent = isVoted ? val - 1 : val + 1;
  }
}

// ── Modal ──────────────────────────────
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('mUsername').focus(), 200);
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('formMsg').textContent = '';
  document.getElementById('formMsg').className = 'form-msg';
}

document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('openModalBtn').addEventListener('click', openModal);

async function submitPost() {
  const msg = document.getElementById('formMsg');
  const username = document.getElementById('mUsername').value.trim();
  const title = document.getElementById('mTitle').value.trim();
  const content = document.getElementById('mContent').value.trim();

  if (!username || !title || !content) {
    msg.className = 'form-msg error';
    msg.textContent = 'All fields are required';
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Posting…';
  msg.className = 'form-msg';
  msg.textContent = '';

  try {
    await apiFetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ username, title, content }),
    });
    msg.className = 'form-msg success';
    msg.textContent = 'Published!';
    document.getElementById('mUsername').value = '';
    document.getElementById('mTitle').value = '';
    document.getElementById('mContent').value = '';
    await loadPosts();
    setTimeout(() => closeModal(), 800);
  } catch (err) {
    msg.className = 'form-msg error';
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post';
  }
}

// ── Tab switching (cosmetic) ───────────
function setTab(el) {
  el.parentElement.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}
function setFeedTab(el) {
  el.parentElement.querySelectorAll('.feed-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

// ── Data loading ───────────────────────
async function loadUsers() {
  const result = await apiFetch('/api/users');
  renderUsers(result.data);
}
async function loadPosts() {
  const result = await apiFetch('/api/posts');
  renderPosts(result.data);
}
async function bootstrap() {
  renderSubs(SUBS_FAVS, 'favSubs');
  renderSubs(SUBS_FEEDS, 'feedSubs');
  try {
    await Promise.all([loadUsers(), loadPosts()]);
  } catch (err) {
    document.getElementById('postsList').innerHTML =
      `<div class="posts-empty">${esc(err.message)}</div>`;
  }
}

bootstrap();