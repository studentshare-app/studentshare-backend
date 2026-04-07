const fs = require('fs')

const htmlPath = 'e:/StudentShare/admin/dashboard.html'
let content = fs.readFileSync(htmlPath, 'utf8')

// 1. Add Sidebar Buttons
if (!content.includes('navNotices')) {
  content = content.replace(
    '<button class="nav-btn" id="navArticles">📰 Articles</button>',
    `<button class="nav-btn" id="navNotices">📢 Notices</button>
<button class="nav-btn" id="navEvents">📅 Events</button>
<button class="nav-btn" id="navClubs">🎭 Clubs</button>
<button class="nav-btn" id="navSpotlights">✨ Spotlights</button>
<button class="nav-btn" id="navArticles">📰 Articles</button>`
  )
}

// 2. Add navMap integration
if (!content.includes('navNotices\',\'notices\'')) {
  content = content.replace(
    "['navArticles','articles'],['navFlags','flags']",
    "['navNotices','notices'],['navEvents','events'],['navClubs','clubs'],['navSpotlights','spotlights'],['navArticles','articles'],['navFlags','flags']"
  )
}

// 3. Add ALL_TABS
if (!content.includes("'notices','events','clubs','spotlights'")) {
  content = content.replace(
    "'slides','articles','flags'",
    "'slides','articles','flags','notices','events','clubs','spotlights'"
  )
}

// 4. Add switchTab logic
if (!content.includes("loadInfoTab('notices')")) {
  content = content.replace(
    "if(tab==='slides')         loadSlidesColleges()",
    `if(tab==='slides')         loadSlidesColleges()
  if(['notices','events','clubs','spotlights'].includes(tab)) loadInfoTab(tab)`
  )
}

// 5. Append HTML Tabs
const tabsHtml = `
    <!-- COMPONENTS MANAGER (Notices, Events, Clubs, Spotlights) -->
    <div id="noticesTab" class="hidden component-tab">
      <h1 class="page-title">📢 Notices Manager</h1>
      <div class="cit-toolbar">
        <select class="componentCollegeSelect" onchange="loadComponentData('notices')"><option value="">Select a college...</option></select>
        <button class="cit-add-btn" onclick="openNoticeModal()">+ Add Notice</button>
      </div>
      <div id="noticesList"></div>
    </div>

    <div id="eventsTab" class="hidden component-tab">
      <h1 class="page-title">📅 Events Manager</h1>
      <div class="cit-toolbar">
        <select class="componentCollegeSelect" onchange="loadComponentData('events')"><option value="">Select a college...</option></select>
        <button class="cit-add-btn" onclick="openEventModal()">+ Add Event</button>
      </div>
      <div id="eventsList"></div>
    </div>

    <div id="clubsTab" class="hidden component-tab">
      <h1 class="page-title">🎭 Clubs Manager</h1>
      <div class="cit-toolbar">
        <select class="componentCollegeSelect" onchange="loadComponentData('clubs')"><option value="">Select a college...</option></select>
        <button class="cit-add-btn" onclick="openClubModal()">+ Add Club</button>
      </div>
      <div id="clubsList"></div>
    </div>

    <div id="spotlightsTab" class="hidden component-tab">
      <h1 class="page-title">✨ Spotlights Manager</h1>
      <div class="cit-toolbar">
        <select class="componentCollegeSelect" onchange="loadComponentData('spotlights')"><option value="">Select a college...</option></select>
        <button class="cit-add-btn" onclick="openSpotlightModal()">+ Add Spotlight</button>
      </div>
      <div id="spotlightsList"></div>
    </div>
`
if (!content.includes('<div id="noticesTab" class="hidden component-tab">')) {
  content = content.replace(
    '<!-- FEATURE FLAGS -->',
    `${tabsHtml}\n    <!-- FEATURE FLAGS -->`
  )
}

// 5.5 Append Switch CSS
if(!content.includes('.component-tab {')) {
    content = content.replace(
        '</style>',
        `.component-tab { min-height:100%; padding: 0 10px; }
.component-card { background:#fff; border-radius:12px; padding:16px 20px; margin-bottom:10px; display:flex; gap:14px; align-items:center; border:1px solid #E5E7EB; box-shadow:0 1px 4px rgba(0,0,0,0.05); }
.comp-img { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; background: #F3F4F6; }
.comp-info { flex: 1; }
.comp-title { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.comp-meta { font-size: 12px; color: #6B7280; margin-bottom: 2px; }
</style>`
    )
}

// 6. Append Javascript Logic
const scriptJS = `
// ════════════════════════════════════════════════════════════════════════
//  COLLEGE COMPONENTS (Notices, Events, Clubs, Spotlights)
// ════════════════════════════════════════════════════════════════════════
async function loadInfoTab(type) {
  const selects = document.querySelectorAll('.componentCollegeSelect');
  if (selects[0].options.length <= 1) {
    const { data } = await sb.from('colleges').select('*').order('name');
    selects.forEach(sel => {
      sel.innerHTML = '<option value="">Select a college...</option>';
      (data||[]).forEach(c => sel.innerHTML += \`<option value="\${c.id}">\${esc(c.name)}</option>\`);
    });
  }
  loadComponentData(type);
}

async function loadComponentData(type) {
  let collegeId = null;
  document.querySelectorAll('.componentCollegeSelect').forEach(s => {
    if (s.closest('#' + type + 'Tab') && !s.closest('.hidden')) { collegeId = s.value; }
  });
  if (!collegeId) return;

  const listEl = document.getElementById(type + 'List');
  listEl.innerHTML = '<div class="empty-state">Loading...</div>';

  try {
    const table = type === 'notices' ? 'college_notices' : type === 'events' ? 'college_events' : type === 'clubs' ? 'college_clubs' : 'college_spotlights';
    const { data } = await sb.from(table).select('*').eq('college_id', collegeId);
    
    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No items found for this college.</div>';
      return;
    }
    
    let html = '';
    data.forEach(item => {
      let title = esc(item.title || item.name || item.message || '');
      let img = item.image_url ? \`<img src="\${item.image_url}" class="comp-img">\` : '';
      let meta = item.type ? \`Type: \${item.type} | Date: \${item.date}\` : (item.author ? \`Author: \${item.author}\` : (item.is_active ? 'Active' : 'Inactive'));
      
      html += \`<div class="component-card">
        \${img}
        <div class="comp-info">
          <div class="comp-title">\${title}</div>
          <div class="comp-meta">\${meta}</div>
        </div>
        <button class="btn-sm btn-reject" onclick="deleteComponent('\${table}', '\${item.id}', '\${type}')">Delete</button>
      </div>\`;
    });
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div class="empty-state">Error loading items.</div>';
  }
}

async function deleteComponent(table, id, type) {
  if(!confirm('Delete this item?')) return;
  await sb.from(table).delete().eq('id', id);
  toast('Item deleted');
  loadComponentData(type);
}

// Extremely simplified modals via prompts for MVP speed:
async function openNoticeModal() {
  const cid = document.querySelector('#noticesTab .componentCollegeSelect').value;
  if (!cid) return toast('Select a college first', 'error');
  const msg = prompt('Enter Notice Message:');
  if(!msg) return;
  await sb.from('college_notices').insert({ college_id: cid, message: msg, is_active: true });
  loadInfoTab('notices');
}

async function openEventModal() {
  const cid = document.querySelector('#eventsTab .componentCollegeSelect').value;
  if (!cid) return toast('Select a college first', 'error');
  const title = prompt('Event Title:'); if(!title) return;
  const date = prompt('Event Date (e.g. March 15-17):'); if(!date) return;
  const loc = prompt('Location:'); if(!loc) return;
  const imgUrl = prompt('Image URL (optional):', 'https://images.unsplash.com/photo-1523580494863-6f3031224c94');
  await sb.from('college_events').insert({ college_id: cid, title, date, location: loc, type: 'Event', image_url: imgUrl, is_featured: false });
  loadInfoTab('events');
}

async function openClubModal() {
  const cid = document.querySelector('#clubsTab .componentCollegeSelect').value;
  if (!cid) return toast('Select a college first', 'error');
  const name = prompt('Club Name:'); if(!name) return;
  const imgUrl = prompt('Image URL (optional):', 'https://images.unsplash.com/photo-1511632765486-a01980e01a18');
  await sb.from('college_clubs').insert({ college_id: cid, name, image_url: imgUrl });
  loadInfoTab('clubs');
}

async function openSpotlightModal() {
  const cid = document.querySelector('#spotlightsTab .componentCollegeSelect').value;
  if (!cid) return toast('Select a college first', 'error');
  const title = prompt('Spotlight Title:'); if(!title) return;
  const quote = prompt('Quote:'); if(!quote) return;
  const author = prompt('Author Name:'); if(!author) return;
  const role = prompt('Role/Major:'); if(!role) return;
  const imgUrl = prompt('Image URL:', 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79');
  await sb.from('college_spotlights').insert({ college_id: cid, title, quote, author, role, image_url: imgUrl, is_active: true });
  loadInfoTab('spotlights');
}
</script>
</body>
</html>`

if (!content.includes('loadInfoTab(type)')) {
  content = content.replace(
    '</script>\n</body>\n</html>',
    scriptJS
  )
}

fs.writeFileSync(htmlPath, content, 'utf8')
console.log('Successfully injected components into dashboard.')
