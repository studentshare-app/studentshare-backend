/**
 * e:\StudentShare\src\features\materials\screens\ViewerScreen.tsx
 * Professional high-fidelity PDF and Office Doc viewer.
 *
 * PAGE LAYOUT FIXES (this version):
 *  1. Pages were rendering as thin horizontal strips — canvas width was being
 *     set before the page-wrap width was committed to layout, so innerWidth
 *     was wrong. Fix: measure innerWidth ONCE after the first page loads and
 *     store it; use that value for every page.
 *  2. Image-based / scanned PDFs showed as flat white lines — the canvas
 *     height collapsed because the CSS `height:auto` on canvas conflicted with
 *     the explicit pixel dimensions set by JS. Fix: set canvas CSS width/height
 *     explicitly in pixels to match the logical display size, and set the
 *     page-wrap size before rendering starts.
 *  3. devicePixelRatio was applied to the display dimensions, making pages
 *     appear zoomed-in and clipped. Fix: use DPR only for the canvas pixel
 *     buffer (render quality), never for the CSS/display dimensions.
 *  4. The `min-height:500px` placeholder was never removed on some devices,
 *     leaving empty space below rendered pages. Fix: always set minHeight to
 *     'unset' after computing real dimensions.
 *
 * ALL PREVIOUS FIXES RETAINED:
 *  - Supabase CORS → download natively first, pass base64 to PDF.js.
 *  - RNAnimated vs Reanimated mismatch → progress bar uses RNAnimated.View.
 *  - opacity ClassCastException → interpolated values stay in one system.
 *  - Missing `lastZoom` in WebView JS.
 *  - Hooks-after-return violation.
 *  - Alert.prompt (iOS-only) → GoToPageModal.
 *  - Downloads directory created if missing.
 *  - EncodingType.Base64 used explicitly.
 *  - Page navigation clamped to valid range.
 */

import { usePremium } from '@/core/entitlements/PremiumProvider'
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

let _Sharing: any = null
const Sharing = {
  shareAsync: async (url: string, options?: any) => {
    try {
      if (!_Sharing) _Sharing = require('expo-sharing')
      return await _Sharing.shareAsync(url, options)
    } catch {
      Alert.alert('Sharing Error', 'Sharing is not available on this device.')
    }
  },
}

let _IntentLauncher: any = null
const IntentLauncher = {
  startActivityAsync: async (action: string, options?: any) => {
    try {
      if (!_IntentLauncher) _IntentLauncher = require('expo-intent-launcher')
      return await _IntentLauncher.startActivityAsync(action, options)
    } catch (e) {
      console.warn('[IntentLauncher] Module missing', e)
      throw e
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────
type ViewerMode = 'loading' | 'downloading' | 'pdfjs' | 'gdocs' | 'unsupported' | 'error'

const MIME: Record<string, string> = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getExt(url: string): string {
  return url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? ''
}

function isLocalPath(url: string): boolean {
  if (!url) return false
  return url.startsWith('file://') || url.startsWith('/') || url.startsWith('content://')
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Path Alignment
// ─────────────────────────────────────────────────────────────────────────────
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
// PDF.js HTML — FIXED page layout
// ─────────────────────────────────────────────────────────────────────────────
function buildPdfJsHtml(base64: string, title?: string): string {
  const loadScript = `
    const bytes = new Uint8Array(atob('${base64}').split('').map(c => c.charCodeAt(0)));
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
  `
  return buildViewerHtml(loadScript, title)
}

function buildViewerHtml(loadScript: string, _title?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes"/>
  <style>
    :root {
      --bg: #0F172A;
      --surface: #1E293B;
      --border: #334155;
      --accent: #3B82F6;
      --hi: rgba(59,130,246,0.25);
    }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    html, body {
      width: 100%;
      height: 100%;
      background: var(--bg);
      overflow: hidden;
      font-family: -apple-system, system-ui, sans-serif;
    }

    /* ── Scrollable page container ── */
    #container {
      position: absolute;
      inset: 0;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 12px 8px 100px;
    }

    /*
     * PAGE LAYOUT FIX:
     * Each .page-wrap is sized explicitly by JS (width + height in px).
     * We do NOT use percentage widths or auto heights here — those cause
     * the canvas to collapse on image-based PDFs.
     * position:relative lets the text layer overlay the canvas correctly.
     */
    .page-wrap {
      position: relative;
      background: #ffffff;
      border-radius: 3px;
      overflow: hidden;
      /* Shadow gives depth */
      box-shadow: 0 4px 24px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.3);
      /* JS sets width + height explicitly — these are just fallbacks */
      width: 100%;
      flex-shrink: 0;
    }

    /* Skeleton while a page is waiting to render */
    .page-wrap.skeleton {
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .page-wrap.skeleton::after {
      content: '';
      width: 28px; height: 28px;
      border: 2.5px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    /*
     * CANVAS FIX:
     * canvas must fill its wrapper exactly.
     * Do NOT use width:100%/height:auto — that ignores the explicit pixel
     * dimensions set by JS and collapses image-based pages.
     * JS sets canvas.style.width and canvas.style.height in CSS pixels.
     */
    canvas {
      display: block;
      /* CSS pixel size set by JS; canvas.width/height = physical pixels */
    }

    /* Text layer — same size as canvas, transparent text for selection */
    .textLayer {
      position: absolute;
      left: 0; top: 0;
      /* JS sets width + height to match canvas CSS size */
      overflow: hidden;
      opacity: 0.25;
      line-height: 1;
      pointer-events: auto;
    }
    .textLayer > span {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: text;
      transform-origin: 0% 0%;
    }
    ::selection { background: var(--hi); }

    .highlight {
      position: absolute;
      background: rgba(255,220,0,0.45);
      pointer-events: none;
      z-index: 5;
      border-radius: 2px;
    }

    /* Full-screen loading splash */
    #loading-screen {
      position: fixed;
      inset: 0;
      background: var(--bg);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #94A3B8;
      gap: 18px;
      z-index: 200;
    }
    .loader-ring {
      width: 44px; height: 44px;
      border: 3px solid var(--surface);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.9s cubic-bezier(0.4,0,0.2,1) infinite;
    }
    #loading-screen span { font-size: 14px; font-weight: 600; }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* Night mode */
    body.night-mode { background: #020617; }
    body.night-mode #container { filter: invert(0.93) hue-rotate(180deg); }
    body.night-mode .page-wrap { background: #fff !important; }
  </style>
</head>
<body>

<div id="loading-screen">
  <div class="loader-ring"></div>
  <span>Opening document…</span>
</div>

<div id="container"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── State ───────────────────────────────────────────────────────────────────
let pdfDoc        = null;
let currentPage   = 1;
let currentZoom   = 1.0;
let lastZoom      = 1.0;
let currentRotation = 0;
let pageStates    = new Map(); // page -> 'pending'|'rendering'|'done'|'error'
let zoomTimeout   = null;

// The available render width in CSS pixels.
// Computed once from the container after layout — avoids stale innerWidth reads.
let renderWidth   = 0;

const container     = document.getElementById('container');
const loadingScreen = document.getElementById('loading-screen');

function post(data) {
  if (window.ReactNativeWebView)
    window.ReactNativeWebView.postMessage(JSON.stringify(data));
}

// ── Compute render width ────────────────────────────────────────────────────
// Called once after the DOM is ready. We subtract padding (8px each side = 16px).
function getRenderWidth() {
  if (renderWidth > 0) return renderWidth;
  // container padding is 8px each side
  renderWidth = (container.clientWidth || window.innerWidth) - 16;
  return renderWidth;
}

// ── Page rendering ──────────────────────────────────────────────────────────
async function renderPage(num) {
  if (pageStates.get(num) === 'rendering' || pageStates.get(num) === 'done') return;
  pageStates.set(num, 'rendering');

  const wrap = document.getElementById('pw_' + num);
  if (!wrap) return;

  try {
    const page      = await pdfDoc.getPage(num);

    // ── 1. Compute display dimensions ──────────────────────────────────────
    // Use scale=1 + rotation to get the natural page dimensions in PDF units.
    const naturalVP = page.getViewport({ scale: 1.0, rotation: currentRotation });

    // The CSS pixel width we want to fill (minus container padding).
    const availW    = getRenderWidth() * currentZoom;

    // Scale factor to fit page into availW, respecting aspect ratio.
    const fitScale  = availW / naturalVP.width;

    // CSS pixel dimensions of the rendered page.
    const cssW      = Math.floor(naturalVP.width  * fitScale);
    const cssH      = Math.floor(naturalVP.height * fitScale);

    // ── 2. Size the wrapper ────────────────────────────────────────────────
    // This must happen BEFORE canvas sizing so layout is stable.
    wrap.style.width    = cssW + 'px';
    wrap.style.height   = cssH + 'px';
    wrap.style.minHeight = 'unset'; // remove skeleton fallback

    // ── 3. Set up canvas ───────────────────────────────────────────────────
    // Canvas physical pixels = CSS pixels × DPR (for crisp rendering).
    // Canvas CSS size = logical CSS pixels (so it fits the wrapper).
    const dpr       = Math.min(window.devicePixelRatio || 1, 2); // cap at 2× to save memory
    const physW     = Math.floor(cssW * dpr);
    const physH     = Math.floor(cssH * dpr);

    // Memory guard — cap canvas at 16 MP
    let renderScale = fitScale * dpr;
    if (physW * physH > 16_777_216) {
      const shrink  = Math.sqrt(16_777_216 / (physW * physH));
      renderScale   = fitScale * dpr * shrink;
    }

    const renderVP  = page.getViewport({ scale: renderScale, rotation: currentRotation });

    let canvas      = wrap.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      wrap.insertBefore(canvas, wrap.firstChild);
    }

    // Physical pixels
    canvas.width        = renderVP.width;
    canvas.height       = renderVP.height;
    // CSS pixels — canvas fills wrapper exactly
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.display = 'block';

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: renderVP,
    }).promise;

    // ── 4. Text layer ──────────────────────────────────────────────────────
    // Use the CSS-pixel viewport for text positioning (not the DPR-scaled one).
    const textVP = page.getViewport({ scale: fitScale, rotation: currentRotation });

    let tLayer = wrap.querySelector('.textLayer');
    if (!tLayer) {
      tLayer = document.createElement('div');
      tLayer.className = 'textLayer';
      wrap.appendChild(tLayer);
    }
    tLayer.innerHTML    = '';
    tLayer.style.width  = cssW + 'px';
    tLayer.style.height = cssH + 'px';

    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    pdfjsLib.renderTextLayer({
      textContent,
      container:             tLayer,
      viewport:              textVP,
      enhanceTextSelection:  true,
    });

    wrap.classList.remove('skeleton');
    pageStates.set(num, 'done');

  } catch (e) {
    console.error('[pdfjs] page', num, e);
    pageStates.set(num, 'error');
    if (wrap) {
      wrap.classList.remove('skeleton');
      wrap.innerHTML = '<div style="color:#EF4444;padding:16px;font-size:12px">Page ' + num + ' failed to render</div>';
    }
  }
}

// ── Lazy rendering via IntersectionObserver ─────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) renderPage(parseInt(e.target.dataset.page));
  });
}, { root: container, rootMargin: '800px' });

// ── Re-render all visible pages (after zoom/rotate) ─────────────────────────
function reRenderAll() {
  // Reset render width so it's recalculated with new zoom
  renderWidth = 0;
  pageStates.clear();

  // Clear all canvases and text layers so stale content doesn't show
  container.querySelectorAll('.page-wrap').forEach(w => {
    const c = w.querySelector('canvas');
    if (c) c.remove();
    const t = w.querySelector('.textLayer');
    if (t) t.remove();
    w.classList.add('skeleton');
    // Reset explicit dimensions so renderPage recomputes them
    w.style.width = '';
    w.style.height = '';
  });

  container.querySelectorAll('.page-wrap').forEach(w => {
    const r = w.getBoundingClientRect();
    if (r.top < window.innerHeight + 800 && r.bottom > -800)
      renderPage(parseInt(w.dataset.page));
  });
}

function scrollToPage(num) {
  const el = document.getElementById('pw_' + num);
  if (el) container.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  try {
    ${loadScript}

    loadingTask.onProgress = (p) => {
      if (p.total > 0)
        post({ type: 'loadingProgress', percent: Math.round((p.loaded / p.total) * 100) });
    };

    pdfDoc = await loadingTask.promise;
    loadingScreen.style.display = 'none';

    // Create placeholder wrappers for every page
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const wrap = document.createElement('div');
      wrap.id          = 'pw_' + i;
      wrap.className   = 'page-wrap skeleton';
      wrap.dataset.page = String(i);
      // Give skeleton a reasonable minimum height so scroll works before render
      wrap.style.minHeight = '200px';
      wrap.style.width     = '100%';
      container.appendChild(wrap);
      observer.observe(wrap);
    }

    post({ type: 'pageInfo', total: pdfDoc.numPages });

    const outline = await pdfDoc.getOutline();
    if (outline && outline.length) post({ type: 'outline', data: outline });

  } catch (e) {
    loadingScreen.innerHTML =
      '<span style="color:#EF4444;padding:20px;text-align:center">Failed to open PDF:<br>' + e.message + '</span>';
    post({ type: 'error', message: e.message });
  }
}

// ── API exposed to React Native ──────────────────────────────────────────────
window.findText = (text, backward) =>
  window.find(text, false, !!backward, true, false, true, false);

window.setZoom = (z) => {
  currentZoom = z;
  clearTimeout(zoomTimeout);
  zoomTimeout = setTimeout(() => {
    lastZoom = currentZoom;
    reRenderAll();
  }, 150);
};

window.setRotation = (r) => {
  currentRotation = r;
  reRenderAll();
};

window.scrollToPage = scrollToPage;

window.setNightMode = (on) =>
  document.body.classList.toggle('night-mode', on);

window.addHighlight = (pageNum, rects) => {
  const wrap = document.getElementById('pw_' + pageNum);
  if (!wrap) return;
  rects.forEach(r => {
    const h = document.createElement('div');
    h.className    = 'highlight';
    h.style.left   = r.left   + 'px';
    h.style.top    = r.top    + 'px';
    h.style.width  = r.width  + 'px';
    h.style.height = r.height + 'px';
    wrap.appendChild(h);
  });
};

// ── Selection tracking ───────────────────────────────────────────────────────
document.onselectionchange = () => {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) {
    post({ type: 'selection', active: false });
    return;
  }
  const text = sel.toString().trim();
  if (!text) { post({ type: 'selection', active: false }); return; }
  const range = sel.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).map(r => ({
    top:    r.top    + container.scrollTop,
    left:   r.left   + container.scrollLeft,
    width:  r.width,
    height: r.height,
  }));
  post({ type: 'selection', active: true, rects, text });
};

// ── Scroll tracking ──────────────────────────────────────────────────────────
container.addEventListener('scroll', () => {
  for (const w of container.querySelectorAll('.page-wrap')) {
    const r = w.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.6 && r.bottom > 0) {
      const p = parseInt(w.dataset.page);
      if (p !== currentPage) {
        currentPage = p;
        post({ type: 'pageInfo', current: currentPage });
      }
      break;
    }
  }
}, { passive: true });

init();
</script>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// LoadingOverlay
// ─────────────────────────────────────────────────────────────────────────────
function LoadingOverlay({ color, label = 'Opening document…' }: { color: string; label?: string }) {
  const pulse = useRef(new RNAnimated.Value(0.5)).current
  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
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

// ─────────────────────────────────────────────────────────────────────────────
// ErrorState
// ─────────────────────────────────────────────────────────────────────────────
function ErrorState({ title, message, onRetry, onExternal }: {
  title: string; message: string; onRetry?: () => void; onExternal?: () => void
}) {
  return (
    <View style={errS.wrap}>
      <View style={errS.iconBox}><Ionicons name="alert-circle" size={48} color="#EF4444" /></View>
      <Text style={errS.title}>{title}</Text>
      <Text style={errS.message}>{message}</Text>
      <View style={errS.actions}>
        {onRetry && (
          <TouchableOpacity style={errS.btn} onPress={onRetry}>
            <Text style={errS.btnText}>Try Again</Text>
          </TouchableOpacity>
        )}
        {onExternal && (
          <TouchableOpacity style={[errS.btn, errS.btnOutline]} onPress={onExternal}>
            <Ionicons name="open-outline" size={16} color="#3B82F6" />
            <Text style={[errS.btnText, { color: '#3B82F6' }]}>Open Externally</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}
const errS = StyleSheet.create({
  wrap:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12, backgroundColor: '#0F172A' },
  iconBox:   { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EF444415', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  title:     { fontSize: 20, fontWeight: '800', color: '#F8FAFC', textAlign: 'center' },
  message:   { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  actions:   { width: '100%', gap: 12 },
  btn:       { backgroundColor: '#EF4444', height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  btnOutline:{ backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3B82F6' },
  btnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
})

// ─────────────────────────────────────────────────────────────────────────────
// OutlineModal
// ─────────────────────────────────────────────────────────────────────────────
function OutlineModal({ visible, data, onClose, onSelect }: {
  visible: boolean; data: any[]; onClose: () => void; onSelect: (page: number) => void
}) {
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
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: '#0F172A', borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: '50%', maxHeight: '80%', borderTopWidth: 1, borderTopColor: '#1E293B' },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  title:    { fontSize: 16, fontWeight: '700', color: '#F8FAFC' },
  scroll:   { padding: 10 },
  item:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  itemText: { color: '#E2E8F0', fontSize: 14, fontWeight: '500' },
  empty:    { color: '#64748B', textAlign: 'center', marginTop: 40, fontSize: 14 },
})

// ─────────────────────────────────────────────────────────────────────────────
// DocTypeBadge
// ─────────────────────────────────────────────────────────────────────────────
function DocTypeBadge({ ext }: { ext: string }) {
  const bg   = ext === 'pdf' ? '#EF444420' : '#3B82F620'
  const text = ext === 'pdf' ? '#EF4444'   : '#3B82F6'
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

// ─────────────────────────────────────────────────────────────────────────────
// ThumbnailScrubber
// ─────────────────────────────────────────────────────────────────────────────
function ThumbnailScrubber({ total, current, onSelect }: {
  total: number; current: number; onSelect: (p: number) => void
}) {
  const ref = useRef<ScrollView>(null)
  useEffect(() => {
    ref.current?.scrollTo({ x: (current - 1) * 50 - 100, animated: true })
  }, [current])
  return (
    <View style={scbS.wrap}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={scbS.content}>
        {Array.from({ length: total }).map((_, i) => {
          const p = i + 1
          const active = p === current
          return (
            <TouchableOpacity key={p} onPress={() => onSelect(p)} style={[scbS.item, active && scbS.activeItem]}>
              <Text style={[scbS.itemText, active && scbS.activeText]}>{p}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}
const scbS = StyleSheet.create({
  wrap:       { height: 50, backgroundColor: 'rgba(10,15,30,0.9)', borderTopWidth: 1, borderTopColor: '#1E293B' },
  content:    { paddingHorizontal: 20, alignItems: 'center' },
  item:       { width: 34, height: 34, borderRadius: 8, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#334155' },
  activeItem: { backgroundColor: '#3B82F6', borderColor: '#60A5FA' },
  itemText:   { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  activeText: { color: '#fff' },
})

// ─────────────────────────────────────────────────────────────────────────────
// SelectionToolbar
// ─────────────────────────────────────────────────────────────────────────────
function SelectionToolbar({ text, onHighlight, onCopy, onSearch, onClose }: {
  text: string; onHighlight: () => void; onCopy: () => void; onSearch: () => void; onClose: () => void
}) {
  return (
    <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={selS.wrap}>
      <View style={selS.header}>
        <Text style={selS.title} numberOfLines={1}>"{text}"</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={18} color="#94A3B8" /></TouchableOpacity>
      </View>
      <View style={selS.actions}>
        <TouchableOpacity style={selS.btn} onPress={onHighlight}>
          <Ionicons name="brush" size={18} color="#F59E0B" /><Text style={selS.btnText}>Highlight</Text>
        </TouchableOpacity>
        <TouchableOpacity style={selS.btn} onPress={onCopy}>
          <Ionicons name="copy-outline" size={18} color="#3B82F6" /><Text style={selS.btnText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={selS.btn} onPress={onSearch}>
          <Ionicons name="search-outline" size={18} color="#10B981" /><Text style={selS.btnText}>Search</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  )
}
const selS = StyleSheet.create({
  wrap:    { position: 'absolute', bottom: 120, left: 16, right: 16, backgroundColor: '#1E293B', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 8 },
  title:   { color: '#94A3B8', fontSize: 13, flex: 1, fontStyle: 'italic', marginRight: 10 },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  btn:     { alignItems: 'center', gap: 6, minWidth: 70 },
  btnText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700' },
})

// ─────────────────────────────────────────────────────────────────────────────
// PremiumGateModal
// ─────────────────────────────────────────────────────────────────────────────
function PremiumGateModal({ visible, action, onClose, onUpgrade }: {
  visible: boolean; action: string; onClose: () => void; onUpgrade: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen">
      <View style={prmS.overlay}>
        <View style={prmS.sheet}>
          <Ionicons name="star" size={32} color="#F59E0B" />
          <Text style={prmS.title}>Premium Feature</Text>
          <Text style={prmS.sub}>{action} requires Premium.</Text>
          <TouchableOpacity style={prmS.upgradeBtn} onPress={onUpgrade} activeOpacity={0.85}>
            <Text style={prmS.upgradeBtnText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity style={prmS.cancelBtn} onPress={onClose}>
            <Text style={prmS.cancelBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
const prmS = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: '#0F172A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 32, alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#1E293B' },
  title:          { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  sub:            { fontSize: 14, color: '#64748B', textAlign: 'center' },
  upgradeBtn:     { backgroundColor: '#F59E0B', borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center' },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  cancelBtn:      { paddingVertical: 12 },
  cancelBtnText:  { fontSize: 14, color: '#475569', fontWeight: '600' },
})

// ─────────────────────────────────────────────────────────────────────────────
// OfflineBanner
// ─────────────────────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={offS.bar}>
      <Ionicons name="cloud-offline-outline" size={14} color="#94A3B8" />
      <Text style={offS.text}>Viewing cached copy — offline</Text>
    </View>
  )
}
const offS = StyleSheet.create({
  bar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1E293B', paddingVertical: 6 },
  text: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
})

// ─────────────────────────────────────────────────────────────────────────────
// GoToPageModal — replaces Alert.prompt (not available on Android)
// ─────────────────────────────────────────────────────────────────────────────
function GoToPageModal({ visible, totalPages, currentPage, onClose, onGo }: {
  visible: boolean; totalPages: number; currentPage: number; onClose: () => void; onGo: (p: number) => void
}) {
  const [value, setValue] = useState('')
  useEffect(() => { if (visible) setValue(String(currentPage)) }, [visible, currentPage])

  function submit() {
    const n = parseInt(value, 10)
    if (n >= 1 && n <= totalPages) { onGo(n); onClose() }
    else Alert.alert('Invalid Page', `Enter a number between 1 and ${totalPages}.`)
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={gtS.overlay}>
        <View style={gtS.card}>
          <Text style={gtS.title}>Go to Page</Text>
          <Text style={gtS.sub}>1 – {totalPages}</Text>
          <TextInput
            style={gtS.input}
            keyboardType="number-pad"
            value={value}
            onChangeText={setValue}
            onSubmitEditing={submit}
            autoFocus
            selectTextOnFocus
          />
          <View style={gtS.row}>
            <TouchableOpacity style={gtS.cancelBtn} onPress={onClose}>
              <Text style={gtS.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={gtS.goBtn} onPress={submit}>
              <Text style={gtS.goText}>Go</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}
const gtS = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  card:      { backgroundColor: '#1E293B', borderRadius: 20, padding: 24, width: '100%', gap: 12, borderWidth: 1, borderColor: '#334155' },
  title:     { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  sub:       { fontSize: 13, color: '#64748B' },
  input:     { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 12, color: '#F8FAFC', fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 12, textAlign: 'center' },
  row:       { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  cancelText:{ color: '#94A3B8', fontWeight: '700', fontSize: 15 },
  goBtn:     { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
  goText:    { color: '#fff', fontWeight: '800', fontSize: 15 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Main ViewerScreen
// ─────────────────────────────────────────────────────────────────────────────
export default function ViewerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{
    file_url?: string; title?: string; color?: string; material_id?: string; is_local?: string
  }>()

  const { isPremium } = usePremium()

  // All hooks before any early return
  const [showPremModal,  setShowPremModal]  = useState(false)
  const [premAction,     setPremAction]     = useState('')
  const [isOffline,      setIsOffline]      = useState(false)
  const [isLoading,      setIsLoading]      = useState(true)
  const [retryCount,     setRetryCount]     = useState(0)
  const [mode,           setMode]           = useState<ViewerMode>('loading')
  const [downloadLabel,  setDownloadLabel]  = useState('Downloading…')
  const [htmlSource,     setHtmlSource]     = useState<string | null>(null)
  const [viewerUrl,      setViewerUrl]      = useState<string | null>(null)
  const [currentPage,    setCurrentPage]    = useState(1)
  const [totalPages,     setTotalPages]     = useState(0)
  const [isSearching,    setIsSearching]    = useState(false)
  const [searchQuery,    setSearchQuery]    = useState('')
  const [outline,        setOutline]        = useState<any[]>([])
  const [showOutline,    setShowOutline]    = useState(false)
  const [zoom,           setZoom]           = useState(1.0)
  const [rotation,       setRotation]       = useState(0)
  const [isNightMode,    setIsNightMode]    = useState(false)
  const [showGoToPage,   setShowGoToPage]   = useState(false)
  const [selection,      setSelection]      = useState<{ active: boolean; rects: any[]; text: string }>(
    { active: false, rects: [], text: '' }
  )

  const loadingProgress = useRef(new RNAnimated.Value(0)).current
  const webviewRef      = useRef<WebView>(null)
  const accent          = params.color || '#1A56DB'
  const ext             = getExt(params.file_url || '')

  // Network listener
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => setIsOffline(!state.isConnected))
    return () => unsub()
  }, [])

  // Main load effect
  useEffect(() => {
    if (!params.file_url) return

    ;(async () => {
      try {
        const materialId = params.material_id || 'temp'
        const cachePath  = getCachePath(materialId, params.file_url!)

        // 1. Cache check
        const cached: any = await FileSystem.getInfoAsync(cachePath).catch(() => ({ exists: false, size: 0, uri: '' }))
        let localUri: string

        if (cached.exists && (cached.size ?? 0) > 512) {
          localUri = cached.uri as string
        } else if (isLocalPath(params.file_url!)) {
          localUri = params.file_url!.startsWith('file://') ? params.file_url! : `file://${params.file_url!}`
        } else {
          // 2. Download natively — bypasses Supabase CORS entirely
          setMode('downloading')
          setDownloadLabel('Downloading file…')
          localUri = await downloadToCache(params.file_url!, cachePath)
        }

        // 3. Validate
        const info: any = await FileSystem.getInfoAsync(localUri).catch(() => ({ exists: false, size: 0 }))
        if (!info.exists)               throw new Error('File not found after download')
        if ((info.size ?? 0) < 512)     throw new Error('File appears empty or download failed')
        if ((info.size ?? 0) > 20 * 1024 * 1024) throw new Error(`File too large: ${Math.round(info.size / 1024 / 1024)} MB`)

        // 4. Build viewer
        if (ext === 'pdf') {
          setDownloadLabel('Preparing viewer…')
          const safePath = localUri.startsWith('file://') ? localUri : `file://${localUri}`
          const b64 = await FileSystem.readAsStringAsync(safePath, {
            encoding: FileSystem.EncodingType.Base64,
          })
          if (!b64 || b64.length < 100) throw new Error('Could not read PDF data')
          setHtmlSource(buildPdfJsHtml(b64, params.title || 'Document'))
          setMode('pdfjs')
        } else {
          if (isLocalPath(params.file_url!)) throw new Error('Office docs require the Google Docs online viewer')
          const encoded = encodeURIComponent(params.file_url!)
          setViewerUrl(`https://docs.google.com/viewer?url=${encoded}&embedded=true`)
          setMode('gdocs')
        }
      } catch (e: any) {
        console.error('[Viewer]', e)
        setMode('error')
        const msg = e.message ?? ''
        Alert.alert(
          'Could Not Open File',
          msg.includes('large')  ? `Too large for in-app viewer (${msg.match(/[\d.]+ MB/)?.[0] ?? ''}). Try opening externally.`
          : msg.includes('HTTP') ? `Download failed. Check your connection.\n\n${msg}`
          : msg.includes('empty')? 'File appears empty. The link may have expired.'
          : msg.includes('found')? 'File not found. The link may have expired.'
          : `Could not open document.\n${msg}`,
          [{ text: 'OK' }]
        )
      }
    })()
  }, [params.file_url, params.material_id, params.title, ext, retryCount])

  // Handlers
  const openExternally = async (filePath: string, fileExt: string) => {
    if (!isPremium) { setPremAction('Open file externally'); setShowPremModal(true); return }
    const mime = MIME[fileExt] ?? 'application/octet-stream'
    try {
      if (Platform.OS === 'android') {
        const cu = await FileSystem.getContentUriAsync(filePath)
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: cu, flags: 1, type: mime })
      } else {
        await Sharing.shareAsync(filePath, { mimeType: mime })
      }
    } catch { Alert.alert('External Open Failed', 'Could not open with an external app.') }
  }

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data)
      if (msg.type === 'pageInfo') {
        if (msg.current) setCurrentPage(msg.current)
        if (msg.total)   setTotalPages(msg.total)
      } else if (msg.type === 'loadingProgress') {
        RNAnimated.timing(loadingProgress, { toValue: msg.percent, duration: 200, useNativeDriver: false }).start()
      } else if (msg.type === 'outline') {
        setOutline(msg.data)
      } else if (msg.type === 'selection') {
        setSelection({ active: msg.active, rects: msg.rects || [], text: msg.text || '' })
      } else if (msg.type === 'error') {
        setMode('error')
      }
    } catch {}
  }

  function inject(js: string) { webviewRef.current?.injectJavaScript(js + ';true;') }

  function handleSearch(text: string) {
    setSearchQuery(text)
    if (text.length > 1) inject(`window.findText('${text.replace(/'/g, "\\'")}')`)
  }

  function handleZoom(delta: number) {
    const next = Math.max(0.5, Math.min(3.0, zoom + delta))
    setZoom(next)
    inject(`window.setZoom(${next})`)
  }

  function handleRotate() {
    const next = (rotation + 90) % 360
    setRotation(next)
    inject(`window.setRotation(${next})`)
  }

  // Early return guard — AFTER all hooks
  if (!params.file_url) {
    return (
      <ErrorState
        title="Invalid File"
        message="No file URL was provided. Please try opening the file again."
        onExternal={() => router.back()}
      />
    )
  }

  const webSrc = htmlSource ? { html: htmlSource } : viewerUrl ? { uri: viewerUrl } : undefined

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#E2E8F0" />
        </TouchableOpacity>

        {isSearching ? (
          <View style={S.searchContainer}>
            <TextInput
              style={S.searchInput}
              placeholder="Find text…"
              placeholderTextColor="#94A3B8"
              autoFocus
              value={searchQuery}
              onChangeText={handleSearch}
              onSubmitEditing={() => inject(`window.findText('${searchQuery.replace(/'/g, "\\'")}', false)`)}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => inject(`window.findText('${searchQuery.replace(/'/g, "\\'")}', true)`)} style={S.searchAction}>
              <Ionicons name="chevron-up" size={18} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => inject(`window.findText('${searchQuery.replace(/'/g, "\\'")}', false)`)} style={S.searchAction}>
              <Ionicons name="chevron-down" size={18} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery('') }} style={S.searchAction}>
              <Ionicons name="close" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={S.headerCenter}>
              <View style={S.titleRow}>
                <DocTypeBadge ext={ext} />
                <Text style={S.headerTitle} numberOfLines={1}>{params.title || 'Document'}</Text>
              </View>
            </View>
            <View style={S.headerActions}>
              <TouchableOpacity style={S.headerBtn} onPress={() => setIsSearching(true)}>
                <Ionicons name="search-outline" size={18} color="#94A3B8" />
              </TouchableOpacity>
              <TouchableOpacity style={S.headerBtn} onPress={() => { const next = !isNightMode; setIsNightMode(next); inject(`window.setNightMode(${next})`) }}>
                <Ionicons name={isNightMode ? 'sunny' : 'moon-outline'} size={18} color={isNightMode ? '#F59E0B' : '#94A3B8'} />
              </TouchableOpacity>
              <TouchableOpacity style={S.headerBtn} onPress={() => openExternally(params.file_url!, ext)}>
                <Ionicons name="share-outline" size={18} color="#94A3B8" />
              </TouchableOpacity>
              {outline.length > 0 && (
                <TouchableOpacity style={S.headerBtn} onPress={() => setShowOutline(true)}>
                  <Ionicons name="list" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>

      {/* Progress bar — RNAnimated.View only, no Reanimated mixing */}
      <View style={S.progressContainer}>
        <RNAnimated.View style={[S.progressBar, {
          backgroundColor: accent,
          width:   loadingProgress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          opacity: loadingProgress.interpolate({ inputRange: [0, 99, 100], outputRange: [1, 1, 0] }),
        }]} />
      </View>

      {isOffline && <OfflineBanner />}

      {/* Content */}
      <View style={S.content}>
        {(mode === 'loading' || mode === 'downloading') && (
          <LoadingOverlay color={accent} label={mode === 'downloading' ? downloadLabel : 'Opening document…'} />
        )}

        {mode === 'error' && (
          <ErrorState
            title="Could Not Open File"
            message="The document could not be loaded. It may be corrupted, the link may have expired, or you may be offline."
            onRetry={() => {
              if (retryCount < 3) {
                setMode('loading'); setHtmlSource(null); setViewerUrl(null)
                loadingProgress.setValue(0); setRetryCount(c => c + 1)
              } else {
                openExternally(params.file_url!, ext)
              }
            }}
            onExternal={() => openExternally(params.file_url!, ext)}
          />
        )}

        {mode === 'unsupported' && (
          <ErrorState
            title="External App Needed"
            message="This file type works best in a native app (Word, Acrobat, etc.)."
            onExternal={() => openExternally(params.file_url!, ext)}
          />
        )}

        {webSrc && mode !== 'unsupported' && mode !== 'error' && (
          <WebView
            ref={webviewRef}
            source={webSrc}
            style={S.webview}
            onMessage={onMessage}
            onLoadEnd={() => setIsLoading(false)}
            onError={s => { console.error('[WebView]', s.nativeEvent); setMode('error') }}
            bounces={false}
            scrollEnabled={false}
            javaScriptEnabled
            domStorageEnabled
            allowUniversalAccessFromFileURLs
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            // Needed so the WebView reports correct dimensions on Android
            androidLayerType="hardware"
          />
        )}

        {selection.active && selection.text.length > 0 && (
          <SelectionToolbar
            text={selection.text}
            onHighlight={() => {
              inject(`window.addHighlight(${currentPage}, ${JSON.stringify(selection.rects)}); window.getSelection().removeAllRanges()`)
              setSelection({ active: false, rects: [], text: '' })
            }}
            onCopy={async () => {
              await Clipboard.setStringAsync(selection.text)
              setSelection({ active: false, rects: [], text: '' })
              inject(`window.getSelection().removeAllRanges()`)
              Alert.alert('Copied', 'Selection copied to clipboard.')
            }}
            onSearch={() => {
              setIsSearching(true); handleSearch(selection.text)
              setSelection({ active: false, rects: [], text: '' })
              inject(`window.getSelection().removeAllRanges()`)
            }}
            onClose={() => {
              setSelection({ active: false, rects: [], text: '' })
              inject(`window.getSelection().removeAllRanges()`)
            }}
          />
        )}
      </View>

      {/* Bottom toolbar — PDF only */}
      {mode === 'pdfjs' && !isLoading && totalPages > 0 && (
        <>
          <ThumbnailScrubber
            total={totalPages}
            current={currentPage}
            onSelect={p => inject(`window.scrollToPage(${p})`)}
          />
          <View style={[S.toolbar, { paddingBottom: insets.bottom + 10 }]}>
            <View style={S.pillGroup}>
              <TouchableOpacity onPress={() => handleZoom(-0.25)} style={S.pillBtn}>
                <Ionicons name="remove" size={16} color="#94A3B8" />
              </TouchableOpacity>
              <Text style={S.pillText}>{Math.round(zoom * 100)}%</Text>
              <TouchableOpacity onPress={() => handleZoom(0.25)} style={S.pillBtn}>
                <Ionicons name="add" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={S.navGroup}>
              <TouchableOpacity onPress={() => inject(`window.scrollToPage(${Math.max(1, currentPage - 1)})`)} style={S.navArrow}>
                <Ionicons name="chevron-back" size={24} color="#F8FAFC" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowGoToPage(true)} style={S.pagePill}>
                <Text style={S.pageNum}>{currentPage} / {totalPages}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => inject(`window.scrollToPage(${Math.min(totalPages, currentPage + 1)})`)} style={S.navArrow}>
                <Ionicons name="chevron-forward" size={24} color="#F8FAFC" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleRotate} style={S.utilBtn}>
              <Ionicons name="reload" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Modals */}
      <OutlineModal visible={showOutline} data={outline} onClose={() => setShowOutline(false)}
        onSelect={p => { setShowOutline(false); inject(`window.scrollToPage(${p})`) }} />

      <PremiumGateModal visible={showPremModal} action={premAction}
        onClose={() => setShowPremModal(false)}
        onUpgrade={() => { setShowPremModal(false); router.push('/subscription' as any) }} />

      <GoToPageModal visible={showGoToPage} totalPages={totalPages} currentPage={currentPage}
        onClose={() => setShowGoToPage(false)}
        onGo={p => inject(`window.scrollToPage(${p})`)} />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:             { flex: 1, backgroundColor: '#0F172A' },
  header:           { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn:          { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  headerCenter:     { flex: 1, paddingLeft: 8 },
  titleRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:      { fontSize: 14, fontWeight: '700', color: '#E2E8F0', flex: 1 },
  headerBtn:        { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerActions:    { flexDirection: 'row', gap: 2 },
  searchContainer:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 12, marginLeft: 12, paddingLeft: 12, height: 44, borderWidth: 1, borderColor: '#334155' },
  searchInput:      { flex: 1, color: '#F8FAFC', fontSize: 13, height: '100%', fontWeight: '500' },
  searchAction:     { paddingHorizontal: 10, height: '100%', justifyContent: 'center' },
  progressContainer:{ height: 2, backgroundColor: 'rgba(255,255,255,0.02)' },
  progressBar:      { height: '100%' },
  content:          { flex: 1, position: 'relative' },
  webview:          { flex: 1, backgroundColor: '#0F172A' },
  toolbar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0F172A', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#1E293B' },
  pillGroup:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 12, paddingHorizontal: 4 },
  pillBtn:          { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  pillText:         { color: '#94A3B8', fontSize: 11, fontWeight: '800', width: 38, textAlign: 'center' },
  navGroup:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navArrow:         { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  pagePill:         { backgroundColor: '#1E293B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#334155' },
  pageNum:          { color: '#F8FAFC', fontWeight: '800', fontSize: 13 },
  utilBtn:          { width: 44, height: 44, borderRadius: 14, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
})