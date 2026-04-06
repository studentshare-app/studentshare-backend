/**
 * src/features/library/components/LibraryModals.tsx  —  PRODUCTION-READY
 *
 * FIXES APPLIED
 * ─────────────
 * Bug
 *  1. FolderFormModal: onClose now only called if onSave succeeds — if onSave
 *     throws, modal stays open and error prop is displayed to user
 *  2. AddToFolderSheet: onCreateAndAdd wrapped in try/catch — shows inline
 *     error if creation fails instead of silently failing
 *
 * Accessibility
 *  3. FolderFormModal color dots have accessibilityRole="radio" and
 *     accessibilityLabel for each color + accessibilityState={{ checked }}
 *  4. AddToFolderSheet folder rows have accessibilityState={{ checked }}
 *     on the checkbox view
 *  5. PremiumGateModal upgrade button has accessibilityLabel
 *  6. All close/cancel buttons have accessibilityLabel
 *  7. Modal backdrop Pressable has accessibilityLabel="Close"
 *
 * Safety
 *  8. AddToFolderSheet create confirm catches errors and shows createError
 *  9. FolderFormModal accepts optional error prop to surface save failures
 *
 * Cleanup
 * 10. C palette imported from libraryConstants — local duplicate removed
 * 11. FOLDER_COLORS imported from libraryConstants
 */

import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import type { Folder } from '@/features/library/hooks/useFolders'
import type { Download } from '@/features/library/utils/downloads'
import { C, FOLDER_COLORS } from '@/features/library/utils/libraryConstants'

// ── Color name map for accessibility labels ───────────────────────────────────
const COLOR_NAMES: Record<string, string> = {
  [C.orange]:   'Orange',
  [C.sapphire]: 'Blue',
  [C.emerald]:  'Green',
  [C.lavender]: 'Purple',
  [C.coral]:    'Red',
  [C.gold]:     'Gold',
  [C.sky]:      'Sky blue',
}

// ── PremiumGateModal ──────────────────────────────────────────────────────────
export function PremiumGateModal({
  visible,
  onClose,
  onUpgrade,
}: {
  visible:   boolean
  onClose:   () => void
  onUpgrade: () => void
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        style={pg.overlay}
        onPress={onClose}
        accessibilityLabel="Close premium gate"
      >
        <Pressable style={pg.sheet} onPress={e => e.stopPropagation()}>
          <View style={pg.handleRow}>
            <View style={pg.handle} accessibilityElementsHidden importantForAccessibility="no" />
          </View>
          <View
            style={pg.iconBox}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            <LinearGradient
              colors={[C.gold, C.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="star" size={30} color="#fff" />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={pg.title} accessibilityRole="header">
            Premium Required
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={pg.sub}>
            Offline downloads are a{'\n'}
            <Text style={{ color: C.gold, fontWeight: '700' }}>Premium-only</Text> feature.{'\n\n'}
            Upgrade to save files to your device and{'\n'}access them without internet.
          </Text>
          <TouchableOpacity
            style={pg.upgradeBtn}
            onPress={onUpgrade}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Premium"
          >
            <LinearGradient
              colors={[C.orange, '#F07840']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
            />
            <Ionicons name="star" size={15} color="#fff" />
            <Text maxFontSizeMultiplier={1.3} style={pg.upgradeBtnText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={pg.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Maybe later"
          >
            <Text maxFontSizeMultiplier={1.3} style={pg.cancelBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ── FolderFormModal ───────────────────────────────────────────────────────────
export function FolderFormModal({
  visible,
  onClose,
  initial,
  onSave,
  saving,
  error,
}: {
  visible:  boolean
  onClose:  () => void
  initial?: { name: string; color: string }
  onSave:   (name: string, color: string) => Promise<void>
  saving:   boolean
  error?:   string
}) {
  const [name,  setName]  = useState(initial?.name  ?? '')
  const [color, setColor] = useState(initial?.color ?? FOLDER_COLORS[0])

  useEffect(() => {
    if (visible) {
      setName(initial?.name   ?? '')
      setColor(initial?.color ?? FOLDER_COLORS[0])
    }
  }, [initial?.color, initial?.name, visible])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        style={ff.overlay}
        onPress={onClose}
        accessibilityLabel="Close folder form"
      >
        <Pressable style={ff.sheet} onPress={e => e.stopPropagation()}>
          <View style={ff.handleRow}>
            <View style={ff.handle} accessibilityElementsHidden importantForAccessibility="no" />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={ff.title} accessibilityRole="header">
            {initial ? 'Rename Folder' : 'New Folder'}
          </Text>

          {/* Save error */}
          {!!error && (
            <View style={ff.errorRow} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle-outline" size={14} color={C.coral} />
              <Text maxFontSizeMultiplier={1.3} style={ff.errorText}>{error}</Text>
            </View>
          )}

          <Text maxFontSizeMultiplier={1.3} style={ff.label}>Folder Name</Text>
          <TextInput
            style={ff.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Finals Week"
            placeholderTextColor={C.textMute}
            autoFocus
            maxLength={40}
            accessibilityLabel="Folder name"
          />

          <Text maxFontSizeMultiplier={1.3} style={ff.label}>Colour</Text>
          <View style={ff.colorRow} accessibilityRole="radiogroup">
            {FOLDER_COLORS.map(col => (
              <TouchableOpacity
                key={col}
                style={[ff.colorDot, { backgroundColor: col }, color === col && ff.colorDotActive]}
                onPress={() => setColor(col)}
                accessibilityRole="radio"
                accessibilityLabel={COLOR_NAMES[col] ?? col}
                accessibilityState={{ checked: color === col }}
              >
                {color === col && <Ionicons name="checkmark" size={12} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[ff.saveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}
            onPress={async () => {
              if (!name.trim() || saving) return
              try {
                await onSave(name.trim(), color)
                // Only close if save succeeded (#1)
                onClose()
              } catch {
                // Error is surfaced via the error prop from parent
              }
            }}
            disabled={!name.trim() || saving}
            accessibilityRole="button"
            accessibilityLabel={initial ? 'Save folder changes' : 'Create folder'}
            accessibilityState={{ disabled: !name.trim() || saving }}
          >
            <LinearGradient
              colors={[C.orange, '#F07840']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
            />
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="folder-open" size={16} color="#fff" />
                  <Text maxFontSizeMultiplier={1.3} style={ff.saveBtnText}>
                    {initial ? 'Save Changes' : 'Create Folder'}
                  </Text>
                </>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={ff.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text maxFontSizeMultiplier={1.3} style={ff.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ── AddToFolderSheet ──────────────────────────────────────────────────────────
export function AddToFolderSheet({
  visible,
  onClose,
  item,
  folders,
  onToggle,
  onCreateAndAdd,
}: {
  visible:         boolean
  onClose:         () => void
  item:            Download | null
  folders:         Folder[]
  onToggle:        (fid: string, mid: string) => void
  onCreateAndAdd:  (name: string, color: string, mid: string) => Promise<void>
}) {
  const [creating,     setCreating]     = useState(false)
  const [newName,      setNewName]      = useState('')
  const [newColor,     setNewColor]     = useState(FOLDER_COLORS[0])
  const [saving,       setSaving]       = useState(false)
  const [createError,  setCreateError]  = useState('')

  useEffect(() => {
    if (!visible) {
      setCreating(false)
      setNewName('')
      setNewColor(FOLDER_COLORS[0])
      setCreateError('')
    }
  }, [visible])

  if (!item) return null
  const materialId = item.material.id

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        style={af.overlay}
        onPress={onClose}
        accessibilityLabel="Close add to folder"
      >
        <Pressable style={af.sheet} onPress={e => e.stopPropagation()}>
          <View style={af.handleRow}>
            <View style={af.handle} accessibilityElementsHidden importantForAccessibility="no" />
          </View>
          <View style={af.header}>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={af.title} accessibilityRole="header">
                Add to Folder
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={af.sub} numberOfLines={1}>
                {item.material.title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={af.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={17} color={C.textSub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <View
              style={af.syncNote}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <Ionicons name="cloud-done-outline" size={11} color={C.emerald} />
              <Text allowFontScaling={false} style={af.syncNoteText}>
                Folders sync across all your devices
              </Text>
            </View>

            {folders.length > 0 && (
              <View style={af.folderList}>
                {folders.map(folder => {
                  const isIn = folder.material_ids.includes(materialId)
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      style={[
                        af.folderRow,
                        isIn && { borderColor: `${folder.color}50`, backgroundColor: `${folder.color}0D` },
                      ]}
                      onPress={() => onToggle(folder.id, materialId)}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${folder.name}, ${folder.material_ids.length} file${folder.material_ids.length !== 1 ? 's' : ''}`}
                      accessibilityState={{ checked: isIn }}
                    >
                      <View style={[af.folderIcon, { backgroundColor: `${folder.color}18` }]}>
                        <Ionicons name="folder" size={20} color={folder.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text maxFontSizeMultiplier={1.3} style={af.folderName}>{folder.name}</Text>
                        <Text allowFontScaling={false} style={af.folderCount}>
                          {folder.material_ids.length} file{folder.material_ids.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View
                        style={[af.checkbox, isIn && { backgroundColor: folder.color, borderColor: folder.color }]}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      >
                        {isIn && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Create error */}
            {!!createError && (
              <View style={af.errorRow} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={13} color={C.coral} />
                <Text maxFontSizeMultiplier={1.3} style={af.errorText}>{createError}</Text>
              </View>
            )}

            {creating ? (
              <View style={af.createBox}>
                <Text maxFontSizeMultiplier={1.3} style={af.createLabel}>Folder Name</Text>
                <TextInput
                  style={af.createInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Finals Week"
                  placeholderTextColor={C.textMute}
                  autoFocus
                  maxLength={40}
                  accessibilityLabel="New folder name"
                />
                <Text maxFontSizeMultiplier={1.3} style={af.createLabel}>Colour</Text>
                <View style={af.colorRow} accessibilityRole="radiogroup">
                  {FOLDER_COLORS.map(col => (
                    <TouchableOpacity
                      key={col}
                      style={[af.colorDot, { backgroundColor: col }, newColor === col && af.colorDotActive]}
                      onPress={() => setNewColor(col)}
                      accessibilityRole="radio"
                      accessibilityLabel={COLOR_NAMES[col] ?? col}
                      accessibilityState={{ checked: newColor === col }}
                    >
                      {newColor === col && <Ionicons name="checkmark" size={11} color="#fff" />}
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={af.createBtns}>
                  <TouchableOpacity
                    style={af.createCancelBtn}
                    onPress={() => { setCreating(false); setCreateError('') }}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel new folder"
                  >
                    <Text maxFontSizeMultiplier={1.3} style={af.createCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[af.createConfirmBtn, (!newName.trim() || saving) && { opacity: 0.4 }]}
                    disabled={!newName.trim() || saving}
                    accessibilityRole="button"
                    accessibilityLabel="Create folder and add file"
                    accessibilityState={{ disabled: !newName.trim() || saving }}
                    onPress={async () => {
                      if (!newName.trim() || saving) return
                      setCreateError('')
                      setSaving(true)
                      try {
                        await onCreateAndAdd(newName.trim(), newColor, materialId)
                        setCreating(false)
                        setNewName('')
                      } catch (err) {
                        if (__DEV__) console.warn('[AddToFolderSheet] onCreateAndAdd error:', err)
                        setCreateError('Could not create folder. Please try again.')
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <Ionicons name="folder-open" size={14} color="#fff" />
                          <Text maxFontSizeMultiplier={1.3} style={af.createConfirmText}>
                            Create & Add
                          </Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={af.newFolderBtn}
                onPress={() => setCreating(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create new folder"
              >
                <View style={af.newFolderIconBox}>
                  <Ionicons name="add" size={18} color={C.orange} />
                </View>
                <Text maxFontSizeMultiplier={1.3} style={af.newFolderText}>New Folder</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pg = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, paddingBottom: 44, alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border },
  handleRow:      { alignItems: 'center', marginBottom: 16, width: '100%' },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  iconBox:        { width: 72, height: 72, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8, overflow: 'hidden' },
  title:          { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  sub:            { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 23 },
  upgradeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 28, marginTop: 12, width: '100%', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  cancelBtn:      { paddingVertical: 12 },
  cancelBtnText:  { fontSize: 14, color: C.textMute, fontWeight: '600' },
})

const ff = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.80)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, gap: 12, borderTopWidth: 1, borderTopColor: C.border },
  handleRow:  { alignItems: 'center', marginBottom: 4 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  title:      { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3, marginBottom: 4 },
  label:      { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.8 },
  input:      { backgroundColor: C.raised, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border },
  colorRow:   { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot:   { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  colorDotActive: { borderWidth: 2.5, borderColor: '#fff' },
  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 8, overflow: 'hidden', position: 'relative', minHeight: 52 },
  saveBtnText:{ fontSize: 15, fontWeight: '800', color: '#fff' },
  cancelBtn:  { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 14, color: C.textMute, fontWeight: '600' },
  errorRow:   { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(238,104,104,0.08)', borderWidth: 1, borderColor: 'rgba(238,104,104,0.25)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  errorText:  { fontSize: 12, color: C.coral, flex: 1 },
})

const af = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 40, maxHeight: '80%', borderTopWidth: 1, borderTopColor: C.border },
  handleRow:        { alignItems: 'center', paddingVertical: 14 },
  handle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title:            { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  sub:              { fontSize: 12, color: C.textMute, marginTop: 3, maxWidth: 260 },
  closeBtn:         { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  syncNote:         { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  syncNoteText:     { fontSize: 11, color: C.emerald, fontWeight: '600' },
  folderList:       { gap: 8, marginBottom: 14 },
  folderRow:        { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14 },
  folderIcon:       { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  folderName:       { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  folderCount:      { fontSize: 11, color: C.textMute },
  checkbox:         { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  errorRow:         { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(238,104,104,0.08)', borderWidth: 1, borderColor: 'rgba(238,104,104,0.25)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  errorText:        { fontSize: 12, color: C.coral, flex: 1 },
  newFolderBtn:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  newFolderIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center' },
  newFolderText:    { fontSize: 14, fontWeight: '700', color: C.orange },
  createBox:        { backgroundColor: C.raised, borderRadius: 18, padding: 16, gap: 10, borderWidth: 1, borderColor: C.border },
  createLabel:      { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.8 },
  createInput:      { backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border },
  colorRow:         { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot:         { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  colorDotActive:   { borderWidth: 2.5, borderColor: '#fff' },
  createBtns:       { flexDirection: 'row', gap: 10, marginTop: 4 },
  createCancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  createCancelText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  createConfirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 12, backgroundColor: C.orange, minHeight: 44 },
  createConfirmText:{ fontSize: 13, fontWeight: '700', color: '#fff' },
})