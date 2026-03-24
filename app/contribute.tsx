/**
 * app/contribute.tsx
 * Contribute Materials Screen
 *
 * Features:
 *  1. PDF file upload with thumbnail preview
 *  2. Cascading College → Class → Course selection (Supabase)
 *  3. Form validation & error handling
 *  4. Upload progress bar (0-100%)
 *  5. Success toast + auto-return to previous screen
 *  6. Category toggle (Notes, Slides, Summary)
 *  7. Public visibility toggle
 */

import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import { useRouter } from 'expo-router'
import {
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProfileSync } from '../hooks/useProfileSync'
import { C } from '../lib/colors'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type College = { id: string; name: string; short_name: string }
type Class = { id: string; name: string; college_id: string }
type Course = { id: string; name: string; class_id: string }

type SelectedFile = {
  name: string
  size: number
  uri: string
  thumbnail?: string | null
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const CATEGORIES = ['notes', 'slides', 'summary', 'past_question_answer', 'solutions', 'books'] as const

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

const isValidPDF = (fileName: string): boolean => {
  return fileName.toLowerCase().endsWith('.pdf')
}

// ─────────────────────────────────────────────
// Fetch Functions
// ─────────────────────────────────────────────
async function fetchColleges(): Promise<College[]> {
  const { data, error } = await supabase
    .from('colleges')
    .select('id, name, short_name')
    .order('name', { ascending: true })
  
  if (error) {
    console.error('Error fetching colleges:', error)
    return []
  }
  return data || []
}

async function fetchClasses(collegeId: string): Promise<Class[]> {
  if (!collegeId) return []
  
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, college_id')
    .eq('college_id', collegeId)
    .order('name', { ascending: true })
  
  if (error) {
    console.error('Error fetching classes:', error)
    return []
  }
  return data || []
}

async function fetchCourses(classId: string): Promise<Course[]> {
  if (!classId) return []
  
  const { data, error } = await supabase
    .from('courses')
    .select('id, name, class_id')
    .eq('class_id', classId)
    .order('name', { ascending: true })
  
  if (error) {
    console.error('Error fetching courses:', error)
    return []
  }
  return data || []
}

// ─────────────────────────────────────────────
// Toast Component
// ─────────────────────────────────────────────
function Toast({ message, type = 'success', visible }: { message: string; type?: 'success' | 'error'; visible: boolean }) {
  if (!visible) return null

  const bgColor = type === 'success' ? C.emerald : C.coral
  const textColor = '#fff'

  return (
    <View style={[st.toast, { backgroundColor: bgColor }]}>
      <Ionicons name={type === 'success' ? 'checkmark-circle' : 'close-circle'} size={18} color={textColor} />
      <Text maxFontSizeMultiplier={1.3} style={[st.toastText, { color: textColor }]}>
        {message}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// File Upload Zone Component
// ─────────────────────────────────────────────
function FileUploadZone({
  selectedFile,
  onFileSelect,
  isLoading,
  error,
}: {
  selectedFile: SelectedFile | null
  onFileSelect: (file: SelectedFile) => void
  isLoading: boolean
  error: string | null
}) {
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
      })

      if (result.canceled) return

      const file = result.assets[0]

      // Validate file type
      if (!isValidPDF(file.name)) {
        Alert.alert('Invalid file', 'Only PDF files are supported.')
        return
      }

      // Validate file size
      if (file.size == null) {
        Alert.alert('Invalid file', 'Unable to determine file size.')
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        Alert.alert('File too large', `Maximum file size is 50MB. Your file is ${formatFileSize(file.size)}.`)
        return
      }

      onFileSelect({
        name: file.name,
        size: file.size,
        uri: file.uri,
        thumbnail: null, // TODO: Generate PDF thumbnail if needed
      })
    } catch (err: any) {
      Alert.alert('Error', 'Could not pick file. ' + err.message)
    }
  }

  if (selectedFile) {
    return (
      <View style={[st.uploadZoneSelected, error ? { borderColor: C.coral + '50' } : {}]}>
        <View style={st.selectedFilePreview}>
          <View style={[st.pdfIconBox, { backgroundColor: C.orangeDim }]}>
            <Ionicons name="document-outline" size={32} color={C.orange} />
          </View>
          <View style={st.selectedFileInfo}>
            <Text maxFontSizeMultiplier={1.3} style={st.selectedFileName} numberOfLines={2}>
              {selectedFile.name}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={st.selectedFileSize}>
              {formatFileSize(selectedFile.size)}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={st.changeFileBtn} onPress={pickFile} disabled={isLoading}>
          <Text maxFontSizeMultiplier={1.3} style={st.changeFileBtnText}>Change</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={[st.uploadZone, error ? { borderColor: C.coral + '50', backgroundColor: C.coral + '05' } : {}]}
      onPress={pickFile}
      disabled={isLoading}
      activeOpacity={0.75}
    >
      <View style={[st.uploadIconBox, { backgroundColor: C.orangeDim }]}>
        <Ionicons name="cloud-upload-outline" size={48} color={C.orange} />
      </View>

      <Text maxFontSizeMultiplier={1.3} style={st.uploadTitle}>Upload Study Resource</Text>
      <Text maxFontSizeMultiplier={1.3} style={st.uploadSubtitle}>
        PDF only • Tap to select or drag & drop
      </Text>

      <TouchableOpacity style={st.selectFileBtn} onPress={pickFile} disabled={isLoading} activeOpacity={0.75}>
        {isLoading ? (
          <ActivityIndicator color={C.void} size="small" />
        ) : (
          <Text maxFontSizeMultiplier={1.3} style={st.selectFileBtnText}>Select File</Text>
        )}
      </TouchableOpacity>

      {error && <Text maxFontSizeMultiplier={1.3} style={st.errorText}>{error}</Text>}
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────
// Custom Select Component
// ─────────────────────────────────────────────
function SelectDropdown({
  label,
  value,
  items,
  onValueChange,
  placeholder,
  disabled,
  isLoading,
}: {
  label: string
  value: string
  items: Array<{ id: string; name: string }>
  onValueChange: (id: string) => void
  placeholder: string
  disabled?: boolean
  isLoading?: boolean
}) {
  const [showDropdown, setShowDropdown] = useState(false)

  return (
    <View style={st.selectWrapper}>
      <Text maxFontSizeMultiplier={1.3} style={st.fieldLabel}>{label}</Text>

      <TouchableOpacity
        style={[st.selectButton, disabled && st.selectButtonDisabled]}
        onPress={() => !disabled && setShowDropdown(true)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text
          maxFontSizeMultiplier={1.3}
          style={[
            st.selectButtonText,
            !value && st.selectButtonPlaceholder,
            disabled && st.selectButtonDisabledText,
          ]}
          numberOfLines={1}
        >
          {isLoading ? '...' : value ? items.find(i => i.id === value)?.name || placeholder : placeholder}
        </Text>

        {!isLoading && <Ionicons name={showDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={C.textSub} />}
      </TouchableOpacity>

      {showDropdown && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
          <Pressable style={st.dropdownOverlay} onPress={() => setShowDropdown(false)}>
            <View style={st.dropdownMenu}>
              <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                {items.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[st.dropdownItem, value === item.id && st.dropdownItemSelected]}
                    onPress={() => {
                      onValueChange(item.id)
                      setShowDropdown(false)
                    }}
                  >
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={[st.dropdownItemText, value === item.id && st.dropdownItemTextSelected]}
                    >
                      {item.name}
                    </Text>
                    {value === item.id && <Ionicons name="checkmark" size={18} color={C.orange} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Category Toggle Component
// ─────────────────────────────────────────────
function CategoryToggle({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (category: string) => void
}) {
  return (
    <View style={st.categoryWrapper}>
      <Text maxFontSizeMultiplier={1.3} style={st.fieldLabel}>Category</Text>

  <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={{ gap: 10, paddingHorizontal: 4 }}
        style={{ marginBottom: 4 }}
      >
        {CATEGORIES.map(category => {
          const isSelected = value === category
          const displayName = category === 'past_question_answer' ? 'Past Q&A' 
                       : category === 'solutions' ? 'Solutions' 
                       : category.charAt(0).toUpperCase() + category.slice(1)
          return (
            <TouchableOpacity
              key={category}
              style={[
                st.categoryButton,
                {
                  minWidth: 80,
                  paddingHorizontal: 16,
                  borderRadius: 20,
                  borderWidth: isSelected ? 0 : 1,
                  borderColor: isSelected ? 'transparent' : C.border,
                  backgroundColor: isSelected ? C.orange : C.raised,
                  shadowColor: isSelected ? C.orange : 'transparent',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isSelected ? 0.3 : 0,
                  shadowRadius: 8,
                  elevation: isSelected ? 4 : 0,
                }
              ]}
              onPress={() => onValueChange(category)}
              activeOpacity={0.8}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={[
                  st.categoryButtonText,
                  {
                    fontSize: 12,
                    fontWeight: '700',
                    color: isSelected ? '#fff' : C.textSub,
                  }
                ]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

// ─────────────────────────────────────────────
// Main Contribute Screen
// ─────────────────────────────────────────────
export default function ContributeScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { userId } = useProfileSync()

  // State
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [selectedCollege, setSelectedCollege] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('notes')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)

  // Queries for cascading selects
  const { data: colleges = [], isLoading: isLoadingColleges } = useQuery({
    queryKey: ['colleges'],
    queryFn: fetchColleges,
  })

  const { data: classes = [], isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes', selectedCollege],
    queryFn: () => fetchClasses(selectedCollege),
    enabled: !!selectedCollege,
  })

  const { data: courses = [], isLoading: isLoadingCourses } = useQuery({
    queryKey: ['courses', selectedClass],
    queryFn: () => fetchCourses(selectedClass),
    enabled: !!selectedClass,
  })

  // Reset dependent selects when parent changes
  useEffect(() => {
    setSelectedClass('')
    setSelectedCourse('')
  }, [selectedCollege])

  useEffect(() => {
    setSelectedCourse('')
  }, [selectedClass])

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !selectedFile) throw new Error('Missing user ID or file')

      console.log('Starting upload process...')
      console.log('User ID:', userId)
      console.log('File:', selectedFile.name, selectedFile.size)

      // Read file
      console.log('Reading file from device...')
      const response = await fetch(selectedFile.uri)
      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.status} ${response.statusText}`)
      }
      const blob = await response.blob()
      console.log('File read successfully, size:', blob.size)

      // Upload to storage with progress callback
      const fileName = `${userId}/${Date.now()}_${selectedFile.name}`
      console.log('Uploading to storage:', fileName)

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('materials')
        .upload(fileName, blob, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        console.error('Storage upload error:', uploadError)
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }
      console.log('Storage upload successful:', uploadData.path)

      // Get public URL
      const { data: urlData } = supabase.storage.from('materials').getPublicUrl(uploadData.path)
      console.log('Public URL generated:', urlData.publicUrl)

      // Simulate progress
      setUploadProgress(75)

      // Insert metadata
      console.log('Inserting material metadata...')
      const { data: material, error: dbError } = await supabase
        .from('materials')
        .insert({
          profile_id: userId,
          title,
          description,
          type: category,
          file_url: urlData.publicUrl,
          course_id: selectedCourse,
          status: 'published',
          is_public: isPublic,
        })
        .select()
        .single()

      if (dbError) {
        console.error('Database insert error:', dbError)
        throw new Error(`Database insert failed: ${dbError.message}`)
      }
      console.log('Database insert successful:', material.id)

      setUploadProgress(100)
      return material
    },
    onSuccess: () => {
      setToastMessage('Your material uploaded successfully! 🎉')
      setShowToast(true)

      // Navigate back after delay
      setTimeout(() => {
        router.back()
      }, 1500)
    },
    onError: (error: any) => {
      Alert.alert('Upload Failed', error.message || 'Could not upload material')
    },
  })

  // Form validation
  const isFormValid = useMemo(() => {
    return (
      selectedFile !== null &&
      selectedCollege !== '' &&
      selectedClass !== '' &&
      selectedCourse !== '' &&
      title.trim().length > 0 &&
      category !== ''
    )
  }, [selectedFile, selectedCollege, selectedClass, selectedCourse, title, category])

  const handleUpload = () => {
    if (!isFormValid) {
      let errorMsg = ''
      if (!selectedCollege) errorMsg = 'Please select a college'
      else if (!selectedClass) errorMsg = 'Please select a class'
      else if (!selectedCourse) errorMsg = 'Please select a course'
      else if (!title.trim()) errorMsg = 'Please enter a resource title'
      else if (!selectedFile) errorMsg = 'Please select a PDF file'

      Alert.alert('Missing Information', errorMsg)
      return
    }

    setUploadProgress(0)
    uploadMutation.mutate()
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>
      {/* HEADER */}
      <View style={[st.header, { paddingTop: insets.top + 10, paddingBottom: 14 }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>

        <Text maxFontSizeMultiplier={1.3} style={st.headerTitle}>CONTRIBUTE</Text>

        <View style={{ width: 24 }} />
      </View>

      {/* CONTENT */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingTop: 24,
            paddingBottom: 200,
          }}
        >
          {/* FILE UPLOAD */}
          <FileUploadZone
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
            isLoading={uploadMutation.isPending}
            error={fileError}
          />

          {/* FORM SECTION */}
          <View style={{ marginTop: 32 }}>
            {/* College */}
            <SelectDropdown
              label="College"
              value={selectedCollege}
              items={colleges.map(c => ({ id: c.id, name: c.short_name || c.name }))}
              onValueChange={setSelectedCollege}
              placeholder="Select your college"
              isLoading={isLoadingColleges}
            />

            {/* Class */}
            <SelectDropdown
              label="Class"
              value={selectedClass}
              items={classes.map(c => ({ id: c.id, name: c.name }))}
              onValueChange={setSelectedClass}
              placeholder={selectedCollege ? 'Select a class' : 'Select college first'}
              disabled={!selectedCollege}
              isLoading={isLoadingClasses}
            />

            {/* Course */}
            <SelectDropdown
              label="Course"
              value={selectedCourse}
              items={courses.map(c => ({ id: c.id, name: c.name }))}
              onValueChange={setSelectedCourse}
              placeholder={selectedClass ? 'Select a course' : 'Select class first'}
              disabled={!selectedClass}
              isLoading={isLoadingCourses}
            />

            {/* Title */}
            <View style={st.fieldWrapper}>
              <Text maxFontSizeMultiplier={1.3} style={st.fieldLabel}>Resource Title</Text>
              <TextInput
                style={st.input}
                placeholder="e.g. Advanced Organic Chemistry Notes"
                placeholderTextColor={C.textMute}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
              <Text maxFontSizeMultiplier={1.3} style={st.charCount}>
                {title.length}/100
              </Text>
            </View>

            {/* Category */}
            <CategoryToggle value={category} onValueChange={setCategory} />

            {/* Description */}
            <View style={st.fieldWrapper}>
              <Text maxFontSizeMultiplier={1.3} style={st.fieldLabel}>Description (Optional)</Text>
              <TextInput
                style={[st.input, st.textarea]}
                placeholder="Briefly describe what's inside this resource..."
                placeholderTextColor={C.textMute}
                value={description}
                onChangeText={setDescription}
                maxLength={500}
                multiline
                numberOfLines={4}
              />
              <Text maxFontSizeMultiplier={1.3} style={st.charCount}>
                {description.length}/500
              </Text>
            </View>

            {/* Public Toggle */}
            <View style={st.toggleWrapper}>
              <View style={st.toggleLeft}>
                <Text maxFontSizeMultiplier={1.3} style={st.toggleLabel}>Public for Community</Text>
                <Text maxFontSizeMultiplier={1.3} style={st.toggleSub}>
                  Allow other students to find and use your resource
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: C.border, true: C.orange + '50' }}
                thumbColor={isPublic ? C.orange : C.textMute}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* PROGRESS BAR */}
      {uploadMutation.isPending && uploadProgress > 0 && (
        <View style={st.progressContainer}>
          <Text maxFontSizeMultiplier={1.3} style={st.progressText}>
            Uploading... {uploadProgress}%
          </Text>
          <View style={st.progressBar}>
            <View style={[st.progressFill, { width: `${uploadProgress}%` }]} />
          </View>
        </View>
      )}

      {/* FOOTER BUTTON */}
      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[
            st.uploadButton,
            !isFormValid || uploadMutation.isPending ? st.uploadButtonDisabled : {},
          ]}
          onPress={handleUpload}
          disabled={!isFormValid || uploadMutation.isPending}
          activeOpacity={0.8}
        >
          {uploadMutation.isPending ? (
            <ActivityIndicator color={C.void} size="small" />
          ) : (
            <Text maxFontSizeMultiplier={1.3} style={st.uploadButtonText}>UPLOAD RESOURCE</Text>
          )}
        </TouchableOpacity>

        <Text maxFontSizeMultiplier={1.3} style={st.disclaimer}>
          By uploading, you agree to StudentShare's terms of service and content policy.
        </Text>
      </View>

      {/* TOAST */}
      <Toast message={toastMessage} type="success" visible={showToast} />
    </View>
  )
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const st = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.deep,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 22,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'serif',
    color: C.text,
    letterSpacing: -0.3,
  },

  uploadZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.orange + '30',
    backgroundColor: C.orange + '08',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  uploadZoneSelected: {
    borderWidth: 2,
    borderColor: C.orange + '30',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadIconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfIconBox: {
    width: 60,
    height: 60,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'serif',
    color: C.text,
  },
  uploadSubtitle: {
    fontSize: 12,
    color: C.textMute,
    textAlign: 'center',
  },
  selectFileBtn: {
    backgroundColor: C.orange,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  selectFileBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  selectedFilePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  selectedFileName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    marginBottom: 4,
  },
  selectedFileSize: {
    fontSize: 11,
    color: C.textMute,
  },
  selectedFileInfo: {
    flex: 1,
  },
  changeFileBtn: {
    backgroundColor: C.orangeDim,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  changeFileBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.orange,
  },
  errorText: {
    fontSize: 11,
    color: C.coral,
    marginTop: 8,
    textAlign: 'center',
  },

  fieldWrapper: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.orange,
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: C.text,
    fontWeight: '500',
  },
  textarea: {
    paddingTop: 14,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  charCount: {
    fontSize: 10,
    color: C.textMute,
    marginTop: 6,
    textAlign: 'right',
  },

  selectWrapper: {
    marginBottom: 20,
  },
  selectButton: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectButtonDisabled: {
    backgroundColor: C.raised,
    opacity: 0.6,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
    flex: 1,
  },
  selectButtonPlaceholder: {
    color: C.textMute,
  },
  selectButtonDisabledText: {
    color: C.textMute,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dropdownMenu: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingVertical: 16,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dropdownItemSelected: {
    backgroundColor: C.orange + '10',
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
  },
  dropdownItemTextSelected: {
    fontWeight: '600',
    color: C.orange,
  },

  categoryWrapper: {
    marginBottom: 20,
  },
  categoryScrollWrapper: {
    height: 44,
  },
  categoryButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryButton: {
    minHeight: 36,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  categoryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },

  toggleWrapper: {
    backgroundColor: C.orange + '08',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLeft: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    marginBottom: 4,
  },
  toggleSub: {
    fontSize: 11,
    color: C.textMute,
  },

  progressContainer: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 22,
    paddingVertical: 12,
    gap: 8,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text,
  },
  progressBar: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.orange,
    borderRadius: 2,
  },

  footer: {
    backgroundColor: C.void,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  uploadButton: {
    backgroundColor: C.orange,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  uploadButtonDisabled: {
    backgroundColor: C.orange + '60',
    shadowOpacity: 0,
    elevation: 0,
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  disclaimer: {
    fontSize: 10,
    color: C.textMute,
    textAlign: 'center',
    lineHeight: 14,
  },

  toast: {
    position: 'absolute',
    bottom: 20,
    left: 22,
    right: 22,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
})