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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// ── Design tokens — mirrors index.tsx exactly ────────────────────────────────
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

// ── Typing dots ──────────────────────────────────────────────────────────────
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

// ── Message row ──────────────────────────────────────────────────────────────
function MessageRow({ item }: { item: Message }) {
  if (item.role === 'assistant') {
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

// ── Markdown — matches index.tsx palette ─────────────────────────────────────
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

// ── Main screen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
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

  const isGeneral = !file_url || file_url === ''
  const isNew     = !conversation_id || conversation_id === 'new'
  const { isOffline } = useNetworkStatus()
  const insets    = useSafeAreaInsets()

  const [messages,        setMessages]        = useState<Message[]>([])
  const [input,           setInput]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [initializing,    setInitializing]    = useState(true)
  const [documentContent, setDocumentContent] = useState<string | null>(null)

  const flatListRef = useRef<FlatList>(null)
  const convIdRef   = useRef<string>(isNew ? Date.now().toString() : conversation_id)

  const welcomeMessage = isGeneral
    ? `Hi there! I'm your **StudentShare AI Tutor** — here to help you study smarter 🎓\n\nI can help you with:\n- Explaining difficult concepts\n- Answering course questions\n- Exam preparation strategies\n- Summarizing topics\n\nWhat would you like to explore today?`
    : `Hi! I've loaded **${material_title}** and I'm ready to help.\n\nAsk me anything about this document — explanations, summaries, exam prep, you name it!`

  const quickChips = isGeneral
    ? ['Explain a concept', 'Exam tips', 'Study plan', 'Summarize topic']
    : ['Summarize this', 'Key concepts', 'Practice questions', 'Explain a section']

  useEffect(() => { initChat() }, [])

  // ── Fetch document content ─────────────────────────────────────────────────
  async function fetchDocumentContent() {
    if (isGeneral) return
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

  // ── Init chat ──────────────────────────────────────────────────────────────
  async function initChat() {
  if (!isNew) {
    // Try local cache first (offline-safe)
    const raw = await AsyncStorage.getItem(`messages_${convIdRef.current}`)
    if (raw) {
      setMessages(JSON.parse(raw))
      setInitializing(false)
      fetchDocumentContent()  // background
      return
    }
    // Fall back to Supabase
    const { data } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', convIdRef.current)
      .order('created_at', { ascending: true })
    if (data && data.length > 0) {
      const loaded: Message[] = data.map(m => ({ id: m.id, role: m.role, content: m.content }))
      setMessages(loaded)
      await AsyncStorage.setItem(`messages_${convIdRef.current}`, JSON.stringify(loaded))
      setInitializing(false)
      fetchDocumentContent()  // background
      return
    }
  }

  // New chat — show welcome immediately
  setMessages([{ id: 'welcome', role: 'assistant', content: welcomeMessage }])
  setInitializing(false)
  fetchDocumentContent()      // background
}

  

  // ── Save conversation (AsyncStorage + Supabase) ────────────────────────────
  async function saveConversation(allMessages: Message[], lastUserMessage: string) {
    const convId = convIdRef.current
    const now    = new Date().toISOString()
    const title  = lastUserMessage.slice(0, 50) || (isGeneral ? 'General Chat' : material_title)

    // Always persist locally first
    await AsyncStorage.setItem(`messages_${convId}`, JSON.stringify(allMessages))

    // Update conversations list in AsyncStorage
    const raw      = await AsyncStorage.getItem('conversations')
    const convList = raw ? JSON.parse(raw) : []
    const existingIndex = convList.findIndex((c: any) => c.id === convId)
    const convData = {
      id:             convId,
      title:          existingIndex === -1 ? title : convList[existingIndex].title,
      material_title: material_title || 'General Assistant',
      file_url:       file_url || '',
      updated_at:     now,
      last_message:   lastUserMessage.slice(0, 80),
    }
    if (existingIndex === -1) convList.unshift(convData)
    else convList[existingIndex] = { ...convList[existingIndex], ...convData }
    await AsyncStorage.setItem('conversations', JSON.stringify(convList))

    // Best-effort Supabase sync (non-blocking)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('conversations').upsert({
          id:             convId,
          user_id:        user.id,
          title:          convData.title,
          material_title: material_title || 'General Assistant',
          file_url:       file_url || '',
          updated_at:     now,
          last_message:   convData.last_message,
        })
        const last2 = allMessages.filter(m => m.id !== 'welcome').slice(-2)
        for (const msg of last2) {
          await supabase.from('conversation_messages').upsert({
            id:              msg.id,
            conversation_id: convId,
            role:            msg.role,
            content:         msg.content,
          })
        }
      }
    } catch { /* saved locally — fine offline */ }
  }

  // ── Send message ───────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading) return
    if (isOffline) {
      Alert.alert(
        'You are offline 📡',
        'The AI Tutor needs an internet connection to respond.',
        [{ text: 'OK' }]
      )
      return
    }

    const userMessage: Message = {
      id:      Date.now().toString(),
      role:    'user',
      content: input.trim(),
    }
    const currentInput    = input.trim()
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    let systemPrompt: string
    if (isGeneral) {
      systemPrompt = `You are a helpful and friendly AI study tutor for university and college students in Sierra Leone. Help students understand academic concepts, answer questions about their courses, assist with exam preparation, and explain difficult topics clearly. Be concise, encouraging, and student-friendly.`
    } else if (documentContent) {
      systemPrompt = `You are a helpful study tutor for students. The student is studying a document called "${material_title}".\n\nDocument content:\n---\n${documentContent.slice(0, 12000)}\n---\n\nAnswer the student's questions using this document. Be concise, accurate, and student-friendly.`
    } else {
      systemPrompt = `You are a helpful study tutor for students. The student is studying a document called "${material_title}". Help them understand the material and prepare for exams. Be concise and student-friendly.`
    }

    try {
      // Get the current session to explicitly pass the auth token
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.access_token) {
        Alert.alert('Session expired', 'Please sign in again.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          messages: [
            { role: 'system', content: systemPrompt },
            ...updatedMessages
              .filter(m => m.id !== 'welcome')
              .map(m => ({ role: m.role, content: m.content })),
          ],
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (error) {
  const errorBody = await (error as any).context?.json?.().catch(() => ({})) ?? {}
  console.error('[chat] Edge Function error body:', JSON.stringify(errorBody))
  console.error('[chat] Edge Function error:', error.message, error)
  Alert.alert('Error', JSON.stringify(errorBody) || error.message)
  setLoading(false)
  return
}

      if (!data?.choices?.[0]?.message?.content) {
        console.error('[chat] Unexpected response shape:', JSON.stringify(data))
        Alert.alert('Error', 'Unexpected response from AI. Please try again.')
        setLoading(false)
        return
      }

      const assistantMessage: Message = {
        id:      (Date.now() + 1).toString(),
        role:    'assistant',
        content: data.choices[0].message.content,
      }
      const finalMessages = [...updatedMessages, assistantMessage]
      setMessages(finalMessages)
      await saveConversation(finalMessages, currentInput)
    } catch (e: any) {
      console.error('[chat] sendMessage error:', e)
      Alert.alert('Error', e?.message || 'Could not connect to AI. Please try again.')
    }

    setLoading(false)
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.loadingIconBox}>
          <Ionicons name="sparkles" size={28} color={C.orange} />
        </View>
        <Text style={styles.loadingTitle}>Starting AI Tutor…</Text>
        <ActivityIndicator size="small" color={C.orange} style={{ marginTop: 8 }} />
      </View>
    )
  }

  const showChips = messages.length <= 1

  return (
    <View style={[styles.safeArea, { paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
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
            onPress={() => router.push('/conversations' as any)}
          >
            <Ionicons name="time-outline" size={18} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {/* ── Messages ────────────────────────────────────────────────────── */}
        <FlatList
          ref={flatListRef}
          data={messages}
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

        {/* ── Input area ──────────────────────────────────────────────────── */}
        <View style={styles.inputWrapper}>

          {/* Quick chips — only shown before first user message */}
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
           StudentShare  AI Tutor can make mistakes. Verify important information.
          </Text>
        </View>

      </KeyboardAvoidingView>
    </View>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
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
  chipPrimary: {
    backgroundColor: C.orangeDim,
    borderColor: C.orange + '40',
  },
  chipDefault: {
    backgroundColor: C.surface,
    borderColor: C.border,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextPrimary: { color: C.orange },
  chipTextDefault: { color: C.textSub },

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
  sendDisabled: {
    backgroundColor: C.raised,
  },

  disclaimer: {
    fontSize: 10,
    fontWeight: '500',
    color: C.textMute,
    textAlign: 'center',
    marginTop: 9,
    letterSpacing: 0.2,
  },
})