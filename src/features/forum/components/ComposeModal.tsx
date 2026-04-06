import type { Post, UserProfile } from '@/features/forum/types'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useRef, useState } from 'react'
import {
  Image,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const MAX_CHARS = 280

const T = {
  bg:      '#000000',
  bg2:     '#0d0d0d',
  bg3:     '#16181c',
  bg4:     '#202327',
  border:  '#2f3336',
  border2: '#3e4144',
  text:    '#e7e9ea',
  muted:   '#71767b',
  accent:  '#1DA1F2',
  red:     '#f91880',
  amber:   '#ffd400',
  green:   '#00ba7c',
} as const

function Avatar({
  initials, grad, size = 40, uri,
}: {
  initials: string; grad: readonly [string, string]; size?: number; uri?: string | null
}) {
  return (
    <LinearGradient
      colors={grad as [string, string]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
    >
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, position: 'absolute' }} resizeMode="cover" />
        : <Text style={{ fontSize: size * 0.34, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>{initials}</Text>
      }
    </LinearGradient>
  )
}

export function ComposeModal({
  visible, onClose, onPost, replyTo, profile,
}: {
  visible:  boolean
  onClose:  () => void
  onPost:   (text: string, img?: string, pollOptions?: string[], isAnonymous?: boolean) => void
  replyTo:  Post | null
  profile:  UserProfile
}) {
  const insets = useSafeAreaInsets()
  const [text, setText]         = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [showPoll, setShowPoll] = useState(false)
  const [isAnon, setIsAnon]     = useState(false)
  const [pollOpts, setPollOpts] = useState<string[]>(['', ''])
  const inputRef = useRef<TextInput>(null)

  const remaining = MAX_CHARS - text.length
  const charColor = remaining < 20 ? T.red : remaining < 50 ? T.amber : T.muted
  const pct       = Math.max(0, Math.min(100, ((MAX_CHARS - remaining) / MAX_CHARS) * 100))
  const canPost   = text.trim().length > 0 && (!showPoll || pollOpts.filter(o => o.trim()).length >= 2)

  useEffect(() => {
    if (visible) {
      setText(''); setImageUri(null); setShowPoll(false); setIsAnon(false); setPollOpts(['', ''])
      const t = setTimeout(() => inputRef.current?.focus(), 350)
      return () => clearTimeout(t)
    }
  }, [visible])

  const pickImage = async () => {
    if (showPoll) return
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true,
    })
    if (!r.canceled && r.assets[0]) setImageUri(r.assets[0].uri)
  }

  const addPollOption = () => { if (pollOpts.length < 4) setPollOpts(p => [...p, '']) }
  const updatePollOpt = (val: string, idx: number) => {
    const next = [...pollOpts]; next[idx] = val; setPollOpts(next)
  }
  const removePollOption = (idx: number) => {
    if (pollOpts.length <= 2) return
    setPollOpts(p => p.filter((_, i) => i !== idx))
  }

  const handlePost = () => {
    if (!canPost) return
    onPost(
      text.trim(),
      imageUri ?? undefined,
      showPoll ? pollOpts.filter(o => o.trim()) : undefined,
      isAnon,
    )
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: T.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[st.header, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={st.cancelBtn}>
            <Text style={{ fontSize: 16, color: T.text }}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[st.postBtn, !canPost && { opacity: 0.45 }]}
            onPress={handlePost}
            disabled={!canPost}
          >
            <Text style={st.postBtnText}>{replyTo ? 'Reply' : 'Post'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Reply context */}
          {replyTo && (
            <View style={st.replyCtx}>
              <View style={{ alignItems: 'center' }}>
                <Avatar initials={replyTo.avatar} grad={replyTo.avatarGrad} size={36} uri={replyTo.avatarUri} />
                <View style={st.threadLine} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={st.replyName}>{replyTo.name}</Text>
                  <Text style={st.replyHandle}>{replyTo.handle}</Text>
                </View>
                <Text style={st.replySnippet} numberOfLines={3}>{replyTo.text}</Text>
                <Text style={st.replyLabel}>
                  Replying to <Text style={{ color: T.accent }}>{replyTo.handle}</Text>
                </Text>
              </View>
            </View>
          )}

          {/* Compose row */}
          <View style={st.row}>
            {/* Always shows real profile avatar unless anonymous */}
            <Avatar
              initials={isAnon ? '?' : profile.initials}
              grad={isAnon ? ['#3e4144', '#16181c'] : profile.grad}
              size={40}
              uri={isAnon ? null : profile.avatarUri}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              {/* Anon indicator */}
              {isAnon && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <View style={{ backgroundColor: T.bg4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: T.muted, fontSize: 13, fontWeight: '600' }}>Posting anonymously</Text>
                  </View>
                </View>
              )}
              <TextInput
                ref={inputRef}
                style={st.input}
                placeholder={replyTo ? 'Post your reply…' : "What's happening?"}
                placeholderTextColor={T.muted}
                multiline
                value={text}
                onChangeText={setText}
                maxLength={MAX_CHARS + 10}
              />

              {/* Image preview */}
              {imageUri && (
                <View style={{ marginTop: 10, position: 'relative' }}>
                  <Image
                    source={{ uri: imageUri }}
                    style={{ width: '100%', borderRadius: 16, aspectRatio: 16 / 9 }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity onPress={() => setImageUri(null)} style={st.imgRemove}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Poll builder */}
              {showPoll && (
                <View style={st.pollCard}>
                  <Text style={st.pollTitle}>Poll options</Text>
                  {pollOpts.map((opt, i) => (
                    <View key={i} style={st.pollInputWrap}>
                      <TextInput
                        style={st.pollInput}
                        placeholder={`Choice ${i + 1}`}
                        placeholderTextColor={T.muted}
                        value={opt}
                        onChangeText={v => updatePollOpt(v, i)}
                        maxLength={25}
                      />
                      {pollOpts.length > 2 && (
                        <TouchableOpacity onPress={() => removePollOption(i)} hitSlop={8}>
                          <Ionicons name="close-circle" size={18} color={T.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {pollOpts.length < 4 && (
                    <TouchableOpacity style={st.addOptBtn} onPress={addPollOption}>
                      <Ionicons name="add-circle-outline" size={18} color={T.accent} />
                      <Text style={{ color: T.accent, fontWeight: '700', fontSize: 14 }}>Add option</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => { setShowPoll(false); setPollOpts(['', '']) }}
                    style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 8 }}
                  >
                    <Text style={{ color: T.red, fontWeight: '700' }}>Remove poll</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Toolbar */}
        <View style={st.toolbar}>
          <TouchableOpacity style={st.toolBtn} onPress={pickImage} disabled={showPoll}>
            <Ionicons name="image-outline" size={22} color={showPoll ? T.muted : T.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={st.toolBtn}
            onPress={() => { setShowPoll(p => !p); setImageUri(null) }}
            disabled={!!imageUri}
          >
            <Ionicons name="bar-chart-outline" size={22} color={imageUri ? T.muted : (showPoll ? T.accent : T.accent)} />
          </TouchableOpacity>
          <TouchableOpacity style={st.toolBtn} onPress={() => setIsAnon(!isAnon)}>
            <Ionicons
              name={isAnon ? 'eye-off' : 'eye-off-outline'}
              size={22}
              color={isAnon ? T.accent : T.muted}
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={st.charTrack}>
            {remaining <= 50 && (
              <Text style={[st.charCount, { color: charColor }]}>{remaining}</Text>
            )}
            {/* Progress ring */}
            <View style={st.ringWrap}>
              <View style={[st.ring, {
                borderColor: pct > 90 ? T.red : pct > 70 ? T.amber : T.muted,
                opacity:     pct > 10 ? 1 : 0.3,
              }]} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const st = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#2f3336' },
  cancelBtn:    { paddingVertical: 8 },
  postBtn:      { backgroundColor: '#1DA1F2', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  postBtnText:  { fontSize: 14, fontWeight: '800', color: '#fff' },

  replyCtx:     { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  replyName:    { fontSize: 15, fontWeight: '700', color: '#e7e9ea' },
  replyHandle:  { fontSize: 14, color: '#71767b' },
  replyLabel:   { fontSize: 14, color: '#71767b', marginTop: 6, marginBottom: 8 },
  replySnippet: { fontSize: 14, color: '#8b98a5', lineHeight: 20, marginTop: 4 },
  threadLine:   { width: 2, flex: 1, backgroundColor: '#3e4144', marginTop: 6, borderRadius: 1 },

  row:          { flexDirection: 'row', padding: 16, paddingTop: 12 },
  input:        { fontSize: 18, color: '#e7e9ea', lineHeight: 28, minHeight: 80, paddingTop: 0 },
  imgRemove:    { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },

  pollCard:     { marginTop: 12, borderWidth: 1, borderColor: '#2f3336', borderRadius: 16, padding: 14 },
  pollTitle:    { fontSize: 13, fontWeight: '700', color: '#71767b', marginBottom: 8 },
  pollInputWrap:{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#2f3336', paddingVertical: 12, gap: 8 },
  pollInput:    { flex: 1, fontSize: 15, color: '#e7e9ea' },
  addOptBtn:    { paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },

  toolbar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#2f3336', backgroundColor: '#000' },
  toolBtn:      { padding: 10 },
  charTrack:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  charCount:    { fontSize: 13, fontWeight: '600' },
  ringWrap:     { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  ring:         { width: 20, height: 20, borderRadius: 10, borderWidth: 2, position: 'absolute' },
})