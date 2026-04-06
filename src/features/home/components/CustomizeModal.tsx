import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { C } from '@/lib/colors'
import type { DashCard } from '@/features/home/types'

type CustomizeModalProps = {
  visible: boolean
  availableCards: DashCard[]
  customCards: string[]
  onClose: () => void
  onSave: (newCards: string[]) => void
}

export function CustomizeModal({
  visible,
  availableCards,
  customCards,
  onClose,
  onSave,
}: CustomizeModalProps) {
  const [tempSelected, setTempSelected] = useState(customCards)

  useEffect(() => {
    if (visible) {
      setTempSelected(customCards)
    }
  }, [visible, customCards])

  const handleToggle = (id: string) => {
    setTempSelected(prev => {
      const next = prev.includes(id) ? prev.filter(selected => selected !== id) : [...prev, id]
      return next.slice(0, 6)
    })
  }

  const handleSave = () => {
    onSave(tempSelected)
    onClose()
  }

  const handleReset = () => {
    setTempSelected(['solutions', 'mats', 'notes', 'plan', 'contribute', 'contributors'])
  }

  const maxedOut = tempSelected.length >= 6

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrap}>
          <View style={styles.sheet}>
            <View style={styles.handleRow}><View style={styles.handle} /></View>
            <View style={styles.header}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={styles.title}>Customize Dashboard</Text>
                <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>Choose up to 6 cards (3x2 grid)</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>

            <Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel} numberOfLines={1}>
              {tempSelected.length}/6 cards selected
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollArea}>
              {availableCards.map(card => {
                const isSelected = tempSelected.includes(card.id)
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.cardItem, isSelected && { backgroundColor: `${card.glowColor}20` }]}
                    onPress={() => (!maxedOut || isSelected ? handleToggle(card.id) : null)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardCheckbox}>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={isSelected ? C.emerald : C.textMute}
                      />
                    </View>
                    <View style={[styles.cardIcon, { backgroundColor: card.badgeBg }]}>
                      <Text style={styles.cardEmoji}>{card.emoji}</Text>
                    </View>
                    <View style={styles.cardText}>
                      <Text maxFontSizeMultiplier={1.3} style={styles.cardTitle} numberOfLines={1}>{card.title}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={styles.cardSub} numberOfLines={1}>{card.sub}</Text>
                    </View>
                    {maxedOut && !isSelected && (
                      <View style={styles.maxedBadge}>
                        <Text style={styles.maxedText}>MAX</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.8}>
                <Text maxFontSizeMultiplier={1.3} style={styles.resetBtnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={tempSelected.length === 0}
                activeOpacity={0.8}
              >
                <Text maxFontSizeMultiplier={1.3} style={styles.saveBtnText}>
                  {tempSelected.length === 0 ? 'Select cards' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: C.textMute, marginTop: 3 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.raised,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMute,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 12,
  },
  scrollArea: { maxHeight: 300 },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.raised,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardCheckbox: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardEmoji: { fontSize: 20 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  cardSub: { fontSize: 12, color: C.textSub },
  maxedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.coralDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  maxedText: { fontSize: 10, fontWeight: '800', color: C.coral },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingVertical: 15,
  },
  resetBtnText: { fontSize: 15, fontWeight: '700', color: C.text },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.orange,
    borderRadius: 16,
    paddingVertical: 15,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
