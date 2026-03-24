/**
 * components/leaderboard/TabBar.tsx
 * Top tab selector: All Campus | Weekly Gainers | Colleges
 */

import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C } from '../../lib/colors'

export type LeaderTab = 'all_campus' | 'weekly_gainers' | 'colleges'

const TABS: { key: LeaderTab; label: string }[] = [
  { key: 'all_campus',     label: 'All Campus'     },
  { key: 'weekly_gainers', label: 'Weekly Gainers' },
  { key: 'colleges',       label: 'Colleges'       },
]

type Props = {
  active: LeaderTab
  onChange: (tab: LeaderTab) => void
}

export function TabBar({ active, onChange }: Props) {
  return (
    <View style={st.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.row}
      >
        {TABS.map(t => {
          const isActive = t.key === active
          return (
            <TouchableOpacity
              key={t.key}
              style={[st.tab, isActive && st.tabActive]}
              onPress={() => onChange(t.key)}
              activeOpacity={0.8}
            >
              <Text
                maxFontSizeMultiplier={1.2}
                style={[st.tabText, isActive && st.tabTextActive]}
              >
                {t.label}
              </Text>
              {isActive && <View style={st.underline} />}
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      <View style={st.border} />
    </View>
  )
}

const st = StyleSheet.create({
  wrap:          { position: 'relative' },
  border:        { height: 1, backgroundColor: C.border, position: 'absolute', bottom: 0, left: 0, right: 0 },
  row:           { paddingHorizontal: 16, gap: 0, flexDirection: 'row' },
  tab:           { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, alignItems: 'center', position: 'relative' },
  tabActive:     {},
  tabText:       { fontSize: 13.5, fontWeight: '600', color: C.textSub },
  tabTextActive: { color: C.orange, fontWeight: '700' },
  underline:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: C.orange, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
})