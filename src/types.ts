export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'none';

export type StaffAttendanceStatus = 'm_in' | 'm_out' | 'a_in' | 'a_out' | 'none';

export type AppUserRole = 'master_admin' | 'admin' | 'user';

export interface AppUser {
  id: string;
  staffId: string; // Linking to staff record
  username: string;
  passwordHash: string; // In production, use real hashing
  role: AppUserRole;
  isConfirmed: boolean; // For OTP/Admin confirmation
}

export interface StaffAttendanceData {
  mIn: string | null;
  mOut: string | null;
  aIn: string | null;
  aOut: string | null;
  mInPhoto?: boolean;
  mOutPhoto?: boolean;
  aInPhoto?: boolean;
  aOutPhoto?: boolean;
}

export interface Class {
  id: string;
  name: string;
  studyTime?: string;
  teacherId?: string;
}

export interface Student {
  id: string;
  nameKhmer: string;
  nameLatin: string;
  gender: 'M' | 'F';
  dateOfBirth: string;
  address: string;
  phoneNumber: string;
  classId: string;
}

export interface Staff {
  id: string;
  nameKhmer: string;
  nameLatin: string;
  gender: 'M' | 'F';
  phoneNumber: string;
  mInTime?: string;
  mOutTime?: string;
  aInTime?: string;
  aOutTime?: string;
  deviceId?: string;
}

export interface AttendanceRecord {
  [studentId: string]: AttendanceStatus;
}

export interface StaffAttendanceRecord {
  [staffId: string]: StaffAttendanceData;
}

export interface AttendanceState {
  [dateStr: string]: AttendanceRecord; // Format: YYYY-MM-DD
}

export interface StaffAttendanceState {
  [dateStr: string]: StaffAttendanceRecord; // Format: YYYY-MM-DD
}

export interface AppSettings {
  telegramBotToken?: string;
  telegramChatId?: string;
  schoolLatitude?: number;
  schoolLongitude?: number;
  allowedRadius?: number; // in meters
  requirePhoto?: boolean;
  enableDeviceBinding?: boolean;
  spreadsheetId?: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}
