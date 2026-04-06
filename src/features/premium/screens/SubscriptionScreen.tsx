import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/core/api/supabase'

const { width } = Dimensions.get('window')
const BACKEND_URL = 'https://studentshare-backend.onrender.com'

type Plan = {
  id: string
  name: string
  duration: string
  price: number
  originalPrice: number
  savings: number
  badge?: string
  accentColor: string
  secondaryColor: string
  description: string
  perMonth: string
}

const PLANS: Plan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    duration: '1 Month',
    price: 25,
    originalPrice: 50,
    savings: 25,
    description: 'Full access, cancel anytime',
    accentColor: '#60A5FA',
    secondaryColor: '#1D4ED8',
    perMonth: 'SLE 25 / mo',
  },
  {
    id: 'academic_year',
    name: 'Academic Year',
    duration: '9 Months',
    price: 150,
    originalPrice: 225,
    savings: 75,
    badge: 'MOST POPULAR',
    description: 'Perfect for a full school year',
    accentColor: '#FBBF24',
    secondaryColor: '#92400E',
    perMonth: 'SLE 16.7 / mo',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    duration: '12 Months',
    price: 300,
    originalPrice: 600,
    savings: 300,
    badge: 'BEST VALUE',
    description: 'Maximum savings, full year access',
    accentColor: '#34D399',
    secondaryColor: '#065F46',
    perMonth: 'SLE 25 / mo',
  },
]

const FEATURES = [
  { icon: 'library', color: '#60A5FA', label: 'Past Questions', sub: 'Full archive access' },
  { icon: 'play-circle', color: '#FBBF24', label: 'Video Lessons', sub: 'Learn at your pace' },
  { icon: 'sparkles', color: '#A78BFA', label: 'AI Assistant', sub: 'Instant answers' },
  { icon: 'book-outline', color: '#34D399', label: 'Textbooks', sub: 'Full reference library' },
  { icon: 'checkmark-done', color: '#F87171', label: 'Worked Solutions', sub: 'Step-by-step answers' },
  { icon: 'cloud-download', color: '#FB923C', label: 'Offline Access', sub: 'Study anywhere' },
  { icon: 'help-circle', color: '#E879F9', label: 'AI Quizzes', sub: 'Test your knowledge' },
  { icon: 'document-text', color: '#38BDF8', label: 'AI Notes', sub: 'Auto-generated notes' },
  { icon: 'chatbubbles', color: '#4ADE80', label: 'Unlimited Chats', sub: 'Message without limits' },
]

export default function SubscriptionScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState<Plan>(PLANS[1])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pressAnim = useRef(new Animated.Value(1)).current

  function selectPlan(plan: Plan) {
    setSelected(plan)
    setError(null)
  }

  async function handleGetPlan() {
    setError(null)
    Animated.sequence([
      Animated.timing(pressAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(pressAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start()
    setLoading(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Please sign in to continue')

      const res = await fetch(`${BACKEND_URL}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selected.id,
          userId: user.id,
          userEmail: user.email,
          userName: user.user_metadata?.full_name || '',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create checkout. Please try again.')

      if (!data.checkoutUrl) throw new Error('No checkout URL returned from server.')
      await Linking.openURL(data.checkoutUrl)
      router.replace('/payment-pending')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      {/* ── Hero ── */}
      <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
        {/* Decorative orbs */}
        <View style={[styles.orb, { width: 280, height: 280, top: -120, right: -80, backgroundColor: '#FBBF24', opacity: 0.07 }]} />
        <View style={[styles.orb, { width: 200, height: 200, top: -60, left: -60, backgroundColor: '#60A5FA', opacity: 0.06 }]} />
        <View style={[styles.orb, { width: 160, height: 160, bottom: -40, right: 40, backgroundColor: '#A78BFA', opacity: 0.05 }]} />

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#94A3B8" />
        </TouchableOpacity>

        <View style={styles.heroContent}>
          <View style={styles.premiumBadge}>
            <View style={styles.premiumDot} />
            <Text style={styles.premiumBadgeText}>STUDENTSHARE PREMIUM</Text>
          </View>
          <Text style={styles.heroTitle}>Unlock Your{'\n'}Full Potential</Text>
          <Text style={styles.heroSub}>
            Everything you need to excel — past questions, video lessons, AI help, and more.
          </Text>
        </View>

        {/* Trust indicators */}
        <View style={styles.trustRow}>
          {[
            { icon: 'people', label: '2,400+ students' },
            { icon: 'star', label: '4.9 rating' },
            { icon: 'shield-checkmark', label: 'Secure payments' },
          ].map(t => (
            <View key={t.label} style={styles.trustItem}>
              <Ionicons name={t.icon as any} size={13} color="#FBBF24" />
              <Text style={styles.trustText}>{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Features ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLine} />
          <Text style={styles.sectionTitle}>WHAT'S INCLUDED</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.featuresGrid}>
          {FEATURES.map(f => (
            <View key={f.label} style={styles.featureCard}>
              <View style={[styles.featureIconBox, { backgroundColor: f.color + '15', borderColor: f.color + '30' }]}>
                <Ionicons name={f.icon as any} size={19} color={f.color} />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Text style={styles.featureSub}>{f.sub}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Plans ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLine} />
          <Text style={styles.sectionTitle}>CHOOSE YOUR PLAN</Text>
          <View style={styles.sectionLine} />
        </View>

        {PLANS.map(plan => {
          const isSelected = selected.id === plan.id
          return (
            <TouchableOpacity
              key={plan.id}
              onPress={() => selectPlan(plan)}
              activeOpacity={0.85}
            >
              <View style={[
                styles.planCard,
                isSelected && {
                  borderColor: plan.accentColor,
                  backgroundColor: plan.accentColor + '08',
                  shadowColor: plan.accentColor,
                  shadowOpacity: 0.15,
                  shadowRadius: 16,
                  elevation: 8,
                }
              ]}>
                {/* Popular badge */}
                {plan.badge && (
                  <View style={[styles.planBadge, {
                    backgroundColor: isSelected ? plan.accentColor : '#1E293B',
                    borderColor: plan.accentColor + '60',
                  }]}>
                    <Text style={[styles.planBadgeText, { color: isSelected ? '#0F172A' : plan.accentColor }]}>
                      {plan.badge}
                    </Text>
                  </View>
                )}

                <View style={styles.planBody}>
                  {/* Left: radio + info */}
                  <View style={styles.planLeft}>
                    <View style={[styles.radioOuter, {
                      borderColor: isSelected ? plan.accentColor : '#334155'
                    }]}>
                      {isSelected && (
                        <View style={[styles.radioInner, { backgroundColor: plan.accentColor }]} />
                      )}
                    </View>
                    <View style={styles.planTextBlock}>
                      <View style={styles.planTitleRow}>
                        <Text style={[styles.planName, { color: isSelected ? '#F1F5F9' : '#94A3B8' }]}>
                          {plan.name}
                        </Text>
                        <View style={[styles.durationTag, {
                          backgroundColor: isSelected ? plan.accentColor + '20' : '#1E293B',
                          borderColor: isSelected ? plan.accentColor + '40' : '#334155',
                        }]}>
                          <Text style={[styles.durationTagText, { color: isSelected ? plan.accentColor : '#475569' }]}>
                            {plan.duration}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.planDesc}>{plan.description}</Text>
                      <View style={styles.savingsChip}>
                        <Ionicons name="trending-down" size={10} color="#34D399" />
                        <Text style={styles.savingsChipText}>Save SLE {plan.savings}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Right: price */}
                  <View style={styles.planPriceBlock}>
                    <Text style={[styles.planPrice, { color: isSelected ? plan.accentColor : '#64748B' }]}>
                      SLE {plan.price}
                    </Text>
                    <Text style={styles.planStrike}>SLE {plan.originalPrice}</Text>
                    <Text style={[styles.planPerMonth, { color: isSelected ? plan.accentColor + 'AA' : '#334155' }]}>
                      {plan.perMonth}
                    </Text>
                  </View>
                </View>

                {/* Selected indicator bar */}
                {isSelected && (
                  <View style={[styles.selectedBar, { backgroundColor: plan.accentColor }]} />
                )}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Order Summary ── */}
      <View style={styles.orderSummary}>
        <Text style={styles.orderTitle}>Order Summary</Text>
        <View style={styles.orderRow}>
          <Text style={styles.orderLabel}>{selected.name} Plan</Text>
          <Text style={styles.orderValue}>{selected.duration}</Text>
        </View>
        <View style={styles.orderDivider} />
        <View style={styles.orderRow}>
          <Text style={styles.orderLabel}>Original price</Text>
          <Text style={[styles.orderValue, styles.strikeThrough]}>SLE {selected.originalPrice}</Text>
        </View>
        <View style={styles.orderDivider} />
        <View style={styles.orderRow}>
          <Text style={styles.orderLabel}>Discount (50% off)</Text>
          <Text style={styles.orderSaving}>− SLE {selected.savings}</Text>
        </View>
        <View style={[styles.orderDivider, { backgroundColor: '#334155' }]} />
        <View style={styles.orderRow}>
          <Text style={styles.orderTotalLabel}>Total due today</Text>
          <Text style={[styles.orderTotalValue, { color: selected.accentColor }]}>
            SLE {selected.price}
          </Text>
        </View>
      </View>

      {/* ── Error ── */}
      {error && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color="#F87171" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── CTA ── */}
      <Animated.View style={[styles.ctaWrapper, { transform: [{ scale: pressAnim }] }]}>
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: selected.accentColor }, loading && styles.ctaDisabled]}
          onPress={handleGetPlan}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#0F172A" size="small" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={16} color="#0F172A" />
              <Text style={styles.ctaText}>
                Continue · SLE {selected.price}
              </Text>
              <Ionicons name="arrow-forward" size={16} color="#0F172A" />
            </>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* ── Footer note ── */}
      <View style={styles.footerNote}>
        <Ionicons name="shield-checkmark-outline" size={13} color="#334155" />
        <Text style={styles.footerText}>
          Secured by Monime · Orange Money & Afrimoney accepted
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080E1A',
  },

  // ── Hero ──
  hero: {
    backgroundColor: '#0D1526',
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2640',
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#131F33',
    borderWidth: 1,
    borderColor: '#1E3048',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  heroContent: {
    marginBottom: 24,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 16,
  },
  premiumDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FBBF24',
  },
  premiumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 1.8,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#F1F5F9',
    lineHeight: 44,
    letterSpacing: -1,
    marginBottom: 12,
  },
  heroSub: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 24,
    maxWidth: 300,
  },
  trustRow: {
    flexDirection: 'row',
    gap: 16,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trustText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  // ── Section ──
  section: {
    paddingHorizontal: 16,
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1E293B',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 2,
  },

  // ── Features ──
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureCard: {
    width: (width - 48) / 3,
    backgroundColor: '#0D1526',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1A2640',
    alignItems: 'flex-start',
  },
  featureIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
  },
  featureLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 2,
  },
  featureSub: {
    fontSize: 10,
    color: '#334155',
    lineHeight: 14,
  },

  // ── Plans ──
  planCard: {
    backgroundColor: '#0D1526',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#1A2640',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  planBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: -2,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  planBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  planLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 3,
    flexShrink: 0,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  planTextBlock: {
    flex: 1,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  planName: {
    fontSize: 15,
    fontWeight: '700',
  },
  durationTag: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  durationTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  planDesc: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 7,
  },
  savingsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  savingsChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34D399',
  },
  planPriceBlock: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  planStrike: {
    fontSize: 11,
    color: '#1E3048',
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  planPerMonth: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  selectedBar: {
    height: 2,
    width: '100%',
  },

  // ── Order Summary ──
  orderSummary: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#0D1526',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1A2640',
    padding: 18,
  },
  orderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  orderDivider: {
    height: 1,
    backgroundColor: '#1A2640',
    marginVertical: 4,
  },
  orderLabel: {
    fontSize: 13,
    color: '#475569',
  },
  orderValue: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  strikeThrough: {
    textDecorationLine: 'line-through',
    color: '#334155',
  },
  orderSaving: {
    fontSize: 13,
    color: '#34D399',
    fontWeight: '700',
  },
  orderTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  orderTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  // ── Error ──
  errorCard: {
    marginHorizontal: 16,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1A0A0A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3B1515',
    padding: 13,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#F87171',
    lineHeight: 19,
  },

  // ── CTA ──
  ctaWrapper: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  ctaBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaDisabled: {
    opacity: 0.65,
  },
  ctaText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  // ── Footer ──
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 32,
  },
  footerText: {
    fontSize: 12,
    color: '#1E3048',
    textAlign: 'center',
  },
})
