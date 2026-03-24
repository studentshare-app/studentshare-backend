import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function Dashboard({ session }) {
  const [colleges, setColleges] = useState([])
  const [classes, setClasses] = useState([])
  const [courses, setCourses] = useState([])
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [selectedCollege, setSelectedCollege] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState('past_question')
  const [isPremium, setIsPremium] = useState(false)
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('upload')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (selectedCollege) fetchClasses(selectedCollege)
  }, [selectedCollege])

  useEffect(() => {
    if (selectedClass) fetchCourses(selectedClass)
  }, [selectedClass])

  async function fetchData() {
    const [{ data: collegesData }, { data: profileData }, { data: requestsData }, { data: usersData }] = await Promise.all([
      supabase.from('colleges').select('*').order('display_order'),
      supabase.from('profiles').select('*').eq('id', session.user.id).single(),
      supabase.from('contributor_requests').select('*, profiles(full_name, role)').eq('status', 'pending'),
      supabase.from('profiles').select('*, colleges(name)').order('created_at', { ascending: false }),
    ])
    setColleges(collegesData || [])
    setProfile(profileData)
    setRequests(requestsData || [])
    setUsers(usersData || [])
  }

  async function fetchClasses(collegeId) {
    const { data } = await supabase.from('classes').select('*').eq('college_id', collegeId).order('display_order')
    setClasses(data || [])
    setSelectedClass('')
    setCourses([])
  }

  async function fetchCourses(classId) {
    const { data } = await supabase.from('courses').select('*').eq('class_id', classId).order('name')
    setCourses(data || [])
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!file || !selectedCourse || !title) {
      setMessage('Please fill in all fields and select a file')
      return
    }
    setUploading(true)
    setMessage('')

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `${selectedCourse}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('materials')
      .upload(filePath, file)

    if (uploadError) {
      setMessage('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('materials').getPublicUrl(filePath)

    const { error: dbError } = await supabase.from('materials').insert({
      course_id: selectedCourse,
      uploaded_by: session.user.id,
      title,
      type,
      file_url: publicUrl,
      file_size: file.size,
      is_premium: isPremium,
      status: 'published',
    })

    if (dbError) {
      setMessage('Database error: ' + dbError.message)
    } else {
      setMessage('✅ Material uploaded successfully!')
      setTitle('')
      setFile(null)
      e.target.reset()
    }
    setUploading(false)
  }

  async function handleApproveRequest(requestId, userId) {
    await supabase.from('profiles').update({ role: 'contributor' }).eq('id', userId)
    await supabase.from('contributor_requests').update({ status: 'approved', reviewed_by: session.user.id }).eq('id', requestId)
    setRequests(requests.filter(r => r.id !== requestId))
    setMessage('✅ Contributor approved!')
  }

  async function handleRejectRequest(requestId) {
    await supabase.from('contributor_requests').update({ status: 'rejected', reviewed_by: session.user.id }).eq('id', requestId)
    setRequests(requests.filter(r => r.id !== requestId))
  }

  async function handlePromoteToAdmin(userId) {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId)
    setMessage('✅ User promoted to admin!')
    fetchData()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (profile?.role !== 'admin') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Access denied. Admin only.</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <h2 style={styles.sidebarLogo}>StudentShare</h2>
        <p style={styles.sidebarRole}>Admin Panel</p>
        <nav>
          {['upload', 'users', 'requests'].map(tab => (
            <button
              key={tab}
              style={{ ...styles.navItem, ...(activeTab === tab ? styles.navItemActive : {}) }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'upload' && '📤 Upload Material'}
              {tab === 'users' && '👥 Manage Users'}
              {tab === 'requests' && `📋 Requests ${requests.length > 0 ? `(${requests.length})` : ''}`}
            </button>
          ))}
        </nav>
        <button style={styles.logoutButton} onClick={handleLogout}>Log Out</button>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {message && <div style={styles.message}>{message}</div>}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div>
            <h1 style={styles.pageTitle}>Upload Material</h1>
            <div style={styles.card}>
              <form onSubmit={handleUpload}>
                <div style={styles.grid}>
                  <div style={styles.field}>
                    <label style={styles.label}>College</label>
                    <select style={styles.select} value={selectedCollege} onChange={e => setSelectedCollege(e.target.value)} required>
                      <option value="">Select college...</option>
                      {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Class / Year</label>
                    <select style={styles.select} value={selectedClass} onChange={e => setSelectedClass(e.target.value)} required disabled={!selectedCollege}>
                      <option value="">Select class...</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Course</label>
                    <select style={styles.select} value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} required disabled={!selectedClass}>
                      <option value="">Select course...</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                    </select>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Material Type</label>
                    <select style={styles.select} value={type} onChange={e => setType(e.target.value)}>
                      <option value="past_question">Past Question</option>
                      <option value="slide">Slide</option>
                      <option value="book">Book</option>
                      <option value="tutorial">Tutorial</option>
                    </select>
                  </div>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Title</label>
                  <input style={styles.input} type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Anatomy Past Questions 2023" required />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>File (PDF, PPT, DOC)</label>
                  <input style={styles.input} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={e => setFile(e.target.files[0])} required />
                </div>
                <div style={styles.checkboxField}>
                  <input type="checkbox" id="premium" checked={isPremium} onChange={e => setIsPremium(e.target.checked)} />
                  <label htmlFor="premium" style={styles.checkboxLabel}>Premium content (requires subscription)</label>
                </div>
                <button style={styles.uploadButton} type="submit" disabled={uploading}>
                  {uploading ? 'Uploading...' : '📤 Upload Material'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <h1 style={styles.pageTitle}>Manage Users ({users.length})</h1>
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>College</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={styles.td}>{u.full_name || 'No name'}</td>
                      <td style={styles.td}>{u.colleges?.name || '—'}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: u.role === 'admin' ? '#DBEAFE' : u.role === 'contributor' ? '#D1FAE5' : '#F3F4F6', color: u.role === 'admin' ? '#1A56DB' : u.role === 'contributor' ? '#059669' : '#6B7280' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {u.role === 'student' && (
                          <button style={styles.actionButton} onClick={() => handlePromoteToAdmin(u.id)}>
                            Promote to Admin
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div>
            <h1 style={styles.pageTitle}>Contributor Requests ({requests.length})</h1>
            {requests.length === 0 ? (
              <div style={styles.card}>
                <p style={{ color: '#6B7280', textAlign: 'center', padding: '40px' }}>No pending requests</p>
              </div>
            ) : (
              requests.map(r => (
                <div key={r.id} style={styles.requestCard}>
                  <div>
                    <p style={styles.requestName}>{r.profiles?.full_name}</p>
                    <p style={styles.requestReason}>{r.reason}</p>
                  </div>
                  <div style={styles.requestActions}>
                    <button style={styles.approveButton} onClick={() => handleApproveRequest(r.id, r.user_id)}>Approve</button>
                    <button style={styles.rejectButton} onClick={() => handleRejectRequest(r.id)}>Reject</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif', backgroundColor: '#F9FAFB' },
  sidebar: { width: '240px', backgroundColor: '#1A56DB', padding: '24px 16px', display: 'flex', flexDirection: 'column' },
  sidebarLogo: { color: '#fff', fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' },
  sidebarRole: { color: '#BFDBFE', fontSize: '13px', marginBottom: '32px' },
  navItem: { display: 'block', width: '100%', padding: '12px 16px', marginBottom: '4px', backgroundColor: 'transparent', border: 'none', borderRadius: '8px', color: '#BFDBFE', fontSize: '14px', cursor: 'pointer', textAlign: 'left' },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' },
  logoutButton: { marginTop: 'auto', padding: '12px', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' },
  main: { flex: 1, padding: '32px', overflowY: 'auto' },
  pageTitle: { fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '24px' },
  message: { backgroundColor: '#D1FAE5', color: '#065F46', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' },
  card: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
  field: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '14px', boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff' },
  checkboxField: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' },
  checkboxLabel: { fontSize: '14px', color: '#374151' },
  uploadButton: { backgroundColor: '#1A56DB', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 16px', backgroundColor: '#F9FAFB', fontSize: '13px', fontWeight: '600', color: '#6B7280', borderBottom: '1px solid #E5E7EB' },
  td: { padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontSize: '14px', color: '#374151' },
  badge: { padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' },
  actionButton: { padding: '6px 12px', backgroundColor: '#EFF6FF', color: '#1A56DB', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' },
  requestCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  requestName: { fontWeight: '600', color: '#111827', marginBottom: '4px' },
  requestReason: { fontSize: '13px', color: '#6B7280' },
  requestActions: { display: 'flex', gap: '8px' },
  approveButton: { padding: '8px 16px', backgroundColor: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  rejectButton: { padding: '8px 16px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
}