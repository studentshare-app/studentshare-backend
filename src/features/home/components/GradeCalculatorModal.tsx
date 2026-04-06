import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { C } from '@/lib/colors'
import type { GradeEntry } from '@/features/home/types'

const BLANK_GRADES: GradeEntry[] = [
  { id: '1', subject: '', score: '', weight: '' },
  { id: '2', subject: '', score: '', weight: '' },
]

export function GradeCalculatorModal({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const [entries, setEntries] = useState<GradeEntry[]>(BLANK_GRADES)

  useEffect(() => {
    if (!visible) {
      setEntries(BLANK_GRADES.map(entry => ({ ...entry })))
    }
  }, [visible])

  const addEntry = () => {
    setEntries(prev => [...prev, { id: Date.now().toString(), subject: '', score: '', weight: '' }])
  }

  const removeEntry = (id: string) => {
    if (entries.length <= 1) return
    setEntries(prev => prev.filter(entry => entry.id !== id))
  }

  const updateEntry = (id: string, field: keyof GradeEntry, value: string) => {
    let nextValue = value
    if (field === 'score' && value !== '') {
      const numeric = Number(value)
      if (!isNaN(numeric)) nextValue = String(Math.min(100, Math.max(0, numeric)))
    }
    setEntries(prev => prev.map(entry => (entry.id === id ? { ...entry, [field]: nextValue } : entry)))
  }

  const { gpa, average, letterGrade, mixed } = useMemo(() => {
    const valid = entries.filter(entry => entry.score !== '' && !isNaN(Number(entry.score)))
    if (!valid.length) return { gpa: null, average: null, letterGrade: null, mixed: false }

    const weighted = valid.filter(entry => entry.weight !== '' && !isNaN(Number(entry.weight)))
    const unweighted = valid.filter(entry => entry.weight === '' || isNaN(Number(entry.weight)))
    const isMixed = weighted.length > 0 && unweighted.length > 0

    const averageScore = isMixed || !weighted.length
      ? valid.reduce((sum, entry) => sum + Number(entry.score), 0) / valid.length
      : valid.reduce((sum, entry) => sum + Number(entry.score) * Number(entry.weight), 0)
          / valid.reduce((sum, entry) => sum + Number(entry.weight), 0)

    const nextGpa = averageScore >= 90 ? 4.0 : averageScore >= 80 ? 3.0 : averageScore >= 70 ? 2.0 : averageScore >= 60 ? 1.0 : 0.0
    const nextLetter = averageScore >= 90 ? 'A' : averageScore >= 80 ? 'B' : averageScore >= 70 ? 'C' : averageScore >= 60 ? 'D' : 'F'

    return {
      gpa: nextGpa.toFixed(1),
      average: averageScore.toFixed(1),
      letterGrade: nextLetter,
      mixed: isMixed,
    }
  }, [entries])

  const gradeColor = letterGrade === 'A'
    ? C.emerald
    : letterGrade === 'B'
      ? C.sapphire
      : letterGrade === 'C'
        ? C.gold
        : letterGrade === 'D'
          ? C.orange
          : C.coral

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrap}>
          <View style={styles.sheet}>
            <View style={styles.handleRow}><View style={styles.handle} /></View>
            <View style={styles.header}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={styles.title}>Grade Calculator</Text>
                <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>Weighted GPA calculator</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>

            {mixed && (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={13} color={C.gold} />
                <Text maxFontSizeMultiplier={1.3} style={styles.warningText}>
                  Mixed weights detected - showing unweighted average.
                </Text>
              </View>
            )}

            {average !== null && (
              <View style={[styles.resultBox, { borderColor: `${gradeColor}30`, backgroundColor: `${gradeColor}08` }]}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.resultGrade, { color: gradeColor }]}>{letterGrade}</Text>
                <View>
                  <Text maxFontSizeMultiplier={1.3} style={styles.resultAvg}>{average}%</Text>
                  <Text maxFontSizeMultiplier={1.3} style={styles.resultGpa}>GPA {gpa} / 4.0</Text>
                </View>
              </View>
            )}

            <View style={styles.colHeaders}>
              {['Subject', 'Score %', 'Weight', ''].map((header, index) => (
                <Text
                  key={index}
                  maxFontSizeMultiplier={1.3}
                  style={[styles.colHeader, index === 0 ? { flex: 2 } : index < 3 ? { flex: 1 } : { width: 32 }]}
                >
                  {header}
                </Text>
              ))}
            </View>

            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              {entries.map((entry, index) => (
                <View key={entry.id} style={styles.entryRow}>
                  <TextInput
                    style={[styles.input, { flex: 2 }]}
                    placeholder={`Course ${index + 1}`}
                    placeholderTextColor={C.textMute}
                    value={entry.subject}
                    onChangeText={value => updateEntry(entry.id, 'subject', value)}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="85"
                    placeholderTextColor={C.textMute}
                    keyboardType="decimal-pad"
                    value={entry.score}
                    onChangeText={value => updateEntry(entry.id, 'score', value)}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="3"
                    placeholderTextColor={C.textMute}
                    keyboardType="decimal-pad"
                    value={entry.weight}
                    onChangeText={value => updateEntry(entry.id, 'weight', value)}
                  />
                  <TouchableOpacity onPress={() => removeEntry(entry.id)} style={styles.removeBtn}>
                    <Ionicons name="remove-circle" size={20} color={C.coral} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.addBtn} onPress={addEntry}>
              <Ionicons name="add-circle-outline" size={17} color={C.orange} />
              <Text maxFontSizeMultiplier={1.3} style={styles.addBtnText}>Add Course</Text>
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
    paddingBottom: 48,
    maxHeight: '88%',
  },
  handleRow: { alignItems: 'center', marginBottom: 22 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: C.textMute, marginTop: 3 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(223,168,60,0.08)',
    borderRadius: 12,
    padding: 11,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(223,168,60,0.2)',
  },
  warningText: { flex: 1, fontSize: 12, color: C.gold, lineHeight: 17 },
  resultBox: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  resultGrade: { fontSize: 52, fontWeight: '900' },
  resultAvg: { fontSize: 24, fontWeight: '800', color: C.text },
  resultGpa: { fontSize: 14, color: C.textMute, fontWeight: '600', marginTop: 3 },
  colHeaders: { flexDirection: 'row', paddingHorizontal: 4, marginBottom: 10, gap: 8 },
  colHeader: { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.6 },
  scrollArea: { maxHeight: 220 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
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
  removeBtn: { width: 32, alignItems: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: C.orangeDim,
    borderWidth: 1,
    borderColor: `${C.orange}30`,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: C.orange },
})
