import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { C } from '@/lib/colors'
import { DEADLINE_COLORS } from '@/features/home/constants'
import type { Deadline } from '@/features/home/types'

export function AddDeadlineModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean
  onClose: () => void
  onAdd: (deadline: Omit<Deadline, 'id'>) => void
}) {
  const [title, setTitle] = useState('')
  const [course, setCourse] = useState('')
  const [due, setDue] = useState('')
  const [color, setColor] = useState(DEADLINE_COLORS[0])

  const handleAdd = () => {
    if (!title.trim() || !due.trim()) {
      Alert.alert('Missing fields', 'Please enter a title and due date.')
      return
    }

    onAdd({
      title: title.trim(),
      course: course.trim() || 'General',
      due_date: due.trim(),
      color,
    })

    setTitle('')
    setCourse('')
    setDue('')
    setColor(DEADLINE_COLORS[0])
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrap}>
          <View style={styles.sheet}>
            <View style={styles.handleRow}><View style={styles.handle} /></View>
            <View style={styles.header}>
              <Text maxFontSizeMultiplier={1.3} style={styles.title}>Add Deadline</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Assignment / Exam title"
              placeholderTextColor={C.textMute}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="Course name (optional)"
              placeholderTextColor={C.textMute}
              value={course}
              onChangeText={setCourse}
            />
            <TextInput
              style={styles.input}
              placeholder="Due date (e.g. Dec 20, 2025)"
              placeholderTextColor={C.textMute}
              value={due}
              onChangeText={setDue}
            />

            <Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>Colour tag</Text>
            <View style={styles.colorRow}>
              {DEADLINE_COLORS.map(swatch => (
                <TouchableOpacity
                  key={swatch}
                  style={[styles.colorDot, { backgroundColor: swatch }, color === swatch && styles.colorDotActive]}
                  onPress={() => setColor(swatch)}
                >
                  {color === swatch && <Ionicons name="checkmark" size={12} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleAdd}>
              <Text maxFontSizeMultiplier={1.3} style={styles.primaryBtnText}>Add Deadline</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 36,
  },
  handleRow: { alignItems: 'center', marginBottom: 22 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  input: {
    backgroundColor: C.raised,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 13,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMute,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 7,
  },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  colorDot: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  colorDotActive: { borderWidth: 2.5, borderColor: '#fff' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.orange,
    borderRadius: 16,
    paddingVertical: 15,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
