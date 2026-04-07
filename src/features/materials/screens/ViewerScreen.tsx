/**
 * e:\StudentShare\src\features\materials\screens\ViewerScreen.tsx
 * Professional high-fidelity PDF and Office Doc viewer.
 * 
 * High-Speed Direct File approach:
 * 1. Pre-bundles all viewer assets and PDF data into a single temporary HTML file.
 * 2. Loads the viewer directly via a file:// URI to bypass bridge bottlenecks and memory limits.
 * 3. Restores and maintains all original UI features (Scrubber, Selection, etc.).
 */

import { Ionicons } from '@expo/vector-icons'
import NetInfo from '@react-native-community/netinfo'
import * as FileSystem from 'expo-file-system/legacy'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView, WebViewMessageEvent } from 'react-native-webview'
import { Asset } from 'expo-asset'

// ─────────────────────────────────────────────────────────────────────────────
// Lazy-loaded native modules
// ─────────────────────────────────────────────────────────────────────────────
let _Clipboard: any = null
const Clipboard = {
  setStringAsync: async (text: string) => {
    try {
      if (!_Clipboard) _Clipboard = require('expo-clipboard')
      return await _Clipboard.setStringAsync(text)
    } catch (e) {
      console.warn('[Clipboard] Native module missing', e)
    }
  },
}

// Intentionally removed Sharing/IntentLauncher as part of the refactor

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────
type ViewerMode = 'loading' | 'downloading' | 'active' | 'error'

const MIME: Record<string, string> = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  txt:  'text/plain',
  tex:  'text/plain',
  md:   'text/plain',
  csv:  'text/plain',
  json: 'application/json',
}

function getExt(url: string): string {
  return url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? ''
}

function isLocalPath(url: string): boolean {
  if (!url) return false
  return url.startsWith('file://') || url.startsWith('/') || url.startsWith('content://')
}

const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`

function getCachePath(materialId: string, fileUrl: string): string {
  const ext = fileUrl.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || 'pdf'
  return `${DOWNLOAD_DIR}${materialId}.${ext}`
}

async function downloadToCache(remoteUrl: string, cachePath: string): Promise<string> {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR).catch(() => ({ exists: false }))
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true })
  }
  const result = await FileSystem.downloadAsync(remoteUrl, cachePath)
  if (result.status !== 200) throw new Error(`Download failed — HTTP ${result.status}`)
  return result.uri
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
    'body.night-mode { filter: invert(0.93) hue-rotate(180deg) brightness(1.05); background:#0F172A !important; }'
  ].join(' ');
  document.head.appendChild(style);

  window.addEventListener("message", function(event){
     try{
       var msg = JSON.parse(event.data);
       if(msg.type==="setNightMode"){
         document.body.classList.toggle("night-mode", msg.enabled);
       }
     }catch(e){}
  });
})();
true;
`

function buildTextViewerHtml(textContent: string): string {
  const safeText = textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br/>').replace(/\\r/g, '')
  var css = ':root { --bg: #0F172A; --text: #E2E8F0; --accent: #3B82F6; }'
    + ' body { background:var(--bg); color:var(--text); font-family:-apple-system,system-ui,monospace; padding: 24px; font-size: 14px; line-height: 1.6; user-select: text; -webkit-user-select: text; transition: all 0.3s ease; }'
    + ' ::selection { background:rgba(59,130,246,0.3); color: transparent; }'
    + ' .highlight { background: rgba(255,220,0,0.45); color: inherit; }'
    + ' body.night-mode { filter:invert(1) hue-rotate(180deg); background:#fff; color:#000; }'
  var js = 'function post(d){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(d));}'
    + ' document.onselectionchange=function(){var sel=window.getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed){post({type:"selection",active:false});return;}var text=sel.toString().trim();if(!text){post({type:"selection",active:false});return;}var range=sel.getRangeAt(0);var rects=Array.from(range.getClientRects()).map(function(r){return{top:r.top+window.scrollY,left:r.left+window.scrollX,width:r.width,height:r.height};});post({type:"selection",active:true,rects:rects,text:text});};'
    + ' window.addEventListener("message", function(e){ try { var msg=JSON.parse(e.data);'
    + ' if(msg.type==="setNightMode"){document.body.classList.toggle("night-mode", msg.enabled);}'
    + ' else if(msg.type==="findText" && window.find){ if(!msg.text) { window.getSelection().removeAllRanges(); return; } window.find(msg.text, false, !!msg.backward, true, false, true, false); }'
    + ' else if(msg.type==="setZoom"){ document.body.style.transform = "scale("+msg.zoom+")"; document.body.style.transformOrigin = "top left"; document.body.style.width = (100/msg.zoom)+"%"; }'
    + ' else if(msg.type==="addHighlight"){'
    + '   var sel = window.getSelection(); if(!sel || sel.isCollapsed) return;'
    + '   var range = sel.getRangeAt(0); var span = document.createElement("span"); span.className = "highlight";'
    + '   try { range.surroundContents(span); sel.removeAllRanges(); } catch(err) {}'
    + ' }'
    + ' }catch(e){} });';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>'
    + '<style>' + css + '</style></head><body>'
    + '<div id="content">' + safeText + '</div>'
    + '<script>' + js + '<\\/script></body></html>';
}

// ─────────────────────────────────────────────────────────────────────────────
// LockedIcon
// ─────────────────────────────────────────────────────────────────────────────
function LockedIcon({ name, size, color, locked }: { name: string; size: number; color: string; locked: boolean }) {
  return (
    <View style={{ position: 'relative' }}>
      <Ionicons name={name as any} size={size} color={color} />
      {locked && (
        <View style={LI_STYLE.badge}>
          <Ionicons name="lock-closed" size={7} color="#fff" />
        </View>
      )}
    </View>
  )
}
const LI_STYLE = StyleSheet.create({
  badge: { position: 'absolute', bottom: -3, right: -4, width: 13, height: 13, borderRadius: 7, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#0F172A' },
})

// ─────────────────────────────────────────────────────────────────────────────
// PDF.js Cached Asset Extraction & Lightweight HTML Builder
// ─────────────────────────────────────────────────────────────────────────────
const VIEWER_ASSETS_DIR = `${FileSystem.cacheDirectory}pdf_viewer/`
let _assetsReady: Promise<void> | null = null

/**
 * One-time extraction of PDF.js assets from the app bundle to the cache.
 * Subsequent calls return instantly if files are already extracted.
 */
function ensureViewerAssets(): Promise<void> {
  if (_assetsReady) return _assetsReady
  _assetsReady = (async () => {
    try {
      const markerPath = VIEWER_ASSETS_DIR + '.ready'
      const marker: any = await FileSystem.getInfoAsync(markerPath).catch(() => ({ exists: false }))
      if (marker.exists) return
      await FileSystem.makeDirectoryAsync(VIEWER_ASSETS_DIR, { intermediates: true })
      const pjs = Asset.fromModule(require('../../../../assets/vendor/pdf.min.bundle'))
      const pw = Asset.fromModule(require('../../../../assets/vendor/pdf.worker.min.bundle'))
      await Promise.all([pjs.downloadAsync(), pw.downloadAsync()])
      const [pdfjsCode, workerCode] = await Promise.all([
        FileSystem.readAsStringAsync(pjs.localUri!),
        FileSystem.readAsStringAsync(pw.localUri!),
      ])
      await Promise.all([
        FileSystem.writeAsStringAsync(VIEWER_ASSETS_DIR + 'pdf.min.js', pdfjsCode),
        FileSystem.writeAsStringAsync(VIEWER_ASSETS_DIR + 'pdf.worker.min.js', workerCode),
      ])
      await FileSystem.writeAsStringAsync(markerPath, 'ok')
    } catch (e) {
      _assetsReady = null
      throw e
    }
  })()
  return _assetsReady
}

/**
 * Build a lightweight HTML viewer that loads PDF.js from cached local scripts
 * and fetches the PDF from its file:// path — no base64 inlining.
 */
function buildViewerHtml(pdfFilePath: string): string {
  const safePath = pdfFilePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  // Use string concatenation for the HTML to avoid template literal issues
  var css = ':root { --bg: #0F172A; --surface: #1E293B; --border: #334155; --accent: #3B82F6; }'
    + ' * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }'
    + ' html, body { width:100%; height:100%; background:var(--bg); overflow:hidden; font-family:-apple-system,system-ui,sans-serif; }'
    + ' #container { position:absolute; inset:0; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; display:flex; flex-direction:column; align-items:center; gap:16px; padding:12px 8px 100px; }'
    + ' .page-wrap { position:relative; background:#fff; border-radius:3px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.55),0 1px 4px rgba(0,0,0,0.3); width:100%; flex-shrink:0; transition: transform 0.2s ease; }'
    + ' .page-wrap.skeleton { background:var(--surface); display:flex; align-items:center; justify-content:center; }'
    + ' .page-wrap.skeleton::after { content:\'\'; width:28px; height:28px; border:2.5px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; }'
    + ' canvas { display:block; z-index: 1; position: relative; }'
    + ' .textLayer { position:absolute; left:0; top:0; right:0; bottom:0; overflow:hidden; line-height:1; pointer-events:auto; z-index: 2; }'
    + ' .textLayer > span { color:transparent; position:absolute; white-space:pre; cursor:text; transform-origin:0% 0%; }'
    + ' ::selection { background:rgba(59,130,246,0.3); color:transparent; }'
    + ' .highlight { position:absolute; background:rgba(255,220,0,0.45); pointer-events:none; z-index:5; border-radius:2px; mix-blend-mode: multiply; }'
    + ' #loading-screen { position:fixed; inset:0; background:var(--bg); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94A3B8; gap:18px; z-index:200; }'
    + ' .loader-ring { width:44px; height:44px; border:3px solid var(--surface); border-top-color:var(--accent); border-radius:50%; animation:spin .9s cubic-bezier(.4,0,.2,1) infinite; }'
    + ' @keyframes spin { to { transform:rotate(360deg); } }'
    + ' body.night-mode #container { filter:none !important; }'
    + ' body.night-mode .page-wrap { background:#0F172A !important; border:1px solid #1E293B; }'
    + ' body.night-mode canvas { filter:invert(0.93) hue-rotate(180deg) brightness(1.05); }'
    + ' body.night-mode .highlight { mix-blend-mode: screen; background: rgba(255,220,0,0.5); }'

  var js = 'pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";'
    + ' var pdfDoc=null, currentPage=1, currentZoom=1.0, currentRotation=0, pageStates=new Map(), renderWidth=0;'
    + ' var container=document.getElementById("container"), statusText=document.getElementById("load-status");'
    + ' function post(d){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(d));}'
    + ' function getRenderWidth(){if(renderWidth>0)return renderWidth;renderWidth=(container.clientWidth||window.innerWidth)-16;return renderWidth;}'
    + ' async function renderPage(num){'
    + '   if(pageStates.get(num)==="rendering"||pageStates.get(num)==="done")return;'
    + '   pageStates.set(num,"rendering");var wrap=document.getElementById("pw_"+num);if(!wrap)return;'
    + '   try{var page=await pdfDoc.getPage(num);var nVP=page.getViewport({scale:1.0,rotation:currentRotation});'
    + '   var aW=getRenderWidth()*currentZoom;var fS=aW/nVP.width;var cW=Math.floor(nVP.width*fS);var cH=Math.floor(nVP.height*fS);'
    + '   wrap.style.width=cW+"px";wrap.style.height=cH+"px";wrap.style.minHeight="unset";'
    + '   var dpr=Math.min(window.devicePixelRatio||1,2);var pW=Math.floor(cW*dpr);var pH=Math.floor(cH*dpr);'
    + '   var rS=fS*dpr;if(pW*pH>16777216)rS=fS*dpr*Math.sqrt(16777216/(pW*pH));'
    + '   var rVP=page.getViewport({scale:rS,rotation:currentRotation});'
    + '   var canvas=wrap.querySelector("canvas");if(!canvas){canvas=document.createElement("canvas");wrap.insertBefore(canvas,wrap.firstChild);}'
    + '   canvas.width=rVP.width;canvas.height=rVP.height;canvas.style.width=cW+"px";canvas.style.height=cH+"px";'
    + '   await page.render({canvasContext:canvas.getContext("2d"),viewport:rVP}).promise;'
    + '   var tVP=page.getViewport({scale:fS,rotation:currentRotation});'
    + '   var tL=wrap.querySelector(".textLayer");if(!tL){tL=document.createElement("div");tL.className="textLayer";wrap.appendChild(tL);}'
    + '   tL.innerHTML="";tL.style.width=cW+"px";tL.style.height=cH+"px";'
    + '   var tc=await page.getTextContent({normalizeWhitespace:true});'
    + '   pdfjsLib.renderTextLayer({textContent:tc,container:tL,viewport:tVP,enhanceTextSelection:true});'
    + '   wrap.classList.remove("skeleton");pageStates.set(num,"done");'
    + '   }catch(e){pageStates.set(num,"error");}'
    + ' }'
    + ' var observer=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting)renderPage(parseInt(e.target.dataset.page));});},{root:container,rootMargin:"1000px"});'
    + ' function reRenderAll(){renderWidth=0;pageStates.clear();container.querySelectorAll(".page-wrap").forEach(function(w){var c=w.querySelector("canvas");if(c)c.remove();var t=w.querySelector(".textLayer");if(t)t.remove();w.classList.add("skeleton");w.style.width="";w.style.height="";});container.querySelectorAll(".page-wrap").forEach(function(w){var r=w.getBoundingClientRect();if(r.top<window.innerHeight+1000&&r.bottom>-1000)renderPage(parseInt(w.dataset.page));});}'
    + ' window.addEventListener("message",async function(event){try{var msg=JSON.parse(event.data);'
    + '   if(msg.type==="setZoom"){currentZoom=msg.zoom;reRenderAll();}'
    + '   else if(msg.type==="setRotation"){'
    + '     currentRotation=msg.rotation;'
    + '     container.style.opacity = "0";'
    + '     setTimeout(function(){reRenderAll();setTimeout(function(){container.style.transition="opacity 0.2s ease";container.style.opacity="1";},300);},150);'
    + '   }'
    + '   else if(msg.type==="scrollToPage"){var el=document.getElementById("pw_"+msg.page);if(el){el.scrollIntoView({behavior:"smooth", block:"start"}); currentPage=msg.page; post({type:"pageInfo",current:currentPage});}}'
    + '   else if(msg.type==="setNightMode"){document.body.classList.toggle("night-mode",msg.enabled);}'
    + '   else if(msg.type==="findText"){'
    + '     if(!msg.text) { window.getSelection().removeAllRanges(); return; }'
    + '     var found = window.find(msg.text, false, !!msg.backward, true, false, true, false);'
    + '     if(found) return;'
    + '     let start = currentPage;'
    + '     for(let i=1; i<=pdfDoc.numPages; i++){'
    + '       let p = start + (msg.backward ? -i : i);'
    + '       if (p > pdfDoc.numPages) p = p % pdfDoc.numPages || pdfDoc.numPages;'
    + '       if (p < 1) p = pdfDoc.numPages + p;'
    + '       let page = await pdfDoc.getPage(p);'
    + '       let tc = await page.getTextContent();'
    + '       let pageText = tc.items.map(function(item){return item.str;}).join(" ");'
    + '       if(pageText.toLowerCase().includes(msg.text.toLowerCase())){'
    + '         var el = document.getElementById("pw_"+p);'
    + '         if(el){'
    + '           await renderPage(p);'
    + '           el.scrollIntoView({behavior:"smooth", block:"start"});'
    + '           setTimeout(function(){window.find(msg.text,false,!!msg.backward,true,false,true,false);}, 150);'
    + '         }'
    + '         break;'
    + '       }'
    + '     }'
    + '   }'
    + '   else if(msg.type==="addHighlight"){var wrap=document.getElementById("pw_"+msg.page);if(wrap){msg.rects.forEach(function(r){var h=document.createElement("div");h.className="highlight";h.style.left=r.left+"px";h.style.top=r.top+"px";h.style.width=r.width+"px";h.style.height=r.height+"px";wrap.appendChild(h);});}}'
    + ' }catch(e){console.error("[ViewerJS]",e);}});'
    + ' document.onselectionchange=function(){var sel=window.getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed){post({type:"selection",active:false});return;}var text=sel.toString().trim();if(!text){post({type:"selection",active:false});return;}var range=sel.getRangeAt(0);var rects=Array.from(range.getClientRects()).map(function(r){return{top:r.top+container.scrollTop,left:r.left+container.scrollLeft,width:r.width,height:r.height};});post({type:"selection",active:true,rects:rects,text:text});};'
    + ' container.addEventListener("scroll",function(){var wraps=container.querySelectorAll(".page-wrap");for(var i=0;i<wraps.length;i++){var r=wraps[i].getBoundingClientRect();if(r.top<window.innerHeight*0.6&&r.bottom>0){var p=parseInt(wraps[i].dataset.page);if(p!==currentPage){currentPage=p;post({type:"pageInfo",current:currentPage});}break;}}},{passive:true});'
    + ' (async function(){try{'
    + '   statusText.innerText="Loading PDF…";'
    + '   var loadingTask=pdfjsLib.getDocument("' + safePath + '");'
    + '   loadingTask.onProgress=function(p){if(p.total>0)post({type:"loadingProgress",percent:Math.round((p.loaded/p.total)*100)});};'
    + '   pdfDoc=await loadingTask.promise;'
    + '   document.getElementById("loading-screen").style.display="none";'
    + '   for(var i=1;i<=pdfDoc.numPages;i++){var wrap=document.createElement("div");wrap.id="pw_"+i;wrap.className="page-wrap skeleton";wrap.dataset.page=String(i);wrap.style.minHeight="300px";wrap.style.width="100%";container.appendChild(wrap);observer.observe(wrap);}'
    + '   post({type:"pageInfo",total:pdfDoc.numPages});'
    + '   var outline=await pdfDoc.getOutline();if(outline&&outline.length)post({type:"outline",data:outline});'
    + ' }catch(e){statusText.innerText="Error: "+e.message;post({type:"error",message:e.message});}})();'

  return '<!DOCTYPE html><html><head><meta charset="utf-8"/>'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>'
    + '<style>' + css + '</style></head><body>'
    + '<div id="loading-screen"><div class="loader-ring"></div><span id="load-status">Opening document…</span></div>'
    + '<div id="container"></div>'
    + '<script src="pdf.min.js"><\/script>'
    + '<script>' + js + '<\/script>'
    + '</body></html>'
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function LoadingOverlay({ color, label = 'Opening document…' }: { color: string; label?: string }) {
  const pulse = useRef(new RNAnimated.Value(0.5)).current
  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return (
    <View style={ovS.wrap}>
      <RNAnimated.View style={[ovS.ring, { borderColor: color + '50', opacity: pulse }]}>
        <ActivityIndicator size="large" color={color} />
      </RNAnimated.View>
      <Text style={ovS.text}>{label}</Text>
    </View>
  )
}
const ovS = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', gap: 16, zIndex: 20 },
  ring: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 15, fontWeight: '700', color: '#E2E8F0' },
})

function ErrorState({ title, message, onRetry, onExternal }: { title: string; message: string; onRetry?: () => void; onExternal?: () => void }) {
  return (
    <View style={errS.wrap}>
      <View style={errS.iconBox}><Ionicons name="alert-circle" size={48} color="#EF4444" /></View>
      <Text style={errS.title}>{title}</Text>
      <Text style={errS.message}>{message}</Text>
      <View style={errS.actions}>
        {onRetry && <TouchableOpacity style={errS.btn} onPress={onRetry}><Text style={errS.btnText}>Try Again</Text></TouchableOpacity>}
      </View>
    </View>
  )
}
const errS = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12, backgroundColor: '#0F172A' },
  iconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EF444415', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', textAlign: 'center' },
  message: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  actions: { width: '100%', gap: 12 },
  btn: { backgroundColor: '#EF4444', height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  btnOutline:{ backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3B82F6' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})

function OutlineModal({ visible, data, onClose, onSelect }: { visible: boolean; data: any[]; onClose: () => void; onSelect: (page: number) => void }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={outS.overlay}>
        <View style={[outS.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={outS.header}>
            <Text style={outS.title}>Table of Contents</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#94A3B8" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={outS.scroll}>
            {data.map((item, i) => (
              <TouchableOpacity key={i} style={outS.item} onPress={() => { if (item.dest) onSelect(item.dest[0]?.num ?? 1) }}>
                <Text style={outS.itemText} numberOfLines={1}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={14} color="#334155" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}
            {data.length === 0 && <Text style={outS.empty}>No outline available</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
const outS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0F172A', borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: '50%', maxHeight: '80%', borderTopWidth: 1, borderTopColor: '#1E293B' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  title: { fontSize: 16, fontWeight: '700', color: '#F8FAFC' },
  scroll: { padding: 10 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  itemText: { color: '#E2E8F0', fontSize: 14, fontWeight: '500' },
  empty: { color: '#64748B', textAlign: 'center', marginTop: 40, fontSize: 14 },
})

function DocTypeBadge({ ext }: { ext: string }) {
  const isText = ['txt', 'tex', 'md', 'csv', 'json'].includes(ext)
  const bg = ext === 'pdf' ? '#EF444420' : isText ? '#10B98120' : '#3B82F620'
  const text = ext === 'pdf' ? '#EF4444' : isText ? '#10B981' : '#3B82F6'
  return (
    <View style={[bdgS.wrap, { backgroundColor: bg }]}>
      <Text style={[bdgS.text, { color: text }]}>{ext.toUpperCase()}</Text>
    </View>
  )
}
const bdgS = StyleSheet.create({
  wrap: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  text: { fontSize: 10, fontWeight: '800' },
})

function ThumbnailScrubber({ total, current, onSelect }: { total: number; current: number; onSelect: (p: number) => void }) {
  const ref = useRef<ScrollView>(null); useEffect(() => { ref.current?.scrollTo({ x: (current - 1) * 50 - 100, animated: true }) }, [current])
  return (
    <View style={scbS.wrap}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={scbS.content}>
        {Array.from({ length: total }).map((_, i) => {
          const p = i + 1; const active = p === current
          return (
            <TouchableOpacity key={p} onPress={() => onSelect(p)} style={[scbS.item, active && scbS.activeItem]}>
              <Text style={[scbS.itemText, active && scbS.activeText]}>{p}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  )
}
const scbS = StyleSheet.create({
  wrap: { height: 50, backgroundColor: 'rgba(10,15,30,0.9)', borderTopWidth: 1, borderTopColor: '#1E293B' },
  content: { paddingHorizontal: 20, alignItems: 'center' },
  item: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#334155' },
  activeItem: { backgroundColor: '#3B82F6', borderColor: '#60A5FA' },
  itemText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  activeText: { color: '#fff' },
})

function SelectionToolbar({ text, onHighlight, onCopy, onSearch, onClose }: { text: string; onHighlight: () => void; onCopy: () => void; onSearch: () => void; onClose: () => void }) {
  return (
    <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={selS.wrap}>
      <View style={selS.header}>
        <Text style={selS.title} numberOfLines={1}>"{text}"</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={18} color="#94A3B8" /></TouchableOpacity>
      </View>
      <View style={selS.actions}>
        <TouchableOpacity style={selS.btn} onPress={onHighlight}><Ionicons name="brush" size={18} color="#F59E0B" /><Text style={selS.btnText}>Highlight</Text></TouchableOpacity>
        <TouchableOpacity style={selS.btn} onPress={onCopy}><Ionicons name="copy-outline" size={18} color="#3B82F6" /><Text style={selS.btnText}>Copy</Text></TouchableOpacity>
        <TouchableOpacity style={selS.btn} onPress={onSearch}><Ionicons name="search-outline" size={18} color="#10B981" /><Text style={selS.btnText}>Search</Text></TouchableOpacity>
      </View>
    </Animated.View>
  )
}
const selS = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 120, left: 16, right: 16, backgroundColor: '#1E293B', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 8 },
  title: { color: '#94A3B8', fontSize: 13, flex: 1, fontStyle: 'italic', marginRight: 10 },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  btn: { alignItems: 'center', gap: 6, minWidth: 70 },
  btnText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700' },
})



function OfflineBanner() { 
  return ( 
    <View style={offS.bar}>
      <View style={offS.inner}>
        <Ionicons name="cloud-offline" size={12} color="#F59E0B" />
        <Text style={offS.text}>You are currently offline. Showing cached version.</Text>
      </View>
    </View> 
  ) 
}
const offS = StyleSheet.create({ 
  bar: { backgroundColor: '#0F172A', paddingVertical: 10, paddingHorizontal: 16 }, 
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.1)', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  text: { fontSize: 11, color: '#F59E0B', fontWeight: '700', letterSpacing: 0.3 } 
})

function GoToPageModal({ visible, totalPages, currentPage, onClose, onGo }: { visible: boolean; totalPages: number; currentPage: number; onClose: () => void; onGo: (p: number) => void }) {
  const [value, setValue] = useState(''); useEffect(() => { if (visible) setValue(String(currentPage)) }, [visible, currentPage])
  function submit() { const n = parseInt(value, 10); if (n >= 1 && n <= totalPages) { onGo(n); onClose() } else Alert.alert('Invalid Page', `Enter between 1 and ${totalPages}.`) }
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={gtS.overlay}>
        <View style={gtS.card}>
          <Text style={gtS.title}>Go to Page</Text><Text style={gtS.sub}>1 – {totalPages}</Text>
          <TextInput style={gtS.input} keyboardType="number-pad" value={value} onChangeText={setValue} onSubmitEditing={submit} autoFocus selectTextOnFocus />
          <View style={gtS.row}>
            <TouchableOpacity style={gtS.cancelBtn} onPress={onClose}><Text style={gtS.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={gtS.goBtn} onPress={submit}><Text style={gtS.goText}>Go</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}
const gtS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: { backgroundColor: '#1E293B', borderRadius: 20, padding: 24, width: '100%', gap: 12, borderWidth: 1, borderColor: '#334155' },
  title: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  sub: { fontSize: 13, color: '#64748B' },
  input: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 12, color: '#F8FAFC', fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 12, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  cancelText:{ color: '#94A3B8', fontWeight: '700', fontSize: 15 },
  goBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
  goText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Main ViewerScreen
// ─────────────────────────────────────────────────────────────────────────────
export default function ViewerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ file_url?: string; title?: string; color?: string; material_id?: string; is_local?: string }>()
  
  const [isOffline, setIsOffline] = useState(false); const [isLoading, setIsLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0); const [mode, setMode] = useState<ViewerMode>('loading')
  const [downloadLabel, setDownloadLabel] = useState('Downloading…')
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1); const [totalPages, setTotalPages] = useState(0)
  const [isSearching, setIsSearching] = useState(false); const [searchQuery, setSearchQuery] = useState('')
  const [outline, setOutline] = useState<any[]>([]); const [showOutline, setShowOutline] = useState(false)
  const [zoom, setZoom] = useState(1.0); const [rotation, setRotation] = useState(0)
  const [isNightMode, setIsNightMode] = useState(false); const [showGoToPage, setShowGoToPage] = useState(false)
  const [selection, setSelection] = useState<{ active: boolean; rects: any[]; text: string }>({ active: false, rects: [], text: '' })

  const loadingProgress = useRef(new RNAnimated.Value(0)).current
  const rotateAnim = useRef(new RNAnimated.Value(0)).current
  const webviewRef = useRef<WebView>(null); const accent = params.color || '#1A56DB'; const ext = getExt(params.file_url || ''); const isText = ['txt', 'tex', 'md', 'csv', 'json'].includes(ext)

  useEffect(() => { const unsub = NetInfo.addEventListener(state => setIsOffline(!state.isConnected)); return () => unsub() }, [])

  useEffect(() => {
    if (!params.file_url) return
    let cancelled = false
    ;(async () => {
      try {
        const materialId = params.material_id || 'temp'
        const cachePath = getCachePath(materialId, params.file_url!)
        const cached: any = await FileSystem.getInfoAsync(cachePath).catch(() => ({ exists: false, size: 0, uri: '' }))
        let localUri: string
        if (cached.exists && (cached.size ?? 0) > 512) {
          localUri = cached.uri
        } else if (isLocalPath(params.file_url!)) {
          localUri = params.file_url!.startsWith('file://') ? params.file_url! : `file://${params.file_url!}`
        } else {
          setMode('downloading'); setDownloadLabel('Downloading file…')
          localUri = await downloadToCache(params.file_url!, cachePath)
        }
        if (cancelled) return
        const info: any = await FileSystem.getInfoAsync(localUri).catch(() => ({ exists: false, size: 0 }))
        if (!info.exists || (info.size ?? 0) < 512) throw new Error('Download failed')

        if (ext === 'pdf') {
          setDownloadLabel('Preparing viewer…')
          // Extract PDF.js assets to cache (instant if already done)
          await ensureViewerAssets()
          if (cancelled) return
          // Ensure localUri is a proper file:// path for the HTML to reference
          const pdfPath = localUri.startsWith('file://') ? localUri : 'file://' + localUri
          const html = buildViewerHtml(pdfPath)
          const filename = `viewer_${Date.now()}.html`
          const htmlPath = VIEWER_ASSETS_DIR + filename
          await FileSystem.writeAsStringAsync(htmlPath, html)
          if (cancelled) return
          // cacheDirectory already includes file:// prefix
          const viewerUri = htmlPath.startsWith('file://') ? htmlPath : 'file://' + htmlPath
          setViewerUrl(viewerUri)
          setMode('active')
        } else if (isText) {
          setDownloadLabel('Preparing text…')
          const textData = await FileSystem.readAsStringAsync(localUri)
          const html = buildTextViewerHtml(textData)
          if (cancelled) return
          await ensureViewerAssets()
          const filename = `viewer_${Date.now()}.html`
          const htmlPath = VIEWER_ASSETS_DIR + filename
          await FileSystem.writeAsStringAsync(htmlPath, html)
          const viewerUri = htmlPath.startsWith('file://') ? htmlPath : 'file://' + htmlPath
          setViewerUrl(viewerUri)
          setMode('active')
        } else {
          if (isLocalPath(params.file_url!)) throw new Error('Office docs require online viewer')
          setViewerUrl('https://docs.google.com/viewer?url=' + encodeURIComponent(params.file_url!) + '&embedded=true')
          setMode('active')
        }
      } catch (e: any) {
        if (cancelled) return
        console.error('[Viewer]', e)
        setMode('error')
        Alert.alert('Error', e.message || 'Failed to load document')
      }
    })()
    return () => { cancelled = true }
  }, [params.file_url, retryCount])

  // Share logic removed as per user request

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data)
      if (msg.type === 'pageInfo') { if (msg.current) setCurrentPage(msg.current); if (msg.total) setTotalPages(msg.total) }
      else if (msg.type === 'loadingProgress') { RNAnimated.timing(loadingProgress, { toValue: msg.percent, duration: 200, useNativeDriver: false }).start() }
      else if (msg.type === 'outline') { setOutline(msg.data) }
      else if (msg.type === 'selection') { setSelection({ active: msg.active, rects: msg.rects || [], text: msg.text || '' }) }
      else if (msg.type === 'error') { setMode('error') }
    } catch {}
  }

  function send(type: string, data: any = {}) { webviewRef.current?.postMessage(JSON.stringify({ type, ...data })) }
  function handleZoom(delta: number) { const n = Math.max(0.5, Math.min(2.5, zoom + delta)); setZoom(n); send('setZoom', { zoom: n }) }
  function handleRotate() { 
    const n = (rotation + 90) % 360; 
    setRotation(n); 
    send('setRotation', { rotation: n });
    RNAnimated.timing(rotateAnim, { toValue: n, duration: 400, useNativeDriver: true }).start(); 
  }

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color="#E2E8F0" /></TouchableOpacity>
        {isSearching ? (
          <View style={S.searchContainer}>
            <TextInput style={S.searchInput} placeholder="Find text…" placeholderTextColor="#94A3B8" autoFocus value={searchQuery} onChangeText={t => { setSearchQuery(t); send('findText', { text: t }) }} returnKeyType="search" />
            <TouchableOpacity onPress={() => send('findText', { text: searchQuery, backward: true })} style={S.searchAction}><Ionicons name="chevron-up" size={18} color="#94A3B8" /></TouchableOpacity>
            <TouchableOpacity onPress={() => send('findText', { text: searchQuery, backward: false })} style={S.searchAction}><Ionicons name="chevron-down" size={18} color="#94A3B8" /></TouchableOpacity>
            <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery('') }} style={S.searchAction}><Ionicons name="close" size={18} color="#EF4444" /></TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={S.headerCenter}><View style={S.titleRow}><DocTypeBadge ext={ext} /><Text style={S.headerTitle} numberOfLines={1}>{params.title || 'Document'}</Text></View></View>
            <View style={S.headerActions}>
              <TouchableOpacity style={S.headerBtn} onPress={() => setIsSearching(true)}><Ionicons name="search-outline" size={18} color="#94A3B8" /></TouchableOpacity>
              <TouchableOpacity style={S.headerBtn} onPress={() => { const n = !isNightMode; setIsNightMode(n); send('setNightMode', { enabled: n }) }} activeOpacity={0.7}><Ionicons name={isNightMode ? 'sunny' : 'moon-outline'} size={18} color={isNightMode ? '#F59E0B' : '#94A3B8'} /></TouchableOpacity>
              {outline.length > 0 && <TouchableOpacity style={S.headerBtn} onPress={() => setShowOutline(true)} activeOpacity={0.7}><Ionicons name="list" size={18} color="#94A3B8" /></TouchableOpacity>}
            </View>
          </>
        )}
      </View>

      <View style={S.progressContainer}>
        <RNAnimated.View style={[S.progressBar, { backgroundColor: accent, width: loadingProgress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }), opacity: loadingProgress.interpolate({ inputRange: [0, 99, 100], outputRange: [1, 1, 0] }) }]} />
      </View>
      {isOffline && <OfflineBanner />}

      <View style={S.content}>
        {(mode === 'loading' || mode === 'downloading') && <LoadingOverlay color={accent} label={mode === 'downloading' ? downloadLabel : 'Opening document…'} />}
        {mode === 'error' && <ErrorState title="Error" message="Could not load document." onRetry={() => setRetryCount(c => c + 1)} />}
        {viewerUrl && mode === 'active' && (
          <WebView 
            ref={webviewRef} 
            source={{ uri: viewerUrl }} 
            style={S.webview} 
            onMessage={onMessage} 
            onLoadEnd={() => {
              setIsLoading(false);
              if (ext !== 'pdf' && !isText) {
                webviewRef.current?.injectJavaScript(GDOCS_INJECT_JS);
              }
              if (isNightMode) { send('setNightMode', { enabled: true }); }
            }} 
            onError={(e) => { console.error('[WebView]', e.nativeEvent); setMode('error'); }}
            bounces={false} 
            scrollEnabled={true} 
            javaScriptEnabled 
            domStorageEnabled 
            allowFileAccess={true} 
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true} 
            originWhitelist={['*']}
            androidLayerType="hardware"
            scalesPageToFit={true}
            mixedContentMode="always"
          />
        )}
        {selection.active && selection.text.length > 0 && (
          <SelectionToolbar text={selection.text}
            onHighlight={() => { send('addHighlight', { page: currentPage, rects: selection.rects }); setSelection({ active: false, rects: [], text: '' }) }}
            onCopy={async () => { await Clipboard.setStringAsync(selection.text); setSelection({ active: false, rects: [], text: '' }); Alert.alert('Copied', 'Selection copied.') }}
            onSearch={() => { setIsSearching(true); setSearchQuery(selection.text); send('findText', { text: selection.text }); setSelection({ active: false, rects: [], text: '' }) }}
            onClose={() => setSelection({ active: false, rects: [], text: '' })} />
        )}
      </View>

      {(ext === 'pdf' || isText) && mode === 'active' && !isLoading && (
        <>
          {ext === 'pdf' && totalPages > 0 && <ThumbnailScrubber total={totalPages} current={currentPage} onSelect={p => send('scrollToPage', { page: p })} />}
          <View style={[S.toolbar, { paddingBottom: insets.bottom + 10 }]}>
            <View style={S.pillGroup}>
              <TouchableOpacity onPress={() => handleZoom(-0.25)} style={S.pillBtn}><Ionicons name="remove" size={16} color="#94A3B8" /></TouchableOpacity>
              <Text style={S.pillText}>{Math.round(zoom * 100)}%</Text>
              <TouchableOpacity onPress={() => handleZoom(0.25)} style={S.pillBtn}><Ionicons name="add" size={16} color="#94A3B8" /></TouchableOpacity>
            </View>
            <View style={S.navGroup}>
              {ext === 'pdf' && (
                <>
                  <TouchableOpacity onPress={() => send('scrollToPage', { page: Math.max(1, currentPage - 1) })} style={S.navArrow}><Ionicons name="chevron-back" size={24} color="#F8FAFC" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowGoToPage(true)} style={S.pagePill}><Text style={S.pageNum}>{currentPage} / {totalPages}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => send('scrollToPage', { page: Math.min(totalPages, currentPage + 1) })} style={S.navArrow}><Ionicons name="chevron-forward" size={24} color="#F8FAFC" /></TouchableOpacity>
                </>
              )}
            </View>
            {ext === 'pdf' && (
              <TouchableOpacity onPress={handleRotate} style={S.utilBtn}>
                <RNAnimated.View style={{ transform: [{ rotate: rotateAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}>
                  <Ionicons name="reload" size={18} color="#94A3B8" />
                </RNAnimated.View>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      <OutlineModal visible={showOutline} data={outline} onClose={() => setShowOutline(false)} onSelect={p => { setShowOutline(false); send('scrollToPage', { page: p }) }} />
      <GoToPageModal visible={showGoToPage} totalPages={totalPages} currentPage={currentPage} onClose={() => setShowGoToPage(false)} onGo={p => send('scrollToPage', { page: p })} />
    </View>
  )
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, paddingLeft: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: '#E2E8F0', flex: 1 },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerActions: { flexDirection: 'row', gap: 2 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 12, marginLeft: 12, paddingLeft: 12, height: 44, borderWidth: 1, borderColor: '#334155' },
  searchInput: { flex: 1, color: '#F8FAFC', fontSize: 13, height: '100%', fontWeight: '500' },
  searchAction: { paddingHorizontal: 10, height: '100%', justifyContent: 'center' },
  progressContainer:{ height: 2, backgroundColor: 'rgba(255,255,255,0.02)' },
  progressBar: { height: '100%' },
  content: { flex: 1, position: 'relative' },
  webview: { flex: 1, backgroundColor: '#0F172A' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0F172A', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#1E293B' },
  pillGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 12, paddingHorizontal: 4 },
  pillBtn: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  pillText: { color: '#94A3B8', fontSize: 11, fontWeight: '800', width: 38, textAlign: 'center' },
  navGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navArrow: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  pagePill: { backgroundColor: '#1E293B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#334155' },
  pageNum: { color: '#F8FAFC', fontWeight: '800', fontSize: 13 },
  utilBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
})