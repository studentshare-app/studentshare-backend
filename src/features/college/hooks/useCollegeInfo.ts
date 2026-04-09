import { useQuery } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/core/api/supabase'

// Types
export type Slide = { id: string; image_url: string; title: string | null; subtitle: string | null; order: number }
export type CollegeTab = { id: string; label: string; icon: string; html_content: string; order: number }
export type CollegeProfile = { id: string; name: string; short_name: string | null; logo_url: string | null; city: string | null; institution: string | null; is_live: boolean | null }
export type CollegeNotice = { id: string; message: string; is_active: boolean }
export type CollegeEvent = { id: string; title: string; type: string; date: string; location: string; description: string | null; image_url: string | null; is_featured: boolean }
export type CollegeClub = { id: string; name: string; image_url: string | null }
export type CollegeSpotlight = { id: string; title: string; quote: string; author: string; role: string; image_url: string | null; is_active: boolean }

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Helpers
async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data as T
  } catch {
    return null
  }
}
async function writeCache<T>(key: string, data: T) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch { }
}

function buildPageHtml(page_html: string, page_css: string, page_js: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
  <style>
    *{box-sizing:border-box;}
    html,body{margin:0;padding:0;width:100%;overflow-x:hidden;overflow-y:hidden;
      background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    ${page_css || ''}
  </style>
</head>
<body>
${page_html || ''}
<script>
${page_js || ''}
;(function(){
  function postH(){
    var h=Math.max(
      document.body.scrollHeight,document.body.offsetHeight,
      document.documentElement.scrollHeight,document.documentElement.offsetHeight
    );
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'height',height:h}));
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');if(!a)return;
    var href=a.getAttribute('href');if(!href||href[0]!=='#')return;
    e.preventDefault();
    var el=document.getElementById(href.slice(1));if(!el)return;
    var top=0,n=el;
    while(n&&n!==document.body){top+=n.offsetTop;n=n.offsetParent;}
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'anchor',offsetTop:top}));
  },true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',postH);
  else postH();
  window.addEventListener('load',postH);
  new ResizeObserver(postH).observe(document.body);
})();
</script>
</body>
</html>`
}

export function useCollegeInfo() {
  const { data: collegeId, isLoading: loadingId } = useQuery({
    queryKey: ['userCollegeId'],
    queryFn: async () => {
      const KEY = 'college_info_user_college_id'
      const cached = await readCache<string>(KEY)
      const net = await NetInfo.fetch()
      if (!net.isConnected) return cached
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        const { data, error } = await supabase.from('profiles').select('college_id').eq('id', user.id).single()
        if (error) return cached
        const id = data?.college_id ?? null
        if (id) await writeCache(KEY, id)
        return id
      } catch {
        return cached
      }
    },
    staleTime: CACHE_TTL,
    gcTime: CACHE_TTL,
  })

  return {
    collegeId,
    loadingId,

    profile: useQuery({
      queryKey: ['collegeProfile', collegeId],
      enabled: !!collegeId,
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        const KEY = `college_info_profile_${collegeId}`
        const cached = await readCache<CollegeProfile>(KEY)
        const net = await NetInfo.fetch()
        if (!net.isConnected) return cached
        try {
          const { data, error } = await supabase.from('colleges').select('id,name,short_name,logo_url,city,institution,is_live').eq('id', collegeId).single()
          if (!error && data) {
            await writeCache(KEY, data)
            return data
          }
          return cached
        } catch { return cached }
      }
    }),

    slides: useQuery({
      queryKey: ['collegeSlides', collegeId],
      enabled: !!collegeId,
      staleTime: 0,
      queryFn: async () => {
        const KEY = `college_info_slides_${collegeId}`
        const net = await NetInfo.fetch()
        if (net.isConnected) {
          try {
            const { data, error } = await supabase.from('college_slides').select('*').eq('college_id', collegeId).eq('is_active', true).order('order', { ascending: true })
            if (!error && data) {
              await writeCache(KEY, data)
              return data as Slide[]
            }
          } catch { }
        }
        return (await readCache<Slide[]>(KEY)) ?? []
      }
    }),

    tabs: useQuery({
      queryKey: ['collegeTabs', collegeId],
      enabled: !!collegeId,
      staleTime: 5 * 60 * 1000,
      queryFn: async (): Promise<CollegeTab[]> => {
        const KEY = `college_info_tabs_${collegeId}`
        const cached = await readCache<CollegeTab[]>(KEY)
        const net = await NetInfo.fetch()
        if (!net.isConnected) return cached ?? []
        try {
          const { data, error } = await supabase.from('college_info_tabs').select('id,label,icon,html_content,order,page_id,college_pages(page_html,page_css,page_js)').eq('college_id', collegeId).eq('is_active', true).order('order', { ascending: true })
          if (error) return cached ?? []
          const result: CollegeTab[] = (data ?? []).map((tab: any) => {
            let html = tab.html_content ?? ''
            if (tab.college_pages) {
              const { page_html = '', page_css = '', page_js = '' } = tab.college_pages
              html = buildPageHtml(page_html, page_css, page_js)
            }
            return { id: tab.id, label: tab.label, icon: tab.icon, html_content: html, order: tab.order }
          }).filter(t => !t.label.toLowerCase().includes('comahs'))
          await writeCache(KEY, result)
          return result
        } catch { return cached ?? [] }
      }
    }),

    notices: useQuery({
      queryKey: ['collegeNotices', collegeId],
      enabled: !!collegeId,
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const net = await NetInfo.fetch()
        if (!net.isConnected) return []
        const { data } = await supabase.from('college_notices').select('*').eq('college_id', collegeId).eq('is_active', true).order('created_at', { ascending: false })
        return (data || []) as CollegeNotice[]
      }
    }),

    events: useQuery({
      queryKey: ['collegeEvents', collegeId],
      enabled: !!collegeId,
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const net = await NetInfo.fetch()
        if (!net.isConnected) return []
        const { data } = await supabase.from('college_events').select('*').eq('college_id', collegeId).order('date', { ascending: true })
        return (data || []) as CollegeEvent[]
      }
    }),

    clubs: useQuery({
      queryKey: ['collegeClubs', collegeId],
      enabled: !!collegeId,
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const net = await NetInfo.fetch()
        if (!net.isConnected) return []
        const { data } = await supabase.from('college_clubs').select('*').eq('college_id', collegeId).order('name', { ascending: true })
        return (data || []) as CollegeClub[]
      }
    }),

    spotlights: useQuery({
      queryKey: ['collegeSpotlights', collegeId],
      enabled: !!collegeId,
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const net = await NetInfo.fetch()
        if (!net.isConnected) return []
        const { data } = await supabase.from('college_spotlights').select('*').eq('college_id', collegeId).eq('is_active', true).order('created_at', { ascending: false })
        return (data || []) as CollegeSpotlight[]
      }
    }),
  }
}
