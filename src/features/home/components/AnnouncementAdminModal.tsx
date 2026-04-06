import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { supabase } from '@/core/api/supabase'
import { base64ToBytes, priorityColor } from '@/features/home/api/home'
import { C } from '@/lib/colors'
import type { Announcement } from '@/features/home/types'

export function AnnouncementAdminModal({
  visible,
  onClose,
  announcements,
  classId,
  collegeId,
  onRefresh,
  onSaveSuccess,
  onOptimisticUpdate,
}: {
  visible: boolean
  onClose: () => void
  announcements: Announcement[]
  classId: string | null
  collegeId: string | null
  onRefresh: () => void
  onSaveSuccess?: () => void
  onOptimisticUpdate: (updater: (prev: Announcement[]) => Announcement[]) => void
}) {
  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null)
  const [saving, setSaving] = useState(false)
  const [imgUp, setImgUp] = useState(false)

  const reset = () => {
    setEditing(null)
    setMode('list')
  }

  useEffect(() => {
    if (!visible) reset()
  }, [visible])

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Delete this announcement?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          onOptimisticUpdate(prev => prev.filter(item => item.id !== id))
          const { error } = await supabase.from('announcements').delete().eq('id', id)
          if (error) {
            Alert.alert('Error', error.message)
            onRefresh()
          }
        },
      },
    ])
  }

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo library access.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    })

    if (result.canceled) return

    try {
      setImgUp(true)
      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `announcement_${Date.now()}.${ext}`
      const bytes = base64ToBytes(asset.base64!)
      const { error } = await supabase.storage.from('announcements').upload(fileName, bytes, {
        contentType: `image/${ext}`,
        upsert: true,
      })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('announcements').getPublicUrl(fileName)
      setEditing(prev => ({ ...prev, image_url: urlData.publicUrl }))
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message)
    } finally {
      setImgUp(false)
    }
  }

  const handleSave = async () => {
    if (!editing?.title?.trim()) {
      Alert.alert('Required', 'Please enter a title.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: editing.title.trim(),
        body: editing.body?.trim() || '',
        priority: (editing.priority || 'normal') as Announcement['priority'],
        image_url: editing.image_url || null,
        class_id: classId,
        college_id: collegeId,
      }
      const isNew = !editing.id

      if (editing.id) {
        const { error } = await supabase.from('announcements').update(payload).eq('id', editing.id)
        if (error) throw new Error(error.message)
        onOptimisticUpdate(prev => prev.map(item => (item.id === editing.id ? { ...item, ...payload, created_at: item.created_at } : item)))
      } else {
        const { data: inserted, error } = await supabase
          .from('announcements')
          .insert(payload)
          .select('id, title, body, image_url, created_at, priority')
          .single()
        if (error) throw new Error(error.message)
        if (!inserted) throw new Error('Insert returned no data.')
        onOptimisticUpdate(prev => [inserted as Announcement, ...prev])
      }

      reset()
      onClose()
      if (isNew) onSaveSuccess?.()
      onRefresh()
    } catch (error: any) {
      Alert.alert('Could not save', error?.message ?? 'Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrap}>
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.handleRow}><View style={styles.handle} /></View>
            <View style={styles.header}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={styles.title}>
                  {mode === 'edit' ? (editing?.id ? 'Edit Announcement' : 'New Announcement') : 'Manage Announcements'}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>
                  {mode === 'edit' ? 'Fill in details below' : 'Add, edit or remove'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { reset(); onClose() }} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>

            {mode === 'list' ? (
              <>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
                  {announcements.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="megaphone-outline" size={32} color={C.textMute} />
                      <Text maxFontSizeMultiplier={1.3} style={styles.emptyText}>No announcements yet</Text>
                    </View>
                  ) : (
                    announcements.map(item => (
                      <View key={item.id} style={[styles.annCard, { borderLeftColor: priorityColor(item.priority) }]}>
                        <View style={{ flex: 1 }}>
                          <Text maxFontSizeMultiplier={1.3} style={styles.annCardTitle} numberOfLines={1}>{item.title}</Text>
                          <Text maxFontSizeMultiplier={1.3} style={styles.annCardBody} numberOfLines={2}>{item.body}</Text>
                          {item.image_url && (
                            <View style={styles.hasImageRow}>
                              <Ionicons name="image" size={11} color={C.textMute} />
                              <Text maxFontSizeMultiplier={1.3} style={styles.hasImageText}>Has image</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.iconColumn}>
                          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: C.sapphDim }]} onPress={() => { setEditing({ ...item }); setMode('edit') }}>
                            <Ionicons name="pencil" size={15} color={C.sapphire} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: C.coralDim }]} onPress={() => handleDelete(item.id)}>
                            <Ionicons name="trash" size={15} color={C.coral} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => { setEditing({ title: '', body: '', priority: 'normal', image_url: null }); setMode('edit') }}>
                  <Ionicons name="add-circle-outline" size={17} color={C.void} />
                  <Text maxFontSizeMultiplier={1.3} style={styles.primaryBtnText}>New Announcement</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.backRow} onPress={reset}>
                  <Ionicons name="arrow-back" size={15} color={C.textSub} />
                  <Text maxFontSizeMultiplier={1.3} style={styles.backText}>Back to list</Text>
                </TouchableOpacity>

                <Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Announcement title"
                  placeholderTextColor={C.textMute}
                  value={editing?.title || ''}
                  onChangeText={value => setEditing(prev => ({ ...prev, title: value }))}
                />

                <Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>Body</Text>
                <TextInput
                  style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                  placeholder="Write the announcement..."
                  placeholderTextColor={C.textMute}
                  multiline
                  numberOfLines={4}
                  value={editing?.body || ''}
                  onChangeText={value => setEditing(prev => ({ ...prev, body: value }))}
                />

                <Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>Priority</Text>
                <View style={styles.priorityRow}>
                  {(['high', 'normal', 'low'] as const).map(priority => (
                    <TouchableOpacity
                      key={priority}
                      style={[styles.priorityBtn, editing?.priority === priority && { backgroundColor: priorityColor(priority), borderColor: priorityColor(priority) }]}
                      onPress={() => setEditing(prev => ({ ...prev, priority }))}
                    >
                      <Text maxFontSizeMultiplier={1.3} style={[styles.priorityBtnText, editing?.priority === priority && { color: '#fff' }]}>
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>Image (optional)</Text>
                {editing?.image_url ? (
                  <View style={styles.imageWrap}>
                    <Image source={{ uri: editing.image_url }} style={styles.previewImage} resizeMode="cover" />
                    <TouchableOpacity style={styles.removeImageBtn} onPress={() => setEditing(prev => ({ ...prev, image_url: null }))}>
                      <Ionicons name="close-circle" size={22} color={C.coral} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.imgPickBtn} onPress={handlePickImage} disabled={imgUp}>
                    {imgUp ? (
                      <ActivityIndicator color={C.orange} size="small" />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={18} color={C.orange} />
                        <Text maxFontSizeMultiplier={1.3} style={[styles.addBtnText, { color: C.orange }]}>Upload Image</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 18, marginBottom: 8 }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color={C.void} size="small" /> : <Text style={styles.primaryBtnText}>{editing?.id ? 'Save Changes' : 'Post Announcement'}</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 48, maxHeight: '88%' },
  handleRow: { alignItems: 'center', marginBottom: 22 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: C.textMute, marginTop: 3 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { fontSize: 14, fontWeight: '700', color: C.orange },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingVertical: 15 },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: C.textMute },
  annCard: { flexDirection: 'row', backgroundColor: C.raised, borderRadius: 14, padding: 13, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border, gap: 10, marginBottom: 10 },
  annCardTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 3 },
  annCardBody: { fontSize: 12.5, color: C.textSub, lineHeight: 17 },
  hasImageRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  hasImageText: { fontSize: 11, color: C.textMute },
  iconColumn: { flexDirection: 'column', gap: 8 },
  iconBtn: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 20 },
  backText: { fontSize: 14, color: C.textSub, fontWeight: '600' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 7 },
  input: { backgroundColor: C.raised, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 13 },
  priorityRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  priorityBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  priorityBtnText: { fontSize: 13, fontWeight: '700', color: C.textMute },
  imageWrap: { position: 'relative', marginBottom: 16 },
  previewImage: { width: '100%', height: 150, borderRadius: 14 },
  removeImageBtn: { position: 'absolute', top: 8, right: 8 },
  imgPickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orangeDim, borderRadius: 13, paddingVertical: 14, borderWidth: 1, borderColor: `${C.orange}25`, marginBottom: 4 },
})
