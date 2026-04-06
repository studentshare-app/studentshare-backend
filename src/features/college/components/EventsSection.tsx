import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C } from '@/lib/colors'
import { CollegeEvent } from '../hooks/useCollegeInfo'

function FeaturedEventCard({ event }: { event: CollegeEvent }) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={ss.featuredWrap}>
      <View style={ss.featuredImageWrap}>
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={ss.featuredImage} resizeMode="cover" />
        ) : (
          <View style={[ss.featuredImage, { backgroundColor: C.deep, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="calendar-outline" size={48} color={`${C.orange}40`} />
          </View>
        )}
        <LinearGradient colors={['transparent', `${C.void}cc`]} style={ss.featuredGradient} />
        <View style={ss.featuredBadgeWrap}>
          <Text style={ss.featuredBadge}>FEATURED</Text>
        </View>
      </View>

      <View style={ss.featuredContent}>
        <Text style={ss.featuredLabel}>{event.date} • {event.location}</Text>
        <Text style={ss.featuredTitle}>{event.title}</Text>
        {event.description && <Text style={ss.featuredDesc} numberOfLines={2}>{event.description}</Text>}
      </View>

      <TouchableOpacity style={ss.featuredBtn} activeOpacity={0.7}>
        <Ionicons name="add" size={22} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

function SecondaryEventCard({ event }: { event: CollegeEvent }) {
  return (
    <TouchableOpacity activeOpacity={0.8} style={ss.secondaryWrap}>
      {event.image_url ? (
        <Image source={{ uri: event.image_url }} style={ss.secondaryImage} resizeMode="cover" />
      ) : (
        <View style={[ss.secondaryImage, { backgroundColor: C.deep, justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="calendar" size={24} color={`${C.orange}40`} />
        </View>
      )}
      <View style={ss.secondaryContent}>
        <Text style={ss.secondaryType}>{event.type}</Text>
        <Text style={ss.secondaryTitle}>{event.title}</Text>
        <Text style={ss.secondaryMeta}>{event.date} • {event.location}</Text>
      </View>
      <TouchableOpacity style={ss.secondaryBtn} activeOpacity={0.7}>
        <Text style={ss.secondaryBtnText}>Join</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

export function EventsSection({ events }: { events: CollegeEvent[] }) {
  if (!events || events.length === 0) return null

  // Ensure first event is featured, otherwise use the actual featured ones
  const featured = events.find(e => e.is_featured) || events[0]
  const secondary = events.filter(e => e.id !== featured.id).slice(0, 3)

  return (
    <View style={ss.eventsSection}>
      <View style={ss.sectionHeader}>
        <Text style={ss.sectionTitle}>Campus{'\n'}Events</Text>
        <TouchableOpacity activeOpacity={0.7}>
          <Text style={ss.viewAllLink}>View All</Text>
        </TouchableOpacity>
      </View>

      {featured && <FeaturedEventCard event={featured} />}

      {secondary.length > 0 && (
        <View style={ss.secondaryEvents}>
          {secondary.map(event => (
            <SecondaryEventCard key={event.id} event={event} />
          ))}
        </View>
      )}
    </View>
  )
}

const ss = StyleSheet.create({
  eventsSection: { paddingHorizontal: 16, marginTop: 24, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  sectionTitle: { fontSize: 32, fontWeight: '900', color: C.text, lineHeight: 36, letterSpacing: -0.5 },
  viewAllLink: { fontSize: 12, fontWeight: '700', color: C.orange, letterSpacing: 0.3 },

  featuredWrap: { marginBottom: 20 },
  featuredImageWrap: { position: 'relative', height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  featuredImage: { width: '100%', height: '100%' },
  featuredGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  featuredBadgeWrap: { position: 'absolute', bottom: 12, left: 16 },
  featuredBadge: { fontSize: 10, fontWeight: '800', color: C.orange, backgroundColor: C.orangeDim, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, letterSpacing: 0.8 },
  featuredContent: { marginBottom: 12 },
  featuredLabel: { fontSize: 11, fontWeight: '700', color: C.orange, letterSpacing: 0.5, marginBottom: 6 },
  featuredTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6, lineHeight: 22 },
  featuredDesc: { fontSize: 13, color: C.textSub, lineHeight: 18 },
  featuredBtn: { position: 'absolute', top: 130, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },

  secondaryEvents: { gap: 12 },
  secondaryWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden' },
  secondaryImage: { width: 90, height: 90 },
  secondaryContent: { flex: 1, paddingVertical: 12 },
  secondaryType: { fontSize: 10, fontWeight: '700', color: C.orange, letterSpacing: 0.5, marginBottom: 2 },
  secondaryTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 3, lineHeight: 18 },
  secondaryMeta: { fontSize: 11, color: C.textMute },
  secondaryBtn: { borderWidth: 2, borderColor: C.orange, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 12 },
  secondaryBtnText: { fontSize: 11, fontWeight: '700', color: C.orange, letterSpacing: 0.4 },
})
