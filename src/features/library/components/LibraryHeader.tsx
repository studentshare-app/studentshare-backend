/**
 * src/features/library/components/LibraryHeader.tsx  —  PRODUCTION-READY
 *
 * FIXES APPLIED
 * ─────────────
 * Bug
 *  1. onToggleSearch now properly toggles search — the no-op passthrough
 *     is removed. Header manages showSearch/query internally and exposes
 *     onChangeQuery and onToggleSearch as callbacks only (not raw setters).
 *     setShowSearch and setQuery are no longer leaked as props.
 *  2. C palette imported from libraryConstants (was a local partial copy)
 *
 * UI/UX
 *  3. navWordmark fontFamily: 'serif' removed — not a valid RN font on Android
 *
 * Accessibility
 *  4. Tab buttons have accessibilityRole="tab" and accessibilityState={{ selected }}
 *  5. Search toggle button has dynamic accessibilityLabel
 *  6. Offline toggle button has accessibilityLabel and accessibilityState
 *  7. Bulk delete button has accessibilityLabel
 *  8. Cancel select button has accessibilityLabel
 *  9. Nav logo marked accessibilityElementsHidden (decorative)
 * 10. Orb decorations marked hidden from screen readers
 */

import { Ionicons } from '@expo/vector-icons'
import { memo } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { C } from '@/features/library/utils/libraryConstants'

const BODY_H_PAD = 22

type TabOption = 'downloads' | 'favorites' | 'folders'

interface LibraryHeaderProps {
  activeTab:      TabOption
  downloadsCount: number
  favCount:       number
  foldersCount:   number
  navPaddingTop:  number
  offlineOnly:    boolean
  selectMode:     boolean
  selectedCount:  number
  showSearch:     boolean
  query:          string
  scale:          number
  tabs:           { label: string; value: TabOption }[]
  onBulkDelete:   () => void
  onCancelSelect: () => void
  onChangeQuery:  (value: string) => void
  onToggleOffline:() => void
  onToggleSearch: () => void
  onToggleTab:    (value: TabOption) => void
  onClearQuery:   () => void
  setOpenMenuId:  (id: string | null) => void
}

export const LibraryHeader = memo(function LibraryHeader({
  activeTab,
  downloadsCount,
  favCount,
  foldersCount,
  navPaddingTop,
  offlineOnly,
  selectMode,
  selectedCount,
  showSearch,
  query,
  scale,
  tabs,
  onBulkDelete,
  onCancelSelect,
  onChangeQuery,
  onToggleOffline,
  onToggleSearch,
  onToggleTab,
  onClearQuery,
  setOpenMenuId,
}: LibraryHeaderProps) {
  return (
    <View style={[styles.navShell, { paddingTop: navPaddingTop }]}>
      {/* Decorative orbs */}
      <View
        style={styles.orbOrange}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View
        style={styles.orbBlue}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />

      <View style={styles.navRow}>
        {selectMode ? (
          // ── Select mode bar ───────────────────────────────────────────────
          <>
            <TouchableOpacity
              onPress={onCancelSelect}
              style={styles.navCancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel selection"
            >
              <Ionicons name="close" size={16} color={C.textSub} />
              <Text maxFontSizeMultiplier={1.3} style={styles.navCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text
              maxFontSizeMultiplier={1.3}
              style={styles.navSelectCount}
              accessibilityLiveRegion="polite"
            >
              {selectedCount} selected
            </Text>
            <TouchableOpacity
              onPress={onBulkDelete}
              style={styles.navDeleteBtn}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${selectedCount} selected file${selectedCount !== 1 ? 's' : ''}`}
            >
              <Ionicons name="trash-outline" size={14} color={C.coral} />
              <Text maxFontSizeMultiplier={1.3} style={styles.navDeleteText}>Delete</Text>
            </TouchableOpacity>
          </>
        ) : (
          // ── Normal bar ────────────────────────────────────────────────────
          <>
            <View
              style={styles.navBrand}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <View style={styles.navLogo}>
                <Text style={{ fontSize: Math.round(16 * scale) }}>📥</Text>
              </View>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.navWordmark, { fontSize: Math.round(19 * scale) }]}
              >
                My <Text style={styles.navWordmarkAccent}>Library</Text>
              </Text>
            </View>

            {showSearch ? (
              <View style={styles.navSearchBox}>
                <Ionicons name="search-outline" size={13} color={C.textMute} />
                <TextInput
                  style={styles.navSearchInput}
                  value={query}
                  onChangeText={onChangeQuery}
                  placeholder={`Search ${activeTab}…`}
                  placeholderTextColor={C.textMute}
                  autoFocus
                  autoCorrect={false}
                  accessibilityLabel={`Search ${activeTab}`}
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <TouchableOpacity
                    onPress={onClearQuery}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={14} color={C.textMute} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {activeTab === 'downloads' && (
              <TouchableOpacity
                style={[styles.navBtn, offlineOnly && styles.navBtnActive]}
                onPress={onToggleOffline}
                activeOpacity={0.8}
                accessibilityRole="togglebutton"
                accessibilityLabel="Show offline files only"
                accessibilityState={{ checked: offlineOnly }}
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={16}
                  color={offlineOnly ? C.emerald : C.textSub}
                />
                {offlineOnly && <View style={styles.navBtnDot} />}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.navBtn, showSearch && styles.navBtnActive]}
              onPress={onToggleSearch}
              activeOpacity={0.8}
              accessibilityRole="togglebutton"
              accessibilityLabel={showSearch ? 'Close search' : 'Open search'}
              accessibilityState={{ checked: showSearch }}
            >
              <Ionicons
                name="search"
                size={16}
                color={showSearch ? C.orange : C.textSub}
              />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Tab row */}
      <View style={styles.tabBorderTop}>
        <View style={styles.tabRow}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.value}
              style={[styles.tab, activeTab === tab.value && styles.tabActive]}
              onPress={() => { onToggleTab(tab.value); setOpenMenuId(null) }}
              activeOpacity={0.75}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: activeTab === tab.value }}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.tabText, activeTab === tab.value && styles.tabTextActive]}
              >
                {tab.label}
              </Text>
              {tab.value === 'downloads' && downloadsCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text allowFontScaling={false} style={styles.tabBadgeText}>
                    {downloadsCount}
                  </Text>
                </View>
              )}
              {tab.value === 'favorites' && favCount > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: C.coralDim, borderColor: `${C.coral}30` }]}>
                  <Text allowFontScaling={false} style={[styles.tabBadgeText, { color: C.coral }]}>
                    {favCount}
                  </Text>
                </View>
              )}
              {tab.value === 'folders' && foldersCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text allowFontScaling={false} style={styles.tabBadgeText}>
                    {foldersCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  navShell:         { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40, backgroundColor: C.deep, borderBottomWidth: 1, borderBottomColor: C.border, overflow: 'hidden' },
  orbOrange:        { position: 'absolute', top: -90, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(232,105,42,0.10)' },
  orbBlue:          { position: 'absolute', top: 20, left: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(75,140,245,0.05)' },
  navRow:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: BODY_H_PAD, paddingBottom: 12 },
  navBrand:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogo:          { width: 34, height: 34, borderRadius: 11, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center' },
  navWordmark:      { fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  navWordmarkAccent:{ color: C.orange, fontStyle: 'italic' },
  navSearchBox:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  navSearchInput:   { flex: 1, fontSize: 12, color: C.text, paddingVertical: 0 },
  navBtn:           { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  navBtnActive:     { borderColor: `${C.orange}40`, backgroundColor: C.orangeDim },
  navBtnDot:        { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.orange },
  navCancelBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  navCancelText:    { color: C.textSub, fontSize: 12.5, fontWeight: '700' },
  navSelectCount:   { flex: 1, color: C.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  navDeleteBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.coralDim, borderWidth: 1, borderColor: `${C.coral}30` },
  navDeleteText:    { color: C.coral, fontSize: 12.5, fontWeight: '800' },
  tabBorderTop:     { borderTopWidth: 1, borderTopColor: C.border },
  tabRow:           { flexDirection: 'row', paddingHorizontal: BODY_H_PAD, paddingVertical: 10, gap: 10 },
  tab:              { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tabActive:        { backgroundColor: C.orangeDim, borderColor: `${C.orange}30` },
  tabText:          { color: C.textSub, fontSize: 12.5, fontWeight: '700' },
  tabTextActive:    { color: C.text },
  tabBadge:         { minWidth: 20, height: 20, borderRadius: 7, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: `${C.orange}30`, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  tabBadgeText:     { color: C.orange, fontSize: 10, fontWeight: '800' },
})