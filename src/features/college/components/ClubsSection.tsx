import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C } from '@/lib/colors'
import { CollegeClub } from '../hooks/useCollegeInfo'

function ClubCard({ club }: { club: CollegeClub }) {
  return (
    <TouchableOpacity activeOpacity={0.8} style={ss.clubWrap}>
      <View style={ss.clubImageWrap}>
        {club.image_url ? (
          <Image source={{ uri: club.image_url }} style={ss.clubImage} resizeMode="cover" />
        ) : (
          <View style={ss.clubPlaceholder}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.orange }}>
              {club.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={ss.clubName} numberOfLines={2}>{club.name}</Text>
    </TouchableOpacity>
  )
}

export function ClubsSection({ clubs }: { clubs: CollegeClub[] }) {
  if (!clubs || clubs.length === 0) return null

  return (
    <View style={ss.clubsSection}>
      <View style={ss.clubsHeader}>
        <Text style={ss.clubsTitle}>Clubs & Societies</Text>
        <Ionicons name="people" size={18} color={C.orange} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}>
        {clubs.map(club => (
          <ClubCard key={club.id} club={club} />
        ))}
      </ScrollView>
    </View>
  )
}

const ss = StyleSheet.create({
  clubsSection: { backgroundColor: C.deep, paddingVertical: 24, marginTop: 0 },
  clubsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14 },
  clubsTitle: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.1 },
  clubWrap: { minWidth: 100, maxWidth: 100, alignItems: 'center' },
  clubImageWrap: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: `${C.orange}40`, padding: 2, marginBottom: 10, overflow: 'hidden' },
  clubImage: { width: '100%', height: '100%', borderRadius: 43 },
  clubPlaceholder: { width: '100%', height: '100%', borderRadius: 43, backgroundColor: `${C.orange}1f`, justifyContent: 'center', alignItems: 'center' },
  clubName: { fontSize: 12, fontWeight: '700', color: C.text, textAlign: 'center', lineHeight: 16 },
})
