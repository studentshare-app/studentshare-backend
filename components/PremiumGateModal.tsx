/**
 * components/PremiumGateModal.tsx
 *
 * Bottom sheet that appears when a freemium user hits the 5-item limit.
 * Shows what they're missing and an upgrade CTA.
 *
 * Usage:
 *   <PremiumGateModal
 *     visible={showGate}
 *     onClose={() => setShowGate(false)}
 *     onUpgrade={() => router.push('/subscription')}
 *     limitedFeature="study blocks"   // e.g. "tasks", "focus sessions"
 *   />
 */

import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useEffect, useRef } from 'react'
import { FREE_LIMIT } from '../hooks/usePremiumGuard'

// ── Design tokens (match study-planner palette) ──────────────────────────
const C = {
  void:      '#08090C',
  surface:   '#111318',
  raised:    '#161A22',
  border:    '#1E2330',
  text:      '#EEF0F6',
  textSub:   '#8B93A8',
  textMute:  '#4A5168',
  gold:      '#F0C060',
  goldGlow:  '#D4983A',
  goldDim:   '#2A1E08',
  sapphire:  '#5B8DEF',
  sapphDim:  '#0D1A35',
  emerald:   '#44D4A0',
  emerDim:   '#0A2C1E',
  coral:     '#FF7B7B',
  lavender:  '#A78BFA',
  lavDim:    '#1E1040',
} as const

const PERKS = [
  { icon: 'calendar-outline'        as const, label: 'Unlimited schedule blocks'   },
  { icon: 'checkmark-circle-outline'as const, label: 'Unlimited tasks & deadlines' },
  { icon: 'timer-outline'           as const, label: 'Unlimited focus sessions'    },
  { icon: 'trophy-outline'          as const, label: 'Unlimited goals & tracking'  },
  { icon: 'sync-outline'            as const, label: 'Cross-device sync'           },
  { icon: 'flash-outline'           as const, label: 'AI study recommendations'    },
]

type Props = {
  visible:        boolean
  onClose:        () => void
  onUpgrade:      () => void
  limitedFeature: string   // e.g. "schedule blocks", "tasks"
}

export function PremiumGateModal({ visible, onClose, onUpgrade, limitedFeature }: Props) {
  const slideAnim = useRef(new Animated.Value(400)).current
  const fadeAnim  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0,   useNativeDriver: true, speed: 18, bounciness: 6 }),
        Animated.timing(fadeAnim,  { toValue: 1,   useNativeDriver: true, duration: 220 }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 400, useNativeDriver: true, duration: 240 }),
        Animated.timing(fadeAnim,  { toValue: 0,   useNativeDriver: true, duration: 200 }),
      ]).start()
    }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Gold gradient header */}
        <View style={s.headerBox}>
          <LinearGradient
            colors={[C.goldDim, C.lavDim]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Crown icon */}
          <View style={s.crownBox}>
            <Text style={s.crownEmoji}>👑</Text>
          </View>
          <Text style={s.headerTitle}>Upgrade to Premium</Text>
          <Text style={s.headerSub}>
            You've reached the free limit of{' '}
            <Text style={{ color: C.gold, fontWeight: '700' }}>{FREE_LIMIT} {limitedFeature}</Text>.{'\n'}
            Unlock unlimited access to all Study Planner features.
          </Text>

          {/* Close button */}
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={16} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {/* Perks list */}
        <View style={s.perksBox}>
          {PERKS.map(p => (
            <View key={p.label} style={s.perkRow}>
              <View style={s.perkIconBox}>
                <Ionicons name={p.icon} size={15} color={C.gold} />
              </View>
              <Text style={s.perkText}>{p.label}</Text>
              <Ionicons name="checkmark" size={14} color={C.emerald} />
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity style={s.upgradeBtn} onPress={onUpgrade} activeOpacity={0.88}>
          <LinearGradient
            colors={[C.gold, C.goldGlow]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.upgradeBtnGradient}
          >
            <Ionicons name="flash" size={16} color={C.void} />
            <Text style={s.upgradeBtnText}>Upgrade to Premium</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={onClose} style={s.maybeLater} activeOpacity={0.7}>
          <Text style={s.maybeLaterText}>Maybe later</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    position:              'absolute',
    bottom:                0,
    left:                  0,
    right:                 0,
    backgroundColor:       C.surface,
    borderTopLeftRadius:   32,
    borderTopRightRadius:  32,
    overflow:              'hidden',
    paddingBottom:         40,
  },

  // ── Header
  headerBox: {
    padding:        24,
    paddingBottom:  22,
    alignItems:     'center',
    overflow:       'hidden',
    position:       'relative',
  },
  crownBox: {
    width:           56,
    height:          56,
    borderRadius:    20,
    backgroundColor: C.goldDim,
    borderWidth:     1,
    borderColor:     C.gold + '30',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    14,
  },
  crownEmoji:   { fontSize: 26 },
  headerTitle:  { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  headerSub:    { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20 },
  closeBtn: {
    position:        'absolute',
    top:             16,
    right:           16,
    width:           30,
    height:          30,
    borderRadius:    10,
    backgroundColor: C.raised,
    justifyContent:  'center',
    alignItems:      'center',
  },

  // ── Perks
  perksBox: {
    marginHorizontal: 20,
    marginBottom:     20,
    backgroundColor:  C.raised,
    borderRadius:     18,
    borderWidth:      1,
    borderColor:      C.border,
    padding:          16,
    gap:              12,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  perkIconBox: {
    width:           30,
    height:          30,
    borderRadius:    9,
    backgroundColor: C.goldDim,
    borderWidth:     1,
    borderColor:     C.gold + '20',
    alignItems:      'center',
    justifyContent:  'center',
  },
  perkText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },

  // ── CTA
  upgradeBtn: {
    marginHorizontal: 20,
    marginBottom:     12,
    borderRadius:     18,
    overflow:         'hidden',
  },
  upgradeBtnGradient: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical: 16,
  },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: C.void },
  maybeLater:     { alignItems: 'center', paddingVertical: 6 },
  maybeLaterText: { fontSize: 13, color: C.textMute, fontWeight: '600' },
})