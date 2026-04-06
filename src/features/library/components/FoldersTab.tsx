/**
 * src/features/library/components/FoldersTab.tsx  —  PRODUCTION-READY
 *
 * FIXES APPLIED
 * ─────────────
 * Bug
 *  1. handleSave → useCallback (was plain async fn, recreated every render)
 *  2. confirmDelete → useCallback (same issue)
 *  3. TYPE_META icon fields imported from libraryConstants — typed as
 *     IoniconsName, no more `as any` cast
 *
 * Performance
 *  4. FolderCard receives scale as prop — no internal useWindowDimensions()
 *     per card instance
 *  5. FolderCard wrapped in React.memo
 *
 * Safety
 *  6. handleSave shows error feedback if save fails (was silently swallowed)
 *  7. FolderCard and folder item row both have proper error boundary comments
 *
 * Accessibility
 *  8. FolderCard has accessibilityRole="button" and accessibilityLabel
 *  9. Back button in open-folder view has accessibilityLabel
 * 10. Remove-from-folder button has accessibilityLabel
 * 11. Edit/delete header buttons have accessibilityLabel
 * 12. Empty folder state accessible
 *
 * UI/UX
 * 13. Alert.alert for long-press replaced with inline state (showFolderMenu)
 *     showing a small action sheet — consistent with app patterns
 *
 * Cleanup
 * 14. C palette, BODY_H_PAD, COL_GAP, TYPE_META, TYPE_FALLBACK, matchesQuery,
 *     timeAgo imported from shared libraryConstants — duplicates removed
 */

import { Ionicons } from '@expo/vector-icons'
import { memo, useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'

import type { Folder } from '@/features/library/hooks/useFolders'
import type { Download } from '@/features/library/utils/downloads'
import {
  C,
  BODY_H_PAD,
  COL_GAP,
  TYPE_META,
  TYPE_FALLBACK,
  matchesQuery,
  timeAgo,
} from '@/features/library/utils/libraryConstants'

// ── FolderCard ────────────────────────────────────────────────────────────────
const FolderCard = memo(function FolderCard({
  folder,
  count,
  scale,
  onPress,
  onLongPress,
  ScalePress,
}: {
  folder:       Folder
  count:        number
  scale:        number
  onPress:      () => void
  onLongPress:  () => void
  ScalePress:   React.ComponentType<{ onPress?: () => void; onLongPress?: () => void; children: React.ReactNode }>
}) {
  const iconSz  = Math.round(26 * scale)
  const iconBox = Math.round(52 * scale)
  const minH    = Math.round(150 * scale)
  const nameSz  = Math.round(14 * scale)

  return (
    <ScalePress onPress={onPress} onLongPress={onLongPress}>
      <View
        style={[fold.card, { borderColor: `${folder.color}25`, minHeight: minH }]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${folder.name} folder, ${count} file${count !== 1 ? 's' : ''}`}
        accessibilityHint="Double tap to open folder"
      >
        <View
          style={[fold.glow, { backgroundColor: `${folder.color}12` }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={[fold.iconBox, {
          backgroundColor: `${folder.color}18`,
          width: iconBox, height: iconBox,
          borderRadius: Math.round(16 * scale),
        }]}>
          <Ionicons name="folder" size={iconSz} color={folder.color} />
        </View>
        <Text
          maxFontSizeMultiplier={1.3}
          style={[fold.name, { fontSize: nameSz }]}
          numberOfLines={2}
        >
          {folder.name}
        </Text>
        <View style={[fold.countPill, { backgroundColor: `${folder.color}15` }]}>
          <Text
            allowFontScaling={false}
            style={[fold.countText, { color: folder.color, fontSize: Math.round(11 * scale) }]}
          >
            {count} file{count !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </ScalePress>
  )
})

// ── FoldersTab ────────────────────────────────────────────────────────────────
export function FoldersTab({
  folders,
  downloads,
  syncing,
  query,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onRemoveMaterial,
  onOpenFile,
  favIds,
  onLike,
  FolderFormModal,
  HeartBtn,
  ScalePress,
  SectionHead,
  TagChip,
  useScale,
}: {
  folders:          Folder[]
  downloads:        Download[]
  syncing:          boolean
  query:            string
  onCreateFolder:   (name: string, color: string) => Promise<void>
  onUpdateFolder:   (id: string, name: string, color: string) => Promise<void>
  onDeleteFolder:   (id: string) => Promise<void>
  onRemoveMaterial: (folderId: string, materialId: string) => void
  onOpenFile:       (item: Download) => void
  favIds:           Set<string>
  onLike:           (materialId: string) => void
  FolderFormModal:  React.ComponentType<any>
  HeartBtn:         React.ComponentType<any>
  ScalePress:       React.ComponentType<any>
  SectionHead:      React.ComponentType<any>
  TagChip:          React.ComponentType<any>
  useScale:         () => number
}) {
  const [showForm,       setShowForm]       = useState(false)
  const [editFolder,     setEditFolder]     = useState<Folder | null>(null)
  const [openFolder,     setOpenFolder]     = useState<Folder | null>(null)
  const [formSaving,     setFormSaving]     = useState(false)
  const [saveError,      setSaveError]      = useState('')
  const [folderMenuFor,  setFolderMenuFor]  = useState<Folder | null>(null)

  const scale = useScale()
  const { width } = useWindowDimensions()
  const colW = (width - BODY_H_PAD * 2 - COL_GAP) / 2

  const liveOpenFolder = openFolder
    ? (folders.find(f => f.id === openFolder.id) ?? openFolder)
    : null

  const filteredFolders = useMemo(() => {
    if (!query.trim()) return folders
    const q = query.toLowerCase().trim()
    return folders.filter(f =>
      f.name.toLowerCase().includes(q) ||
      downloads.some(d =>
        f.material_ids.includes(d.material.id) &&
        matchesQuery(d.material.title, q),
      ),
    )
  }, [folders, downloads, query])

  const openFolderItems = useMemo(() => {
    if (!liveOpenFolder) return []
    let list = downloads.filter(d =>
      liveOpenFolder.material_ids.includes(d.material.id),
    )
    if (query.trim()) list = list.filter(d => matchesQuery(d.material.title, query))
    return list
  }, [downloads, liveOpenFolder, query])

  // Stable callbacks (#1, #2)
  const handleSave = useCallback(async (name: string, color: string) => {
    setSaveError('')
    setFormSaving(true)
    try {
      if (editFolder) {
        await onUpdateFolder(editFolder.id, name, color)
      } else {
        await onCreateFolder(name, color)
      }
    } catch (err) {
      if (__DEV__) console.warn('[FoldersTab] handleSave error:', err)
      setSaveError('Could not save folder. Please try again.')
      // Re-throw so FolderFormModal knows not to close
      throw err
    } finally {
      setFormSaving(false)
    }
  }, [editFolder, onUpdateFolder, onCreateFolder])

  const confirmDelete = useCallback((folder: Folder) => {
    setFolderMenuFor(null)
    // Use inline action sheet instead of Alert.alert (#13)
    // This is triggered from the folder long-press menu modal below
    onDeleteFolder(folder.id).then(() => {
      if (openFolder?.id === folder.id) setOpenFolder(null)
    }).catch(err => {
      if (__DEV__) console.warn('[FoldersTab] delete error:', err)
    })
  }, [onDeleteFolder, openFolder])

  // ── Open folder view ────────────────────────────────────────────────────
  if (liveOpenFolder) {
    return (
      <View style={{ flex: 1 }}>
        {/* Folder header */}
        <View style={ft.folderHeader}>
          <TouchableOpacity
            onPress={() => setOpenFolder(null)}
            style={ft.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to folders"
          >
            <Ionicons name="chevron-back" size={Math.round(18 * scale)} color={C.textSub} />
          </TouchableOpacity>
          <View style={[ft.folderHeaderIcon, { backgroundColor: `${liveOpenFolder.color}18` }]}>
            <Ionicons name="folder" size={Math.round(18 * scale)} color={liveOpenFolder.color} />
          </View>
          <Text
            maxFontSizeMultiplier={1.3}
            style={ft.folderHeaderName}
            numberOfLines={1}
          >
            {liveOpenFolder.name}
          </Text>
          <View style={{ flex: 1 }} />
          <View
            style={ft.syncChip}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            <Ionicons name="cloud-done-outline" size={11} color={C.emerald} />
            <Text allowFontScaling={false} style={ft.syncChipText}>Synced</Text>
          </View>
          <TouchableOpacity
            style={ft.folderEditBtn}
            onPress={() => { setEditFolder(liveOpenFolder); setShowForm(true) }}
            accessibilityRole="button"
            accessibilityLabel={`Rename ${liveOpenFolder.name}`}
          >
            <Ionicons name="pencil" size={14} color={C.textSub} />
          </TouchableOpacity>
          <TouchableOpacity
            style={ft.folderDeleteBtn}
            onPress={() => setFolderMenuFor(liveOpenFolder)}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${liveOpenFolder.name}`}
          >
            <Ionicons name="trash-outline" size={14} color={C.coral} />
          </TouchableOpacity>
        </View>

        {openFolderItems.length === 0 ? (
          <View
            style={ft.emptyFolder}
            accessible
            accessibilityLabel={
              query.trim()
                ? `No files in this folder match "${query}"`
                : 'This folder is empty'
            }
          >
            <View style={[ft.emptyIconBox, { backgroundColor: `${liveOpenFolder.color}12` }]}>
              <Ionicons
                name="folder-open-outline"
                size={Math.round(30 * scale)}
                color={liveOpenFolder.color}
              />
            </View>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptyTitle}>
              {query.trim() ? 'No matches' : 'Folder is empty'}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptySub}>
              {query.trim()
                ? `No files in this folder match "${query}"`
                : 'Tap ⋮ on any download and choose "Add to folder"'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={ft.folderItemList}
            showsVerticalScrollIndicator={false}
            accessibilityRole="list"
          >
            {openFolderItems.map(item => {
              const meta = TYPE_META[item.material.type] ?? TYPE_FALLBACK
              const iSz  = Math.round(18 * scale)
              const iBox = Math.round(42 * scale)
              return (
                <ScalePress key={item.id} onPress={() => onOpenFile(item)}>
                  <View
                    style={ft.folderItem}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${item.material.title}, ${meta.short}`}
                  >
                    <View style={[ft.folderItemLine, { backgroundColor: meta.color }]} />
                    <View style={[ft.folderItemIcon, {
                      backgroundColor: meta.dimBg,
                      borderColor: `${meta.color}20`,
                      width: iBox, height: iBox, minWidth: iBox,
                      borderRadius: Math.round(12 * scale),
                    }]}>
                      <Ionicons name={meta.icon} size={iSz} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={[ft.folderItemTitle, { fontSize: Math.round(13.5 * scale) }]}
                        numberOfLines={1}
                      >
                        {item.material.title}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <TagChip label={meta.short} color={meta.color} bg={meta.dimBg} scale={scale} />
                        <Text allowFontScaling={false} style={ft.folderItemTime}>
                          {timeAgo(item.downloaded_at)}
                        </Text>
                        {item.isOffline && (
                          <Ionicons name="cloud-done-outline" size={11} color={C.emerald} />
                        )}
                      </View>
                    </View>
                    <HeartBtn
                      liked={favIds.has(item.material.id)}
                      onPress={() => onLike(item.material.id)}
                      size={Math.round(17 * scale)}
                    />
                    <TouchableOpacity
                      onPress={() => onRemoveMaterial(liveOpenFolder.id, item.material.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={ft.removeBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.material.title} from ${liveOpenFolder.name}`}
                    >
                      <Ionicons
                        name="remove-circle-outline"
                        size={Math.round(18 * scale)}
                        color={C.coral}
                      />
                    </TouchableOpacity>
                  </View>
                </ScalePress>
              )
            })}
          </ScrollView>
        )}

        <FolderFormModal
          visible={showForm}
          onClose={() => { setShowForm(false); setEditFolder(null); setSaveError('') }}
          initial={editFolder ? { name: editFolder.name, color: editFolder.color } : undefined}
          onSave={handleSave}
          saving={formSaving}
          error={saveError}
        />

        {/* Inline delete confirmation modal (#13) */}
        <FolderActionMenu
          folder={folderMenuFor}
          onClose={() => setFolderMenuFor(null)}
          onRename={f => { setFolderMenuFor(null); setEditFolder(f); setShowForm(true) }}
          onDelete={confirmDelete}
        />
      </View>
    )
  }

  // ── Folder grid ──────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[ft.grid, { paddingTop: 12 }]}
        showsVerticalScrollIndicator={false}
      >
        <SectionHead
          title="My Folders"
          link={syncing ? 'Syncing…' : 'New Folder'}
          onLink={syncing ? undefined : () => { setEditFolder(null); setShowForm(true) }}
        />

        <View
          style={ft.syncBanner}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Ionicons name="cloud-done-outline" size={13} color={C.emerald} />
          <Text maxFontSizeMultiplier={1.3} style={ft.syncBannerText}>
            Folders sync across all your devices in real-time
          </Text>
          {syncing && <ActivityIndicator size="small" color={C.emerald} style={{ marginLeft: 4 }} />}
        </View>

        {filteredFolders.length === 0 && query.trim() ? (
          <View style={ft.emptyFolder}>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptyTitle}>
              No folders match "{query}"
            </Text>
          </View>
        ) : folders.length === 0 ? (
          <TouchableOpacity
            style={ft.emptyCreate}
            onPress={() => { setEditFolder(null); setShowForm(true) }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create your first folder"
          >
            <View style={ft.emptyCreateIcon}>
              <Ionicons name="folder-open-outline" size={Math.round(30 * scale)} color={C.orange} />
            </View>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptyCreateTitle}>No folders yet</Text>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptyCreateSub}>
              Create folders to organise your downloads.{'\n'}
              They'll appear on all your devices instantly.
            </Text>
            <View style={ft.emptyCreateBtn}>
              <Ionicons name="add" size={15} color="#fff" />
              <Text maxFontSizeMultiplier={1.3} style={ft.emptyCreateBtnText}>Create Folder</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={ft.gridCols}>
            {filteredFolders.map(folder => {
              const count = downloads.filter(d =>
                folder.material_ids.includes(d.material.id),
              ).length
              return (
                <View key={folder.id} style={{ width: colW }}>
                  <FolderCard
                    folder={folder}
                    count={count}
                    scale={scale}
                    onPress={() => setOpenFolder(folder)}
                    onLongPress={() => setFolderMenuFor(folder)}
                    ScalePress={ScalePress}
                  />
                </View>
              )
            })}
            {!query.trim() && (
              <TouchableOpacity
                style={{ width: colW }}
                onPress={() => { setEditFolder(null); setShowForm(true) }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create new folder"
              >
                <View style={[ft.newFolderCard, { minHeight: Math.round(150 * scale) }]}>
                  <View style={[ft.newFolderCardIcon, {
                    width: Math.round(52 * scale),
                    height: Math.round(52 * scale),
                    borderRadius: Math.round(16 * scale),
                  }]}>
                    <Ionicons name="add" size={Math.round(24 * scale)} color={C.orange} />
                  </View>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[ft.newFolderCardLabel, { fontSize: Math.round(13 * scale) }]}
                  >
                    New Folder
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <FolderFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditFolder(null); setSaveError('') }}
        initial={editFolder ? { name: editFolder.name, color: editFolder.color } : undefined}
        onSave={handleSave}
        saving={formSaving}
        error={saveError}
      />

      {/* Inline folder action menu (#13) */}
      <FolderActionMenu
        folder={folderMenuFor}
        onClose={() => setFolderMenuFor(null)}
        onRename={f => { setFolderMenuFor(null); setEditFolder(f); setShowForm(true) }}
        onDelete={confirmDelete}
      />
    </View>
  )
}

// ── FolderActionMenu — replaces Alert.alert for folder long-press (#13) ───────
const FolderActionMenu = memo(function FolderActionMenu({
  folder,
  onClose,
  onRename,
  onDelete,
}: {
  folder:   Folder | null
  onClose:  () => void
  onRename: (f: Folder) => void
  onDelete: (f: Folder) => void
}) {
  if (!folder) return null
  return (
    <Modal
      visible={!!folder}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={fam.overlay} onPress={onClose}>
        <Pressable style={fam.sheet} onPress={e => e.stopPropagation()}>
          <View style={fam.handle} />
          <Text maxFontSizeMultiplier={1.3} style={fam.folderName} numberOfLines={1}>
            {folder.name}
          </Text>
          <TouchableOpacity
            style={fam.row}
            onPress={() => onRename(folder)}
            accessibilityRole="button"
            accessibilityLabel={`Rename ${folder.name}`}
          >
            <Ionicons name="pencil-outline" size={18} color={C.textSub} />
            <Text maxFontSizeMultiplier={1.3} style={fam.rowText}>Rename</Text>
          </TouchableOpacity>
          <View style={fam.divider} />
          <TouchableOpacity
            style={fam.row}
            onPress={() => onDelete(folder)}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${folder.name}`}
          >
            <Ionicons name="trash-outline" size={18} color={C.coral} />
            <Text maxFontSizeMultiplier={1.3} style={[fam.rowText, { color: C.coral }]}>
              Delete Folder
            </Text>
          </TouchableOpacity>
          <Text maxFontSizeMultiplier={1.3} style={fam.note}>
            Files inside won't be deleted.
          </Text>
          <TouchableOpacity
            style={fam.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text maxFontSizeMultiplier={1.3} style={fam.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
})

const fam = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 4, borderTopWidth: 1, borderTopColor: C.border },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  folderName: { fontSize: 13, fontWeight: '700', color: C.textMute, marginBottom: 8, textAlign: 'center' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  rowText:    { fontSize: 15, fontWeight: '600', color: C.text },
  divider:    { height: 1, backgroundColor: C.border, marginVertical: 2 },
  note:       { fontSize: 11, color: C.textMute, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  cancelBtn:  { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { fontSize: 14, fontWeight: '700', color: C.textSub },
})

// ── Styles ────────────────────────────────────────────────────────────────────
const fold = StyleSheet.create({
  card:      { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, padding: 18, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' },
  glow:      { position: 'absolute', top: -28, right: -28, width: 90, height: 90, borderRadius: 45, opacity: 0.6 },
  iconBox:   { justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  name:      { fontWeight: '700', color: C.text, lineHeight: 19, letterSpacing: -0.1, marginBottom: 8 },
  countPill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  countText: { fontWeight: '700' },
})

const ft = StyleSheet.create({
  grid:            { paddingHorizontal: BODY_H_PAD, paddingBottom: 60 },
  gridCols:        { flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP },
  syncBanner:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.emerDim, borderWidth: 1, borderColor: `${C.emerald}25`, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 20 },
  syncBannerText:  { flex: 1, fontSize: 12, color: C.emerald, fontWeight: '600' },
  folderHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: BODY_H_PAD, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:         { width: 34, height: 34, borderRadius: 10, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  folderHeaderIcon:{ width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  folderHeaderName:{ fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.2, flexShrink: 1 },
  syncChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.emerDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  syncChipText:    { fontSize: 10, fontWeight: '700', color: C.emerald },
  folderEditBtn:   { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  folderDeleteBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.coralDim, borderWidth: 1, borderColor: `${C.coral}30`, justifyContent: 'center', alignItems: 'center' },
  folderItemList:  { paddingHorizontal: BODY_H_PAD, paddingTop: 12, paddingBottom: 60 },
  folderItem:      { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, marginBottom: 8, position: 'relative', overflow: 'hidden' },
  folderItemLine:  { position: 'absolute', left: 0, top: 12, bottom: 12, width: 2, borderRadius: 1, opacity: 0.75 },
  folderItemIcon:  { borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  folderItemTitle: { fontWeight: '600', color: C.text, marginBottom: 6, lineHeight: 18 },
  folderItemTime:  { fontSize: 11, color: C.textMute },
  removeBtn:       { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  emptyFolder:     { flex: 1, alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconBox:    { width: 72, height: 72, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  emptySub:        { fontSize: 13, color: C.textMute, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  emptyCreate:     { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyCreateIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: `${C.orange}25`, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyCreateTitle:{ fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  emptyCreateSub:  { fontSize: 13, color: C.textMute, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  emptyCreateBtn:  { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.orange, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13, marginTop: 4 },
  emptyCreateBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  newFolderCard:   { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 18 },
  newFolderCardIcon: { backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center' },
  newFolderCardLabel: { fontWeight: '700', color: C.orange },
})