import re

with open('dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Sidebar Buttons
content = re.sub(
    r'(<button class="nav-btn" id="navFlags">🚩 Feature Flags</button>)\s*(<button class="logout-btn" id="logoutBtn">⬅ Log Out</button>)',
    r'\1\n\n    <div class="nav-section">Logs</div>\n    <button class="nav-btn" id="navActivities">📉 User Activities</button>\n    <button class="nav-btn" id="navCrashes">💥 Crashes</button>\n\n    \2',
    content
)

# 2. Add Tabs DIVs
tabs_html = """      <div id="flagsList"><div class="empty-state">Loading...</div></div>
    </div>

    <!-- USER ACTIVITIES -->
    <div id="activitiesTab" class="hidden">
      <h1 class="page-title">📉 User Activities</h1>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:18px 20px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between">
          <h3 style="font-size:15px;font-weight:700;color:#111827">Recent Activity</h3>
          <button onclick="loadActivitiesTab()" style="padding:7px 14px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">↻ Refresh</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody id="activitiesListBody">
            <tr><td colspan="4" class="empty-state">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CRASHES -->
    <div id="crashesTab" class="hidden">
      <h1 class="page-title">💥 Crash Reports</h1>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:18px 20px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between">
          <h3 style="font-size:15px;font-weight:700;color:#111827">Recent Crashes</h3>
          <button onclick="loadCrashesTab()" style="padding:7px 14px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">↻ Refresh</button>
        </div>
        <table style="table-layout:fixed">
          <thead>
            <tr>
              <th style="width:20%">User</th>
              <th style="width:40%">Error Message</th>
              <th style="width:20%">App Version</th>
              <th style="width:20%">Date</th>
            </tr>
          </thead>
          <tbody id="crashesListBody">
            <tr><td colspan="4" class="empty-state">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>"""

content = content.replace(
    '      <div id="flagsList"><div class="empty-state">Loading...</div></div>\n    </div>',
    tabs_html
)


# 3. Update navMap
content = content.replace(
    "['navFlags','flags']\n  ];",
    "['navFlags','flags'],\n    ['navActivities','activities'],['navCrashes','crashes']\n  ];"
)

# 4. Update ALL_TABS
content = content.replace(
    "'flags','notices','events','clubs','spotlights'\n]",
    "'flags','notices','events','clubs','spotlights','activities','crashes'\n]"
)

# 5. Update switchTab
if "if(tab==='activities')     loadActivitiesTab()" not in content:
    content = content.replace(
        "  if(['notices','events','clubs','spotlights'].includes(tab)) loadInfoTab(tab)",
        "  if(tab==='activities')     loadActivitiesTab()\n  if(tab==='crashes')        loadCrashesTab()\n  if(['notices','events','clubs','spotlights'].includes(tab)) loadInfoTab(tab)"
    )

# 6. Update JS logic
js_logic = """async function toggleFlagPremium(key,cur){ await sb.from('feature_flags').update({is_premium_only:!cur}).eq('key',key); toast(`"${key}" is now ${cur?'free for all':'premium only'}`); loadFeatureFlags() }

// ════════════════════════════════════════════════════════════════════════
//  USER ACTIVITIES
// ════════════════════════════════════════════════════════════════════════
async function loadActivitiesTab(){
  const tbody=document.getElementById('activitiesListBody');
  tbody.innerHTML='<tr><td colspan="4" class="empty-state">Loading activities...</td></tr>';
  const {data,error}=await sb.from('user_activities').select('*,profiles(full_name)').order('created_at',{ascending:false}).limit(100);
  if(error){
    if(error.code==='42P01') tbody.innerHTML='<tr><td colspan="4" class="empty-state"><div class="empty-icon">📉</div>Table not created yet.<br>Please run the database migration.</td></tr>';
    else tbody.innerHTML=`<tr><td colspan="4" class="empty-state">Error: ${esc(error.message)}</td></tr>`;
    return;
  }
  if(!data||!data.length){ tbody.innerHTML='<tr><td colspan="4" class="empty-state"><div class="empty-icon">📉</div>No recent activities found</td></tr>'; return }
  tbody.innerHTML=data.map(a=>`<tr>
    <td style="font-weight:600;color:#111827">${esc(a.profiles?.full_name||'Unknown (or deleted)')}</td>
    <td><span style="background:#EFF6FF;color:#1A56DB;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${esc(a.action)}</span></td>
    <td style="font-size:13px;color:#64748B">${esc(JSON.stringify(a.details||{}))}</td>
    <td style="color:#9CA3AF;font-size:12px">${fmtDate(a.created_at)} ${new Date(a.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
  </tr>`).join('')
}

// ════════════════════════════════════════════════════════════════════════
//  CRASHES
// ════════════════════════════════════════════════════════════════════════
async function loadCrashesTab(){
  const tbody=document.getElementById('crashesListBody');
  tbody.innerHTML='<tr><td colspan="4" class="empty-state">Loading crash reports...</td></tr>';
  const {data,error}=await sb.from('crashes').select('*,profiles(full_name)').order('created_at',{ascending:false}).limit(100);
  if(error){
    if(error.code==='42P01') tbody.innerHTML='<tr><td colspan="4" class="empty-state"><div class="empty-icon">💥</div>Table not created yet.<br>Please run the database migration.</td></tr>';
    else tbody.innerHTML=`<tr><td colspan="4" class="empty-state">Error: ${esc(error.message)}</td></tr>`;
    return;
  }
  if(!data||!data.length){ tbody.innerHTML='<tr><td colspan="4" class="empty-state"><div class="empty-icon">💥</div>No recent crashes found</td></tr>'; return }
  tbody.innerHTML=data.map(c=>`<tr>
    <td style="font-weight:600;color:#111827">${esc(c.profiles?.full_name||'Anonymous/Unknown')}</td>
    <td style="font-size:13px;color:#DC2626;word-break:break-word;white-space:pre-wrap">${esc(c.error_message)}<br><span style="font-size:11px;color:#94A3B8">${esc(c.stack_trace||'')}</span></td>
    <td style="font-size:13px;color:#64748B"><span style="background:#F1F5F9;padding:3px 8px;border-radius:6px;font-weight:600">${esc(c.app_version||'Unknown')}</span></td>
    <td style="color:#9CA3AF;font-size:12px">${fmtDate(c.created_at)} ${new Date(c.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
  </tr>`).join('')
}"""

content = content.replace(
    "async function toggleFlagPremium(key,cur){ await sb.from('feature_flags').update({is_premium_only:!cur}).eq('key',key); toast(`\"${key}\" is now ${cur?'free for all':'premium only'}`); loadFeatureFlags() }",
    js_logic
)

with open('dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("done.")
