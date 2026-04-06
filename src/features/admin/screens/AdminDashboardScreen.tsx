import React from 'react'
import { SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const COLORS = {
  background: '#0B1220',
  card: '#111827',
  border: '#1F2937',
  text: '#F9FAFB',
  muted: '#9CA3AF',
  accent: '#F59E0B',
}

export default function AdminDashboardScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark-outline" size={28} color={COLORS.accent} />
        </View>
        <Text style={styles.title}>Admin dashboard is being migrated</Text>
        <Text style={styles.body}>
          The route is live now so admin users do not hit a dead link. The full moderation
          and content tools can be moved here safely in the next hardening pass.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
  },
})
