import React from 'react'
import { Dimensions, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { C } from '@/lib/colors'
import { CollegeSpotlight } from '../hooks/useCollegeInfo'

const { width: W } = Dimensions.get('window')
const CARD_W = W * 0.85

export function SpotlightSection({ spotlights }: { spotlights: CollegeSpotlight[] }) {
  if (!spotlights || spotlights.length === 0) return null

  return (
    <View style={ss.spotlightSection}>
      <View style={ss.sectionHeader}>
        <View style={ss.spotlightLine} />
        <Text style={ss.spotlightLabel}>STUDENT SPOTLIGHT</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + 16}
        decelerationRate="fast"
        contentContainerStyle={ss.scrollContent}
      >
        {spotlights.map((spotlight) => (
          <View key={spotlight.id} style={ss.spotlightWrap}>
            <Text style={ss.spotlightTitle}>{spotlight.title}</Text>
            <Text style={ss.spotlightQuote}>"{spotlight.quote}"</Text>
            <Text style={ss.spotlightAuthor}>— {spotlight.author}, {spotlight.role}</Text>
            {spotlight.image_url && (
              <Image source={{ uri: spotlight.image_url }} style={ss.spotlightImage} resizeMode="cover" />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const ss = StyleSheet.create({
  spotlightSection: { marginTop: 24, marginBottom: 30 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, paddingHorizontal: 16 },
  spotlightLine: { height: 2, width: 16, backgroundColor: C.orange },
  spotlightLabel: { fontSize: 9, fontWeight: '700', color: C.orange, letterSpacing: 2 },
  scrollContent: { paddingHorizontal: 16, gap: 16 },
  spotlightWrap: {
    width: CARD_W,
    backgroundColor: C.surface,
    borderTopWidth: 3,
    borderTopColor: C.orange,
    borderRadius: 12,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2
  },
  spotlightTitle: { fontSize: 22, fontWeight: '900', color: C.text, lineHeight: 28, marginBottom: 12, fontStyle: 'italic', letterSpacing: -0.3 },
  spotlightQuote: { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 20, fontStyle: 'italic', marginBottom: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: `${C.orange}4d` },
  spotlightAuthor: { fontSize: 12, color: C.textMute, marginBottom: 14 },
  spotlightImage: { width: '100%', height: 160, borderRadius: 10 },
})
