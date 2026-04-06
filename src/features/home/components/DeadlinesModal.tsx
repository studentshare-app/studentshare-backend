import { Ionicons } from '@expo/vector-icons'
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { isOverdue, sortDeadlines } from '@/features/home/api/home'
import { TagChip } from '@/features/home/components/HomeShell'
import { C } from '@/lib/colors'
import type { Deadline } from '@/features/home/types'

export function DeadlinesModal({
  visible,
  onClose,
  deadlines,
  onAdd,
  onRemove,
}: {
  visible: boolean
  onClose: () => void
  deadlines: Deadline[]
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  const sorted = sortDeadlines(deadlines)

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <View style={styles.outerWrap}>
          <View style={styles.sheet}>
            <View style={styles.handleRow}><View style={styles.handle} /></View>
            <View style={styles.header}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={styles.title}>Deadlines</Text>
                <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>Track assignments & exams</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {sorted.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="calendar-outline" size={32} color={C.textMute} />
                  <Text maxFontSizeMultiplier={1.3} style={styles.emptyText}>No deadlines yet</Text>
                </View>
              ) : (
                sorted.map(deadline => {
                  const overdue = isOverdue(deadline.due_date)
                  return (
                    <View
                      key={deadline.id}
                      style={[
                        styles.deadlineCard,
                        { borderLeftColor: overdue ? C.coral : deadline.color },
                        overdue && { backgroundColor: `${C.coralDim}60` },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.courseRow}>
                          <Text maxFontSizeMultiplier={1.3} style={[styles.dlCourse, overdue && { color: C.coral }]}>
                            {deadline.course}
                          </Text>
                          {overdue && <TagChip label="OVERDUE" color={C.coral} bg={C.coralDim} />}
                        </View>
                        <Text maxFontSizeMultiplier={1.3} style={styles.dlTitle}>{deadline.title}</Text>
                        <View style={styles.dateRow}>
                          <Ionicons name="calendar" size={11} color={overdue ? C.coral : C.textMute} />
                          <Text maxFontSizeMultiplier={1.3} style={[styles.dlDate, overdue && { color: C.coral }]}>
                            {deadline.due_date}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => onRemove(deadline.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={20} color={C.textMute} />
                      </TouchableOpacity>
                    </View>
                  )
                })
              )}
            </ScrollView>

            <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
              <Ionicons name="add-circle-outline" size={17} color={C.orange} />
              <Text maxFontSizeMultiplier={1.3} style={styles.addBtnText}>Add Deadline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  outerWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '82%',
  },
  handleRow: { alignItems: 'center', marginBottom: 22 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: C.textMute, marginTop: 3 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { gap: 10, paddingBottom: 16 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: C.textMute },
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.raised,
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  dlCourse: { fontSize: 10.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
  dlTitle: { fontSize: 13.5, fontWeight: '700', color: C.text, lineHeight: 19 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  dlDate: { fontSize: 11, color: C.textMute },
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
