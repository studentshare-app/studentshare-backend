import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Material extends Model {
  static table = 'materials';

  // Sync mapping
  @field('remote_id')         remoteId;

  // Data
  @field('title')             title;
  @field('description')       description;
  @field('file_url')          fileUrl;
  @field('file_type')         fileType;
  @field('file_size')         fileSize;
  @field('course_id')         courseId;
  @field('class_id')          classId;
  @field('college_id')        collegeId;
  @field('lecturer_id')       lecturerId;
  @field('lecturer_name')     lecturerName;
  @field('uploader_id')       uploaderId;
  @field('status')            status;
  @field('academic_year')     academicYear;
  @field('is_premium')        isPremium;
  @field('content_text')      contentText;
  @field('is_public')         isPublic;

  // Download state (WhatsApp-style)
  // download_status: 'none' | 'downloading' | 'done' | 'failed'
  @field('download_status')   downloadStatus;
  @field('local_path')        localPath;
  @field('cached')            cached;

  // Sync state
  @field('deleted')           deleted;
  @field('version')           version;

  // Timestamps
  @field('created_at')        createdAt;
  @field('updated_at')        updatedAt;
  @field('server_updated_at') serverUpdatedAt;

  // Convenience getters
  get isDownloaded() {
    return this.downloadStatus === 'done' && !!this.localPath;
  }

  get isDownloading() {
    return this.downloadStatus === 'downloading';
  }
}