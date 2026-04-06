import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { C } from '@/lib/colors'
import { CollegeSpotlight } from '../hooks/useCollegeInfo'

export function SpotlightSection({ spotlight }: { spotlight: CollegeSpotlight | null }) {
  if (!spotlight) return null

  return (
    <View style={ss.spotlightSection}>
      <View style={ss.spotlightWrap}>
        <View style={ss.spotlightHeader}>
          <View style={ss.spotlightLine} />
          <Text style={ss.spotlightLabel}>STUDENT SPOTLIGHT</Text>
        </View>

        <Text style={ss.spotlightTitle}>{spotlight.title}</Text>

        <Text style={ss.spotlightQuote}>"{spotlight.quote}"</Text>

        <Text style={ss.spotlightAuthor}>— {spotlight.author}, {spotlight.role}</Text>

        {spotlight.image_url && (
          <Image source={{ uri: spotlight.image_url }} style={ss.spotlightImage} resizeMode="cover" />
        )}
      </View>
    </View>
  )
}

const ss = StyleSheet.create({
  spotlightSection: { paddingHorizontal: 16, marginTop: 24, marginBottom: 30 },
  spotlightWrap: { backgroundColor: C.surface, borderTopWidth: 3, borderTopColor: C.orange, borderRadius: 12, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  spotlightHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  spotlightLine: { height: 2, width: 16, backgroundColor: C.text },
  spotlightLabel: { fontSize: 9, fontWeight: '700', color: C.orange, letterSpacing: 2 },
  spotlightTitle: { fontSize: 26, fontWeight: '900', color: C.text, lineHeight: 30, marginBottom: 12, fontStyle: 'italic', letterSpacing: -0.3 },
  spotlightQuote: { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 20, fontStyle: 'italic', marginBottom: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: `${C.orange}4d` },
  spotlightAuthor: { fontSize: 12, color: C.textMute, marginBottom: 14 },
  spotlightImage: { width: '100%', height: 160, borderRadius: 10 },
})
