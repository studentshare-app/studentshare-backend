/**
 * app/grade-calculator.tsx
 *
 * Dedicated Grade Calculator screen — African University Edition
 * Routed to from the "Grade Calc" quick action on the home screen.
 *
 * FEATURES
 * ────────
 * • Grading system presets for Sierra Leone (USL / COMAHS), Njala University,
 *   Nigeria (5.0 scale), Ghana (UG 4.0 scale)
 * • Auto-detects grade input: letter grade OR percentage — maps to the
 *   correct points value for the active grading system
 * • Weighted GPA / CGPA computation per semester + cumulative
 * • Degree class display (First Class, 2:1, 2:2, Third, Pass, Fail) using
 *   each system's own classification thresholds
 * • Target GPA/CGPA goal tracker with live progress bar
 * • Multi-semester support — add / rename / delete semesters
 * • Full AsyncStorage persistence — survives app restarts
 * • Design tokens / colour palette / typography match index.tsx exactly
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePremiumGuard } from '../hooks/usePremiumGuard'
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ─────────────────────────────────────────────
// Design tokens — identical to index.tsx
// ─────────────────────────────────────────────
const C = {
  void:       '#07080C',
  deep:       '#0B0D13',
  surface:    '#10131C',
  raised:     '#161B27',
  lift2:      '#1C2232',
  border:     'rgba(255,255,255,0.055)',
  text:       '#EEF0F8',
  textSub:    '#6E7A96',
  textMute:   '#353D52',
  orange:     '#E8692A',
  orangeDim:  'rgba(232,105,42,0.10)',
  gold:       '#DFA83C',
  goldDim:    'rgba(223,168,60,0.10)',
  sapphire:   '#4B8CF5',
  sapphDim:   'rgba(75,140,245,0.10)',
  emerald:    '#3DC99A',
  emerDim:    'rgba(61,201,154,0.10)',
  lavender:   '#9B7CF4',
  lavDim:     'rgba(155,124,244,0.10)',
  coral:      '#EE6868',
  coralDim:   'rgba(238,104,104,0.10)',
} as const

const BODY_H_PAD = 22
const STORAGE_KEY = 'ss_grade_calculator_v2'

// ─────────────────────────────────────────────────────────────────────────────
// GRADING SYSTEM DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
type GradeRow = {
  minPct:  number   // inclusive lower bound
  maxPct:  number   // inclusive upper bound
  letter:  string   // canonical letter e.g. "B+"
  points:  number   // grade point value
  remark:  string   // Distinction / Credit / Pass / Fail
  passes:  boolean  // whether this grade is a passing grade
}

type DegreeClass = {
  label:  string   // "First Class Honours"
  short:  string   // "1st"
  minGpa: number
  color:  string
}

type GradingSystem = {
  id:          string
  name:        string
  shortName:   string
  maxPoints:   number          // 4.0 or 5.0
  scale:       GradeRow[]      // ordered highest → lowest
  classes:     DegreeClass[]   // ordered highest → lowest
  passGrade:   string          // minimum passing letter grade
  description: string
}

// ── Sierra Leone / USL / COMAHS — from the uploaded image ────────────────────
const USL_SCALE: GradeRow[] = [
  { minPct: 70, maxPct: 100, letter: 'A',  points: 4.00, remark: 'Distinction', passes: true  },
  { minPct: 65, maxPct: 69,  letter: 'B+', points: 3.50, remark: 'Credit',      passes: true  },
  { minPct: 60, maxPct: 64,  letter: 'B',  points: 3.00, remark: 'Pass',        passes: true  },
  { minPct: 50, maxPct: 59,  letter: 'C+', points: 2.50, remark: 'Pass',        passes: true  },
  { minPct: 46, maxPct: 49,  letter: 'C',  points: 2.00, remark: 'Fail',        passes: false },
  { minPct: 40, maxPct: 45,  letter: 'C-', points: 1.50, remark: 'Fail',        passes: false },
  { minPct: 35, maxPct: 39,  letter: 'D',  points: 1.00, remark: 'Fail',        passes: false },
  { minPct: 30, maxPct: 34,  letter: 'E',  points: 0.50, remark: 'Fail',        passes: false },
  { minPct: 0,  maxPct: 29,  letter: 'F',  points: 0.00, remark: 'Fail',        passes: false },
]
const USL_CLASSES: DegreeClass[] = [
  { label: 'First Class Honours',        short: '1st',  minGpa: 3.50, color: C.emerald  },
  { label: 'Second Class Upper (2:1)',    short: '2:1',  minGpa: 3.00, color: C.sapphire },
  { label: 'Second Class Lower (2:2)',    short: '2:2',  minGpa: 2.50, color: C.gold     },
  { label: 'Third Class Honours',         short: '3rd',  minGpa: 2.00, color: C.orange   },
  { label: 'Pass',                        short: 'Pass', minGpa: 1.00, color: C.textSub  },
  { label: 'Fail',                        short: 'Fail', minGpa: 0.00, color: C.coral    },
]

// ── Njala University Sierra Leone ─────────────────────────────────────────────
const NJALA_SCALE: GradeRow[] = [
  { minPct: 75, maxPct: 100, letter: 'A',  points: 4.00, remark: 'Excellent',      passes: true  },
  { minPct: 65, maxPct: 74,  letter: 'B',  points: 3.00, remark: 'Good',           passes: true  },
  { minPct: 55, maxPct: 64,  letter: 'C+', points: 2.50, remark: 'Above Average',  passes: true  },
  { minPct: 50, maxPct: 54,  letter: 'C',  points: 2.00, remark: 'Average',        passes: true  },
  { minPct: 40, maxPct: 49,  letter: 'D',  points: 1.00, remark: 'Barely Passed',  passes: false },
  { minPct: 30, maxPct: 39,  letter: 'E',  points: 0.50, remark: 'Failing Grade',  passes: false },
  { minPct: 0,  maxPct: 29,  letter: 'F',  points: 0.00, remark: 'Complete Fail',  passes: false },
]
const NJALA_CLASSES: DegreeClass[] = [
  { label: 'First Class Honours',      short: '1st',  minGpa: 3.50, color: C.emerald  },
  { label: 'Second Class Upper (2:1)', short: '2:1',  minGpa: 3.00, color: C.sapphire },
  { label: 'Second Class Lower (2:2)', short: '2:2',  minGpa: 2.00, color: C.gold     },
  { label: 'Third Class Honours',      short: '3rd',  minGpa: 1.00, color: C.orange   },
  { label: 'Fail',                     short: 'Fail', minGpa: 0.00, color: C.coral    },
]

// ── EBKUST — Ernest Bai Koroma University of Science and Technology ───────────
// Uses a 5.0 scale confirmed from EBKUST's own postgraduate admissions page:
// "minimum of 3.50 CGPA on a 5 point scale". Percentage bands follow the
// standard Sierra Leonean university framework (A ≥ 70%) mapped onto 5.0.
const EBKUST_SCALE: GradeRow[] = [
  { minPct: 70, maxPct: 100, letter: 'A',  points: 5.00, remark: 'Distinction',  passes: true  },
  { minPct: 65, maxPct: 69,  letter: 'B+', points: 4.50, remark: 'Credit',       passes: true  },
  { minPct: 60, maxPct: 64,  letter: 'B',  points: 4.00, remark: 'Credit',       passes: true  },
  { minPct: 55, maxPct: 59,  letter: 'C+', points: 3.50, remark: 'Pass',         passes: true  },
  { minPct: 50, maxPct: 54,  letter: 'C',  points: 3.00, remark: 'Pass',         passes: true  },
  { minPct: 45, maxPct: 49,  letter: 'D+', points: 2.50, remark: 'Marginal Pass',passes: true  },
  { minPct: 40, maxPct: 44,  letter: 'D',  points: 2.00, remark: 'Marginal Pass',passes: true  },
  { minPct: 35, maxPct: 39,  letter: 'E',  points: 1.00, remark: 'Fail',         passes: false },
  { minPct: 0,  maxPct: 34,  letter: 'F',  points: 0.00, remark: 'Fail',         passes: false },
]
const EBKUST_CLASSES: DegreeClass[] = [
  { label: 'First Class Honours',        short: '1st',  minGpa: 4.50, color: C.emerald  },
  { label: 'Second Class Upper (2:1)',    short: '2:1',  minGpa: 3.50, color: C.sapphire },
  { label: 'Second Class Lower (2:2)',    short: '2:2',  minGpa: 3.00, color: C.gold     },
  { label: 'Third Class Honours',         short: '3rd',  minGpa: 2.00, color: C.orange   },
  { label: 'Pass',                        short: 'Pass', minGpa: 1.00, color: C.textSub  },
  { label: 'Fail',                        short: 'Fail', minGpa: 0.00, color: C.coral    },
]

// ── UNIMAK — University of Makeni ─────────────────────────────────────────────
// Private Catholic university. Follows the British-derived 4.0 framework
// standard across Sierra Leone's private institutions. No distinct public
// scale published; uses the same national 4.0 model as USL with A ≥ 70%.
const UNIMAK_SCALE: GradeRow[] = [
  { minPct: 70, maxPct: 100, letter: 'A',  points: 4.00, remark: 'Distinction', passes: true  },
  { minPct: 65, maxPct: 69,  letter: 'B+', points: 3.50, remark: 'Credit',      passes: true  },
  { minPct: 60, maxPct: 64,  letter: 'B',  points: 3.00, remark: 'Credit',      passes: true  },
  { minPct: 55, maxPct: 59,  letter: 'C+', points: 2.50, remark: 'Pass',        passes: true  },
  { minPct: 50, maxPct: 54,  letter: 'C',  points: 2.00, remark: 'Pass',        passes: true  },
  { minPct: 45, maxPct: 49,  letter: 'D+', points: 1.50, remark: 'Fail',        passes: false },
  { minPct: 40, maxPct: 44,  letter: 'D',  points: 1.00, remark: 'Fail',        passes: false },
  { minPct: 35, maxPct: 39,  letter: 'E',  points: 0.50, remark: 'Fail',        passes: false },
  { minPct: 0,  maxPct: 34,  letter: 'F',  points: 0.00, remark: 'Fail',        passes: false },
]
const UNIMAK_CLASSES: DegreeClass[] = [
  { label: 'First Class Honours',        short: '1st',  minGpa: 3.50, color: C.emerald  },
  { label: 'Second Class Upper (2:1)',    short: '2:1',  minGpa: 3.00, color: C.sapphire },
  { label: 'Second Class Lower (2:2)',    short: '2:2',  minGpa: 2.50, color: C.gold     },
  { label: 'Third Class Honours',         short: '3rd',  minGpa: 2.00, color: C.orange   },
  { label: 'Pass',                        short: 'Pass', minGpa: 1.00, color: C.textSub  },
  { label: 'Fail',                        short: 'Fail', minGpa: 0.00, color: C.coral    },
]

// ── MMTU — Milton Margai Technical University ─────────────────────────────────
// Formerly Milton Margai College of Education and Technology (MMCET).
// Technical/polytechnic institution that awards both diplomas and degrees.
// Uses the national 4.0 framework; pass mark is 50% (C+) for degree programmes.
// Vocational/diploma programmes may accept a D (40%) pass — represented here
// as an optional "Marginal Pass" so the calculator covers both tracks.
const MMTU_SCALE: GradeRow[] = [
  { minPct: 70, maxPct: 100, letter: 'A',  points: 4.00, remark: 'Distinction',   passes: true  },
  { minPct: 65, maxPct: 69,  letter: 'B+', points: 3.50, remark: 'Credit',        passes: true  },
  { minPct: 60, maxPct: 64,  letter: 'B',  points: 3.00, remark: 'Credit',        passes: true  },
  { minPct: 50, maxPct: 59,  letter: 'C+', points: 2.50, remark: 'Pass',          passes: true  },
  { minPct: 45, maxPct: 49,  letter: 'C',  points: 2.00, remark: 'Marginal Pass', passes: true  },
  { minPct: 40, maxPct: 44,  letter: 'D',  points: 1.50, remark: 'Marginal Pass', passes: true  },
  { minPct: 35, maxPct: 39,  letter: 'E',  points: 1.00, remark: 'Fail',          passes: false },
  { minPct: 0,  maxPct: 34,  letter: 'F',  points: 0.00, remark: 'Fail',          passes: false },
]
const MMTU_CLASSES: DegreeClass[] = [
  { label: 'First Class Honours',        short: '1st',  minGpa: 3.50, color: C.emerald  },
  { label: 'Second Class Upper (2:1)',    short: '2:1',  minGpa: 3.00, color: C.sapphire },
  { label: 'Second Class Lower (2:2)',    short: '2:2',  minGpa: 2.50, color: C.gold     },
  { label: 'Third Class Honours',         short: '3rd',  minGpa: 2.00, color: C.orange   },
  { label: 'Pass',                        short: 'Pass', minGpa: 1.50, color: C.textSub  },
  { label: 'Fail',                        short: 'Fail', minGpa: 0.00, color: C.coral    },
]

const GRADING_SYSTEMS: GradingSystem[] = [
  {
    id: 'usl', name: 'University of Sierra Leone', shortName: 'USL / COMAHS',
    maxPoints: 4.0, scale: USL_SCALE, classes: USL_CLASSES, passGrade: 'C+',
    description: 'FBC, COMAHS, IPAM. A ≥ 70%, pass at C+ (50%). 4.0 scale.',
  },
  {
    id: 'njala', name: 'Njala University', shortName: 'Njala',
    maxPoints: 4.0, scale: NJALA_SCALE, classes: NJALA_CLASSES, passGrade: 'C',
    description: 'Njala & Bo campuses. A ≥ 75%, pass at C (50%). 4.0 scale.',
  },
  {
    id: 'ebkust', name: 'Ernest Bai Koroma University (EBKUST)', shortName: 'EBKUST',
    maxPoints: 5.0, scale: EBKUST_SCALE, classes: EBKUST_CLASSES, passGrade: 'C',
    description: 'Magburaka / Makeni / Portloko campuses. A ≥ 70%, 5.0 scale. PhD requires ≥ 3.50 CGPA.',
  },
  {
    id: 'unimak', name: 'University of Makeni (UNIMAK)', shortName: 'UNIMAK',
    maxPoints: 4.0, scale: UNIMAK_SCALE, classes: UNIMAK_CLASSES, passGrade: 'C',
    description: 'First private Catholic university in SL. A ≥ 70%, pass at C (50%). 4.0 scale.',
  },
  {
    id: 'mmtu', name: 'Milton Margai Technical University', shortName: 'MMTU',
    maxPoints: 4.0, scale: MMTU_SCALE, classes: MMTU_CLASSES, passGrade: 'C+',
    description: 'Freetown. Teacher education & technical programmes. A ≥ 70%, pass at C+ (50%). 4.0 scale.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Computation helpers
// ─────────────────────────────────────────────────────────────────────────────
function resolveRow(raw: string, sys: GradingSystem): GradeRow | null {
  if (!raw.trim()) return null
  const num = Number(raw.trim())
  if (!isNaN(num) && num >= 0 && num <= 100) {
    return sys.scale.find(r => num >= r.minPct && num <= r.maxPct) ?? null
  }
  const upper = raw.trim().toUpperCase()
  return sys.scale.find(r => r.letter.toUpperCase() === upper) ?? null
}

type SemResult = { gpa: number | null; credits: number; qpts: number; gradeCount: number; failCount: number }

function semGPA(courses: CourseEntry[], sys: GradingSystem): SemResult {
  let credits = 0, qpts = 0, gradeCount = 0, failCount = 0
  for (const c of courses) {
    const row  = resolveRow(c.grade, sys)
    const cred = parseFloat(c.credits)
    if (!row || isNaN(cred) || cred <= 0) continue
    credits += cred; qpts += row.points * cred; gradeCount++
    if (!row.passes) failCount++
  }
  return { gpa: credits > 0 ? qpts / credits : null, credits, qpts, gradeCount, failCount }
}

function cumulGPA(sems: Semester[], sys: GradingSystem): { gpa: number | null; credits: number; fails: number } {
  let credits = 0, qpts = 0, fails = 0
  for (const s of sems) {
    const r = semGPA(s.courses, sys)
    credits += r.credits; qpts += r.qpts; fails += r.failCount
  }
  return { gpa: credits > 0 ? qpts / credits : null, credits, fails }
}

function getDegreeClass(gpa: number | null, sys: GradingSystem): DegreeClass | null {
  if (gpa === null) return null
  return sys.classes.find(c => gpa >= c.minGpa) ?? null
}

// Colour helpers
function gpaColor(gpa: number | null, sys: GradingSystem): string {
  if (gpa === null) return C.textSub
  const p = gpa / sys.maxPoints
  if (p >= 0.875) return C.emerald
  if (p >= 0.75)  return C.sapphire
  if (p >= 0.625) return C.gold
  if (p >= 0.5)   return C.orange
  return C.coral
}

function rowAccentColor(row: GradeRow | null): string {
  if (!row || !row.passes) return C.coral
  if (row.points / 4 >= 0.875 || row.points / 5 >= 0.875) return C.emerald
  if (row.points >= 3.0) return C.sapphire
  if (row.points >= 2.5) return C.gold
  return C.orange
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type CourseEntry = { id: string; code: string; name: string; grade: string; credits: string }
type Semester    = { id: string; label: string; courses: CourseEntry[] }
type SavedData   = { semesters: Semester[]; activeSemId: string; targetGpa: string; systemId: string }

function uid()  { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function makeCourse(): CourseEntry { return { id: uid(), code: '', name: '', grade: '', credits: '3' } }
function makeSemester(label: string): Semester { return { id: uid(), label, courses: [makeCourse(), makeCourse()] } }

// ─────────────────────────────────────────────────────────────────────────────
// ScalePress  — identical to index.tsx
// ─────────────────────────────────────────────────────────────────────────────
function ScalePress({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Degree Class Badge
// ─────────────────────────────────────────────────────────────────────────────
function DegreeClassBadge({ gpa, sys }: { gpa: number | null; sys: GradingSystem }) {
  const cls = getDegreeClass(gpa, sys)
  if (!cls) return null
  return (
    <View style={[dcb.wrap, { borderColor: cls.color + '35', backgroundColor: cls.color + '12' }]}>
      <View style={[dcb.dot, { backgroundColor: cls.color }]} />
      <Text style={[dcb.label, { color: cls.color }]}>{cls.label}</Text>
    </View>
  )
}
const dcb = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Grading System Picker Modal
// ─────────────────────────────────────────────────────────────────────────────
function SystemPickerModal({ visible, current, onSelect, onClose }:
  { visible: boolean; current: string; onSelect: (id: string) => void; onClose: () => void }
) {
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={pk.overlay}>
        <View style={pk.sheet}>
          <View style={pk.handleRow}><View style={pk.handle} /></View>
          <View style={pk.header}>
            <View>
              <Text style={pk.title}>Grading System</Text>
              <Text style={pk.subtitle}>Select your university's scale</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={pk.closeBtn}>
              <Ionicons name="close" size={18} color={C.textSub} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {GRADING_SYSTEMS.map(sys => {
              const active = sys.id === current
              return (
                <TouchableOpacity
                  key={sys.id}
                  onPress={() => { onSelect(sys.id); onClose() }}
                  activeOpacity={0.8}
                  style={[pk.item, active && pk.itemActive]}
                >
                  {active && <View style={pk.activeLine} />}

                  <View style={[pk.iconBox, { backgroundColor: active ? C.orangeDim : C.raised }]}>
                    <Text style={pk.iconEmoji}>🏛</Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <Text style={[pk.itemName, active && { color: C.text }]}>{sys.name}</Text>
                      {active && (
                        <View style={pk.activeBadge}><Text style={pk.activeBadgeText}>ACTIVE</Text></View>
                      )}
                    </View>
                    <Text style={pk.itemDesc}>{sys.description}</Text>

                    {/* Scale chips preview */}
                    <View style={pk.scalePreview}>
                      {sys.scale.slice(0, 5).map(row => (
                        <View key={row.letter} style={[pk.chip, {
                          backgroundColor: row.passes ? C.emerDim : C.coralDim,
                          borderColor:     row.passes ? C.emerald + '30' : C.coral + '30',
                        }]}>
                          <Text style={[pk.chipText, { color: row.passes ? C.emerald : C.coral }]}>{row.letter}</Text>
                        </View>
                      ))}
                      <Text style={pk.ellipsis}>···</Text>
                      <Text style={[pk.maxLabel, { color: active ? C.orange : C.textMute }]}>Max {sys.maxPoints.toFixed(1)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
const pk = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:          { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, maxHeight: '88%' },
  handleRow:      { alignItems: 'center', marginBottom: 22 },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title:          { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle:       { fontSize: 13, color: C.textMute, marginTop: 3 },
  closeBtn:       { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  item:           { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16, borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.raised, position: 'relative', overflow: 'hidden' },
  itemActive:     { borderColor: 'rgba(232,105,42,0.35)', backgroundColor: 'rgba(232,105,42,0.05)' },
  activeLine:     { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.orange },
  iconBox:        { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  iconEmoji:      { fontSize: 20 },
  itemName:       { fontSize: 13, fontWeight: '700', color: C.textSub },
  itemDesc:       { fontSize: 11, color: C.textMute, lineHeight: 16, marginBottom: 8 },
  activeBadge:    { backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.3)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  activeBadgeText:{ fontSize: 8, fontWeight: '800', color: C.orange, letterSpacing: 1 },
  scalePreview:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chip:           { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  chipText:       { fontSize: 9.5, fontWeight: '800' },
  ellipsis:       { fontSize: 11, color: C.textMute, letterSpacing: 2 },
  maxLabel:       { fontSize: 10, fontWeight: '700', marginLeft: 4 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Course Row
// ─────────────────────────────────────────────────────────────────────────────
function CourseRow({ course, index, sys, onUpdate, onRemove }: {
  course: CourseEntry; index: number; sys: GradingSystem
  onUpdate: (id: string, field: keyof CourseEntry, val: string) => void
  onRemove: (id: string) => void
}) {
  const row   = resolveRow(course.grade, sys)
  const color = rowAccentColor(row)
  const isPct = course.grade.trim() !== '' && !isNaN(Number(course.grade.trim()))

  return (
    <View style={cr.row}>
      <View style={[cr.accent, { backgroundColor: color }]} />
      <View style={cr.left}>
        <TextInput
          style={cr.code}
          placeholder={`COURSE ${index + 1}`}
          placeholderTextColor={C.textMute}
          value={course.code}
          onChangeText={v => onUpdate(course.id, 'code', v.toUpperCase())}
          autoCapitalize="characters"
          maxLength={12}
        />
        <TextInput
          style={cr.name}
          placeholder="Course name"
          placeholderTextColor={C.textMute}
          value={course.name}
          onChangeText={v => onUpdate(course.id, 'name', v)}
        />
      </View>

      {/* Grade */}
      <View style={cr.cell}>
        <Text style={cr.cellLabel}>GRADE</Text>
        <TextInput
          style={[cr.cellInput, row && { color }]}
          placeholder="—"
          placeholderTextColor={C.textMute}
          value={course.grade}
          onChangeText={v => onUpdate(course.id, 'grade', v)}
          autoCapitalize="characters"
          maxLength={5}
          textAlign="center"
        />
        {/* If user typed a %, show the resolved letter */}
        {row && isPct && (
          <Text style={[cr.hint, { color }]}>{row.letter}</Text>
        )}
        {/* Always show points when resolved */}
        {row && (
          <Text style={[cr.pts, { color: color + 'AA' }]}>{row.points.toFixed(2)}</Text>
        )}
      </View>

      {/* Credits */}
      <View style={[cr.cell, cr.cellBorder]}>
        <Text style={cr.cellLabel}>CREDITS</Text>
        <TextInput
          style={cr.cellInput}
          placeholder="3"
          placeholderTextColor={C.textMute}
          value={course.credits}
          onChangeText={v => onUpdate(course.id, 'credits', v)}
          keyboardType="decimal-pad"
          maxLength={4}
          textAlign="center"
        />
        {row && (
          <Text style={[cr.remarkText, { color: row.passes ? C.emerald : C.coral }]}>
            {row.remark}
          </Text>
        )}
      </View>

      <TouchableOpacity
        onPress={() => onRemove(course.id)}
        style={cr.removeBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="remove-circle" size={18} color={C.textMute} />
      </TouchableOpacity>
    </View>
  )
}
const cr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, paddingLeft: 18, marginBottom: 10, position: 'relative', overflow: 'hidden', gap: 8 },
  accent:     { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, opacity: 0.8 },
  left:       { flex: 1, minWidth: 0 },
  code:       { fontSize: 10, fontWeight: '800', color: C.orange, letterSpacing: 1.2, paddingVertical: 0, marginBottom: 3 },
  name:       { fontSize: 13, fontWeight: '600', color: C.text, paddingVertical: 0 },
  cell:       { alignItems: 'center', paddingHorizontal: 8, minWidth: 50 },
  cellBorder: { borderLeftWidth: 1, borderLeftColor: C.border },
  cellLabel:  { fontSize: 7.5, fontWeight: '800', color: C.textMute, letterSpacing: 1, marginBottom: 3 },
  cellInput:  { fontSize: 16, fontWeight: '900', color: C.text, paddingVertical: 0, minWidth: 34 },
  hint:       { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  pts:        { fontSize: 9, fontWeight: '700', marginTop: 1 },
  remarkText: { fontSize: 8.5, fontWeight: '700', marginTop: 2, letterSpacing: 0.2 },
  removeBtn:  { width: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Semester Tab
// ─────────────────────────────────────────────────────────────────────────────
function SemesterTab({ sem, sys, isActive, onPress, onLongPress }: {
  sem: Semester; sys: GradingSystem; isActive: boolean; onPress: () => void; onLongPress: () => void
}) {
  const r = semGPA(sem.courses, sys)
  return (
    <TouchableOpacity
      onPress={onPress} onLongPress={onLongPress} activeOpacity={0.75}
      style={[stab.tab, isActive && stab.tabActive]}
    >
      <Text style={[stab.label, isActive && stab.labelActive]}>{sem.label}</Text>
      {r.gpa !== null && (
        <Text style={[stab.gpa, { color: isActive ? C.orange : C.textMute }]}>{r.gpa.toFixed(2)}</Text>
      )}
    </TouchableOpacity>
  )
}
const stab = StyleSheet.create({
  tab:         { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', gap: 2 },
  tabActive:   { borderBottomColor: C.orange },
  label:       { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: C.textMute, textTransform: 'uppercase' },
  labelActive: { color: C.text },
  gpa:         { fontSize: 10, fontWeight: '700' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Grade Scale Reference Card
// ─────────────────────────────────────────────────────────────────────────────
function ScaleCard({ sys }: { sys: GradingSystem }) {
  return (
    <View style={sc.card}>
      {/* Header */}
      <View style={sc.cardHeader}>
        <View style={sc.labelRow}>
          <View style={sc.orangeLine} />
          <Text style={sc.cardTitle}>GRADE SCALE — {sys.shortName.toUpperCase()}</Text>
        </View>
        <Text style={sc.maxLabel}>Max {sys.maxPoints.toFixed(1)}</Text>
      </View>

      {/* Table header */}
      <View style={sc.tableHead}>
        <Text style={[sc.colHead, { flex: 1 }]}>GRADE</Text>
        <Text style={[sc.colHead, { flex: 2.2 }]}>% RANGE</Text>
        <Text style={[sc.colHead, { flex: 1.2 }]}>POINTS</Text>
        <Text style={[sc.colHead, { flex: 2 }]}>REMARK</Text>
      </View>

      {sys.scale.map((row, i) => {
        const accent = rowAccentColor(row)
        const isMinPass = row.letter === sys.passGrade
        return (
          <View key={row.letter} style={[
            sc.tableRow,
            i < sys.scale.length - 1 && sc.tableRowBorder,
            !row.passes && { backgroundColor: 'rgba(238,104,104,0.04)' },
            isMinPass   && { backgroundColor: 'rgba(232,105,42,0.06)' },
          ]}>
            <View style={[sc.gradeCell, { flex: 1 }]}>
              <View style={[sc.gradeBadge, { backgroundColor: accent + '15', borderColor: accent + '35' }]}>
                <Text style={[sc.gradeLetter, { color: accent }]}>{row.letter}</Text>
              </View>
            </View>
            <Text style={[sc.cellText, { flex: 2.2, color: C.textSub, fontSize: 11 }]}>
              {row.minPct === 0 ? `< ${row.maxPct + 1}%` : row.maxPct === 100 ? `≥ ${row.minPct}%` : `${row.minPct} – ${row.maxPct}%`}
            </Text>
            <Text style={[sc.cellText, { flex: 1.2, fontWeight: '900', color: row.passes ? C.text : C.coral, fontSize: 13 }]}>
              {row.points.toFixed(2)}
            </Text>
            <View style={sc.remarkCell}>
              <Text style={[sc.remarkText, { color: row.passes ? C.textSub : C.coral }]}>{row.remark}</Text>
              {isMinPass && <Text style={sc.minPassTag}>MIN PASS</Text>}
            </View>
          </View>
        )
      })}

      {/* Degree classes */}
      <View style={sc.classSection}>
        <Text style={sc.classSectionTitle}>DEGREE CLASSIFICATIONS</Text>
        {sys.classes.filter(c => c.label !== 'Fail').map(cls => (
          <View key={cls.label} style={sc.classRow}>
            <View style={[sc.classDot, { backgroundColor: cls.color }]} />
            <Text style={[sc.classShort, { color: cls.color }]}>{cls.short}</Text>
            <Text style={sc.classFullLabel}>{cls.label}</Text>
            <Text style={[sc.classGpa, { color: cls.color }]}>≥ {cls.minGpa.toFixed(2)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
const sc = StyleSheet.create({
  card:            { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 18, marginBottom: 8 },
  cardHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  labelRow:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orangeLine:      { width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  cardTitle:       { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.5 },
  maxLabel:        { fontSize: 10, fontWeight: '700', color: C.orange },
  tableHead:       { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4 },
  colHead:         { fontSize: 8, fontWeight: '800', color: C.textMute, letterSpacing: 1.2 },
  tableRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 2 },
  tableRowBorder:  { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  gradeCell:       { alignItems: 'flex-start' },
  gradeBadge:      { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  gradeLetter:     { fontSize: 12, fontWeight: '900' },
  cellText:        { fontSize: 11, fontWeight: '500', color: C.textSub },
  remarkCell:      { flex: 2, gap: 2 } as const,
  remarkText:      { fontSize: 10.5, fontWeight: '600' },
  minPassTag:      { fontSize: 7.5, fontWeight: '800', color: C.orange, letterSpacing: 1 },
  classSection:    { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, gap: 9 },
  classSectionTitle:{ fontSize: 8.5, fontWeight: '800', color: C.textMute, letterSpacing: 2, marginBottom: 4 },
  classRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  classDot:        { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  classShort:      { fontSize: 12, fontWeight: '900', width: 38 },
  classFullLabel:  { flex: 1, fontSize: 11.5, fontWeight: '500', color: C.textSub },
  classGpa:        { fontSize: 12, fontWeight: '800' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Premium Paywall Gate
// ─────────────────────────────────────────────────────────────────────────────
const FEATURES = [
  { emoji: '🏛', label: 'All 5 Sierra Leone university scales', sub: 'USL, Njala, EBKUST, UNIMAK, MMTU' },
  { emoji: '📊', label: 'Weighted CGPA across all semesters',   sub: 'Multi-semester cumulative tracking'  },
  { emoji: '🎓', label: 'Degree class classification',          sub: '1st, 2:1, 2:2, 3rd, Pass — live'    },
  { emoji: '🎯', label: 'Target CGPA goal tracker',             sub: 'Progress bar + pts-to-goal display'  },
  { emoji: '💾', label: 'Persistent grade history',             sub: 'Saved across sessions automatically'  },
]

function PremiumPaywall({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>

      {/* Nav — same pattern as the calculator */}
      <View style={[pw.nav, { paddingTop: insets.top + 10 }]}>
        <View style={pw.orbOrange} />
        <View style={pw.orbBlue} />
        <TouchableOpacity onPress={onBack} style={pw.navIconBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={18} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={1.3} style={pw.navTitle}>Grade Calculator</Text>
          <Text maxFontSizeMultiplier={1.3} style={pw.navSub}>Premium feature</Text>
        </View>
        {/* Lock badge */}
        <View style={pw.lockBadge}>
          <Ionicons name="lock-closed" size={12} color={C.gold} />
          <Text style={pw.lockBadgeText}>PREMIUM</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 76, paddingBottom: 60 }}
      >
        {/* Hero illustration */}
        <View style={pw.hero}>
          <View style={pw.heroGlow} />
          <View style={pw.heroGlowBlue} />

          {/* Giant calculator icon with gradient ring */}
          <LinearGradient
            colors={[C.gold, C.orange, '#C8501A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={pw.iconRing}
          >
            <View style={pw.iconInner}>
              <Text style={pw.iconEmoji}>🧮</Text>
            </View>
          </LinearGradient>

          {/* Lock overlay on icon */}
          <View style={pw.iconLockBadge}>
            <Ionicons name="lock-closed" size={14} color={C.void} />
          </View>

          <Text maxFontSizeMultiplier={1.3} style={pw.heroTitle}>Grade Calculator</Text>
          <Text maxFontSizeMultiplier={1.3} style={pw.heroSub}>
            Track your CGPA across all Sierra Leonean universities. Know your degree class in real time.
          </Text>

          {/* Premium pill */}
          <View style={pw.premiumPill}>
            <Text style={pw.premiumPillText}>★ PREMIUM ONLY</Text>
          </View>
        </View>

        {/* Features list */}
        <View style={pw.body}>
          <View style={pw.sectionHead}>
            <View style={pw.sectionLine} />
            <Text style={pw.sectionTitle}>WHAT YOU'LL UNLOCK</Text>
          </View>

          {FEATURES.map((f, i) => (
            <View key={i} style={pw.featureRow}>
              <View style={pw.featureIconBox}>
                <Text style={pw.featureEmoji}>{f.emoji}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text maxFontSizeMultiplier={1.3} style={pw.featureLabel}>{f.label}</Text>
                <Text maxFontSizeMultiplier={1.3} style={pw.featureSub}>{f.sub}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={18} color={C.emerald} />
            </View>
          ))}

          {/* Preview card — blurred/locked grade table teaser */}
          <View style={pw.previewCard}>
            <View style={pw.previewCardOverlay}>
              <Ionicons name="lock-closed" size={28} color={C.gold} />
              <Text style={pw.previewCardOverlayText}>Unlock to calculate</Text>
            </View>
            {/* Blurred mock rows */}
            {['CS-401 · Advanced Algorithms', 'MATH-302 · Linear Algebra', 'PHY-201 · Quantum Mechanics'].map((label, i) => (
              <View key={i} style={pw.mockRow}>
                <View style={pw.mockLeft}>
                  <View style={pw.mockCode} />
                  <View style={pw.mockName} />
                </View>
                <View style={pw.mockGrade} />
                <View style={pw.mockCredits} />
              </View>
            ))}
            <View style={pw.mockStatStrip}>
              {[1, 2, 3, 4].map(i => <View key={i} style={pw.mockStat} />)}
            </View>
          </View>

          {/* CTA button */}
          <TouchableOpacity
            onPress={() => router.push('/subscription' as any)}
            activeOpacity={0.85}
            style={{ borderRadius: 20, overflow: 'hidden', marginTop: 8 }}
          >
            <LinearGradient
              colors={[C.gold, C.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={pw.ctaBtn}
            >
              <View style={pw.ctaBtnGlow} />
              <Ionicons name="star" size={18} color={C.void} />
              <Text style={pw.ctaBtnText}>Upgrade to Premium</Text>
              <Ionicons name="arrow-forward" size={16} color={C.void} />
            </LinearGradient>
          </TouchableOpacity>

          <Text style={pw.ctaFooter}>
            Premium unlocks all tools — AI Tutor, Grade Calculator, Study Planner and more.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const pw = StyleSheet.create({
  // Nav
  nav:         { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  navIconBtn:  { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  navTitle:    { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  navSub:      { fontSize: 10, color: C.textMute, fontWeight: '500', marginTop: 1 },
  lockBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.goldDim, borderWidth: 1, borderColor: C.gold + '40', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, flexShrink: 0 },
  lockBadgeText:{ fontSize: 9, fontWeight: '800', color: C.gold, letterSpacing: 1.2 },
  orbOrange:   { position: 'absolute', top: -60, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(223,168,60,0.09)' },
  orbBlue:     { position: 'absolute', top: 10, left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(75,140,245,0.05)' },

  // Hero
  hero:         { backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingTop: 32, paddingBottom: 36, alignItems: 'center', position: 'relative', overflow: 'hidden' },
  heroGlow:     { position: 'absolute', top: -60, left: '50%', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(223,168,60,0.08)', transform: [{ translateX: -150 }] },
  heroGlowBlue: { position: 'absolute', bottom: -40, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(75,140,245,0.05)' },
  iconRing:     { width: 100, height: 100, borderRadius: 30, padding: 3, justifyContent: 'center', alignItems: 'center', marginBottom: 4, shadowColor: C.gold, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 10 },
  iconInner:    { flex: 1, width: '100%', borderRadius: 27, backgroundColor: C.deep, justifyContent: 'center', alignItems: 'center' },
  iconEmoji:    { fontSize: 44 },
  iconLockBadge:{ position: 'absolute', top: 44, left: '50%', marginLeft: 16, width: 28, height: 28, borderRadius: 14, backgroundColor: C.gold, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: C.deep },
  heroTitle:    { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -0.6, marginTop: 20, marginBottom: 10 },
  heroSub:      { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8, marginBottom: 18 },
  premiumPill:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.goldDim, borderWidth: 1, borderColor: C.gold + '40', borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6 },
  premiumPillText:{ fontSize: 10, fontWeight: '800', color: C.gold, letterSpacing: 1.5 },

  // Body
  body:         { paddingHorizontal: BODY_H_PAD, paddingTop: 28 },
  sectionHead:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionLine:  { width: 14, height: 1, backgroundColor: C.gold, opacity: 0.7 },
  sectionTitle: { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8 },

  // Feature rows
  featureRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, marginBottom: 10 },
  featureIconBox:{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  featureEmoji:  { fontSize: 20 },
  featureLabel:  { fontSize: 13.5, fontWeight: '700', color: C.text, marginBottom: 2 },
  featureSub:    { fontSize: 11, color: C.textMute, fontWeight: '500' },

  // Locked preview card
  previewCard:         { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16, marginTop: 6, marginBottom: 24, overflow: 'hidden', position: 'relative' },
  previewCardOverlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,8,12,0.82)', zIndex: 10, justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 20 },
  previewCardOverlayText:{ fontSize: 14, fontWeight: '700', color: C.textSub },
  mockRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  mockLeft:      { flex: 1, gap: 5 },
  mockCode:      { height: 8, width: 60,  borderRadius: 4, backgroundColor: C.raised },
  mockName:      { height: 10, width: 120, borderRadius: 4, backgroundColor: C.lift2 },
  mockGrade:     { height: 22, width: 40, borderRadius: 8, backgroundColor: C.raised },
  mockCredits:   { height: 22, width: 40, borderRadius: 8, backgroundColor: C.raised },
  mockStatStrip: { flexDirection: 'row', gap: 8, marginTop: 4 },
  mockStat:      { flex: 1, height: 36, borderRadius: 10, backgroundColor: C.raised },

  // CTA
  ctaBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 17, borderRadius: 20, position: 'relative', overflow: 'hidden' },
  ctaBtnGlow:   { position: 'absolute', top: -20, left: '50%', width: 200, height: 80, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.10)', transform: [{ translateX: -100 }] },
  ctaBtnText:   { fontSize: 16, fontWeight: '900', color: C.void, letterSpacing: -0.3 },
  ctaFooter:    { fontSize: 11.5, color: C.textMute, textAlign: 'center', lineHeight: 18, marginTop: 14, paddingHorizontal: 8 },
})

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function GradeCalculatorScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { isPremium, isPremiumReady } = usePremiumGuard()

  // ── DEV ONLY: set this to true to preview the paywall while logged in as
  //    a premium account. Flip back to false before committing.
  const DEV_FORCE_PAYWALL = __DEV__ && false

  const effectiveIsPremium = DEV_FORCE_PAYWALL ? false : isPremium

  const [loading,       setLoading]       = useState(true)
  const [semesters,     setSemesters]     = useState<Semester[]>([])
  const [activeSemId,   setActiveSemId]   = useState('')
  const [targetGpa,     setTargetGpa]     = useState('3.5')
  const [systemId,      setSystemId]      = useState('usl')
  const [showPicker,    setShowPicker]    = useState(false)
  const [editingTarget, setEditingTarget] = useState(false)
  const targetRef = useRef<TextInput>(null)

  const sys = useMemo(() => GRADING_SYSTEMS.find(s => s.id === systemId) ?? GRADING_SYSTEMS[0], [systemId])

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          try {
            const d: SavedData = JSON.parse(raw)
            if (d.semesters?.length) {
              setSemesters(d.semesters)
              setActiveSemId(d.activeSemId || d.semesters[0].id)
              setTargetGpa(d.targetGpa ?? '3.5')
              setSystemId(d.systemId ?? 'usl')
              return
            }
          } catch {}
        }
        const init = makeSemester('Semester 1')
        setSemesters([init]); setActiveSemId(init.id)
      })
      .catch(() => {
        const init = makeSemester('Semester 1')
        setSemesters([init]); setActiveSemId(init.id)
      })
      .finally(() => setLoading(false))
  }, [])

  // ── Persist ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ semesters, activeSemId, targetGpa, systemId })).catch(() => {})
  }, [semesters, activeSemId, targetGpa, systemId, loading])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeSem   = useMemo(() => semesters.find(s => s.id === activeSemId) ?? semesters[0], [semesters, activeSemId])
  const semResult   = useMemo(() => activeSem ? semGPA(activeSem.courses, sys) : { gpa: null, credits: 0, qpts: 0, gradeCount: 0, failCount: 0 }, [activeSem, sys])
  const cumulResult = useMemo(() => cumulGPA(semesters, sys), [semesters, sys])
  const targetNum   = parseFloat(targetGpa)
  const targetOk    = !isNaN(targetNum) && targetNum > 0 && targetNum <= sys.maxPoints
  const progress    = cumulResult.gpa !== null && targetOk ? Math.min(cumulResult.gpa / targetNum, 1) : 0
  const cColor      = gpaColor(cumulResult.gpa, sys)
  const sColor      = gpaColor(semResult.gpa, sys)

  // ── Mutations ───────────────────────────────────────────────────────────────
  const updateCourse = useCallback((id: string, field: keyof CourseEntry, val: string) => {
    setSemesters(prev => prev.map(s =>
      s.id !== activeSemId ? s : { ...s, courses: s.courses.map(c => c.id !== id ? c : { ...c, [field]: val }) }
    ))
  }, [activeSemId])

  const addCourse = useCallback(() => {
    setSemesters(prev => prev.map(s => s.id !== activeSemId ? s : { ...s, courses: [...s.courses, makeCourse()] }))
  }, [activeSemId])

  const removeCourse = useCallback((id: string) => {
    setSemesters(prev => prev.map(s => {
      if (s.id !== activeSemId || s.courses.length <= 1) return s
      return { ...s, courses: s.courses.filter(c => c.id !== id) }
    }))
  }, [activeSemId])

  const addSemester = useCallback(() => {
    const sem = makeSemester(`Semester ${semesters.length + 1}`)
    setSemesters(prev => [...prev, sem]); setActiveSemId(sem.id)
  }, [semesters.length])

  const deleteSemester = useCallback((id: string) => {
    if (semesters.length <= 1) { Alert.alert('Cannot delete', 'You need at least one semester.'); return }
    Alert.alert('Delete semester?', 'All courses in this semester will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setSemesters(prev => {
          const next = prev.filter(s => s.id !== id)
          if (activeSemId === id) setActiveSemId(next[0]?.id ?? '')
          return next
        })
      }},
    ])
  }, [semesters.length, activeSemId])

  const renameSemester = useCallback((id: string) => {
    const sem = semesters.find(s => s.id === id)
    if (!sem) return
    if (Platform.OS === 'ios') {
      Alert.prompt('Rename', '', text => { if (text?.trim()) setSemesters(prev => prev.map(s => s.id !== id ? s : { ...s, label: text.trim() })) }, 'plain-text', sem.label)
    } else {
      Alert.alert(sem.label, 'What would you like to do?', [
        { text: 'Delete', style: 'destructive', onPress: () => deleteSemester(id) },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }, [semesters, deleteSemester])

  const clearAll = () => {
    Alert.alert('Clear all data?', 'All semesters and grades will be reset.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        const init = makeSemester('Semester 1')
        setSemesters([init]); setActiveSemId(init.id); setTargetGpa('3.5')
      }},
    ])
  }

  // ── Guards ──────────────────────────────────────────────────────────────────
  // 1. Still resolving premium status OR data still loading — show spinner
  if (!isPremiumReady || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.orange} />
      </View>
    )
  }

  // 2. Premium status resolved — not premium → paywall
  if (!effectiveIsPremium) {
    return <PremiumPaywall onBack={() => router.back()} />
  }

  // 3. Premium confirmed → render the full calculator below

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>

      {/* ══════ FIXED NAV BAR ══════ */}
      <View style={[g.nav, { paddingTop: insets.top + 10 }]}>
        <View style={g.orbOrange} /><View style={g.orbBlue} />
        <TouchableOpacity onPress={() => router.back()} style={g.navIconBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={18} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={1.3} style={g.navTitle}>Grade Calculator</Text>
          <Text maxFontSizeMultiplier={1.3} style={g.navSub}>{sys.shortName} · {sys.maxPoints.toFixed(1)} scale</Text>
        </View>
        <TouchableOpacity onPress={() => setShowPicker(true)} style={g.scaleBtn} activeOpacity={0.75}>
          <Text style={g.scaleBtnLabel}>SCALE</Text>
          <Ionicons name="chevron-down" size={10} color={C.orange} />
        </TouchableOpacity>
        <TouchableOpacity onPress={clearAll} style={g.navIconBtn} activeOpacity={0.75}>
          <Ionicons name="refresh-outline" size={16} color={C.textSub} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: insets.top + 76, paddingBottom: 60 }}
        >

          {/* ══════ HERO ══════ */}
          <View style={g.hero}>
            <View style={g.heroGlow} />

            {/* Twin GPA cards */}
            <View style={g.gpaRow}>
              <View style={g.gpaCard}>
                <Text style={g.eyebrow}>CGPA</Text>
                <View style={g.valueRow}>
                  <Text style={[g.gpaValue, { color: cColor }]}>
                    {cumulResult.gpa !== null ? cumulResult.gpa.toFixed(2) : '—'}
                  </Text>
                  <Text style={g.gpaDenom}>/{sys.maxPoints.toFixed(1)}</Text>
                </View>
                <DegreeClassBadge gpa={cumulResult.gpa} sys={sys} />
                <Text style={g.cardMeta}>
                  {cumulResult.credits > 0
                    ? `${cumulResult.credits} credit hrs · ${semesters.length} sem${semesters.length !== 1 ? 's' : ''}`
                    : 'No grades entered yet'}
                </Text>
                {cumulResult.fails > 0 && (
                  <View style={g.failBadge}>
                    <Ionicons name="warning" size={11} color={C.coral} />
                    <Text style={g.failBadgeText}>{cumulResult.fails} failed course{cumulResult.fails !== 1 ? 's' : ''}</Text>
                  </View>
                )}
              </View>

              <LinearGradient colors={['#E8692A', '#C8501A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={g.gpaCardOrange}>
                <View style={g.orangeGlowCircle} />
                <Text style={g.eyebrowWhite}>THIS SEMESTER</Text>
                <View style={g.valueRow}>
                  <Text style={[g.gpaValue, { color: '#fff' }]}>
                    {semResult.gpa !== null ? semResult.gpa.toFixed(2) : '—'}
                  </Text>
                  <Text style={[g.gpaDenom, { color: 'rgba(255,255,255,0.55)' }]}>/{sys.maxPoints.toFixed(1)}</Text>
                </View>
                <Text style={g.cardMetaWhite}>
                  {semResult.credits > 0
                    ? `${semResult.credits} credit hrs · ${semResult.gradeCount} course${semResult.gradeCount !== 1 ? 's' : ''}`
                    : 'No grades entered'}
                </Text>
                {semResult.failCount > 0 && (
                  <View style={[g.failBadge, { backgroundColor: 'rgba(0,0,0,0.20)' }]}>
                    <Ionicons name="warning" size={11} color="#FFD0C0" />
                    <Text style={[g.failBadgeText, { color: '#FFD0C0' }]}>{semResult.failCount} failed</Text>
                  </View>
                )}
              </LinearGradient>
            </View>

            {/* Target CGPA bar */}
            <View style={g.targetCard}>
              <View style={g.targetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={g.eyebrow}>TARGET CGPA GOAL</Text>
                  {cumulResult.gpa !== null && targetOk && cumulResult.gpa < targetNum && (
                    <Text style={g.targetHint}>{(targetNum - cumulResult.gpa).toFixed(2)} pts needed to reach your goal</Text>
                  )}
                  {cumulResult.gpa !== null && targetOk && cumulResult.gpa >= targetNum && (
                    <Text style={[g.targetHint, { color: C.emerald }]}>🎉 Goal reached! Keep going.</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => { setEditingTarget(true); setTimeout(() => targetRef.current?.focus(), 60) }} activeOpacity={0.75}>
                  {editingTarget
                    ? <TextInput ref={targetRef} style={g.targetInput} value={targetGpa} onChangeText={setTargetGpa} onBlur={() => setEditingTarget(false)} keyboardType="decimal-pad" maxLength={4} selectTextOnFocus />
                    : <View style={g.targetPill}><Text style={g.targetPillVal}>{targetGpa || '—'}</Text><Ionicons name="pencil" size={9} color={C.orange} /></View>
                  }
                </TouchableOpacity>
              </View>
              <View style={g.progTrack}>
                <View style={[g.progFill, { width: `${Math.round(progress * 100)}%` as any }]} />
                {progress > 0.03 && (
                  <View style={[g.progDot, { left: `${Math.max(Math.round(progress * 100) - 1, 0)}%` as any }]} />
                )}
              </View>
              <View style={g.progLabels}>
                <Text style={g.progLabelL}>0.0</Text>
                <Text style={g.progLabelR}>{targetOk ? targetGpa : sys.maxPoints.toFixed(1)}</Text>
              </View>
            </View>
          </View>

          {/* ══════ SEMESTER TABS ══════ */}
          <View style={g.tabsBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.tabsRow}>
              {semesters.map(sem => (
                <SemesterTab
                  key={sem.id} sem={sem} sys={sys}
                  isActive={sem.id === activeSemId}
                  onPress={() => setActiveSemId(sem.id)}
                  onLongPress={() => renameSemester(sem.id)}
                />
              ))}
              <TouchableOpacity onPress={addSemester} style={[stab.tab, { paddingHorizontal: 12 }]} activeOpacity={0.75}>
                <Ionicons name="add" size={16} color={C.orange} />
                <Text style={{ fontSize: 8, fontWeight: '800', color: C.orange, letterSpacing: 1.2 }}>ADD</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* ══════ BODY ══════ */}
          <View style={g.body}>

            {/* Stat strip — only when data exists */}
            {semResult.gradeCount > 0 && (
              <View style={g.statStrip}>
                {[
                  { val: String(semResult.gradeCount), label: 'Courses' },
                  { val: semResult.credits.toFixed(0), label: 'Credits' },
                  { val: semResult.gpa?.toFixed(2) ?? '—', label: 'Sem. GPA', color: sColor },
                  { val: cumulResult.gpa?.toFixed(2) ?? '—', label: 'CGPA', color: cColor },
                ].map((item, i, arr) => (
                  <View key={item.label} style={{ flexDirection: 'row', flex: 1 }}>
                    <View style={g.statCell}>
                      <Text style={[g.statValue, item.color ? { color: item.color } : undefined]}>{item.val}</Text>
                      <Text style={g.statLabel}>{item.label}</Text>
                    </View>
                    {i < arr.length - 1 && <View style={g.statDivider} />}
                  </View>
                ))}
              </View>
            )}

            {/* Section header */}
            <View style={g.sectionHead}>
              <View style={g.sectionLabelRow}>
                <View style={g.sectionLine} />
                <Text style={g.sectionTitle}>{activeSem?.label?.toUpperCase() ?? 'COURSES'}</Text>
              </View>
              {semesters.length > 1 && (
                <TouchableOpacity onPress={() => deleteSemester(activeSemId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={g.deleteSemText}>Delete semester</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Input hint */}
            <View style={g.hintRow}>
              <Ionicons name="information-circle-outline" size={12} color={C.textMute} />
              <Text style={g.hintText}>
                Enter a letter grade (A, B+, C-) or a percentage (72, 58). Credits default to 3.{' '}
                Minimum pass: <Text style={{ color: C.orange, fontWeight: '700' }}>{sys.passGrade}</Text>
              </Text>
            </View>

            {/* Course rows */}
            {activeSem?.courses.map((course, idx) => (
              <CourseRow
                key={course.id} course={course} index={idx} sys={sys}
                onUpdate={updateCourse} onRemove={removeCourse}
              />
            ))}

            {/* Add course */}
            <TouchableOpacity style={g.addBtn} onPress={addCourse} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={17} color={C.orange} />
              <Text style={g.addBtnText}>Add Course</Text>
            </TouchableOpacity>

            {/* Grade scale reference */}
            <ScaleCard sys={sys} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SystemPickerModal visible={showPicker} current={systemId} onSelect={setSystemId} onClose={() => setShowPicker(false)} />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main styles
// ─────────────────────────────────────────────────────────────────────────────
const g = StyleSheet.create({
  // Nav
  nav:         { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  navIconBtn:  { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  navTitle:    { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  navSub:      { fontSize: 10, color: C.textMute, fontWeight: '500', marginTop: 1 },
  scaleBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.30)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, flexShrink: 0 },
  scaleBtnLabel:{ fontSize: 9, fontWeight: '800', color: C.orange, letterSpacing: 1.2 },
  orbOrange:   { position: 'absolute', top: -60, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(232,105,42,0.09)' },
  orbBlue:     { position: 'absolute', top: 10,  left: -30,  width: 120, height: 120, borderRadius: 60,  backgroundColor: 'rgba(75,140,245,0.05)' },

  // Hero
  hero:             { backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingTop: 24, paddingBottom: 28, position: 'relative', overflow: 'hidden' },
  heroGlow:         { position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(232,105,42,0.06)' },
  gpaRow:           { flexDirection: 'row', gap: 12, marginBottom: 16 },
  gpaCard:          { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16 },
  gpaCardOrange:    { flex: 1, borderRadius: 20, padding: 16, position: 'relative', overflow: 'hidden' },
  orangeGlowCircle: { position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.08)' },
  eyebrow:          { fontSize: 8.5, fontWeight: '800', color: C.textMute,                  letterSpacing: 1.8, marginBottom: 4 },
  eyebrowWhite:     { fontSize: 8.5, fontWeight: '800', color: 'rgba(255,255,255,0.70)',      letterSpacing: 1.8, marginBottom: 4 },
  valueRow:         { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 2 },
  gpaValue:         { fontSize: 30, fontWeight: '900', lineHeight: 32, letterSpacing: -1 },
  gpaDenom:         { fontSize: 13, fontWeight: '600', color: C.textMute, marginBottom: 4, lineHeight: 32 },
  cardMeta:         { fontSize: 10, color: C.textMute, fontWeight: '500', marginTop: 6 },
  cardMetaWhite:    { fontSize: 10, color: 'rgba(255,255,255,0.60)', fontWeight: '500', marginTop: 10 },
  failBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.coralDim, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 8 },
  failBadgeText:    { fontSize: 10, fontWeight: '700', color: C.coral },

  // Target card
  targetCard:   { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 18 },
  targetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 10 },
  targetHint:   { fontSize: 11, color: C.textSub, fontWeight: '500', marginTop: 3 },
  targetPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.28)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  targetPillVal:{ fontSize: 16, fontWeight: '900', color: C.orange },
  targetInput:  { fontSize: 16, fontWeight: '900', color: C.orange, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.4)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, minWidth: 60, textAlign: 'center' },
  progTrack:    { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, position: 'relative' },
  progFill:     { height: '100%', backgroundColor: C.orange, borderRadius: 4, minWidth: 4 },
  progDot:      { position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6, backgroundColor: C.orange, borderWidth: 2, borderColor: C.surface, shadowColor: C.orange, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4 },
  progLabels:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progLabelL:   { fontSize: 9, color: C.textMute, fontWeight: '600' },
  progLabelR:   { fontSize: 9, color: C.orange,   fontWeight: '700' },

  // Tabs
  tabsBar: { backgroundColor: C.deep, borderBottomWidth: 1, borderBottomColor: C.border },
  tabsRow: { paddingHorizontal: BODY_H_PAD, gap: 4, flexDirection: 'row' },

  // Body
  body: { backgroundColor: C.void, paddingHorizontal: BODY_H_PAD, paddingTop: 24 },

  // Stat strip
  statStrip:   { flexDirection: 'row', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingVertical: 14, marginBottom: 24 },
  statCell:    { flex: 1, alignItems: 'center', gap: 3 },
  statValue:   { fontSize: 17, fontWeight: '900', color: C.text, lineHeight: 20 },
  statLabel:   { fontSize: 8, fontWeight: '700', color: C.textMute, letterSpacing: 1.2 },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },

  // Section header — matches index.tsx exactly
  sectionHead:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionLine:     { width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  sectionTitle:    { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8 },
  deleteSemText:   { fontSize: 10.5, color: C.coral, fontWeight: '600' },

  // Hint row
  hintRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: C.raised, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  hintText: { flex: 1, fontSize: 11, color: C.textMute, lineHeight: 16, fontWeight: '500' },

  // Add course button
  addBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.25)', marginTop: 4, marginBottom: 28 },
  addBtnText: { fontSize: 14, fontWeight: '700', color: C.orange },
})