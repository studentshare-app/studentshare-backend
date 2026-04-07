import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Markdown from 'react-native-markdown-display'
import { useMessages } from '@/hooks/useLocalQueries'
import { sendMessage as sendLocalMessage } from '@/database/actions'
import { OfflineBanner } from '@/components/OfflineBanner'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { supabase } from '@/core/api/supabase'
import database from '@/database'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  void:       '#07080C',
  deep:       '#0B0D13',
  surface:    '#10131C',
  raised:     '#161B27',
  border:     'rgba(255,255,255,0.055)',
  text:       '#EEF0F8',
  textSub:    '#6E7A96',
  textMute:   '#353D52',
  orange:     '#E8692A',
  orangeDim:  'rgba(232,105,42,0.10)',
  orangeGlow: 'rgba(232,105,42,0.18)',
} as const

const quickChips = [
  'Summarise this document',
  'What are the key points?',
  'Give me practice questions',
  'Explain it simply',
]

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ]

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(480 - i * 160),
        ])
      )
    )
    anims.forEach(a => a.start())
    return () => anims.forEach(a => a.stop())
  }, [])

  return (
    <View style={typingStyles.row}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            typingStyles.dot,
            {
              opacity: dot,
              transform: [
                { translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  )
}

const typingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.orange,
  },
})

// ── Message row ───────────────────────────────────────────────────────────────
function MessageRow({ item }: { item: any }) {
  const isAI = item.senderId === 'ai' || item.role === 'assistant'

  if (isAI) {
    return (
      <View style={msgStyles.aiRow}>
        <View style={msgStyles.aiAvatar}>
          <Ionicons name="sparkles" size={14} color={C.orange} />
        </View>
        <View style={msgStyles.aiBody}>
          <Text style={msgStyles.label}>AI TUTOR</Text>
          <View style={msgStyles.aiBubble}>
            <Markdown style={markdownStyles}>{item.content}</Markdown>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={msgStyles.userRow}>
      <View style={msgStyles.userBody}>
        <Text style={[msgStyles.label, { textAlign: 'right' }]}>STUDENT</Text>
        <View style={msgStyles.userBubble}>
          <Text style={msgStyles.userText}>{item.content}</Text>
        </View>
      </View>
      <View style={msgStyles.userAvatar}>
        <Ionicons name="person" size={14} color={C.textSub} />
      </View>
    </View>
  )
}

const msgStyles = StyleSheet.create({
  aiRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 20,
    paddingRight: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    maxWidth: '88%',
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.orangeDim,
    borderWidth: 1,
    borderColor: C.orange + '50',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginBottom: 2,
    shadowColor: C.orange,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },
  aiBody:   { flex: 1, gap: 5 },
  userBody: { flex: 1, gap: 5, alignItems: 'flex-end' },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: C.textMute,
    marginLeft: 2,
    marginRight: 2,
    textTransform: 'uppercase',
  },
  aiBubble: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: C.orange,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: C.orange,
    shadowOpacity: 0.30,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  userText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 21,
  },
})

// ── Markdown styles ───────────────────────────────────────────────────────────
const markdownStyles = {
  body:         { color: C.text, fontSize: 14, lineHeight: 22 },
  strong:       { fontWeight: '700' as const, color: '#FDEBD8' },
  em:           { fontStyle: 'italic' as const },
  bullet_list:  { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item:    { marginVertical: 3 },
  heading1: { fontSize: 18, fontWeight: '700' as const, marginVertical: 8,  color: C.text },
  heading2: { fontSize: 16, fontWeight: '700' as const, marginVertical: 6,  color: C.text },
  heading3: { fontSize: 14, fontWeight: '600' as const, marginVertical: 4,  color: C.text },
  code_inline: {
    backgroundColor: C.void,
    borderRadius: 4,
    paddingHorizontal: 5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    color: C.orange,
  },
  fence: {
    backgroundColor: C.void,
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    color: C.orange,
  },
  paragraph:  { marginVertical: 2 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: C.orange + '50',
    paddingLeft: 12,
    marginLeft: 0,
    color: C.textSub,
  },
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AiChatScreen() {
  const router = useRouter()
  const {
    material_title,
    file_url,
    conversation_id,
    material_id,
  } = useLocalSearchParams<{
    material_title: string
    file_url: string
    conversation_id: string
    material_id: string
  }>()

  const isGeneral  = !file_url || file_url === ''
  const { isOffline } = useNetworkStatus()
  const insets     = useSafeAreaInsets()
  const flatListRef = useRef<FlatList>(null)

  // Active conversation in WatermelonDB
  const [convId, setConvId] = useState(
    conversation_id && conversation_id !== 'new' ? conversation_id : ''
  )

  // Reactive messages from WatermelonDB
  const { records: dbMessages, loading: messagesLoading } = useMessages(convId)

  const [input,           setInput]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [documentContent, setDocumentContent] = useState<string | null>(null)

  // ── Welcome message (shown only when no messages exist yet) ─────────────────
  const welcomeMessage = isGeneral
    ? `Hello! I'm your **AI Study Tutor** ✦\n\nAsk me anything — concepts, exam prep, essay help, or general study questions. I'm here to help you succeed.`
    : `Hello! I'm your **AI Study Tutor** ✦\n\nI'm ready to help you study **${material_title}**. Ask me anything about this document — I'll guide you through it.`

  // Merge welcome + db messages for display
  const displayMessages: any[] = dbMessages.length === 0 && !messagesLoading
    ? [{ id: 'welcome', senderId: 'ai', content: welcomeMessage }]
    : dbMessages

  const showChips = dbMessages.length === 0

  // ── Fetch document text from Supabase (background) ─────────────────────────
  useEffect(() => {
    if (isGeneral) return
    async function fetchDocContent() {
      if (material_id) {
        const { data } = await supabase
          .from('materials').select('content_text').eq('id', material_id).single()
        if (data?.content_text) { setDocumentContent(data.content_text); return }
      }
      if (file_url) {
        const { data } = await supabase
          .from('materials').select('content_text').eq('file_url', file_url).single()
        if (data?.content_text) setDocumentContent(data.content_text)
      }
    }
    fetchDocContent()
  }, [material_id, file_url])

  // ── Send message ────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading) return
    if (isOffline) {
      Alert.alert('You are offline', 'The AI Tutor needs an internet connection to respond.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const currentInput = input.trim()
    setInput('')
    setLoading(true)

    try {
      // 1. Create conversation locally if new
      let activeConvId = convId
      if (!activeConvId) {
        const now = Date.now()
        await database.write(async () => {
          const collection = database.collections.get('conversations')
          const newConvo = await (collection as any).create((c: any) => {
            c.participantIdsRaw = JSON.stringify([user.id, 'ai'])
            c.lastMessage       = currentInput.slice(0, 80)
            c.lastMessageAt     = now
            c.unreadCount       = 0
            c.deleted           = false
            c.createdAt         = now
            c.updatedAt         = now
          })
          activeConvId = newConvo.id
          setConvId(activeConvId)
        })
      }

      // 2. Save user message locally (shows immediately via WatermelonDB observer)
      await sendLocalMessage(user.id, activeConvId!, currentInput)

      // 3. Build system prompt
      let systemPrompt: string
      if (isGeneral) {
        systemPrompt = `You are a helpful and friendly AI study tutor for university and college students in Sierra Leone. Help students understand academic concepts, answer questions about their courses, assist with exam preparation, and explain difficult topics clearly. Be concise, encouraging, and student-friendly.`
      } else if (documentContent) {
        systemPrompt = `You are a helpful study tutor for students. The student is studying a document called "${material_title}".\n\nDocument content:\n---\n${documentContent.slice(0, 12000)}\n---\n\nAnswer the student's questions using this document. Be concise, accurate, and student-friendly.`
      } else {
        systemPrompt = `You are a helpful study tutor for students. The student is studying a document called "${material_title}". Help them understand the material and prepare for exams. Be concise and student-friendly.`
      }

      // 4. Call AI proxy
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        Alert.alert('Session expired', 'Please sign in again.')
        setLoading(false)
        return
      }

      const chatHistory = dbMessages.map((m: any) => ({
        role:    m.senderId === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }))

      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          messages: [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
            { role: 'user', content: currentInput },
          ],
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (error) {
        const errorBody = await (error as any).context?.json?.().catch(() => ({})) ?? {}
        console.error('[AiChat] Edge Function error:', JSON.stringify(errorBody))
        Alert.alert('Error', JSON.stringify(errorBody) || error.message)
        setLoading(false)
        return
      }

      if (!data?.choices?.[0]?.message?.content) {
        console.error('[AiChat] Unexpected response shape:', JSON.stringify(data))
        Alert.alert('Error', 'Unexpected response from AI. Please try again.')
        setLoading(false)
        return
      }

      // 5. Save AI response locally
      const aiText = data.choices[0].message.content
      await sendLocalMessage('ai', activeConvId!, aiText)

    } catch (e: any) {
      console.error('[AiChat] sendMessage error:', e)
      Alert.alert('Error', e?.message || 'Could not connect to AI. Please try again.')
    }

    setLoading(false)
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (messagesLoading && convId) {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.loadingIconBox}>
          <Ionicons name="sparkles" size={28} color={C.orange} />
        </View>
        <Text style={styles.loadingTitle}>Loading conversation…</Text>
        <ActivityIndicator size="small" color={C.orange} style={{ marginTop: 8 }} />
      </View>
    )
  }

  return (
    <View style={[styles.safeArea, { paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >

        {/* ── Offline banner ────────────────────────────────────────────── */}
        {isOffline && <OfflineBanner />}

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={C.textSub} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              <Text style={styles.headerAccent}>✦ </Text>
              StudentShare AI Tutor
            </Text>
            {!isGeneral && (
              <Text style={styles.headerSub} numberOfLines={1}>{material_title}</Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/student-chat' as any)}
          >
            <Ionicons name="time-outline" size={18} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {/* ── Messages ─────────────────────────────────────────────────── */}
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={styles.dateDivider}>
              <Text style={styles.dateDividerText}>TODAY</Text>
            </View>
          }
          renderItem={({ item }) => <MessageRow item={item} />}
          ListFooterComponent={
            loading ? (
              <View style={msgStyles.aiRow}>
                <View style={msgStyles.aiAvatar}>
                  <Ionicons name="sparkles" size={14} color={C.orange} />
                </View>
                <View style={msgStyles.aiBody}>
                  <Text style={msgStyles.label}>AI TUTOR</Text>
                  <View style={msgStyles.aiBubble}>
                    <TypingDots />
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        {/* ── Input area ───────────────────────────────────────────────── */}
        <View style={styles.inputWrapper}>

          {/* Quick chips — shown before first user message */}
          {showChips && (
            <View style={styles.chipsRow}>
              {quickChips.map((chip, i) => (
                <TouchableOpacity
                  key={chip}
                  style={[styles.chip, i === 0 ? styles.chipPrimary : styles.chipDefault]}
                  onPress={() => setInput(chip)}
                >
                  <Text style={[
                    styles.chipText,
                    i === 0 ? styles.chipTextPrimary : styles.chipTextDefault,
                  ]}>
                    {chip}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={isGeneral ? 'Ask your tutor anything…' : 'Ask about this document…'}
              placeholderTextColor={C.textMute}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                input.trim() && !loading ? styles.sendActive : styles.sendDisabled,
              ]}
              onPress={sendMessage}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="arrow-up" size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.disclaimer}>
            StudentShare AI Tutor can make mistakes. Verify important information.
          </Text>
        </View>

      </KeyboardAvoidingView>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: C.void },
  container: { flex: 1, backgroundColor: C.void },

  loadingScreen: {
    flex: 1,
    backgroundColor: C.void,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingIconBox: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: C.orangeDim,
    borderWidth: 1,
    borderColor: C.orange + '40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: C.orange,
    shadowOpacity: 0.30,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: C.deep,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
    fontFamily: 'serif',
  },
  headerAccent: {
    color: C.orange,
    fontStyle: 'italic',
  },
  headerSub: {
    fontSize: 11,
    color: C.textMute,
    maxWidth: 220,
    letterSpacing: 0.2,
  },

  messagesList: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexGrow: 1,
  },

  dateDivider: {
    alignItems: 'center',
    marginBottom: 24,
  },
  dateDividerText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.8,
    color: C.textMute,
    textTransform: 'uppercase',
  },

  inputWrapper: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: C.deep,
  },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 100,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderWidth: 1,
  },
  chipPrimary:      { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  chipDefault:      { backgroundColor: C.surface,   borderColor: C.border },
  chipText:         { fontSize: 11, fontWeight: '600' },
  chipTextPrimary:  { color: C.orange },
  chipTextDefault:  { color: C.textSub },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    maxHeight: 120,
    paddingVertical: 6,
    lineHeight: 21,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  sendActive: {
    backgroundColor: C.orange,
    shadowColor: C.orange,
    shadowOpacity: 0.40,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sendDisabled: { backgroundColor: C.raised },

  disclaimer: {
    fontSize: 10,
    fontWeight: '500',
    color: C.textMute,
    textAlign: 'center',
    marginTop: 9,
    letterSpacing: 0.2,
  },
})
