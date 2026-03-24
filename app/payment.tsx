import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'

const BACKEND_URL = 'https://studentshare-backend.onrender.com'

export default function PaymentScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{
    plan_id: string
    plan_name: string
    price: string
    original_price: string
    duration: string
  }>()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const btnScale = useRef(new Animated.Value(1)).current

  const price = Number(params.price)
  const originalPrice = Number(params.original_price)
  const savings = originalPrice - price
  const savingsPct = Math.round((savings / originalPrice) * 100)

  async function handleCheckout() {
    setError(null)
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.97, duration: 70,  useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1,    duration: 100, useNativeDriver: true }),
    ]).start()
    setLoading(true)

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Please sign in to continue')

      const res = await fetch(`${BACKEND_URL}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan:      params.plan_id,
          userId:    user.id,
          userEmail: user.email,
          userName:  user.user_metadata?.full_name || '',
        }),
      })

      const data = await res.json()
      if (!res.ok)           throw new Error(data.error || 'Failed to create checkout. Please try again.')
      if (!data.checkoutUrl) throw new Error('No checkout URL returned.')

      // ✅ Opens an in-app browser sheet — user never fully leaves the app.
      // On payment completion, Monime redirects to studentshare://payment-pending
      // which closes the browser automatically and returns to the app.
      const result = await WebBrowser.openAuthSessionAsync(
        data.checkoutUrl,
        'studentshare://payment-pending',
      )

      if (result.type === 'success') {
        // Monime redirected back → payment was completed → go to pending screen
        router.replace('/payment-pending')
      } else {
        // User closed the browser without paying — stay on payment screen
        // so they can try again. No error shown since they chose to cancel.
        setLoading(false)
      }

    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#080E1A' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerGlow} />
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#94A3B8" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Complete Payment</Text>
            <View style={styles.secureChip}>
              <Ionicons name="lock-closed" size={10} color="#34D399" />
              <Text style={styles.secureChipText}>Secured by Monime</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* ── Plan Card ── */}
        <View style={styles.planCard}>
          <View style={styles.planCardInner}>
            <View style={styles.planIconBox}>
              <Ionicons name="star" size={22} color="#FBBF24" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planCardName}>{params.plan_name} Plan</Text>
              <Text style={styles.planCardDuration}>{params.duration} · Full premium access</Text>
            </View>
          </View>

          <View style={styles.planCardDivider} />

          {/* Price breakdown */}
          <View style={styles.priceBreakdown}>
            <View style={styles.priceRow}>
              <Text style={styles.priceRowLabel}>Original price</Text>
              <Text style={styles.priceRowStrike}>SLE {originalPrice}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceRowLabel}>Discount applied</Text>
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>−{savingsPct}% OFF</Text>
              </View>
            </View>
            <View style={styles.priceTotalRow}>
              <Text style={styles.priceTotalLabel}>You pay today</Text>
              <Text style={styles.priceTotalValue}>SLE {price}</Text>
            </View>
          </View>

          <View style={styles.savingsBanner}>
            <Ionicons name="trending-down" size={14} color="#34D399" />
            <Text style={styles.savingsBannerText}>
              You're saving <Text style={{ color: '#34D399', fontWeight: '800' }}>SLE {savings}</Text> on this plan
            </Text>
          </View>
        </View>

        {/* ── What you get ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WHAT'S INCLUDED</Text>
          <View style={styles.includesList}>
            {[
              { icon: 'documents-outline',            color: '#60A5FA', text: 'Past questions & study slides'     },
              { icon: 'play-circle-outline',           color: '#FBBF24', text: 'Full video lesson library'         },
              { icon: 'sparkles-outline',              color: '#A78BFA', text: 'AI study assistant — ask anything' },
              { icon: 'book-outline',                  color: '#34D399', text: 'Complete textbook access'          },
              { icon: 'checkmark-done-circle-outline', color: '#F87171', text: 'Worked solutions & answers'        },
            ].map((item, i) => (
              <View key={i} style={styles.includeRow}>
                <View style={[styles.includeIconBox, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon as any} size={17} color={item.color} />
                </View>
                <Text style={styles.includeText}>{item.text}</Text>
                <Ionicons name="checkmark" size={15} color="#34D399" />
              </View>
            ))}
          </View>
        </View>

        {/* ── Payment methods ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCEPTED PAYMENT METHODS</Text>
          <View style={styles.methodsRow}>
            <View style={styles.methodCard}>
              <View style={[styles.methodDot, { backgroundColor: '#FF6B00' }]} />
              <View>
                <Text style={styles.methodName}>Orange Money</Text>
                <Text style={styles.methodSub}>Instant activation</Text>
              </View>
            </View>
            <View style={styles.methodCard}>
              <View style={[styles.methodDot, { backgroundColor: '#00A651' }]} />
              <View>
                <Text style={styles.methodName}>Afrimoney</Text>
                <Text style={styles.methodSub}>Instant activation</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── How it works ── */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How it works</Text>
          {[
            { step: '01', text: "Tap \"Pay Now\" to open Monime's secure checkout" },
            { step: '02', text: 'Choose Orange Money or Afrimoney and pay'          },
            { step: '03', text: 'Return to the app — access activates instantly'    },
          ].map((s, i) => (
            <View key={i} style={[styles.stepRow, i < 2 && styles.stepRowBorder]}>
              <Text style={styles.stepNum}>{s.step}</Text>
              <Text style={styles.stepText}>{s.text}</Text>
            </View>
          ))}
        </View>

        {/* ── Error ── */}
        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color="#F87171" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── CTA ── */}
        <View style={styles.ctaWrapper}>
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              style={[styles.ctaBtn, loading && styles.ctaDisabled]}
              onPress={handleCheckout}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#0F172A" size="small" />
              ) : (
                <>
                  <Ionicons name="lock-closed" size={17} color="#0F172A" />
                  <Text style={styles.ctaText}>Pay SLE {price} Now</Text>
                  <Ionicons name="arrow-forward" size={17} color="#0F172A" />
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.footerRow}>
            <Ionicons name="shield-checkmark-outline" size={13} color="#1E3048" />
            <Text style={styles.footerText}>256-bit encrypted · Powered by Monime</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 20,
    backgroundColor: '#0D1526', borderBottomWidth: 1, borderBottomColor: '#1A2640',
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    top: -100, right: -40, backgroundColor: '#FBBF24', opacity: 0.06,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#131F33', borderWidth: 1, borderColor: '#1E3048',
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter:   { alignItems: 'center', gap: 5 },
  headerTitle:    { fontSize: 16, fontWeight: '700', color: '#F1F5F9', letterSpacing: -0.3 },
  secureChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#34D39915', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#34D39930',
  },
  secureChipText: { fontSize: 10, fontWeight: '700', color: '#34D399', letterSpacing: 0.3 },
  planCard: {
    marginHorizontal: 16, marginTop: 20, backgroundColor: '#0D1526',
    borderRadius: 18, borderWidth: 1, borderColor: '#FBBF2430', overflow: 'hidden',
  },
  planCardInner:    { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  planIconBox: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: '#FBBF2415', borderWidth: 1, borderColor: '#FBBF2430',
    justifyContent: 'center', alignItems: 'center',
  },
  planCardName:     { fontSize: 17, fontWeight: '800', color: '#F1F5F9', letterSpacing: -0.3 },
  planCardDuration: { fontSize: 13, color: '#475569', marginTop: 2 },
  planCardDivider:  { height: 1, backgroundColor: '#1A2640', marginHorizontal: 18 },
  priceBreakdown:   { padding: 18, gap: 8 },
  priceRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceRowLabel:    { fontSize: 13, color: '#475569' },
  priceRowStrike:   { fontSize: 13, color: '#334155', textDecorationLine: 'line-through' },
  discountBadge: {
    backgroundColor: '#34D39920', borderRadius: 6,
    borderWidth: 1, borderColor: '#34D39940', paddingHorizontal: 8, paddingVertical: 2,
  },
  discountBadgeText: { fontSize: 11, fontWeight: '800', color: '#34D399' },
  priceTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1A2640',
  },
  priceTotalLabel:  { fontSize: 15, fontWeight: '700', color: '#CBD5E1' },
  priceTotalValue:  { fontSize: 26, fontWeight: '800', color: '#FBBF24', letterSpacing: -1 },
  savingsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#34D39910', borderTopWidth: 1, borderTopColor: '#34D39920',
    paddingHorizontal: 18, paddingVertical: 11,
  },
  savingsBannerText: { fontSize: 13, color: '#64748B' },
  section:       { paddingHorizontal: 16, marginTop: 24 },
  sectionLabel:  { fontSize: 10, fontWeight: '800', color: '#334155', letterSpacing: 2, marginBottom: 12 },
  includesList: {
    backgroundColor: '#0D1526', borderRadius: 16,
    borderWidth: 1, borderColor: '#1A2640', overflow: 'hidden',
  },
  includeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#1A2640',
  },
  includeIconBox: { width: 34, height: 34, borderRadius: 9, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  includeText:    { flex: 1, fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  methodsRow:     { flexDirection: 'row', gap: 10 },
  methodCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0D1526', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2640', padding: 14,
  },
  methodDot:  { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  methodName: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
  methodSub:  { fontSize: 11, color: '#334155', marginTop: 1 },
  stepsCard: {
    marginHorizontal: 16, marginTop: 24, backgroundColor: '#0A1220',
    borderRadius: 16, borderWidth: 1, borderColor: '#1A2640', padding: 18,
  },
  stepsTitle:    { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 },
  stepRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 10 },
  stepRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1A2640' },
  stepNum:       { fontSize: 11, fontWeight: '800', color: '#60A5FA', letterSpacing: 0.5, width: 22 },
  stepText:      { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 20 },
  errorCard: {
    marginHorizontal: 16, marginTop: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#1A0A0A', borderRadius: 12,
    borderWidth: 1, borderColor: '#3B1515', padding: 13,
  },
  errorText:  { flex: 1, fontSize: 13, color: '#F87171', lineHeight: 19 },
  ctaWrapper: { paddingHorizontal: 16, marginTop: 24 },
  ctaBtn: {
    borderRadius: 14, paddingVertical: 18, backgroundColor: '#FBBF24',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  ctaDisabled: { opacity: 0.65 },
  ctaText:     { color: '#0F172A', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  footerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  footerText:  { fontSize: 12, color: '#1E3048' },
})