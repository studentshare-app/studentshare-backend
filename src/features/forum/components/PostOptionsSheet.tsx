import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef } from 'react'
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const T = {
  bg:     '#000000',
  bg2:    '#0d0d0d',
  bg3:    '#16181c',
  border: '#2f3336',
  text:   '#e7e9ea',
  muted:  '#71767b',
  accent: '#1DA1F2',
  red:    '#f91880',
} as const

export type PostOption = {
  icon:        string          // Ionicons name
  label:       string
  destructive?: boolean
  accent?:     boolean
  onPress:     () => void
}

export function PostOptionsSheet({
  visible,
  onClose,
  options,
}: {
  visible:  boolean
  onClose:  () => void
  options:  PostOption[]
}) {
  const insets     = useSafeAreaInsets()
  const slideAnim  = useRef(new Animated.Value(300)).current
  const opacityAnim= useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim,  { toValue: 300, duration: 220, useNativeDriver: true }),
        Animated.timing(opacityAnim,{ toValue: 0,   duration: 180, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', opacity: opacityAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          sh.sheet,
          { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle bar */}
        <View style={sh.handle} />

        {options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={[sh.option, i > 0 && sh.optionBorder]}
            activeOpacity={0.7}
            onPress={() => { onClose(); setTimeout(opt.onPress, 250) }}
          >
            <View style={[
              sh.iconWrap,
              opt.destructive && { backgroundColor: 'rgba(249,24,128,0.1)' },
              opt.accent      && { backgroundColor: 'rgba(29,161,242,0.1)' },
            ]}>
              <Ionicons
                name={opt.icon as any}
                size={20}
                color={opt.destructive ? T.red : opt.accent ? T.accent : T.text}
              />
            </View>
            <Text style={[
              sh.optionText,
              opt.destructive && { color: T.red },
              opt.accent      && { color: T.accent },
            ]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Modal>
  )
}

const sh = StyleSheet.create({
  sheet:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.bg3, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 0, borderTopWidth: 1, borderColor: T.border },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 8 },
  option:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  optionBorder:{ borderTopWidth: 1, borderTopColor: T.border },
  iconWrap:    { width: 40, height: 40, borderRadius: 20, backgroundColor: T.bg2, justifyContent: 'center', alignItems: 'center' },
  optionText:  { fontSize: 16, fontWeight: '600', color: T.text, flex: 1 },
})