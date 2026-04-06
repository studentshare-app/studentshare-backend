// features/home/components/HomeRows.tsx
import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { isOverdue } from '@/features/home/api/home'
import { ScalePress, TagChip } from '@/features/home/components/HomeShell'
import { C } from '@/lib/colors'
import type { DashCard, Deadline, Material, IoniconName } from '@/features/home/types'
// ✅ B5: use the authoritative HomeScheduleItem type from the hook
import type { HomeScheduleItem } from '@/features/home/hooks/useStudyPlannerSnapshot'

const DASH_CARD_HEIGHT = 150

export function DashCardItem({ card, cardWidth }: { card: DashCard; cardWidth: number }) {
  return (
    <ScalePress onPress={card.onPress} style={{ width: cardWidth }}>
      <View style={[styles.dashCard, { borderColor: card.borderColor, height: DASH_CARD_HEIGHT, width: cardWidth }]}>
        <View style={[styles.dashCardGlow, { backgroundColor: card.glowColor }]} />
        <View style={styles.dashCardTop}>
          <View style={[styles.dashCardIcon, { backgroundColor: card.badgeBg }]}>
            <Text style={styles.dashCardEmoji}>{card.emoji}</Text>
          </View>
          <View style={styles.dashCardArrow}>
            <Text style={styles.dashCardArrowText}>↗</Text>
          </View>
        </View>
        <View>
          <Text maxFontSizeMultiplier={1.3} style={styles.dashCardTitle} numberOfLines={1}>{card.title}</Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.dashCardSub} numberOfLines={1}>{card.sub}</Text>
          <View style={[styles.dashCardBadge, { backgroundColor: card.badgeBg }]}>
            <Text allowFontScaling={false} style={[styles.dashCardBadgeText, { color: card.badgeColor }]} numberOfLines={1}>
              {card.badgeLabel}
            </Text>
          </View>
        </View>
      </View>
    </ScalePress>
  )
}

// ✅ B5: prop typed as HomeScheduleItem — no more ScheduleItem mismatch
export function ScheduleRow({ item, isLast }: { item: HomeScheduleItem; isLast: boolean }) {
  return (
    <View style={[styles.schedItem, item.cancelled && styles.schedItemCancelled, isLast && { borderBottomWidth: 0 }]}>
      <View style={styles.schedTime}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.schedTimeVal, item.cancelled && { color: C.textMute }]}>
          {item.hour}
        </Text>
        <Text allowFontScaling={false} style={styles.schedTimePeriod}>{item.period}</Text>
      </View>
      <View style={styles.schedDotWrap}>
        <View style={[styles.schedDot, { backgroundColor: item.dotColor, shadowColor: item.dotColor }]} />
        {!isLast && <View style={styles.schedLine} />}
      </View>
      <View style={styles.schedContent}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.schedTitle, item.cancelled && styles.schedTitleStrike]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.schedMeta} numberOfLines={1}>{item.meta}</Text>
        <View style={[styles.schedTag, { backgroundColor: item.tagBg }]}>
          <Text allowFontScaling={false} style={[styles.schedTagText, { color: item.tagColor }]}>{item.tagLabel}</Text>
        </View>
      </View>
    </View>
  )
}

// ✅ B4: MaterialRow now accepts and calls onPress for navigation
export function MaterialRow({
  mat,
  onPress,
}: {
  mat: Material & { typeColor: string; typeBg: string; typeLabel: string; icon: IoniconName }
  onPress?: () => void
}) {
  return (
    <ScalePress onPress={onPress}>
      <View style={styles.matRow}>
        <View style={[styles.matAccentLine, { backgroundColor: mat.typeColor }]} />
        <View style={[styles.matIconBox, { backgroundColor: mat.typeBg, borderColor: `${mat.typeColor}20` }]}>
          <Ionicons name={mat.icon} size={18} color={mat.typeColor} />
        </View>
        <View style={styles.matContent}>
          <Text maxFontSizeMultiplier={1.3} style={styles.matTitle} numberOfLines={2}>{mat.title}</Text>
          <View style={styles.matMeta}>
            <TagChip label={mat.typeLabel} color={mat.typeColor} bg={mat.typeBg} />
            {mat.courses?.name && <Text style={styles.matCourse}>{mat.courses.name}</Text>}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={14} color={C.textMute} />
      </View>
    </ScalePress>
  )
}

export function DeadlineChip({ d, onRemove }: { d: Deadline; onRemove: () => void }) {
  const urgent = isOverdue(d.due_date)

  return (
    <View style={[styles.deadlineChip, urgent && { backgroundColor: C.coralDim, borderColor: `${C.coral}30` }]}>
      <View style={[styles.deadlineChipDot, { backgroundColor: urgent ? C.coral : d.color }]} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={1.3} style={styles.deadlineChipTitle} numberOfLines={1}>{d.title}</Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.deadlineChipDue, urgent && { color: C.coral }]}>Due {d.due_date}</Text>
      </View>
      {/* ✅ A4: accessibilityLabel on remove button */}
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${d.title} deadline`}
      >
        <Ionicons name="close-circle" size={16} color={C.textMute} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  dashCard:          { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, padding: 20, paddingBottom: 18, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' },
  dashCardGlow:      { position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50, opacity: 0.5 },
  dashCardTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dashCardIcon:      { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  dashCardEmoji:     { fontSize: 20 },
  dashCardArrow:     { width: 26, height: 26, borderRadius: 9, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  dashCardArrowText: { fontSize: 11, color: C.textMute },
  dashCardTitle:     { fontSize: 15, fontWeight: '700', fontFamily: 'serif', color: C.text, marginBottom: 4, letterSpacing: -0.2, lineHeight: 19, zIndex: 1 },
  dashCardSub:       { fontSize: 11, color: C.textSub, zIndex: 1 },
  dashCardBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start', zIndex: 1 },
  dashCardBadgeText: { fontSize: 10, fontWeight: '700' },

  schedItem:          { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border } as const,
  schedItemCancelled: { opacity: 0.4 },
  schedTime:          { width: 48, alignItems: 'center', paddingTop: 3, flexShrink: 0 },
  schedTimeVal:       { fontSize: 15, fontWeight: '700', fontFamily: 'serif', color: C.text, lineHeight: 18, textAlign: 'center' },
  schedTimePeriod:    { fontSize: 9, fontWeight: '600', letterSpacing: 1, color: C.textMute, textAlign: 'center', marginTop: 1 },
  schedDotWrap:       { alignItems: 'center', paddingTop: 5, flexShrink: 0 },
  schedDot:           { width: 9, height: 9, borderRadius: 4.5, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 3 },
  schedLine:          { width: 1, flex: 1, minHeight: 28, backgroundColor: C.border, marginTop: 5 },
  schedContent:       { flex: 1, paddingTop: 2 },
  schedTitle:         { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 3, lineHeight: 18 },
  schedTitleStrike:   { textDecorationLine: 'line-through', color: C.textSub },
  schedMeta:          { fontSize: 11, color: C.textSub, lineHeight: 16 },
  schedTag:           { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, marginTop: 6, alignSelf: 'flex-start' },
  schedTagText:       { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  deadlineChip:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, width: 170 },
  deadlineChipDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  deadlineChipTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 3 },
  deadlineChipDue:   { fontSize: 11.5, color: C.textMute, fontWeight: '500' },

  matRow:     { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, position: 'relative', overflow: 'hidden' },
  matAccentLine: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 2, borderRadius: 1, opacity: 0.65 },
  matIconBox: { width: 42, height: 42, minWidth: 42, minHeight: 42, flexShrink: 0, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  matContent: { flex: 1 },
  matTitle:   { fontSize: 13.5, fontWeight: '600', color: C.text, lineHeight: 19, marginBottom: 7 },
  matMeta:    { flexDirection: 'row', alignItems: 'center', gap: 7 },
  matCourse:  { fontSize: 11, color: C.textMute },
})