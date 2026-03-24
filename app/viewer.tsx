/**
 * app/viewer.tsx — Universal File Viewer
 *
 * MONETISATION RULES (strictly enforced):
 *  • Online viewing       → FREE for all users (always loads from network when online)
 *  • Offline auto-load    → If file was previously downloaded (premium), loads from cache automatically
 *  • Download button      → PREMIUM ONLY — non-premium users see upgrade modal → /subscription
 *  • No file is ever written to disk unless a premium download succeeds
 *
 * PATCHES APPLIED
 * ───────────────
 * P1  usePremium() replaces inline Supabase subscription check (reactive, instant).
 * D1  Offline-aware loading — serves cached copy when offline (only if previously downloaded).
 * D2  Post-download hot-swap — viewer immediately switches to local copy after a successful
 *     download (was previously only switching when already offline).
 * D3  handleDownload now upserts a row into the Supabase `downloads` table so the file
 *     appears on the Downloads screen without requiring the user to navigate away and back.
 * D4  `effectiveLocal` is derived from `resolvedUrl` (updated after download) rather than
 *     the original `is_local` param, so the PDF renderer always uses the correct source.
 * G1  Google Docs viewer for all office files (DOCX, XLSX, PPTX, etc.)
 * G2  Google Docs zoom-to-fit — injects CSS to scale content ~70% on load.
 * G3  Google Docs bottom toolbar hidden.
 * N1  NetInfo-driven offline detection.
 */

import NetInfo from '@react-native-community/netinfo'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { supabase } from '../lib/supabase'
import { registryAdd, registryHas } from '../lib/useDownloadRegistry'
import { usePremium } from '../contexts/PremiumContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ViewerMode = 'loading' | 'pdfjs' | 'gdocs' | 'unsupported' | 'error'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getExt(url: string): string {
  return url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? ''
}

function isLocal(url: string): boolean {
  return url.startsWith('file://') || url.startsWith('/')
}

const MIME: Record<string, string> = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
}

function getCachePath(materialId: string, ext: string): string {
  return `${FileSystem.documentDirectory}downloads/${materialId}.${ext}`
}

async function openExternally(filePath: string, ext: string) {
  const mime = MIME[ext] ?? 'application/octet-stream'
  if (Platform.OS === 'android') {
    try {
      const contentUri = await FileSystem.getContentUriAsync(filePath)
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri, flags: 1, type: mime,
      })
    } catch {
      await Sharing.shareAsync(filePath, { mimeType: mime })
    }
  } else {
    await Sharing.shareAsync(filePath)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF.js HTML — Local (base64)
// ─────────────────────────────────────────────────────────────────────────────
function buildPdfJsHtml(base64: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"/>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:100%;height:100%;background:#1E293B;overflow:hidden;}
    #toolbar{position:fixed;top:0;left:0;right:0;height:44px;background:#0F172A;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:center;gap:12px;z-index:100;padding:0 12px;}
    #toolbar button{background:#1E293B;border:1px solid #334155;color:#94A3B8;border-radius:8px;padding:4px 12px;font-size:13px;cursor:pointer;}
    #pageInfo{color:#94A3B8;font-size:13px;min-width:80px;text-align:center;font-family:sans-serif;}
    #container{position:absolute;top:44px;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 8px;}
    canvas{display:block;max-width:100%;box-shadow:0 2px 8px rgba(0,0,0,0.5);border-radius:4px;background:#fff;}
    #loading{position:fixed;inset:0;background:#0F172A;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94A3B8;font-family:sans-serif;gap:12px;font-size:14px;}
    .spinner{width:40px;height:40px;border:3px solid #334155;border-top-color:#3B82F6;border-radius:50%;animation:spin 0.8s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg);}}
  </style>
</head>
<body>
  <div id="loading"><div class="spinner"></div><span>Rendering PDF…</span></div>
  <div id="toolbar" style="display:none">
    <button id="prevBtn">‹ Prev</button>
    <span id="pageInfo">— / —</span>
    <button id="nextBtn">Next ›</button>
  </div>
  <div id="container"></div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const base64='${base64}';
    const raw=atob(base64);
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    let pdfDoc=null,currentPage=1;
    const container=document.getElementById('container');
    const pageInfo=document.getElementById('pageInfo');
    const toolbar=document.getElementById('toolbar');
    const loading=document.getElementById('loading');
    const SCALE=window.devicePixelRatio>1?2.0:1.5;
    async function renderPage(num){
      const page=await pdfDoc.getPage(num);
      const vp=page.getViewport({scale:SCALE});
      const canvas=document.createElement('canvas');
      canvas.width=vp.width;canvas.height=vp.height;
      canvas.style.width=Math.min(vp.width/SCALE,window.innerWidth-16)+'px';
      canvas.style.height='auto';
      await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
      return canvas;
    }
    function updateInfo(){pageInfo.textContent=currentPage+' / '+(pdfDoc?pdfDoc.numPages:'—');}
    function scrollTo(num){
      const c=document.getElementById('page_'+num);
      if(c){c.scrollIntoView({behavior:'smooth',block:'start'});currentPage=num;updateInfo();}
    }
    async function loadAll(){
      pdfDoc=await pdfjsLib.getDocument({data:bytes}).promise;
      loading.style.display='none';toolbar.style.display='flex';
      for(let i=1;i<=pdfDoc.numPages;i++){
        const canvas=await renderPage(i);canvas.id='page_'+i;container.appendChild(canvas);
      }
      updateInfo();
      container.addEventListener('scroll',()=>{
        for(let i=1;i<=pdfDoc.numPages;i++){
          const c=document.getElementById('page_'+i);if(!c)continue;
          const r=c.getBoundingClientRect();
          if(r.top>=44||r.bottom>window.innerHeight/2){currentPage=i;updateInfo();break;}
        }
      });
    }
    document.getElementById('prevBtn').onclick=()=>{if(currentPage>1)scrollTo(currentPage-1);};
    document.getElementById('nextBtn').onclick=()=>{if(pdfDoc&&currentPage<pdfDoc.numPages)scrollTo(currentPage+1);};
    window.goToPrevPage=()=>{if(currentPage>1)scrollTo(currentPage-1);};
    window.goToNextPage=()=>{if(pdfDoc&&currentPage<pdfDoc.numPages)scrollTo(currentPage+1);};
    window.getCurrentPage=()=>currentPage;
    window.getTotalPages=()=>pdfDoc?pdfDoc.numPages:0;
    loadAll().catch(e=>{loading.innerHTML='<span style="color:#EF4444">Failed: '+e.message+'</span>';});
  </script>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF.js HTML — Remote (URL)
// ─────────────────────────────────────────────────────────────────────────────
function buildRemotePdfHtml(pdfUrl: string): string {
  const escaped = pdfUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"/>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:100%;height:100%;background:#1E293B;overflow:hidden;}
    #toolbar{position:fixed;top:0;left:0;right:0;height:44px;background:#0F172A;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:center;gap:12px;z-index:100;padding:0 12px;}
    #toolbar button{background:#1E293B;border:1px solid #334155;color:#94A3B8;border-radius:8px;padding:4px 12px;font-size:13px;cursor:pointer;}
    #pageInfo{color:#94A3B8;font-size:13px;min-width:80px;text-align:center;font-family:sans-serif;}
    #container{position:absolute;top:44px;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 8px;}
    canvas{display:block;max-width:100%;box-shadow:0 2px 8px rgba(0,0,0,0.5);border-radius:4px;background:#fff;}
    #loading{position:fixed;inset:0;background:#0F172A;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94A3B8;font-family:sans-serif;gap:12px;font-size:14px;}
    .spinner{width:40px;height:40px;border:3px solid #334155;border-top-color:#3B82F6;border-radius:50%;animation:spin 0.8s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg);}}
  </style>
</head>
<body>
  <div id="loading"><div class="spinner"></div><span>Loading PDF…</span></div>
  <div id="toolbar" style="display:none">
    <button id="prevBtn">‹ Prev</button>
    <span id="pageInfo">— / —</span>
    <button id="nextBtn">Next ›</button>
  </div>
  <div id="container"></div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    let pdfDoc=null,currentPage=1;
    const container=document.getElementById('container');
    const pageInfo=document.getElementById('pageInfo');
    const toolbar=document.getElementById('toolbar');
    const loading=document.getElementById('loading');
    const SCALE=window.devicePixelRatio>1?2.0:1.5;
    async function renderPage(num){
      const page=await pdfDoc.getPage(num);
      const vp=page.getViewport({scale:SCALE});
      const canvas=document.createElement('canvas');
      canvas.width=vp.width;canvas.height=vp.height;
      canvas.style.width=Math.min(vp.width/SCALE,window.innerWidth-16)+'px';
      canvas.style.height='auto';
      await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
      return canvas;
    }
    function updateInfo(){pageInfo.textContent=currentPage+' / '+(pdfDoc?pdfDoc.numPages:'—');}
    function scrollTo(num){
      const c=document.getElementById('page_'+num);
      if(c){c.scrollIntoView({behavior:'smooth',block:'start'});currentPage=num;updateInfo();}
    }
    async function loadAll(){
      pdfDoc=await pdfjsLib.getDocument({url:'${escaped}',withCredentials:false}).promise;
      loading.style.display='none';toolbar.style.display='flex';
      for(let i=1;i<=pdfDoc.numPages;i++){
        const canvas=await renderPage(i);canvas.id='page_'+i;container.appendChild(canvas);
      }
      updateInfo();
      container.addEventListener('scroll',()=>{
        for(let i=1;i<=pdfDoc.numPages;i++){
          const c=document.getElementById('page_'+i);if(!c)continue;
          const r=c.getBoundingClientRect();
          if(r.top>=44||r.bottom>window.innerHeight/2){currentPage=i;updateInfo();break;}
        }
      });
    }
    document.getElementById('prevBtn').onclick=()=>{if(currentPage>1)scrollTo(currentPage-1);};
    document.getElementById('nextBtn').onclick=()=>{if(pdfDoc&&currentPage<pdfDoc.numPages)scrollTo(currentPage+1);};
    window.goToPrevPage=()=>{if(currentPage>1)scrollTo(currentPage-1);};
    window.goToNextPage=()=>{if(pdfDoc&&currentPage<pdfDoc.numPages)scrollTo(currentPage+1);};
    window.getCurrentPage=()=>currentPage;
    window.getTotalPages=()=>pdfDoc?pdfDoc.numPages:0;
    loadAll().catch(e=>{loading.innerHTML='<span style="color:#EF4444">Failed: '+e.message+'</span>';});
  </script>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Docs zoom + toolbar-hide injection
// ─────────────────────────────────────────────────────────────────────────────
const GDOCS_INJECT_JS = `
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.docs-titlebar, .docs-menubar, .docs-toolbar, ' +
    '#docs-toolbar, .docs-gm-bar, .goog-toolbar, ' +
    '.docs-butterbar-container, .docs-presence-plus-container, ' +
    'footer, #footer { display: none !important; }',
    'body { transform-origin: top left !important; ' +
    '       transform: scale(0.70) !important; ' +
    '       width: 143% !important; ' +
    '       overflow-x: hidden !important; }',
  ].join(' ');
  document.head.appendChild(style);
})();
true;
`

// ─────────────────────────────────────────────────────────────────────────────
// LockedIcon
// ─────────────────────────────────────────────────────────────────────────────
function LockedIcon({ name, size, color, locked }: {
  name: string; size: number; color: string; locked: boolean
}) {
  return (
    <View style={{ position: 'relative' }}>
      <Ionicons name={name as any} size={size} color={color} />
      {locked && (
        <View style={lockedIconS.badge}>
          <Ionicons name="lock-closed" size={7} color="#fff" />
        </View>
      )}
    </View>
  )
}
const lockedIconS = StyleSheet.create({
  badge: {
    position: 'absolute', bottom: -3, right: -4,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: '#F59E0B',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#0F172A',
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading Overlay
// ─────────────────────────────────────────────────────────────────────────────
function LoadingOverlay({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return (
    <View style={overlayS.wrap}>
      <Animated.View style={[overlayS.ring, { borderColor: color + '50', opacity: pulse }]}>
        <ActivityIndicator size="large" color={color} />
      </Animated.View>
      <Text style={overlayS.text}>Loading document…</Text>
      <Text style={overlayS.sub}>This may take a few seconds</Text>
    </View>
  )
}
const overlayS = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', gap: 16, zIndex: 20 },
  ring: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 15, fontWeight: '700', color: '#E2E8F0' },
  sub:  { fontSize: 13, color: '#475569' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Premium Gate Modal
// ─────────────────────────────────────────────────────────────────────────────
function PremiumGateModal({ visible, onClose, onUpgrade, action }: {
  visible: boolean; onClose: () => void; onUpgrade: () => void; action: string
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen">
      <View style={premS.overlay}>
        <View style={premS.sheet}>
          <View style={premS.iconBox}>
            <Ionicons name="star" size={32} color="#F59E0B" />
          </View>
          <Text style={premS.title}>Premium Required</Text>
          <Text style={premS.sub}>
            {action} is only available to{'\n'}
            <Text style={{ color: '#F59E0B', fontWeight: '700' }}>Premium members</Text>.{'\n\n'}
            Upgrade to download files for offline use and open them in external apps.
          </Text>
          <TouchableOpacity style={premS.upgradeBtn} onPress={onUpgrade} activeOpacity={0.85}>
            <Ionicons name="star" size={16} color="#0F172A" />
            <Text style={premS.upgradeBtnText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity style={premS.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={premS.cancelBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
const premS = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: '#0F172A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 32, alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#1E293B' },
  iconBox:        { width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  title:          { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  sub:            { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  upgradeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F59E0B', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8, width: '100%', justifyContent: 'center' },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  cancelBtn:      { paddingVertical: 12 },
  cancelBtnText:  { fontSize: 14, color: '#475569', fontWeight: '600' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Offline Banner
// ─────────────────────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={offlineS.bar}>
      <Ionicons name="cloud-offline-outline" size={14} color="#94A3B8" />
      <Text style={offlineS.text}>Viewing cached copy — you're offline</Text>
    </View>
  )
}
const offlineS = StyleSheet.create({
  bar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1E293B', paddingVertical: 6, paddingHorizontal: 12 },
  text: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ViewerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const {
    file_url    = '',
    title       = 'Document',
    color       = '#1A56DB',
    material_id = '',
    is_local    = '0',
  } = useLocalSearchParams<{
    file_url: string; title: string; color: string
    material_id: string; is_local: string
  }>()

  const accent      = color || '#1A56DB'
  const ext         = getExt(file_url)
  const isPdf       = ext === 'pdf'
  const isOfficeDoc = ['docx','doc','pptx','ppt','xlsx','xls'].includes(ext)

  // ── Premium (P1) ─────────────────────────────────────────────────────────
  const { isPremium } = usePremium()

  const [showPremModal, setShowPremModal] = useState(false)
  const [premAction,    setPremAction]    = useState('')

  // ── Network status (N1) ──────────────────────────────────────────────────
  const [isOffline,  setIsOffline]  = useState(false)
  const [netChecked, setNetChecked] = useState(false)

  useEffect(() => {
    NetInfo.fetch().then(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false))
      setNetChecked(true)
    })
    const unsub = NetInfo.addEventListener(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false))
    })
    return () => unsub()
  }, [])

  // ── Resolve URL (D1): prefer local cache when offline ────────────────────
  const [isDownloaded, setIsDownloaded] = useState(false)
  // resolvedUrl starts as the incoming file_url and may be swapped to a
  // local path after an offline check or a successful download (D2 / D4).
  const [resolvedUrl, setResolvedUrl] = useState(file_url)

  useEffect(() => {
    if (!netChecked) return
    // If the param already points at a local file, nothing to resolve.
    if (is_local === '1' || isLocal(file_url)) {
      setResolvedUrl(file_url)
      setIsDownloaded(true)
      return
    }
    if (!material_id) { setResolvedUrl(file_url); return }

    const cachePath = getCachePath(material_id, ext)
    FileSystem.getInfoAsync(cachePath).then(info => {
      if (info.exists) {
        setIsDownloaded(true)
        // D1: serve local copy when offline; stream from network when online
        setResolvedUrl(isOffline ? info.uri : file_url)
      } else {
        setResolvedUrl(file_url)
      }
    }).catch(() => setResolvedUrl(file_url))
  }, [material_id, file_url, netChecked, isOffline, is_local])

  // ── Viewer state ─────────────────────────────────────────────────────────
  const [mode,        setMode]        = useState<ViewerMode>('loading')
  const [htmlSource,  setHtmlSource]  = useState<string | null>(null)
  const [viewerUrl,   setViewerUrl]   = useState<string | null>(null)
  const [webLoading,  setWebLoading]  = useState(true)
  const [retryCount,  setRetryCount]  = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages,  setTotalPages]  = useState(0)

  const webviewRef = useRef<WebView>(null)

  // ── Resolve viewer mode (D4: use resolvedUrl, not original is_local) ─────
  useEffect(() => {
    if (!netChecked) return
    const url = resolvedUrl
    if (!url) { setMode('error'); return }
    setMode('loading'); setWebLoading(true)
    setHtmlSource(null); setViewerUrl(null)
    setCurrentPage(1); setTotalPages(0)

    ;(async () => {
      // D4: derive effectiveLocal from the current resolvedUrl, not is_local param.
      // This ensures that after a download hot-swap, PDFs use the local base64 path.
      const effectiveLocal = isLocal(url)

      if (isPdf) {
        if (effectiveLocal) {
          try {
            const base64 = await FileSystem.readAsStringAsync(url, {
              encoding: FileSystem.EncodingType.Base64,
            })
            setHtmlSource(buildPdfJsHtml(base64))
            setMode('pdfjs')
          } catch { setMode('error') }
        } else {
          setHtmlSource(buildRemotePdfHtml(url))
          setMode('pdfjs')
        }
        return
      }

      if (isOfficeDoc) {
        if (effectiveLocal && !file_url.startsWith('http')) {
          setMode('unsupported'); return
        }
        const remoteUrl = file_url.startsWith('http') ? file_url : url
        const encoded   = encodeURIComponent(remoteUrl)
        setViewerUrl(`https://docs.google.com/viewer?url=${encoded}&embedded=true`)
        setMode('gdocs')
        return
      }

      const remoteUrl = file_url.startsWith('http') ? file_url : url
      const encoded   = encodeURIComponent(remoteUrl)
      setViewerUrl(`https://docs.google.com/viewer?url=${encoded}&embedded=true`)
      setMode('gdocs')
    })()
  }, [resolvedUrl, retryCount, netChecked])

  // ── Poll PDF.js page info ────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'pdfjs' || webLoading) return
    const id = setInterval(() => {
      webviewRef.current?.injectJavaScript(`
        (function(){
          var cp=window.getCurrentPage?window.getCurrentPage():0;
          var tp=window.getTotalPages?window.getTotalPages():0;
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'pageInfo',current:cp,total:tp}));
        })(); true;
      `)
    }, 800)
    return () => clearInterval(id)
  }, [mode, webLoading])

  // ── Inject Google Docs zoom + toolbar removal ────────────────────────────
  useEffect(() => {
    if (mode !== 'gdocs' || webLoading) return
    const t = setTimeout(() => {
      webviewRef.current?.injectJavaScript(GDOCS_INJECT_JS)
    }, 1200)
    return () => clearTimeout(t)
  }, [mode, webLoading])

  // ── Premium gate helper ──────────────────────────────────────────────────
  function requirePremium(action: string, cb: () => void) {
    if (isPremium) { cb(); return }
    setPremAction(action)
    setShowPremModal(true)
  }

  // ── Download (PREMIUM ONLY) ───────────────────────────────────────────────
  // D2: always hot-swaps viewer to local copy after success (not just when offline).
  // D3: upserts a row into the Supabase `downloads` table so the file appears
  //     on the Downloads screen without requiring a navigation away-and-back.
  async function handleDownload() {
    requirePremium('Downloading files for offline use', async () => {
      try {
        const dir  = FileSystem.documentDirectory + 'downloads/'
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {})
        const dest = getCachePath(material_id || String(Date.now()), ext)

        // Already downloaded — just confirm
        if (registryHas(material_id)) {
          const info = await FileSystem.getInfoAsync(dest)
          if (info.exists) {
            setIsDownloaded(true)
            Alert.alert('Already downloaded', 'This file is already saved on your device.')
            return
          }
        }

        Alert.alert('Downloading…', 'Your file is being saved for offline use.')
        const result = await FileSystem.downloadAsync(file_url, dest)

        if (result.status === 200) {
          // Mark as downloaded in local registry
          setIsDownloaded(true)
          registryAdd(material_id)

          // D2: hot-swap viewer to local copy immediately (regardless of network)
          setResolvedUrl(dest)

          // D3: upsert into Supabase downloads table so Downloads screen picks it up
          try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user && material_id) {
              await supabase
                .from('downloads')
                .upsert(
                  { user_id: user.id, material_id, downloaded_at: new Date().toISOString() },
                  { onConflict: 'user_id,material_id' },
                )
            }
          } catch (dbErr) {
            // Non-critical — file is saved locally; sync will catch up
            console.warn('[viewer] downloads upsert failed:', dbErr)
          }

          Alert.alert('Downloaded!', `"${title}" saved for offline access.`)
        } else {
          await FileSystem.deleteAsync(dest, { idempotent: true })
          Alert.alert('Download failed', 'Please check your connection and try again.')
        }
      } catch (e: any) {
        Alert.alert('Download failed', e?.message ?? 'Please try again.')
      }
    })
  }

  // ── Open externally (PREMIUM ONLY) ───────────────────────────────────────
  async function handleOpenExternal() {
    requirePremium('Opening files in external apps', async () => {
      try {
        const src = isLocal(resolvedUrl) ? resolvedUrl : file_url
        if (isLocal(src)) {
          await openExternally(src, ext)
        } else {
          const tmp  = FileSystem.cacheDirectory + `ss_${material_id || Date.now()}.${ext}`
          const info = await FileSystem.getInfoAsync(tmp)
          if (!info.exists) await FileSystem.downloadAsync(src, tmp)
          await openExternally(tmp, ext)
        }
      } catch (e: any) {
        Alert.alert('Could not open', e?.message ?? 'No app found to open this file.')
      }
    })
  }

  // ── PDF page nav ─────────────────────────────────────────────────────────
  function goToPrevPage() {
    webviewRef.current?.injectJavaScript(`window.goToPrevPage&&window.goToPrevPage();true;`)
  }
  function goToNextPage() {
    webviewRef.current?.injectJavaScript(`window.goToNextPage&&window.goToNextPage();true;`)
  }

  // ── WebView messages ─────────────────────────────────────────────────────
  function onMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'pageInfo') {
        if (msg.current > 0) setCurrentPage(msg.current)
        if (msg.total   > 0) setTotalPages(msg.total)
      }
    } catch {}
  }

  // ── WebView error: fall back to local cache if available ─────────────────
  function handleWebViewError() {
    setWebLoading(false)
    if (isDownloaded) {
      const cachePath = getCachePath(material_id, ext)
      setResolvedUrl(cachePath)
    } else {
      setMode('error')
    }
  }

  // ── Unsupported state ────────────────────────────────────────────────────
  function renderUnsupported() {
    return (
      <View style={stateS.wrap}>
        <View style={[stateS.iconBox, { backgroundColor: accent + '18' }]}>
          <Ionicons name="document-outline" size={44} color={accent} />
        </View>
        <Text style={stateS.title}>
          {isOffline && !isDownloaded ? "Can't preview offline" : 'Preview unavailable'}
        </Text>
        <Text style={stateS.sub}>
          {isOffline && !isDownloaded
            ? `${ext.toUpperCase()} files require a connection to preview.\nUpgrade to Premium to download files for offline access.`
            : isPremium
              ? 'Tap below to open this file in a compatible app on your device.'
              : `${ext.toUpperCase()} files cannot be previewed here.\nUpgrade to Premium to open this file in an external app.`
          }
        </Text>
        <TouchableOpacity
          style={[stateS.btn, {
            backgroundColor: isPremium ? accent : '#1E293B',
            borderWidth: isPremium ? 0 : 1,
            borderColor: 'rgba(245,158,11,0.4)',
          }]}
          onPress={handleOpenExternal}
          activeOpacity={0.85}
        >
          <LockedIcon name="open-outline" size={18} color={isPremium ? '#fff' : '#94A3B8'} locked={!isPremium} />
          <Text style={[stateS.btnText, !isPremium && { color: '#94A3B8' }]}>Open in App</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────
  function renderError() {
    return (
      <View style={stateS.wrap}>
        <View style={[stateS.iconBox, { backgroundColor: '#EF444418' }]}>
          <Ionicons name="alert-circle-outline" size={44} color="#EF4444" />
        </View>
        <Text style={stateS.title}>Failed to load document</Text>
        <Text style={stateS.sub}>
          {isOffline && isDownloaded
            ? "You're offline. Loading your cached copy…"
            : isOffline
              ? "You're offline and this file hasn't been downloaded yet.\nConnect to the internet to view it."
              : 'Something went wrong loading this document.\nCheck your connection and try again.'
          }
        </Text>
        <View style={stateS.btnRow}>
          <TouchableOpacity
            style={[stateS.btn, { backgroundColor: accent, flex: 1 }]}
            onPress={() => setRetryCount(c => c + 1)}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={stateS.btnText}>Retry</Text>
          </TouchableOpacity>
          {isPremium && (
            <TouchableOpacity
              style={[stateS.btn, { backgroundColor: '#1E293B', flex: 1 }]}
              onPress={handleOpenExternal}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social-outline" size={16} color="#E2E8F0" />
              <Text style={[stateS.btnText, { color: '#E2E8F0' }]}>Open Externally</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const webviewSource = htmlSource
    ? { html: htmlSource }
    : viewerUrl
      ? { uri: viewerUrl }
      : undefined

  const showWebView       = (mode === 'pdfjs' || mode === 'gdocs') && !!webviewSource
  const showPdfNav        = mode === 'pdfjs' && !webLoading && totalPages > 1
  const showBottomToolbar = showWebView && !webLoading && mode === 'pdfjs'

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={[S.header, { borderBottomColor: accent + '30' }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#E2E8F0" />
        </TouchableOpacity>

        <View style={S.headerCenter}>
          <View style={[S.extBadge, { backgroundColor: accent + '25' }]}>
            <Text style={[S.extText, { color: accent }]}>{ext ? ext.toUpperCase() : 'FILE'}</Text>
          </View>
          <Text style={S.headerTitle} numberOfLines={1}>{title}</Text>
        </View>

        {isDownloaded && (
          <View style={S.downloadedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
          </View>
        )}

        {/* Download button — only shown when file is remote */}
        {!isLocal(resolvedUrl) && (
          <TouchableOpacity
            style={[S.headerBtn, { backgroundColor: accent + '18' }]}
            onPress={handleDownload}
            activeOpacity={0.8}
          >
            <LockedIcon name="download-outline" size={18} color={accent} locked={!isPremium} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[S.headerBtn, { backgroundColor: 'rgba(255,255,255,0.05)' }]}
          onPress={handleOpenExternal}
          activeOpacity={0.8}
        >
          <LockedIcon name="share-social-outline" size={18} color="#94A3B8" locked={!isPremium} />
        </TouchableOpacity>
      </View>

      {/* Accent line */}
      <View style={[S.accentLine, { backgroundColor: accent }]} />

      {isOffline && isDownloaded && <OfflineBanner />}

      {/* ── Content ── */}
      <View style={S.content}>
        {mode === 'loading'     && <LoadingOverlay color={accent} />}
        {mode === 'unsupported' && renderUnsupported()}
        {mode === 'error'       && renderError()}

        {showWebView && (
          <>
            <WebView
              ref={webviewRef}
              style={S.webview}
              source={webviewSource}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              allowFileAccess
              allowUniversalAccessFromFileURLs
              mixedContentMode="always"
              onLoadStart={() => setWebLoading(true)}
              onLoadEnd={()   => setWebLoading(false)}
              onError={handleWebViewError}
              onHttpError={e => {
                if (e.nativeEvent.statusCode >= 400) {
                  setWebLoading(false)
                  handleWebViewError()
                }
              }}
              onMessage={onMessage}
              scalesPageToFit={false}
              bounces={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            />
            {webLoading && <LoadingOverlay color={accent} />}
          </>
        )}
      </View>

      {/* ── Bottom toolbar — PDF only ── */}
      {showBottomToolbar && (
        <View style={[S.toolbar, { paddingBottom: insets.bottom + 6 }]}>

          {showPdfNav && (
            <TouchableOpacity
              style={[S.toolbarBtn, currentPage <= 1 && S.toolbarBtnDisabled]}
              onPress={goToPrevPage}
              disabled={currentPage <= 1}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={currentPage <= 1 ? '#334155' : '#94A3B8'} />
            </TouchableOpacity>
          )}

          {showPdfNav && (
            <View style={S.pageIndicator}>
              <Text style={[S.pageNum, { color: accent }]}>{currentPage}</Text>
              <Text style={S.pageSep}>/</Text>
              <Text style={S.pageTotal}>{totalPages}</Text>
            </View>
          )}

          {showPdfNav && (
            <TouchableOpacity
              style={[S.toolbarBtn, currentPage >= totalPages && S.toolbarBtnDisabled]}
              onPress={goToNextPage}
              disabled={currentPage >= totalPages}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={20} color={currentPage >= totalPages ? '#334155' : '#94A3B8'} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={S.toolbarBtn}
            onPress={() => webviewRef.current?.reload()}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={18} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[S.toolbarPrimary, { backgroundColor: accent + '18', borderColor: accent + '40' }]}
            onPress={handleOpenExternal}
            activeOpacity={0.8}
          >
            <LockedIcon name="share-social-outline" size={15} color={accent} locked={!isPremium} />
            <Text style={[S.toolbarPrimaryText, { color: accent }]}>Open In</Text>
          </TouchableOpacity>

        </View>
      )}

      {/* Premium Gate Modal */}
      <PremiumGateModal
        visible={showPremModal}
        onClose={() => setShowPremModal(false)}
        action={premAction}
        onUpgrade={() => {
          setShowPremModal(false)
          router.push('/subscription' as any)
        }}
      />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0F172A' },

  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  backBtn:         { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center', alignItems: 'center' },
  headerCenter:    { flex: 1, gap: 2 },
  extBadge:        { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 2 },
  extText:         { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  headerTitle:     { fontSize: 13, fontWeight: '700', color: '#E2E8F0' },
  headerBtn:       { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerBtnGold:   { backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)' },
  downloadedBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(34,197,94,0.12)', justifyContent: 'center', alignItems: 'center' },

  accentLine: { height: 2, opacity: 0.5 },
  content:    { flex: 1, position: 'relative' },
  webview:    { flex: 1, backgroundColor: '#0F172A' },

  toolbar:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#1E293B', backgroundColor: '#0A0F1E' },
  toolbarBtn:         { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  toolbarBtnDisabled: { backgroundColor: '#0F172A', opacity: 0.4 },
  pageIndicator:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1E293B', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  pageNum:            { fontSize: 14, fontWeight: '800' },
  pageSep:            { fontSize: 12, color: '#334155' },
  pageTotal:          { fontSize: 14, fontWeight: '600', color: '#64748B' },
  toolbarPrimary:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  toolbarPrimaryText: { fontSize: 13, fontWeight: '700' },
})

const stateS = StyleSheet.create({
  wrap:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 16 },
  iconBox: { width: 88, height: 88, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  title:   { fontSize: 18, fontWeight: '800', color: '#E2E8F0', textAlign: 'center' },
  sub:     { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  btnRow:  { flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 },
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, marginTop: 8 },
  btnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
})