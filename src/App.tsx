import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Users, CalendarCheck, BarChart3, Plus, Trash2, Edit2,
  CheckCircle2, XCircle, Clock, FileText, Calendar as CalendarIcon, UserPlus, LayoutList, Menu, X, Briefcase, LayoutDashboard, History, ChevronDown, ChevronUp, User, LogIn, LogOut, Settings as SettingsIcon, Send,
  Camera, RefreshCcw, MapPin, Smartphone, ShieldCheck, Smile, Lock, Download, Upload
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Student, AttendanceStatus, AttendanceState, Class, Staff, StaffAttendanceState, StaffAttendanceData, AppSettings, Toast } from './types';
import { AppUser, AppUserRole } from './types';
import { firebaseService } from './services/firebaseService';
import { auth } from './lib/firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// --- Utility Functions ---
const escapeHTML = (text: any) => {
  const str = String(text || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const getTodayStr = () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const safeJSONParse = (str: string | null, fallback: any) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

const getAttendanceLabel = (recordedTime: string | null, limitTime: string | undefined, field: keyof StaffAttendanceData) => {
  if (!recordedTime || !limitTime) return null;
  
  const toMinutes = (timeStr: string) => {
    const parts = timeStr.trim().split(' ');
    if (parts.length !== 2) return null;
    const [time, modifier] = parts;
    const timeParts = time.split(':');
    if (timeParts.length !== 2) return null;
    let [hours, minutes] = timeParts.map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const recordedMins = toMinutes(recordedTime);
  const limitMins = toMinutes(limitTime);
  
  if (recordedMins === null || limitMins === null) return null;

  if (field === 'mIn' || field === 'aIn') {
    return recordedMins <= limitMins ? 'ទាន់ពេល' : 'យឺត';
  } else {
    return recordedMins >= limitMins ? 'ទាន់ពេល' : 'ចេញមុន';
  }
};

const formatTimeToInput = (timeStr: string | undefined) => {
  if (!timeStr) return "";
  const parts = timeStr.split(' ');
  if (parts.length !== 2) return "";
  const [time, modifier] = parts;
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const formatInputToTime = (inputVal: string) => {
  if (!inputVal) return "";
  let [hours, minutes] = inputVal.split(':').map(Number);
  const modifier = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${modifier}`;
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};

const getDeviceId = () => {
  let id = localStorage.getItem('school_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('school_device_id', id);
  }
  return id;
};

function AttendanceCamera({ onCapture, onCancel }: { onCapture: (base64: string) => void, onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' }, 
          audio: false 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
        }
      } catch (err: any) {
        setError(err.message || 'មិនអាចបើក Camera បានទេ');
      }
    }
    setupCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        
        // Visual shutter effect
        const shutter = document.createElement('div');
        shutter.style.position = 'absolute';
        shutter.style.inset = '0';
        shutter.style.backgroundColor = 'white';
        shutter.style.zIndex = '50';
        shutter.style.opacity = '1';
        shutter.style.transition = 'opacity 0.2s ease-out';
        videoRef.current.parentElement?.appendChild(shutter);
        setTimeout(() => {
          shutter.style.opacity = '0';
          setTimeout(() => shutter.remove(), 200);
        }, 50);

        context.drawImage(videoRef.current, 0, 0);
        const data = canvasRef.current.toDataURL('image/jpeg', 0.8); // Higher quality
        onCapture(data);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-slate-800">ថតរូប Selfie</h3>
            <p className="text-sm text-slate-500">ដើម្បីបញ្ជាក់វត្តមានផ្ទាល់ខ្លួន</p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full transition-all">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="relative aspect-square bg-slate-900 rounded-3xl overflow-hidden shadow-inner mb-8">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center">
              <XCircle size={48} className="text-red-500 mb-4" />
              <p className="text-lg font-bold mb-2">Camera Error</p>
              <p className="text-sm text-slate-400">{error}</p>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />
              {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                  <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-center">
          <button 
            onClick={capture}
            disabled={!isReady}
            className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-200 disabled:opacity-50 disabled:bg-slate-400"
          >
            <Camera size={32} />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main App Component ---
export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'attendance' | 'personal_attendance' | 'classes' | 'students' | 'report' | 'staff_report' | 'staffs' | 'history' | 'user_management' | 'settings'>('dashboard');
  const [isReportsExpanded, setIsReportsExpanded] = useState(false);
  const [isAttendanceExpanded, setIsAttendanceExpanded] = useState(false);
  const [currentDateStr, setCurrentDateStr] = useState<string>(getTodayStr());
  
  // Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isFirebaseLoaded, setIsFirebaseLoaded] = useState(false);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // State initialized with empty arrays/objects (loading from Firebase)
  const [classes, setClasses] = useState<Class[]>([]);
  const [staffs, setStaffs] = useState<Staff[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    telegramBotToken: '',
    telegramChatId: ''
  });
  const [students, setStudents] = useState<Student[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => 
    safeJSONParse(localStorage.getItem('attendance_app_current_user'), null)
  );
  const [attendance, setAttendance] = useState<AttendanceState>({});
  const [staffAttendance, setStaffAttendance] = useState<StaffAttendanceState>({});

  // Auth & Firebase Sync
  useEffect(() => {
    // Authenticate anonymously for rule access
    const startAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error: any) {
        console.error("Firebase Auth Error:", error);
        if (error.code === 'auth/admin-restricted-operation') {
          showToast("សូមបើក 'Anonymous Auth' នៅក្នុង Firebase Console (Authentication > Sign-in method) ទើបអាចប្រើប្រាស់កម្មវិធីបាន។", "error");
        } else {
          showToast("មានបញ្ហាក្នុងការភ្ជាប់ទៅកាន់ Database: " + error.message, "error");
        }
      }
    };
    
    startAuth();

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Sync Collections
        const unsubClasses = firebaseService.syncCollection<Class>('classes', setClasses);
        const unsubStaff = firebaseService.syncCollection<Staff>('staff', setStaffs);
        const unsubStudents = firebaseService.syncCollection<Student>('students', setStudents);
        const unsubUsers = firebaseService.syncCollection<AppUser>('users', setUsers);
        const unsubSettings = firebaseService.syncSettings(setSettings);
        
        setIsFirebaseLoaded(true);

        return () => {
          unsubClasses();
          unsubStaff();
          unsubStudents();
          unsubUsers();
          unsubSettings();
        };
      }
    });

    return () => unsubAuth();
  }, []);

  // Sync Attendance for current date
  useEffect(() => {
    if (!isFirebaseLoaded) return;

    const unsubAttendance = firebaseService.syncAttendance(currentDateStr, (records) => {
      setAttendance(prev => ({
        ...prev,
        [currentDateStr]: records
      }));
    });

    const unsubStaffAttendance = firebaseService.syncStaffAttendance(currentDateStr, (records) => {
      setStaffAttendance(prev => ({
        ...prev,
        [currentDateStr]: records
      }));
    });

    return () => {
      unsubAttendance();
      unsubStaffAttendance();
    };
  }, [currentDateStr, isFirebaseLoaded]);

  // Migration logic (Optional but helpful)
  useEffect(() => {
    if (!isFirebaseLoaded) return;
    
    // Simple migration: if Firestore 'users' is empty and localStorage has users, migrate
    const migrate = async () => {
      if (users.length === 0) {
        const localUsers = safeJSONParse(localStorage.getItem('attendance_app_users'), []);
        if (localUsers.length > 0) {
          showToast("កំពុងផ្ទេរទិន្នន័យទៅកាន់ Database...", "info");
          for (const u of localUsers) {
            await firebaseService.saveUser(u);
          }
          const localClasses = safeJSONParse(localStorage.getItem('attendance_app_classes'), []);
          for (const c of localClasses) await firebaseService.saveClass(c);

          const localStaff = safeJSONParse(localStorage.getItem('attendance_app_staffs'), []);
          for (const s of localStaff) await firebaseService.saveStaff(s);

          const localStudents = safeJSONParse(localStorage.getItem('attendance_app_students'), []);
          for (const s of localStudents) await firebaseService.saveStudent(s);

          const localSettings = safeJSONParse(localStorage.getItem('attendance_app_settings'), null);
          if (localSettings) await firebaseService.saveSettings(localSettings);

          showToast("ការផ្ទេរទិន្នន័យជោគជ័យ!", "success");
        } else {
          // Initialize default admin if nothing exists
          const defaultMasterAdmin: AppUser = {
            id: 'default-admin',
            staffId: 'none',
            username: 'MasterAdmin',
            passwordHash: 'Admin@123',
            role: 'master_admin',
            isConfirmed: true
          };
          await firebaseService.saveUser(defaultMasterAdmin);
        }
      }
    };
    migrate();
  }, [isFirebaseLoaded, users.length]);

  const sendTelegramMessage = async (message: string) => {
    if (!settings.telegramBotToken || !settings.telegramChatId) return null;
    try {
      const response = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: settings.telegramBotToken,
          chat_id: settings.telegramChatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      
      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { ok: false, description: text.includes('<!DOCTYPE html>') ? 'Backend Server not found' : 'Invalid Server Response' };
      }

      if (!data.ok) {
        console.error('Telegram API Error:', data.description);
        return data;
      } else {
        console.log('Telegram message sent successfully');
        return data;
      }
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      return { ok: false, description: 'Network error' };
    }
  };

  const sendTelegramPhoto = async (photoBase64: string, caption: string) => {
    if (!settings.telegramBotToken || !settings.telegramChatId) return null;
    try {
      const response = await fetch('/api/telegram/sendPhoto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: settings.telegramBotToken,
          chat_id: settings.telegramChatId,
          photo: photoBase64,
          caption: caption,
          parse_mode: 'HTML'
        })
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error sending Telegram photo:', error);
      return null;
    }
  };

  const deleteTelegramMessage = async (message_id: number) => {
    if (!settings.telegramBotToken || !settings.telegramChatId) return;
    try {
      await fetch('/api/telegram/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: settings.telegramBotToken,
          chat_id: settings.telegramChatId,
          message_id
        })
      });
    } catch (error) {
      console.error('Error deleting Telegram message:', error);
    }
  };

  const filteredClasses = useMemo(() => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'master_admin') return classes;
    return classes.filter(c => c.teacherId === currentUser?.staffId);
  }, [classes, currentUser]);
  
  const [selectedClassId, setSelectedClassId] = useState<string>(filteredClasses[0]?.id || '');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<{isOpen: boolean, message: string, onConfirm: () => void} | null>(null);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Update selected class if the list changes
  useEffect(() => {
    if (!filteredClasses.find(c => c.id === selectedClassId) && filteredClasses.length > 0) {
      setSelectedClassId(filteredClasses[0].id);
    }
  }, [filteredClasses, selectedClassId]);


  // Auto-bind device for logged in user if not already bound
  useEffect(() => {
    if (!isFirebaseLoaded) return;
    if (currentUser && currentUser.staffId && currentUser.staffId !== 'none') {
      const st = staffs.find(s => s.id === currentUser.staffId);
      if (st && !st.deviceId) {
        const thisDeviceId = getDeviceId();
        firebaseService.saveStaff({ ...st, deviceId: thisDeviceId });
      }
    }
  }, [currentUser, staffs, isFirebaseLoaded]);


  useEffect(() => {
    localStorage.setItem('attendance_app_current_user', JSON.stringify(currentUser));
  }, [currentUser]);

  return (
    <>
      {/* Login Screen */}
      {!currentUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-100 p-4 overflow-y-auto">
          {/* Background Decorative Elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-25">
            <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-100 blur-[100px]" />
            <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-indigo-100 blur-[100px]" />
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 w-full max-w-md overflow-hidden relative border border-white/50 backdrop-blur-sm">
            <div className="p-8 sm:p-12">
              <div className="flex flex-col items-center mb-10">
                <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-200 mb-6 transform -rotate-6">
                  <CalendarCheck size={40} />
                </div>
                <h1 className="text-3xl font-black text-slate-800 mb-2">សូមស្វាគមន៍</h1>
                <p className="text-slate-500 font-medium">ប្រព័ន្ធគ្រប់គ្រងវត្តមានសិស្ស និងបុគ្គលិក</p>
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const u = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.passwordHash === password);
                  if (u) {
                    if(u.isConfirmed) {
                      setCurrentUser(u);
                      
                      // Bind device if not already bound
                      const st = staffs.find(s => s.id === u.staffId);
                      if (st && !st.deviceId) {
                        const thisDeviceId = getDeviceId();
                        firebaseService.saveStaff({ ...st, deviceId: thisDeviceId });
                      }

                      showToast(`ស្វាគមន៍ត្រឡប់មកវិញ ${username}!`, "success");
                    } else {
                      showToast("គណនីកំពុងរង់ចាំការអនុម័តពី Admin", "warning");
                    }
                  } else {
                    showToast("ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ! (Wrong Username or Password)", "error");
                  }
                }} 
                className="space-y-5"
              >
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">ឈ្មោះអ្នកប្រើប្រាស់</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                      <User size={20} />
                    </div>
                    <input 
                      value={username} 
                      onChange={e => setUsername(e.target.value)} 
                      placeholder="Username" 
                      className="w-full bg-slate-50 border-2 border-slate-50 px-12 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all text-lg font-medium"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">ពាក្យសម្ងាត់</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                      <Lock size={20} />
                    </div>
                    <input 
                      type="password" 
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      placeholder="••••••••" 
                      className="w-full bg-slate-50 border-2 border-slate-50 px-12 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all text-lg font-medium tracking-widest"
                      required
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit" 
                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white py-4 rounded-2xl font-black text-xl shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3"
                  >
                    <LogIn size={24} />
                    <span>ចូលប្រើប្រាស់</span>
                  </button>
                </div>
              </form>

              <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col items-center gap-4">
                <p className="text-slate-400 text-sm font-medium">មានបញ្ហាក្នុងការប្រើប្រាស់?</p>
                <button className="text-blue-600 font-bold hover:underline">ទាក់ទងអ្នកគ្រប់គ្រងបច្ចេកទេស</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      
      {/* Sidebar (Desktop) */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col z-20 shadow-sm shrink-0">
        <div className="p-5 border-b border-slate-200 flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2.5 rounded-xl">
             <CalendarCheck size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">ប្រព័ន្ធចុះវត្តមាន</h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Attendance App</p>
          </div>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
          <SidebarItem 
            isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} 
            icon={<LayoutDashboard size={20} />} label="ផ្ទាំងគ្រប់គ្រង" 
          />
           <div className="space-y-1">
             <button 
                onClick={() => setIsAttendanceExpanded(!isAttendanceExpanded)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${
                  'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
             >
               <div className="flex items-center gap-3">
                 <CheckCircle2 size={20} />
                 <span>ចុះវត្តមាន</span>
               </div>
               {isAttendanceExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
             </button>
             {isAttendanceExpanded && (
               <div className="pl-8 space-y-1">
                  <SidebarItem 
                    isActive={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} 
                    icon={<Users size={16} />} label="វត្តមានសិស្ស" 
                  />
                  <SidebarItem 
                    isActive={activeTab === 'personal_attendance'} onClick={() => setActiveTab('personal_attendance')} 
                    icon={<Clock size={16} />} label="វត្តមានផ្ទាល់ខ្លួន" 
                  />
               </div>
             )}
           </div>

           {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && (
             <>
               <SidebarItem 
                 isActive={activeTab === 'classes'} onClick={() => setActiveTab('classes')} 
                 icon={<LayoutList size={20} />} label="គ្រប់គ្រងថ្នាក់" 
               />
               <SidebarItem 
                 isActive={activeTab === 'students'} onClick={() => setActiveTab('students')} 
                 icon={<Users size={20} />} label="គ្រប់គ្រងសិស្ស" 
               />
               <SidebarItem 
                 isActive={activeTab === 'staffs'} onClick={() => setActiveTab('staffs')} 
                 icon={<Briefcase size={20} />} label="គ្រប់គ្រងបុគ្គលិក" 
               />
               <SidebarItem 
                 isActive={activeTab === 'user_management'} onClick={() => setActiveTab('user_management')} 
                 icon={<User size={20} />} label="គ្រប់គ្រងអ្នកប្រើប្រាស់" 
               />
               <div className="space-y-1">
                 <button 
                    onClick={() => setIsReportsExpanded(!isReportsExpanded)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${
                      'text-slate-600 hover:bg-slate-100 font-medium'
                    }`}
                 >
                   <div className="flex items-center gap-3">
                     <BarChart3 size={20} />
                     <span>របាយការណ៍</span>
                   </div>
                   {isReportsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                 </button>
                 {isReportsExpanded && (
                   <div className="pl-8 space-y-1">
                      <SidebarItem 
                        isActive={activeTab === 'report'} onClick={() => setActiveTab('report')} 
                        icon={<BarChart3 size={16} />} label="របាយការណ៍សិស្ស" 
                      />
                      <SidebarItem 
                        isActive={activeTab === 'staff_report'} onClick={() => setActiveTab('staff_report')} 
                        icon={<BarChart3 size={16} />} label="របាយការណ៍បុគ្គលិក" 
                      />
                   </div>
                 )}
               </div>
               {currentUser?.role === 'master_admin' && (
                 <SidebarItem 
                   isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} 
                   icon={<SettingsIcon size={20} />} label="ការកំណត់" 
                 />
               )}
             </>
           )}


        </nav>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Mobile Drawer Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-slate-900/50 z-[60] md:hidden flex" onClick={() => setIsMobileMenuOpen(false)}>
            <aside className="w-64 bg-white h-full shadow-lg flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white p-2.5 rounded-xl">
                     <CalendarCheck size={24} />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-slate-800 leading-tight">ប្រព័ន្ធចុះវត្តមាន</h1>
                  </div>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              <nav className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
                <SidebarItem 
                  isActive={activeTab === 'dashboard'} onClick={() => {setActiveTab('dashboard'); setIsMobileMenuOpen(false);}} 
                  icon={<LayoutDashboard size={20} />} label="ផ្ទាំងគ្រប់គ្រង" 
                />
                <div className="space-y-1">
                 <button 
                    onClick={() => setIsAttendanceExpanded(!isAttendanceExpanded)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${
                      'text-slate-600 hover:bg-slate-100 font-medium'
                    }`}
                 >
                   <div className="flex items-center gap-3">
                     <CheckCircle2 size={20} />
                     <span>ចុះវត្តមាន</span>
                   </div>
                   {isAttendanceExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                 </button>
                 {isAttendanceExpanded && (
                   <div className="pl-8 space-y-1">
                      <SidebarItem 
                        isActive={activeTab === 'attendance'} onClick={() => {setActiveTab('attendance'); setIsMobileMenuOpen(false);}} 
                        icon={<Users size={16} />} label="វត្តមានសិស្ស" 
                      />
                      <SidebarItem 
                        isActive={activeTab === 'personal_attendance'} onClick={() => {setActiveTab('personal_attendance'); setIsMobileMenuOpen(false);}} 
                        icon={<Clock size={16} />} label="វត្តមានផ្ទាល់ខ្លួន" 
                      />
                   </div>
                 )}
               </div>
                {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && (
                  <>
                    <SidebarItem 
                      isActive={activeTab === 'classes'} onClick={() => {setActiveTab('classes'); setIsMobileMenuOpen(false);}} 
                      icon={<LayoutList size={20} />} label="គ្រប់គ្រងថ្នាក់" 
                    />
                    <SidebarItem 
                      isActive={activeTab === 'students'} onClick={() => {setActiveTab('students'); setIsMobileMenuOpen(false);}} 
                      icon={<Users size={20} />} label="គ្រប់គ្រងសិស្ស" 
                    />
                    <SidebarItem 
                      isActive={activeTab === 'staffs'} onClick={() => {setActiveTab('staffs'); setIsMobileMenuOpen(false);}} 
                      icon={<Briefcase size={20} />} label="គ្រប់គ្រងបុគ្គលិក" 
                    />
                    <SidebarItem 
                      isActive={activeTab === 'user_management'} onClick={() => {setActiveTab('user_management'); setIsMobileMenuOpen(false);}} 
                      icon={<User size={20} />} label="គ្រប់គ្រងអ្នកប្រើប្រាស់" 
                    />
                     <div className="space-y-1">
                       <button 
                          onClick={() => setIsReportsExpanded(!isReportsExpanded)}
                          className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${
                            'text-slate-600 hover:bg-slate-100 font-medium'
                          }`}
                       >
                         <div className="flex items-center gap-3">
                           <BarChart3 size={20} />
                           <span>របាយការណ៍</span>
                         </div>
                         {isReportsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                       </button>
                       {isReportsExpanded && (
                         <div className="pl-8 space-y-1">
                            <SidebarItem 
                              isActive={activeTab === 'report'} onClick={() => {setActiveTab('report'); setIsMobileMenuOpen(false);}} 
                              icon={<BarChart3 size={16} />} label="របាយការណ៍សិស្ស" 
                            />
                            <SidebarItem 
                              isActive={activeTab === 'staff_report'} onClick={() => {setActiveTab('staff_report'); setIsMobileMenuOpen(false);}} 
                              icon={<BarChart3 size={16} />} label="របាយការណ៍បុគ្គលិក" 
                            />
                         </div>
                       )}
                     </div>
                     {currentUser?.role === 'master_admin' && (
                       <SidebarItem 
                         isActive={activeTab === 'settings'} onClick={() => {setActiveTab('settings'); setIsMobileMenuOpen(false);}} 
                         icon={<SettingsIcon size={20} />} label="ការកំណត់" 
                       />
                     )}
                  </>
                )}
              </nav>
            </aside>
          </div>
        )}

        {/* Header Container (Shows class selection and date across all devices) */}
        <header className="bg-blue-700 text-white shadow-md z-10 w-full shrink-0">
          <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
            <div className="flex md:hidden items-center gap-3">
              <button onClick={() => setIsMobileMenuOpen(true)} className="text-white hover:text-blue-200 transition-colors">
                <Menu size={24} />
              </button>
              <h1 className="text-xl font-bold leading-tight">ប្រព័ន្ធចុះវត្តមាន</h1>
            </div>
            <div className="hidden md:block font-medium text-blue-100">
               {/* Spacer for desktop since logo is in sidebar */}
            </div>
            
            <div className="flex items-center gap-3 ml-auto">
              {currentUser && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2.5 pl-3 py-1 border-l border-blue-400/30">
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] font-bold text-white leading-tight">{currentUser.username}</p>
                      <p className="text-[9px] text-blue-200 leading-tight">
                        {currentUser.role === 'master_admin' ? 'អ្នកគ្រប់គ្រងជាន់ខ្ពស់' : 
                         currentUser.role === 'admin' ? 'អ្នកគ្រប់គ្រង' : 'បុគ្គលិក'}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-500/50 flex items-center justify-center text-white border border-blue-400">
                      <User size={16} />
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      localStorage.removeItem('attendance_app_current_user');
                      setCurrentUser(null);
                      window.location.reload();
                    }}
                    className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-all"
                    title="ចាកចេញ"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 relative w-full">
          <div className="max-w-4xl mx-auto w-full">
            {activeTab === 'dashboard' && (
              <DashboardView
                students={students}
                classes={filteredClasses}
                attendance={attendance}
              />
            )}

            {activeTab === 'attendance' && (
              <AttendanceView 
                students={(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') ? students : students.filter(s => filteredClasses.some(c => c.id === s.classId))}
                classes={filteredClasses}
                staffs={staffs}
                attendance={attendance} 
                setAttendance={setAttendance}
                currentDateStr={currentDateStr}
                setCurrentDateStr={setCurrentDateStr}
                selectedClassId={selectedClassId}
                setSelectedClassId={setSelectedClassId}
                sendTelegramMessage={sendTelegramMessage}
                deleteTelegramMessage={deleteTelegramMessage}
                showToast={showToast}
              />
            )}

            {activeTab === 'personal_attendance' && (
              <StaffAttendanceView 
                staffs={(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') ? staffs : staffs.filter(s => s.id === currentUser?.staffId)}
                setStaffs={setStaffs}
                staffAttendance={staffAttendance} 
                setStaffAttendance={setStaffAttendance}
                currentDateStr={currentDateStr}
                setCurrentDateStr={setCurrentDateStr}
                currentUser={currentUser}
                settings={settings}
                sendTelegramMessage={sendTelegramMessage}
                sendTelegramPhoto={sendTelegramPhoto}
                deleteTelegramMessage={deleteTelegramMessage}
                showToast={showToast}
              />
            )}
            
            {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && activeTab === 'history' && (
              <AttendanceHistoryView 
                students={students}
                classes={classes}
                attendance={attendance}
              />
            )}
            
            {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && activeTab === 'user_management' && (
              <UserManagementView
                users={users}
                setUsers={setUsers}
                staffs={staffs}
                setStaffs={setStaffs}
                currentUser={currentUser}
                setDeleteInfo={setDeleteInfo}
                showToast={showToast}
              />
            )}

            {currentUser?.role === 'master_admin' && activeTab === 'settings' && (
              <SettingsView
                settings={settings}
                setSettings={setSettings}
                showToast={showToast}
              />
            )}
            
            {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && activeTab === 'classes' && (
              <ClassesView 
                classes={classes}
                setClasses={setClasses}
                staffs={staffs}
                students={students}
                onAddStudent={(classId) => {
                  setSelectedClassId(classId);
                  setActiveTab('students');
                  setIsStudentModalOpen(true);
                }}
                setDeleteInfo={setDeleteInfo}
                showToast={showToast}
              />
            )}

            {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && activeTab === 'students' && (
              <StudentsView 
                classes={classes}
                selectedClassId={selectedClassId}
                students={students} 
                setStudents={setStudents} 
                isModalOpen={isStudentModalOpen}
                setIsModalOpen={setIsStudentModalOpen}
                setDeleteInfo={setDeleteInfo}
                showToast={showToast}
              />
            )}

            {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && activeTab === 'staffs' && (
              <StaffsView 
                staffs={staffs}
                setStaffs={setStaffs}
                setDeleteInfo={setDeleteInfo}
                showToast={showToast}
              />
            )}

            {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && activeTab === 'report' && (
              <ReportView 
                students={students} 
                classes={filteredClasses}
                selectedClassId={selectedClassId}
                setSelectedClassId={setSelectedClassId}
                attendance={attendance} 
              />
            )}
            {(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') && activeTab === 'staff_report' && (
              <StaffReportView
                staffs={(currentUser?.role === 'admin' || currentUser?.role === 'master_admin') ? staffs : staffs.filter(s => s.id === currentUser?.staffId)}
                staffAttendance={staffAttendance}
              />
            )}
            {deleteInfo && (
              <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">បញ្ជាក់</h3>
                  <p className="text-slate-600 mb-6">{deleteInfo.message}</p>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setDeleteInfo(null)} className="px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-100">បោះបង់</button>
                    <button onClick={() => { deleteInfo.onConfirm(); setDeleteInfo(null); }} className="px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700">លុប</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
    
    {/* Toast Notification Container */}
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div 
          key={toast.id} 
          className={`pointer-events-auto min-w-[280px] max-w-sm p-4 rounded-xl shadow-lg border flex items-start gap-3 animate-in slide-in-from-right-full transition-all duration-300 ${
            toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
            toast.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-800' :
            toast.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800' :
            'bg-blue-50 border-blue-100 text-blue-800'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />}
          {toast.type === 'error' && <XCircle size={20} className="shrink-0 text-rose-500" />}
          {toast.type === 'warning' && <Clock size={20} className="shrink-0 text-amber-500" />}
          {toast.type === 'info' && <Send size={20} className="shrink-0 text-blue-500" />}
          <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{toast.message}</div>
        </div>
      ))}
    </div>
    </>
  );
}

// --- Sidebar Item Component (Desktop) ---
function SidebarItem({ isActive, onClick, icon, label }: { isActive: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        isActive 
          ? 'bg-blue-50 text-blue-700 font-bold' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
      }`}
    >
      <div className={`${isActive ? 'scale-110' : 'scale-100'} transition-transform`}>
        {icon}
      </div>
      <span>{label}</span>
      {isActive && (
        <div className="absolute left-0 w-1 h-8 bg-blue-600 rounded-r-full" />
      )}
    </button>
  );
}

// --- Navigation Item Component (Mobile) ---
function NavItem({ isActive, onClick, icon, label }: { isActive: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all w-24 ${
        isActive ? 'text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <div className={`mb-1 transition-transform ${isActive ? 'scale-110' : ''}`}>
        {icon}
      </div>
      <span className={`text-[11px] sm:text-xs font-semibold ${isActive ? 'opacity-100' : 'opacity-80'}`}>{label}</span>
      {isActive && (
        <div className="h-1 w-6 bg-blue-600 rounded-full mt-1.5 absolute bottom-1.5" />
      )}
    </button>
  );
}

// --- Dashboard View ---
function DashboardView({
  students,
  classes,
  attendance,
}: {
  students: Student[];
  classes: Class[];
  attendance: AttendanceState;
}) {
  const currentDateStr = getTodayStr();
  const dayRecord = attendance[currentDateStr] || {};

  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus | null>(null);
  const [filterClassId, setFilterClassId] = useState<string>('');

  // High level stats for today
  const stats = useMemo(() => {
    let present = 0, absent = 0, late = 0, excused = 0;
    (students || []).forEach(s => {
      const st = dayRecord[s.id];
      if (st === 'present') present++;
      if (st === 'absent') absent++;
      if (st === 'late') late++;
      if (st === 'excused') excused++;
    });
    return { present, absent, late, excused, total: (students || []).length };
  }, [students, dayRecord]);

  // Chart data: Attendance by Class
  const chartData = useMemo(() => {
    return (classes || []).map(c => {
      const classStudents = (students || []).filter(s => s.classId === c.id);
      let present = 0, absent = 0, late = 0, excused = 0;
      
      (classStudents || []).forEach(s => {
        const st = dayRecord[s.id];
        if (st === 'present') present++;
        else if (st === 'absent') absent++;
        else if (st === 'late') late++;
        else if (st === 'excused') excused++;
      });
      
      return {
        name: c.name,
        present,
        absent,
        late,
        excused,
        total: classStudents.length
      };
    });
  }, [classes, students, dayRecord]);

  const selectedStudents = useMemo(() => {
    if (!selectedStatus) return [];
    let filtered = students.filter(s => dayRecord[s.id] === selectedStatus);
    if (filterClassId) {
      filtered = filtered.filter(s => s.classId === filterClassId);
    }
    return filtered;
  }, [students, dayRecord, selectedStatus, filterClassId]);

  const getStatusLabel = (status: AttendanceStatus | null) => {
    if (status === 'late') return 'សិស្សមកយឺត (Late)';
    if (status === 'excused') return 'សិស្សច្បាប់ (Excused)';
    if (status === 'absent') return 'សិស្សអវត្តមាន (Absent)';
    if (status === 'present') return 'សិស្សវត្តមាន (Present)';
    return '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <LayoutDashboard className="text-blue-600" />
          <span>ផ្ទាំងគ្រប់គ្រង (Dashboard) - {new Date().toLocaleDateString('km-KH')}</span>
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
          <div className="bg-blue-50 text-blue-600 p-3 rounded-full mb-3">
             <Users size={24} />
          </div>
          <span className="text-sm font-semibold text-slate-500 mb-1">សិស្សសរុប (Total)</span>
          <span className="text-3xl font-bold text-slate-800">{stats.total}</span>
        </div>
        
        <div 
          onClick={() => setSelectedStatus('late')}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:border-amber-200 transition-all group"
        >
          <div className="bg-amber-50 text-amber-600 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
             <Clock size={24} />
          </div>
          <span className="text-sm font-semibold text-slate-500 mb-1">សិស្សមកយឺត (Late)</span>
          <span className="text-3xl font-bold text-amber-600">{stats.late}</span>
        </div>

        <div 
          onClick={() => setSelectedStatus('excused')}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="bg-blue-50 text-blue-500 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
             <FileText size={24} />
          </div>
          <span className="text-sm font-semibold text-slate-500 mb-1">សិស្សច្បាប់ (Excused)</span>
          <span className="text-3xl font-bold text-blue-500">{stats.excused}</span>
        </div>

        <div 
          onClick={() => setSelectedStatus('absent')}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:border-rose-200 transition-all group"
        >
          <div className="bg-rose-50 text-rose-500 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
             <XCircle size={24} />
          </div>
          <span className="text-sm font-semibold text-slate-500 mb-1">សិស្សអវត្តមាន (Absent)</span>
          <span className="text-3xl font-bold text-rose-500">{stats.absent}</span>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <BarChart3 className="text-blue-600" size={20} />
          <span>ទិន្នន័យសិស្សវត្តមានតាមថ្នាក់ថ្ងៃនេះ (Today's Attendance by Class)</span>
        </h3>
        
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B'}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B'}} dx={-10} />
              <RechartsTooltip 
                cursor={{fill: '#F1F5F9'}} 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="present" name="វត្តមាន" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="absent" name="អវត្តមាន" fill="#F43F5E" radius={[4, 4, 0, 0]} />
              <Bar dataKey="late" name="យឺត" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="excused" name="ច្បាប់" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {selectedStatus !== null && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users size={20} className="text-blue-600" />
                <span>{getStatusLabel(selectedStatus)} - {selectedStudents.length} នាក់</span>
              </h2>
              <button onClick={() => { setSelectedStatus(null); setFilterClassId(''); }} className="text-slate-400 hover:text-slate-600 p-1">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="px-4 pt-4 sm:px-6 sm:pt-6">
              <select 
                value={filterClassId} 
                onChange={e => setFilterClassId(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 bg-white px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm text-slate-700"
              >
                <option value="">គ្រប់ថ្នាក់ទាំងអស់ (All Classes)</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto">
              {selectedStudents.length === 0 ? (
                <div className="py-10 text-center text-slate-500">
                  <p>មិនមានសិស្សក្នុងប្រភេទនេះទេថ្ងៃនេះ។</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                  {selectedStudents.map((student, idx) => {
                    const studentClass = classes.find(c => c.id === student.classId);
                    return (
                      <li key={student.id} className="flex items-center justify-between p-3 sm:p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-slate-400 w-6 text-right">{idx + 1}.</span>
                          <div className="flex flex-col">
                            <div className="flex items-baseline gap-2">
                              <span className="font-bold text-slate-800">{student.nameKhmer}</span>
                              {student.nameLatin && <span className="text-xs text-slate-500">{student.nameLatin}</span>}
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                              {student.phoneNumber ? (
                                <a href={`tel:${student.phoneNumber}`} className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  📞 {student.phoneNumber}
                                </a>
                              ) : (
                                <span>📞 គ្មានលេខ</span>
                              )}
                              <span>🏫 ថ្នាក់: {studentClass?.name || 'គ្មានថ្នាក់'}</span>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => { setSelectedStatus(null); setFilterClassId(''); }}
                className="px-5 py-2.5 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 rounded-xl transition-colors"
              >
                បិទ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 1.1 Staff Attendance View ---
function StaffAttendanceView({ 
  staffs, 
  setStaffs,
  staffAttendance, 
  setStaffAttendance, 
  currentDateStr, 
  setCurrentDateStr,
  currentUser,
  settings,
  sendTelegramMessage,
  sendTelegramPhoto,
  deleteTelegramMessage,
  showToast
}: { 
  staffs: Staff[]; 
  setStaffs: React.Dispatch<React.SetStateAction<Staff[]>>;
  staffAttendance: StaffAttendanceState; 
  setStaffAttendance: React.Dispatch<React.SetStateAction<StaffAttendanceState>>;
  currentDateStr: string;
  setCurrentDateStr: (date: string) => void;
  currentUser: AppUser | null;
  settings: AppSettings;
  sendTelegramMessage: (message: string) => Promise<any>;
  sendTelegramPhoto: (photoBase64: string, caption: string) => Promise<any>;
  deleteTelegramMessage: (messageId: number) => Promise<void>;
  showToast: (message: string, type: Toast['type']) => void;
}) {

  const dayRecord = staffAttendance[currentDateStr] || {};
  const isPersonal = currentUser?.role === 'user';
  const isToday = currentDateStr === getTodayStr();
  
  const personalStaffId = currentUser?.staffId;
  const staff = isPersonal ? staffs.find(s => s.id === personalStaffId) : null;

  const [confirmDelete, setConfirmDelete] = useState<{ staffId: string, field: keyof StaffAttendanceData } | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [pendingAttendance, setPendingAttendance] = useState<{ staffId: string, field: keyof StaffAttendanceData } | null>(null);

  // Track message IDs to prevent duplicates
  const [lastStaffReportMessageIds, setLastStaffReportMessageIds] = useState<Record<string, number>>(() => 
    safeJSONParse(localStorage.getItem('attendance_last_staff_report_ids'), {})
  );

  useEffect(() => {
    localStorage.setItem('attendance_last_staff_report_ids', JSON.stringify(lastStaffReportMessageIds));
  }, [lastStaffReportMessageIds]);

  const handleAttendanceAction = (staffId: string, field: keyof StaffAttendanceData) => {
    // Identity check: Non-admins can only mark their own attendance
    const isSelf = staffId === currentUser?.staffId;
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'master_admin' && !isSelf) {
      showToast("អ្នកមិនអាចចុះវត្តមានជំនួសអ្នកដទៃបានទេ", "error");
      return;
    }

    // Device Binding check
    const currentStaff = staffs.find(s => s.id === staffId);
    if (settings.enableDeviceBinding && isSelf) {
      const thisDeviceId = getDeviceId();
      if (currentStaff?.deviceId && currentStaff.deviceId !== thisDeviceId) {
        showToast("គណនីរបស់អ្នកត្រូវបានភ្ជាប់ជាមួយឧបករណ៍ផ្សេងរួចហើយ! សូមទាក់ទង Admin។", "error");
        return;
      }
    }

    // New check: only allow changes for today
    if (currentDateStr !== getTodayStr()) {
      showToast("អ្នកអាចកត់ត្រាវត្តមានបានតែសម្រាប់ថ្ងៃនេះប៉ុណ្ណោះ", "warning");
      return;
    }

    // Check if it's a deletion
    const currentStaffRecord = dayRecord[staffId] || { mIn: null, mOut: null, aIn: null, aOut: null };
    const isDelete = !!currentStaffRecord[field];

    // Geolocation check
    if (settings.schoolLatitude && settings.schoolLongitude && !isDelete) {
      if (!navigator.geolocation) {
        showToast("ឧបករណ៍របស់អ្នកមិនគាំទ្រ Geolocation ទេ", "error");
        return;
      }

      showToast("កំពុងត្រួតពិនិត្យទីតាំង...", "info");
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const distance = calculateDistance(
            position.coords.latitude,
            position.coords.longitude,
            settings.schoolLatitude!,
            settings.schoolLongitude!
          );

          const radius = settings.allowedRadius || 100;
          if (distance > radius) {
            showToast(`អ្នកនៅឆ្ងាយពីសាលាពេក (${Math.round(distance)}m)។ ចម្ងាយអនុញ្ញាតគឺ ${radius}m`, "error");
          } else {
            checkCameraRequirement(staffId, field);
          }
        },
        (error) => {
          showToast(`មិនអាចផ្ទៀងផ្ទាត់ទីតាំងបានទេ: ${error.message}។ សូមបើក Location!`, "error");
        },
        { enableHighAccuracy: true }
      );
    } else {
      checkCameraRequirement(staffId, field);
    }
  };

  const checkCameraRequirement = (staffId: string, field: keyof StaffAttendanceData) => {
    const currentStaffRecord = dayRecord[staffId] || { mIn: null, mOut: null, aIn: null, aOut: null };
    const isAlreadySet = !!currentStaffRecord[field];

    if (settings.requirePhoto && !isAlreadySet) {
      setPendingAttendance({ staffId, field });
      setIsCameraOpen(true);
    } else {
      proceedWithAction(staffId, field);
    }
  };

  const onPhotoCaptured = (photoBase64: string) => {
    if (pendingAttendance) {
      processUpdate(pendingAttendance.staffId, pendingAttendance.field, false, photoBase64);
      setIsCameraOpen(false);
      setPendingAttendance(null);
    }
  };

  const proceedWithAction = (staffId: string, field: keyof StaffAttendanceData) => {
    const currentStaffRecord = dayRecord[staffId] || { mIn: null, mOut: null, aIn: null, aOut: null };
    const isCurrentlySet = !!currentStaffRecord[field];

    if (isCurrentlySet) {
      // Show custom confirmation instead of window.confirm
      setConfirmDelete({ staffId, field });
      return;
    }

    // New check: prevent afternoon recording before 12:00 PM
    if (field === 'aIn' || field === 'aOut') {
      const now = new Date();
      if (now.getHours() < 12) {
        showToast("អ្នកមិនអាចចុះវត្តមានពេលល្ងាចមុនម៉ោង 12:00 PM បានទេ", "warning");
        return;
      }
    }

    // New check: prevent clocking out before clocking in
    if (field === 'mOut' && !currentStaffRecord.mIn) {
      showToast("អ្នកត្រូវចុះវត្តមាន 'ចូលព្រឹក' ជាមុនសិន", "warning");
      return;
    }
    if (field === 'aOut' && !currentStaffRecord.aIn) {
      showToast("អ្នកត្រូវចុះវត្តមាន 'ចូលល្ងាច' ជាមុនសិន", "warning");
      return;
    }

    // Process record (Clock In)
    processUpdate(staffId, field, false);
  };

  const processUpdate = (staffId: string, field: keyof StaffAttendanceData, isDelete: boolean, photoBase64?: string) => {
    // Update Device Binding if enabled and first time
    if (settings.enableDeviceBinding && staffId === currentUser?.staffId) {
      const thisDeviceId = getDeviceId();
      const st = staffs.find(s => s.id === staffId);
      if (st && !st.deviceId) {
        setStaffs(prev => prev.map(s => s.id === staffId ? { ...s, deviceId: thisDeviceId } : s));
      }
    }

    const currentTimeStr = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true 
    });

    const currentDayData = staffAttendance[currentDateStr] || {};
    const currentStaffRecord = currentDayData[staffId] || { mIn: null, mOut: null, aIn: null, aOut: null };
    
    const newStaffRecord = { ...currentStaffRecord } as any;
    if (isDelete) {
      newStaffRecord[field] = null;
      if (field === 'mIn') newStaffRecord.mInPhoto = false;
      if (field === 'mOut') newStaffRecord.mOutPhoto = false;
      if (field === 'aIn') newStaffRecord.aInPhoto = false;
      if (field === 'aOut') newStaffRecord.aOutPhoto = false;
    } else {
      newStaffRecord[field] = currentTimeStr;
      if (photoBase64) {
        if (field === 'mIn') newStaffRecord.mInPhoto = true;
        if (field === 'mOut') newStaffRecord.mOutPhoto = true;
        if (field === 'aIn') newStaffRecord.aInPhoto = true;
        if (field === 'aOut') newStaffRecord.aOutPhoto = true;
      }
    }

    const newDayData = {
      ...currentDayData,
      [staffId]: newStaffRecord
    };

    firebaseService.saveStaffAttendance(currentDateStr, staffId, newStaffRecord);
    
    if (!isDelete) {
      const staffRef = staffs.find(s => s.id === staffId);
      const getStatusLabel = (f: keyof StaffAttendanceData) => {
        const time = newDayData[staffId][f] as string | null;
        if (!time || typeof time === 'boolean') return "---";
        const limit = staffRef?.[`${f}Time` as keyof Staff] as string | undefined;
        const label = getAttendanceLabel(time, limit, f);
        return `${time} ${label ? `(${label})` : ''}`;
      };

      const message = `<b>របាយការណ៍បុគ្គលិក</b>\n` +
        `🗓️Date: ${currentDateStr}\n` +
        ` ឈ្មោះបុគ្គលិក: <b>${escapeHTML(staffRef?.nameKhmer || 'Unknown')}</b>\n` +
        `🌅ពេលព្រឹក:\n` +
        `   - ចូល: ${getStatusLabel('mIn')}\n` +
        `   - ចេញ: ${getStatusLabel('mOut')}\n` +
        `🌄ពេលរសៀល: \n` +
        `   - ចូល: ${getStatusLabel('aIn')}\n` +
        `   - ចេញ: ${getStatusLabel('aOut')}`;
      
      const reportKey = `${currentDateStr}_staff_${staffId}`;
      const prevMsgId = lastStaffReportMessageIds[reportKey];
      
      const onMessageSent = (response: any) => {
        if (response && response.ok && response.result?.message_id) {
          if (prevMsgId) {
            deleteTelegramMessage(prevMsgId);
          }
          setLastStaffReportMessageIds(prev => ({
            ...prev,
            [reportKey]: response.result.message_id
          }));
          showToast('បានផ្ញើរបាយការណ៍ទៅ Telegram រួចរាល់!', 'success');
        } else {
          console.error('Telegram Send Error:', response);
          const detail = response?.description || 'Unknown Telegram Error';
          showToast(`⚠️ មិនអាចផ្ញើរូបភាពទៅ Telegram: ${detail}`, 'error');
        }
      };

      if (photoBase64) {
        sendTelegramPhoto(photoBase64, message).then(onMessageSent);
      } else {
        sendTelegramMessage(message).then(onMessageSent);
      }
    }

    setConfirmDelete(null);
  };

  const renderModals = () => (
    <>
      {/* Custom Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center">
            <div className="bg-rose-100 text-rose-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">បញ្ជាក់ការលុប</h3>
            <p className="text-slate-600 mb-8 text-lg">តើអ្នកប្រាកដជាចង់លុបការកត់ត្រាវត្តមាននេះមែនទេ?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
              >
                បោះបង់
              </button>
              <button 
                onClick={() => processUpdate(confirmDelete.staffId, confirmDelete.field, true)}
                className="flex-1 py-4 rounded-2xl bg-rose-600 text-white font-bold hover:bg-rose-700 shadow-lg shadow-rose-200 transition-colors"
              >
                លុបចេញ
              </button>
            </div>
          </div>
        </div>
      )}

      {isCameraOpen && (
        <AttendanceCamera 
          onCapture={onPhotoCaptured} 
          onCancel={() => { setIsCameraOpen(false); setPendingAttendance(null); }} 
        />
      )}
    </>
  );

  if (isPersonal) {
    if (!staff) return <div className="text-slate-500">រកមិនឃើញព័ត៌មានបុគ្គលិក</div>;
    
    const data = dayRecord[staff.id] || { mIn: null, mOut: null, aIn: null, aOut: null };
    const actions = [
      { field: 'mIn', label: 'ចូលព្រឹក', icon: <LogIn size={32} />, color: 'emerald' },
      { field: 'mOut', label: 'ចេញព្រឹក', icon: <LogOut size={32} />, color: 'rose' },
      { field: 'aIn', label: 'ចូលល្ងាច', icon: <LogIn size={32} />, color: 'teal' },
      { field: 'aOut', label: 'ចេញល្ងាច', icon: <LogOut size={32} />, color: 'amber' },
    ];

    const colorMap: Record<string, { active: string, inactive: string }> = {
      emerald: { active: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-emerald-700 border-emerald-100 hover:border-emerald-200' },
      rose: { active: 'bg-rose-600 text-white border-rose-600', inactive: 'bg-white text-rose-700 border-rose-100 hover:border-rose-200' },
      teal: { active: 'bg-teal-600 text-white border-teal-600', inactive: 'bg-white text-teal-700 border-teal-100 hover:border-teal-200' },
      amber: { active: 'bg-amber-600 text-white border-amber-600', inactive: 'bg-white text-amber-700 border-amber-100 hover:border-amber-200' },
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">វត្តមានថ្ងៃ</h2>
          <div className="relative">
             <input 
              type="date"
              value={currentDateStr}
              onChange={(e) => setCurrentDateStr(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
          </div>
        </div>

        {/* Standard Schedule Reference */}
        {(staff.mInTime || staff.mOutTime || staff.aInTime || staff.aOutTime) && (
          <div className="bg-blue-50/50 border border-blue-100/50 rounded-xl px-3 py-2 flex items-center gap-3">
            <div className="text-blue-600 shrink-0">
              <Clock size={14} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-blue-400 uppercase tracking-wider text-[9px]">ព្រឹក:</span>
                <span className="font-bold text-blue-800">{staff.mInTime || '-'} ➔ {staff.mOutTime || '-'}</span>
              </div>
              <div className="w-px h-3 bg-blue-200 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-blue-400 uppercase tracking-wider text-[9px]">ល្ងាច:</span>
                <span className="font-bold text-blue-800">{staff.aInTime || '-'} ➔ {staff.aOutTime || '-'}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {actions.map(({ field, label, icon, color }) => {
            const time = data[field as keyof StaffAttendanceData];
            const active = !!time;
            const style = colorMap[color][active ? 'active' : 'inactive'];
            
            const limitTime = field === 'mIn' ? staff.mInTime : field === 'mOut' ? staff.mOutTime : field === 'aIn' ? staff.aInTime : staff.aOutTime;
            const timeStr = typeof time === 'string' ? time : null;
            const statusLabel = getAttendanceLabel(timeStr, limitTime, field as keyof StaffAttendanceData);

            return (
              <button 
                key={field}
                id={`btn-${field}`}
                autoFocus={false}
                onClick={(e) => {
                  e.preventDefault();
                  handleAttendanceAction(staff.id, field as keyof StaffAttendanceData);
                }}
                disabled={!isToday}
                className={`p-6 rounded-3xl shadow-sm border flex flex-col items-center gap-4 transition-all active:scale-95 touch-manipulation ${style} ${!isToday ? 'cursor-not-allowed' : ''}`}
              >
                <div className="pointer-events-none opacity-80">{active ? <CheckCircle2 size={32} /> : icon}</div>
                <div className="pointer-events-none text-lg font-bold">{label}</div>
                <div className="pointer-events-none flex flex-col items-center">
                  <div className="text-sm font-medium opacity-90">{timeStr || 'ចុចកត់ត្រា'}</div>
                  {time && statusLabel && (
                    <span className="text-[10px] font-bold mt-1 opacity-80 italic">({statusLabel})</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        {renderModals()}
      </div>
    );
  }

  // derived stats (simplified for 4 buttons)
  const stats = useMemo(() => {
    let mIn = 0, mOut = 0, aIn = 0, aOut = 0;
    (staffs || []).forEach(s => {
      const data = dayRecord[s.id];
      if (data) {
        if (data.mIn) mIn++;
        if (data.mOut) mOut++;
        if (data.aIn) aIn++;
        if (data.aOut) aOut++;
      }
    });
    return { mIn, mOut, aIn, aOut, total: (staffs || []).length };
  }, [staffs, dayRecord]);

  return (
    <div className="space-y-6">
      {/* Date Bar & High-Level Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-full text-blue-600">
            <CalendarIcon size={20} />
          </div>
          <div>
            <label htmlFor="staff-date-picker" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              កាលបរិច្ឆេទ (Date)
            </label>
            <input 
              id="staff-date-picker"
              type="date" 
              value={currentDateStr}
              onChange={(e) => setCurrentDateStr(e.target.value)}
              className="font-medium text-slate-800 bg-transparent border-none p-0 focus:ring-0 cursor-pointer text-base sm:text-lg outline-none"
            />
          </div>
        </div>
      </div>

      {staffs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center flex flex-col items-center">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center text-slate-400 mb-4">
            <Briefcase size={32} />
          </div>
          <h3 className="text-slate-800 text-lg font-semibold mb-2">មិនមានបុគ្គលិកនៅឡើយទេ</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-sm">សូមចូលទៅកាន់បញ្ជីបុគ្គលិកដើម្បីបន្ថែមបុគ្គលិកមុននឹងអាចកត់ត្រាវត្តមាន។</p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <StatCard label="ចូលព្រឹក" value={stats.mIn} total={stats.total} color="green" icon={<CheckCircle2 size={16} />} />
            <StatCard label="ចេញព្រឹក" value={stats.mOut} total={stats.total} color="red" icon={<XCircle size={16} />} />
            <StatCard label="ចូលល្ងាច" value={stats.aIn} total={stats.total} color="green" icon={<CheckCircle2 size={16} />} />
            <StatCard label="ចេញល្ងាច" value={stats.aOut} total={stats.total} color="red" icon={<XCircle size={16} />} />
          </div>

          {/* List of Staff */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {staffs.map((staff) => {
              const data = dayRecord[staff.id] || { mIn: null, mOut: null, aIn: null, aOut: null };
              return (
                <div key={staff.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-bold text-slate-800 leading-none">{staff.nameKhmer}</h3>
                    {(staff.mInTime || staff.mOutTime || staff.aInTime || staff.aOutTime) && (
                      <div className="text-[10px] font-semibold text-slate-400 flex gap-2">
                         <span>M: {staff.mInTime || '-'}-{staff.mOutTime || '-'}</span>
                         <span>A: {staff.aInTime || '-'}-{staff.aOutTime || '-'}</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatusButton 
                      active={!!data.mIn} 
                      disabled={!isToday}
                      selectedColor="bg-blue-600 text-white" 
                      baseColor="bg-slate-100 text-slate-600"
                      onClick={() => handleAttendanceAction(staff.id, 'mIn')}
                    >
                      <div className="flex flex-col items-center py-0.5 relative group">
                        <span className="text-xs">{data.mIn || 'ចូលព្រឹក'}</span>
                        {data.mIn && getAttendanceLabel(data.mIn, staff.mInTime, 'mIn') && (
                          <span className="text-[9px] font-bold mt-0.5 opacity-60">({getAttendanceLabel(data.mIn, staff.mInTime, 'mIn')})</span>
                        )}
                        {data.mInPhoto && (
                          <Camera size={10} className="absolute -top-1 -right-2 text-white/80" />
                        )}
                      </div>
                    </StatusButton>
                    <StatusButton 
                      active={!!data.mOut} 
                      disabled={!isToday}
                      selectedColor="bg-blue-600 text-white" 
                      baseColor="bg-slate-100 text-slate-600"
                      onClick={() => handleAttendanceAction(staff.id, 'mOut')}
                    >
                      <div className="flex flex-col items-center py-0.5 relative">
                        <span className="text-xs">{data.mOut || 'ចេញព្រឹក'}</span>
                        {data.mOut && getAttendanceLabel(data.mOut, staff.mOutTime, 'mOut') && (
                          <span className="text-[9px] font-bold mt-0.5 opacity-60">({getAttendanceLabel(data.mOut, staff.mOutTime, 'mOut')})</span>
                        )}
                        {data.mOutPhoto && (
                          <Camera size={10} className="absolute -top-1 -right-2 text-white/80" />
                        )}
                      </div>
                    </StatusButton>
                    <StatusButton 
                      active={!!data.aIn} 
                      disabled={!isToday}
                      selectedColor="bg-blue-600 text-white" 
                      baseColor="bg-slate-100 text-slate-600"
                      onClick={() => handleAttendanceAction(staff.id, 'aIn')}
                    >
                      <div className="flex flex-col items-center py-0.5 relative">
                        <span className="text-xs">{data.aIn || 'ចូលល្ងាច'}</span>
                        {data.aIn && getAttendanceLabel(data.aIn, staff.aInTime, 'aIn') && (
                          <span className="text-[9px] font-bold mt-0.5 opacity-60">({getAttendanceLabel(data.aIn, staff.aInTime, 'aIn')})</span>
                        )}
                        {data.aInPhoto && (
                          <Camera size={10} className="absolute -top-1 -right-2 text-white/80" />
                        )}
                      </div>
                    </StatusButton>
                    <StatusButton 
                      active={!!data.aOut} 
                      disabled={!isToday}
                      selectedColor="bg-blue-600 text-white" 
                      baseColor="bg-slate-100 text-slate-600"
                      onClick={() => handleAttendanceAction(staff.id, 'aOut')}
                    >
                      <div className="flex flex-col items-center py-0.5 relative">
                        <span className="text-xs">{data.aOut || 'ចេញល្ងាច'}</span>
                        {data.aOut && getAttendanceLabel(data.aOut, staff.aOutTime, 'aOut') && (
                          <span className="text-[9px] font-bold mt-0.5 opacity-60">({getAttendanceLabel(data.aOut, staff.aOutTime, 'aOut')})</span>
                        )}
                        {data.aOutPhoto && (
                          <Camera size={10} className="absolute -top-1 -right-2 text-white/80" />
                        )}
                      </div>
                    </StatusButton>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {renderModals()}
    </div>
  );
}

// --- 1. Attendance View ---
function AttendanceView({ 
  students, 
  classes,
  staffs,
  attendance, 
  setAttendance, 
  currentDateStr, 
  setCurrentDateStr,
  selectedClassId,
  setSelectedClassId,
  sendTelegramMessage,
  deleteTelegramMessage,
  showToast
}: { 
  students: Student[]; 
  classes: Class[];
  staffs: Staff[];
  attendance: AttendanceState; 
  setAttendance: React.Dispatch<React.SetStateAction<AttendanceState>>;
  currentDateStr: string;
  setCurrentDateStr: (date: string) => void;
  selectedClassId: string;
  setSelectedClassId: (id: string) => void;
  sendTelegramMessage: (message: string) => Promise<any>;
  deleteTelegramMessage: (messageId: number) => Promise<void>;
  showToast: (message: string, type: Toast['type']) => void;
}) {

  const dayRecord = attendance[currentDateStr] || {};
  const isToday = currentDateStr === getTodayStr();

  // Filter students based on selection for stats and display
  const studentsInView = useMemo(() => {
    if (!selectedClassId) return students || [];
    return (students || []).filter(s => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // Track the last message ID sent for today (if within this session or persists)
  const [lastReportMessageIds, setLastReportMessageIds] = useState<Record<string, number>>(() => 
    safeJSONParse(localStorage.getItem('attendance_last_report_ids'), {})
  );

  useEffect(() => {
    localStorage.setItem('attendance_last_report_ids', JSON.stringify(lastReportMessageIds));
  }, [lastReportMessageIds]);

  const classesWithStudents = useMemo(() => {
    return classes.map(c => ({
      ...c,
      teacher: staffs.find(s => s.id === c.teacherId),
      students: (students || []).filter(s => s.classId === c.id)
    })).filter(c => c.students.length > 0);
  }, [classes, students, staffs]);

  const displayedClasses = useMemo(() => {
    if (!selectedClassId) return classesWithStudents;
    return classesWithStudents.filter(c => c.id === selectedClassId);
  }, [classesWithStudents, selectedClassId]);

  const sendSummaryToTelegram = (specificClass?: typeof classesWithStudents[0]) => {
    let presentCount = 0, absentCount = 0, lateCount = 0, excusedCount = 0;
    let presentFemale = 0, absentFemale = 0, lateFemale = 0, excusedFemale = 0;
    let totalFemale = 0;
    const absents: {name: string, phone: string, className: string}[] = [];

    // Use current selected class if not explicitly passed
    const targetClass = specificClass || (displayedClasses.length === 1 ? displayedClasses[0] : null);
    
    const targetClasses = targetClass ? [targetClass] : (classesWithStudents || []);
    const targetStudents = targetClass ? (targetClass.students || []) : (students || []);

    (targetClasses || []).forEach(cls => {
      (cls.students || []).forEach(s => {
        const isFemale = s.gender === 'F';
        if (isFemale) totalFemale++;

        const status = dayRecord[s.id];
        if (status === 'present') {
          presentCount++;
          if (isFemale) presentFemale++;
        }
        else if (status === 'absent') {
          absentCount++;
          if (isFemale) absentFemale++;
          absents.push({ name: s.nameKhmer, phone: s.phoneNumber || 'គ្មាន', className: cls.name });
        }
        else if (status === 'late') {
          lateCount++;
          if (isFemale) lateFemale++;
        }
        else if (status === 'excused') {
          excusedCount++;
          if (isFemale) excusedFemale++;
        }
      });
    });

    const total = targetStudents.length;

    let message = `<b>របាយការណ៍វត្តមានសិស្សប្រចាំថ្ងៃ</b>\n` +
      `📅 កាលបរិច្ឆេទ: ${currentDateStr}\n`;

    if (targetClass) {
      message += `🏫 ថ្នាក់រៀន៖ <b>${escapeHTML(targetClass.name)}</b>\n`;
      message += `គ្រូដឹកនាំ៖ <b>${escapeHTML(targetClass.teacher?.nameKhmer || 'មិនទាន់កំណត់')}</b>\n`;
    } else {
      message += `🏫 <b>បញ្ជីថ្នាក់រៀន៖</b>\n`;
      (classesWithStudents || []).forEach(cls => {
        message += `• ${escapeHTML(cls.name)} (គ្រូ៖ ${escapeHTML(cls.teacher?.nameKhmer || 'មិនទាន់កំណត់')})\n`;
      });
    }

    message += `------------------------------------\n`;
    message += `សិស្សសរុប ${total}នាក់ ស្រី ${totalFemale}នាក់\n`;
    message += `❌អវត្តមាន: ${absentCount}/${absentFemale}\n` +
      `🕒 មកយឺត: ${lateCount}/${lateFemale}\n` +
      `📝 ច្បាប់: ${excusedCount}/${excusedFemale}\n`;

    if (absents.length > 0) {
      message += `<b>បញ្ជីឈ្មោះសិស្សអវត្តមាន</b>\n`;
      (absents || []).forEach((a, idx) => {
        const classInfo = targetClass ? "" : ` (${escapeHTML(a.className)})`;
        message += `${idx + 1}/. ${escapeHTML(a.name)}${classInfo}      📞${a.phone}\n`;
      });
    }

    message += `------------------------------------`;

    // Key format: YYYY-MM-DD_classId OR YYYY-MM-DD_all
    const reportKey = `${currentDateStr}_${targetClass?.id || 'all'}`;
    const prevMsgId = lastReportMessageIds[reportKey];
    if (prevMsgId) {
      deleteTelegramMessage(prevMsgId);
    }

    sendTelegramMessage(message).then(response => {
      if (response && response.ok && response.result?.message_id) {
        setLastReportMessageIds(prev => ({
          ...prev,
          [reportKey]: response.result.message_id
        }));
      }
    });
    showToast(targetClass ? `រក្សាទុក និងផ្ញើរបាយការណ៍ថ្នាក់ ${targetClass.name} រួចរាល់!` : 'រក្សាទុក និងផ្ញើរបាយការណ៍រួចរាល់!', 'success');
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    if (currentDateStr !== getTodayStr()) {
      showToast("អ្នកអាចចុះវត្តមានបានតែសម្រាប់ថ្ងៃនេះប៉ុណ្ណោះ", "warning");
      return;
    }
    firebaseService.saveAttendance(currentDateStr, studentId, status);
  };

  const markClassPresent = (studentIds: string[], className: string) => {
    if (currentDateStr !== getTodayStr()) {
      showToast("អ្នកអាចចុះវត្តមានបានតែសម្រាប់ថ្ងៃនេះប៉ុណ្ណោះ", "warning");
      return;
    }
    studentIds.forEach(id => {
      firebaseService.saveAttendance(currentDateStr, id, 'present');
    });
    showToast(`បញ្ជីសិស្សទាំងអស់ក្នុងថ្នាក់ ${className} ត្រូវបានកំណត់ជា "វត្តមាន"`, 'info');
  };

  // derived stats
  const stats = useMemo(() => {
    let present = 0, absent = 0, late = 0, excused = 0;
    (studentsInView || []).forEach(s => {
      const st = dayRecord[s.id];
      if (st === 'present') present++;
      if (st === 'absent') absent++;
      if (st === 'late') late++;
      if (st === 'excused') excused++;
    });
    return { present, absent, late, excused, total: (studentsInView || []).length };
  }, [studentsInView, dayRecord]);


  return (
    <div className="space-y-6">
      {/* Date Bar & High-Level Actions */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-xl shadow-sm border border-slate-100">
        {/* Date Picker - Compact */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
          <CalendarIcon size={16} className="text-blue-600" />
          <input 
            id="date-picker"
            type="date" 
            value={currentDateStr}
            onChange={(e) => setCurrentDateStr(e.target.value)}
            className="text-sm font-medium text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer outline-none"
          />
        </div>

        {/* Selection & Save - Compact */}
        <div className="flex items-center gap-2 ml-auto">
          {classes.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 h-9">
              <LayoutList size={16} className="text-blue-600" />
              <select 
                value={selectedClassId} 
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="text-sm font-medium text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer outline-none appearance-none pr-5"
                style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23475569\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '1em' }}
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <button 
            onClick={() => sendSummaryToTelegram()}
            disabled={students.length === 0}
            className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-bold px-4 py-1.5 h-9 rounded-lg transition-all active:scale-95 disabled:opacity-50 shadow-sm"
          >
            <Send size={16} />
            <span className="text-sm">រក្សាទុក</span>
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center flex flex-col items-center">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center text-slate-400 mb-4">
            <Users size={32} />
          </div>
          <h3 className="text-slate-800 text-lg font-semibold mb-2">មិនមានសិស្សនៅឡើយទេ</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-sm">សូមចូលទៅកាន់បញ្ជីសិស្សដើម្បីបន្ថែមសិស្សមុននឹងអាចកត់ត្រាវត្តមាន។</p>
        </div>
      ) : displayedClasses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center flex flex-col items-center">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center text-slate-400 mb-4">
            <LayoutList size={32} />
          </div>
          <h3 className="text-slate-800 text-lg font-semibold mb-2">មិនមានថ្នាក់ ឬសិស្សទេ</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-sm">សូមជ្រើសរើសថ្នាក់ផ្សេង ឬបន្ថែមសិស្សទៅក្នុងថ្នាក់នេះ។</p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-2 sm:gap-4">
            <StatCard label="វត្តមាន" value={stats.present} total={stats.total} color="green" icon={<CheckCircle2 size={16} />} />
            <StatCard label="អវត្តមាន" value={stats.absent} total={stats.total} color="red" icon={<XCircle size={16} />} />
            <StatCard label="យឺត" value={stats.late} total={stats.total} color="orange" icon={<Clock size={16} />} />
            <StatCard label="ច្បាប់" value={stats.excused} total={stats.total} color="blue" icon={<FileText size={16} />} />
          </div>

          {/* List of Students grouped by Class */}
          <div className="space-y-6">
            {displayedClasses.map(c => (
              <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{c.name}</h3>
                    <p className="text-xs text-slate-500 font-medium">គ្រូដឹកនាំ៖ {c.teacher?.nameKhmer || 'មិនទាន់កំណត់'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => markClassPresent(c.students.map(s => s.id), c.name)}
                      disabled={!isToday}
                      className="flex items-center gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-3 py-1.5 rounded-lg transition-colors text-xs disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      <span>វត្តមានទាំងអស់</span>
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-50/80 border-b border-slate-100">
                        <tr>
                            <th className="px-4 pb-3 pt-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">ឈ្មោះសិស្ស (Name)</th>
                            <th className="px-4 pb-3 pt-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center w-24">ភេទ (Sex)</th>
                            <th className="px-4 pb-3 pt-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center w-[360px]">កំណត់វត្តមាន (Status)</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {c.students.map((student, idx) => {
                            const status = dayRecord[student.id] || 'none';
                            return (
                                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-medium text-slate-400 w-5">{idx + 1}.</span>
                                        <div className="flex flex-col">
                                        <span className="font-medium text-slate-800 leading-tight">{student.nameKhmer}</span>
                                        {student.nameLatin && <span className="text-[10px] text-slate-500 uppercase tracking-widest">{student.nameLatin}</span>}
                                        </div>
                                    </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                        student.gender === 'F' ? 'bg-pink-50 text-pink-700' : 'bg-cyan-50 text-cyan-700'
                                    }`}>
                                        {student.gender === 'F' ? 'ស្រី' : 'ប្រុស'}
                                    </span>
                                    </td>
                                    <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-1.5 w-full">
                                        <StatusButton 
                                        active={status === 'present'} 
                                        disabled={!isToday}
                                        selectedColor="bg-emerald-500 hover:bg-emerald-600 text-white" 
                                        baseColor="bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        onClick={() => handleStatusChange(student.id, 'present')}
                                        >
                                        វត្តមាន
                                        </StatusButton>
                                        <StatusButton 
                                        active={status === 'absent'} 
                                        disabled={!isToday}
                                        selectedColor="bg-rose-500 hover:bg-rose-600 text-white" 
                                        baseColor="bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        onClick={() => handleStatusChange(student.id, 'absent')}
                                        >
                                        អវត្តមាន
                                        </StatusButton>
                                        <StatusButton 
                                        active={status === 'late'} 
                                        disabled={!isToday}
                                        selectedColor="bg-amber-500 hover:bg-amber-600 text-white" 
                                        baseColor="bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        onClick={() => handleStatusChange(student.id, 'late')}
                                        >
                                        យឺត
                                        </StatusButton>
                                        <StatusButton 
                                        active={status === 'excused'} 
                                        disabled={!isToday}
                                        selectedColor="bg-blue-500 hover:bg-blue-600 text-white" 
                                        baseColor="bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        onClick={() => handleStatusChange(student.id, 'excused')}
                                        >
                                        ច្បាប់
                                        </StatusButton>
                                    </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- 2. Attendance History View ---
function AttendanceHistoryView({ students, classes, attendance }: { students: Student[], classes: Class[], attendance: AttendanceState }) {
  const [selectedClassId, setSelectedClassId] = useState<string>((classes || [])[0]?.id || '');
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());

  const filteredStudents = useMemo(() => (students || []).filter(s => s.classId === selectedClassId), [students, selectedClassId]);

  const dates = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateArray = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateArray.push(d.toISOString().split('T')[0]);
    }
    return dateArray;
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-slate-800">ប្រវត្តិវត្តមាន</h2>
        <div className="flex flex-wrap gap-2">
           <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="p-2 border rounded-xl">
             {(classes || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
           </select>
           <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-2 border rounded-xl" />
           <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="p-2 border rounded-xl" />
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="p-3">សិស្ស</th>
              {(dates || []).map(date => <th key={date} className="p-3 text-xs">{date}</th>)}
            </tr>
          </thead>
          <tbody>
            {(filteredStudents || []).map(student => (
              <tr key={student.id} className="border-b">
                <td className="p-3 font-medium">{student.nameKhmer}</td>
                {(dates || []).map(date => {
                  const status = attendance[date]?.[student.id] || '-';
                  return <td key={date} className="p-3 text-center text-xs">{status}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Helper: Date Range Modal ---
function DateRangeModal({ 
  isOpen, onClose, startDate, setStartDate, endDate, setEndDate,
  classes, selectedClassId, setSelectedClassId
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  startDate: string; 
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  classes?: Class[];
  selectedClassId?: string;
  setSelectedClassId?: (id: string) => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl max-w-sm w-full animate-in fade-in zoom-in duration-300">
        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner">
            <CalendarIcon size={24} />
          </div>
          <span>តម្រងទិន្នន័យ</span>
        </h3>
        
        <div className="space-y-6">
          {classes && selectedClassId !== undefined && setSelectedClassId && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">ជ្រើសរើសថ្នាក់ (Class)</label>
              <select 
                value={selectedClassId} 
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-50 px-4 py-3.5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => {
              const now = new Date();
              const yyyy = now.getFullYear();
              const mm = String(now.getMonth() + 1).padStart(2, '0');
              const dd = String(now.getDate()).padStart(2, '0');
              const todayStr = `${yyyy}-${mm}-${dd}`;
              setStartDate(todayStr); setEndDate(todayStr);                
            }} className="py-3 bg-slate-50 rounded-2xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-all active:scale-95 border-b-2 border-slate-200">ថ្ងៃនេះ</button>
            <button onClick={() => {
              const now = new Date();
              const yyyy = now.getFullYear();
              const mm = String(now.getMonth() + 1).padStart(2, '0');
              const startOfMonthStr = `${yyyy}-${mm}-01`;
              const dd = String(now.getDate()).padStart(2, '0');
              const todayStr = `${yyyy}-${mm}-${dd}`;
              setStartDate(startOfMonthStr); setEndDate(todayStr);
            }} className="py-3 bg-slate-50 rounded-2xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-all active:scale-95 border-b-2 border-slate-200">ខែនេះ</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">ចាប់ពីថ្ងៃ</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-50 px-4 py-3 rounded-2xl focus:outline-none font-bold text-slate-700" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">ដល់ថ្ងៃ</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-50 px-4 py-3 rounded-2xl focus:outline-none font-bold text-slate-700" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button 
            onClick={onClose} 
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white py-4 rounded-[1.5rem] font-black text-lg shadow-xl shadow-blue-100 transition-all"
          >
            រួចរាល់
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 3. Staff Report View ---
function StaffReportView({ staffs, staffAttendance }: { staffs: Staff[]; staffAttendance: AttendanceState }) {
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [isModalOpen, setIsModalOpen] = useState(false);

  const summary = useMemo(() => {
    return staffs.map(staff => {
      let present = 0, absent = 0, late = 0, excused = 0, total = 0;
      
      Object.keys(staffAttendance).forEach(date => {
        if (date >= startDate && date <= endDate) {
          const dRec = staffAttendance[date];
          if (dRec && dRec[staff.id]) {
            total++;
            const st = dRec[staff.id];
            if (st === 'present') present++;
            else if (st === 'absent') absent++;
            else if (st === 'late') late++;
            else if (st === 'excused') excused++;
          }
        }
      });

      const percentage = total > 0 ? ((present + late) / total) * 100 : 0;

      return {
        ...staff,
        present, absent, late, excused, total, percentage
      };
    });
  }, [staffs, staffAttendance, startDate, endDate]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 size={20} className="text-blue-600" />
              <span>របាយការណ៍បុគ្គលិកសរុប (Overall Staff Report)</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white text-xs sm:text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">តម្រង</button>
              <DateRangeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} />
              <button 
                onClick={() => {
                   const csvRows = [];
                   const headers = ['ឈ្មោះ', 'វត្តមាន', 'អវត្តមាន', 'យឺត', 'ច្បាប់', 'អត្រាវត្តមាន (%)'];
                   csvRows.push(headers.join(','));
                   for (const row of summary) {
                     const values = [row.nameKhmer, row.present, row.absent, row.late, row.excused, row.percentage.toFixed(2)];
                     csvRows.push(values.join(','));
                   }
                   const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                   const url = window.URL.createObjectURL(blob);
                   const a = document.createElement('a');
                   a.setAttribute('href', url);
                   a.setAttribute('download', 'staff_attendance_report.csv');
                   a.click();
                }}
                className="bg-emerald-600 text-white text-xs sm:text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors">
                នាំចេញជា CSV
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-white border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ឈ្មោះ</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">វត្តមាន</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">អវត្តមាន</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">យឺត</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">ច្បាប់</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">អត្រាវត្តមាន (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map((row, idx) => (
                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                     <span className="font-medium text-slate-800">{row.nameKhmer}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-emerald-600 font-bold">{row.present}</td>
                  <td className="px-4 py-3 text-center text-rose-600 font-bold">{row.absent}</td>
                  <td className="px-4 py-3 text-center text-amber-600 font-bold">{row.late}</td>
                  <td className="px-4 py-3 text-center text-blue-600 font-bold">{row.excused}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-700">{row.percentage.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Helper for Stat Card ---
function StatCard({ label, value, total, color, icon }: { label: string; value: number; total: number; color: string; icon: React.ReactNode }) {
  const colorMap = {
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-rose-50 border-rose-200 text-rose-700',
    orange: 'bg-amber-50 border-amber-200 text-amber-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700'
  };
  
  const selectedTheme = colorMap[color as keyof typeof colorMap];
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border ${selectedTheme} flex flex-col items-center sm:items-start justify-center shadow-sm`}>
      <div className="flex items-center gap-1.5 opacity-80 mb-1 sm:mb-2">
        <span className="hidden sm:inline-block">{icon}</span>
        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-xl sm:text-3xl font-black leading-none">{value}</span>
        <span className="hidden sm:inline-block text-xs font-semibold opacity-70 mb-1">({percentage}%)</span>
      </div>
    </div>
  );
}

// --- Helper Status Button ---
function StatusButton({ active, selectedColor, baseColor, onClick, children, disabled }: { active: boolean; selectedColor: string; baseColor: string; onClick: () => void; children: React.ReactNode, disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all shadow-sm ${
        active 
          ? `${selectedColor} shadow-md scale-105 z-10 font-bold` 
          : `${baseColor} opacity-70 hover:opacity-100 hover:scale-[1.02]`
      } ${disabled ? 'cursor-not-allowed' : ''} flex-1 text-center whitespace-nowrap`}
    >
      {children}
    </button>
  );
}


// --- 2. Classes View ---
function ClassesView({ 
  classes, setClasses,
  staffs,
  students,
  onAddStudent,
  setDeleteInfo,
  showToast
}: { 
  classes: Class[];
  setClasses: React.Dispatch<React.SetStateAction<Class[]>>;
  staffs: Staff[];
  students: Student[]; 
  onAddStudent: (classId: string) => void;
  setDeleteInfo: React.Dispatch<React.SetStateAction<{isOpen: boolean, message: string, onConfirm: () => void} | null>>;
  showToast: (message: string, type: Toast['type']) => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  const [classNameInput, setClassNameInput] = useState('');
  const [studyTimeInput, setStudyTimeInput] = useState('');
  const [teacherIdInput, setTeacherIdInput] = useState('');

  const openAddClass = () => {
    setEditingClass(null);
    setClassNameInput('');
    setStudyTimeInput('');
    setTeacherIdInput('');
    setIsModalOpen(true);
  };

  const openEditClass = (c: Class) => {
    setEditingClass(c);
    setClassNameInput(c.name);
    setStudyTimeInput(c.studyTime || '');
    setTeacherIdInput(c.teacherId || '');
    setIsModalOpen(true);
  };

  const saveClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classNameInput.trim()) return;
    
    const classData: Class = editingClass 
      ? { ...editingClass, name: classNameInput.trim(), studyTime: studyTimeInput.trim(), teacherId: teacherIdInput }
      : { id: crypto.randomUUID(), name: classNameInput.trim(), studyTime: studyTimeInput.trim(), teacherId: teacherIdInput };

    firebaseService.saveClass(classData);
    setIsModalOpen(false);
  };

  const removeClass = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (classes.length === 1) {
      showToast('មិនអាចលុបថ្នាក់ចុងក្រោយបានទេ! (Cannot delete the last class)', 'error');
      return;
    }
    const classHasStudents = students.some(s => s.classId === id);
    if (classHasStudents) {
      showToast('មិនអាចលុបថ្នាក់ដែលមានសិស្សបានទេ! (Cannot delete class that has students)', 'error');
      return;
    }
    setDeleteInfo({
      isOpen: true,
      message: 'តើអ្នកប្រាកដជាចង់លុបថ្នាក់នេះមែនទេ?',
      onConfirm: () => {
        firebaseService.deleteClass(id);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Manage Classes */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <LayoutList size={20} className="text-blue-600" />
            <span>គ្រប់គ្រងថ្នាក់ (Manage Classes)</span>
          </h2>
          <button 
            onClick={openAddClass}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-2"
          >
            <Plus size={18} />
            <span className="font-semibold text-sm">បន្ថែមថ្នាក់ថ្មី</span>
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map(c => {
            const studentCount = students.filter(s => s.classId === c.id).length;
            const teacher = staffs.find(s => s.id === c.teacherId);
            
            return (
               <div key={c.id} className="relative bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col group cursor-pointer" onClick={() => openEditClass(c)}>
                 <div className="flex justify-between items-start mb-4">
                   <div>
                     <h3 className="text-xl font-bold text-slate-800 mb-1">{c.name}</h3>
                     <div className="flex items-center gap-2 text-sm text-slate-500 font-medium whitespace-nowrap">
                       <Clock size={14} />
                       <span>ម៉ោង: {c.studyTime || 'មិនបានកំណត់'}</span>
                     </div>
                   </div>
                   <button 
                     type="button" 
                     onClick={(e) => removeClass(c.id, e)} 
                     className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors absolute top-3 right-3" 
                     aria-label="Delete Class"
                   >
                     <Trash2 size={16} />
                   </button>
                 </div>
                 
                 <div className="mb-5 flex-1">
                   <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                     <Briefcase size={14} className="text-slate-400" />
                     <span>គ្រូ: <span className="font-semibold text-slate-700">{teacher ? teacher.nameKhmer : 'មិនបានកំណត់'}</span></span>
                   </div>
                   <div className="flex items-center gap-2 text-sm text-slate-600">
                     <Users size={14} className="text-slate-400" />
                     <span>សិស្សសរុប: <span className="font-semibold text-slate-700">{studentCount} នាក់</span></span>
                   </div>
                 </div>

                 <div className="mt-auto border-t border-slate-100 pt-3">
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       onAddStudent(c.id);
                     }} 
                     className="w-full bg-slate-50 hover:bg-blue-50 text-blue-600 hover:text-blue-700 py-2 rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-2 border border-slate-200 hover:border-blue-200"
                   >
                     <UserPlus size={16} />
                     <span>បញ្ចូលសិស្សចូលថ្នាក់</span>
                   </button>
                 </div>
               </div>
            );
          })}
        </div>
      </div>

      {/* Add/Edit Class Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <LayoutList size={20} className="text-blue-600" />
                  <span>{editingClass ? 'កែប្រែព័ត៌មានថ្នាក់' : 'បន្ថែមថ្នាក់ថ្មី'}</span>
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <XCircle size={24} />
                </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">
               <form onSubmit={saveClass} className="flex flex-col gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ឈ្មោះថ្នាក់ *</label>
                    <input type="text" value={classNameInput} onChange={(e) => setClassNameInput(e.target.value)} required placeholder="ឧ. ថ្នាក់ទី១០ក" className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ម៉ោងសិក្សា</label>
                    <input type="text" value={studyTimeInput} onChange={(e) => setStudyTimeInput(e.target.value)} placeholder="ឧ. 7:00 AM - 11:00 AM" className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">គ្រូបង្រៀន (ជ្រើសរើស)</label>
                    <select value={teacherIdInput} onChange={(e) => setTeacherIdInput(e.target.value)} className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm appearance-none">
                      <option value="">-- សូមជ្រើសរើសគ្រូ --</option>
                      {staffs.map(staff => (
                        <option key={staff.id} value={staff.id}>{staff.nameKhmer} {staff.nameLatin ? `(${staff.nameLatin})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-slate-100">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors">
                      បោះបង់
                    </button>
                    <button type="submit" disabled={!classNameInput.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2.5 flex items-center justify-center gap-2 rounded-xl transition-all font-semibold shadow-sm shadow-blue-200 disabled:shadow-none">
                      <Plus size={18} />
                      <span>រក្សាទុក</span>
                    </button>
                 </div>
               </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 3. Students View ---
function StudentsView({ 
  classes,
  selectedClassId,
  students, setStudents,
  isModalOpen, setIsModalOpen,
  setDeleteInfo,
  showToast
}: { 
  classes: Class[];
  selectedClassId: string;
  students: Student[]; 
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  setDeleteInfo: React.Dispatch<React.SetStateAction<{isOpen: boolean, message: string, onConfirm: () => void} | null>>;
  showToast: (msg: string, type: Toast['type']) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameKhmer, setNameKhmer] = useState('');
  const [nameLatin, setNameLatin] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExistingStudentIds, setSelectedExistingStudentIds] = useState<string[]>([]);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Reset selected students when modal closes/opens
  useEffect(() => {
    if (!isModalOpen) {
      setSelectedExistingStudentIds([]);
      setSearchQuery('');
      setEditingStudent(null);
      setNameKhmer('');
      setNameLatin('');
      setGender('M');
      setDateOfBirth('');
      setAddress('');
      setPhoneNumber('');
    }
  }, [isModalOpen]);

  const filteredStudents = students.filter(s => s.classId === selectedClassId);
  const existingStudents = students.filter(s => s.classId !== selectedClassId && (s.nameKhmer.includes(searchQuery) || s.nameLatin.toLowerCase().includes(searchQuery.toLowerCase()) || s.phoneNumber.includes(searchQuery)));

  const saveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameKhmer.trim() || !selectedClassId) return;
    
    const studentData: Student = editingStudent ? {
      ...editingStudent,
      nameKhmer: nameKhmer.trim(),
      nameLatin: nameLatin.trim(),
      gender,
      dateOfBirth,
      address: address.trim(),
      phoneNumber: phoneNumber.trim(),
    } : {
      id: crypto.randomUUID(),
      nameKhmer: nameKhmer.trim(),
      nameLatin: nameLatin.trim(),
      gender,
      dateOfBirth,
      address: address.trim(),
      phoneNumber: phoneNumber.trim(),
      classId: selectedClassId
    };

    firebaseService.saveStudent(studentData);
    setIsModalOpen(false);
  };

  const openEditStudent = (student: Student) => {
    setActiveTab('new');
    setEditingStudent(student);
    setNameKhmer(student.nameKhmer);
    setNameLatin(student.nameLatin);
    setGender(student.gender);
    setDateOfBirth(student.dateOfBirth || '');
    setAddress(student.address || '');
    setPhoneNumber(student.phoneNumber || '');
    setIsModalOpen(true);
  };

  const importStudents = () => {
    if (selectedExistingStudentIds.length === 0) return;
    selectedExistingStudentIds.forEach(id => {
      const student = students.find(s => s.id === id);
      if (student) {
        firebaseService.saveStudent({ ...student, classId: selectedClassId });
      }
    });
    setSelectedExistingStudentIds([]);
    setIsModalOpen(false);
  };

  const toggleSelectExisting = (id: string) => {
    if (selectedExistingStudentIds.includes(id)) {
      setSelectedExistingStudentIds(selectedExistingStudentIds.filter(sid => sid !== id));
    } else {
      setSelectedExistingStudentIds([...selectedExistingStudentIds, id]);
    }
  };

  const removeStudent = (id: string) => {
    setDeleteInfo({
      isOpen: true,
      message: 'តើអ្នកប្រាកដជាចង់លុបសិស្សនេះមែនទេ?',
      onConfirm: () => {
        firebaseService.deleteStudent(id);
      }
    });
  };

  const currentClass = classes.find(c => c.id === selectedClassId);

  const exportToExcel = () => {
    if (filteredStudents.length === 0) {
      showToast("មិនមានទិន្នន័យដើម្បីនាំចេញទេ", "warning");
      return;
    }
    const dataToExport = filteredStudents.map((s, idx) => ({
      'ល.រ': idx + 1,
      'ឈ្មោះខ្មែរ': s.nameKhmer,
      'ឈ្មោះឡាតាំង': s.nameLatin,
      'ភេទ': s.gender === 'M' ? 'ប្រុស' : 'ស្រី',
      'ថ្ងៃខែឆ្នាំកំណើត': s.dateOfBirth,
      'អាសយដ្ឋាន': s.address,
      'លេខទូរស័ព្ទ': s.phoneNumber,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, `Students_${currentClass?.name || 'List'}.xlsx`);
    showToast("បាននាំចេញទិន្នន័យដោយជោគជ័យ", "success");
  };

  const importFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const fetchedNewStudents: Student[] = data.map(item => ({
          id: crypto.randomUUID(),
          nameKhmer: String(item['ឈ្មោះខ្មែរ'] || '').trim(),
          nameLatin: String(item['ឈ្មោះឡាតាំង'] || '').trim(),
          gender: (item['ភេទ'] === 'ស្រី' ? 'F' : 'M') as 'M' | 'F',
          dateOfBirth: String(item['ថ្ងៃខែឆ្នាំកំណើត'] || '').trim(),
          address: String(item['អាសយដ្ឋាន'] || '').trim(),
          phoneNumber: String(item['លេខទូរស័ព្ទ'] || '').trim(),
          classId: selectedClassId
        })).filter(s => s.nameKhmer);

        if (fetchedNewStudents.length > 0) {
          fetchedNewStudents.forEach(s => firebaseService.saveStudent(s));
          showToast(`បានបញ្ចូលសិស្សចំនួន ${fetchedNewStudents.length} នាក់ដោយជោគជ័យ`, 'success');
        } else {
          showToast("មិនមានទិន្នន័យត្រឹមត្រូវក្នុងឯកសារទេ", "warning");
        }
      } catch (err) {
        showToast("មានបញ្ហាក្នុងការអានឯកសារ", "error");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="space-y-6">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={importFromExcel} 
        accept=".xlsx, .xls" 
        className="hidden" 
      />
      {/* Student List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            <span>បញ្ជីឈ្មោះសិស្ស</span>
          </h2>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center bg-slate-200/50 p-1 rounded-xl">
              <button 
                onClick={exportToExcel}
                className="p-2 text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                title="Export Excel"
              >
                <Download size={18} />
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-600 hover:text-green-600 hover:bg-white rounded-lg transition-all"
                title="Import Excel"
              >
                <Upload size={18} />
              </button>
            </div>
            <span className="bg-blue-100 text-blue-700 text-xs sm:text-sm font-bold px-3 py-1 rounded-full hidden lg:inline-block">
              ចំនួន: {filteredStudents.length} នាក់
            </span>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-xl transition-colors shadow-sm flex items-center gap-1 px-3 sm:px-4"
              aria-label="Add Student"
            >
              <Plus size={18} />
              <span className="text-sm font-semibold hidden sm:inline">បន្ថែមសិស្ស</span>
            </button>
          </div>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <p className="mb-2">មិនទាន់មានទិន្នន័យនៅឡើយទេ។</p>
            <p className="text-sm opacity-70">សូមចុចប៊ូតុងខាងលើដើម្បីបន្ថែមសិស្ស។</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {filteredStudents.map((student, idx) => (
              <li key={student.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-400 w-6 text-right">{idx + 1}.</span>
                  <div className="flex flex-col flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-bold text-slate-800 text-base sm:text-lg">{student.nameKhmer}</span>
                      {student.nameLatin && <span className="font-semibold text-slate-500 text-xs sm:text-sm">{student.nameLatin}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${student.gender === 'F' ? 'bg-pink-50 text-pink-600' : 'bg-cyan-50 text-cyan-600'}`}>
                        {student.gender === 'F' ? 'ស្ត្រី - F' : 'បុរស - M'}
                      </span>
                      {student.dateOfBirth && <span className="text-xs text-slate-500 flex items-center gap-1"><CalendarIcon size={12}/>{student.dateOfBirth}</span>}
                      {student.phoneNumber && (
                        <a href={`tel:${student.phoneNumber}`} className="text-blue-600 hover:text-blue-700 hover:underline text-xs flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          📞 {student.phoneNumber}
                        </a>
                      )}
                      {student.address && <span className="text-xs text-slate-500 flex items-center gap-1 hidden sm:flex">📍 {student.address}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => openEditStudent(student)}
                    className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                    aria-label="Edit Student"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                        console.log('Button clicked, student.id is:', student.id);
                        removeStudent(student.id);
                    }}
                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    aria-label="Delete Student"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <UserPlus size={20} className="text-blue-600" />
                  <span>{editingStudent ? 'កែប្រែព័ត៌មានសិស្ស' : 'បញ្ចូលសិស្សថ្មី'}</span>
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <XCircle size={24} />
                </button>
            </div>
            
            <div className="flex border-b border-slate-200">
              <button 
                onClick={() => setActiveTab('new')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'new' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              >
                {editingStudent ? 'កែប្រែព័ត៌មាន' : 'បង្កើតសិស្សថ្មី'}
              </button>
              {!editingStudent && (
                <button 
                  onClick={() => setActiveTab('existing')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'existing' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                  ជ្រើសរើសពីបញ្ជី
                </button>
              )}
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto">
              {activeTab === 'new' ? (
               <form onSubmit={saveStudent} className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ឈ្មោះខ្មែរ (Name Khmer) *</label>
                      <input type="text" value={nameKhmer} onChange={(e) => setNameKhmer(e.target.value)} required placeholder="ឈ្មោះខ្មែរ" className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ឈ្មោះឡាតាំង (Name Latin)</label>
                      <input type="text" value={nameLatin} onChange={(e) => setNameLatin(e.target.value)} placeholder="Name in Latin" className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ភេទ (Gender)</label>
                      <select value={gender} onChange={(e) => setGender(e.target.value as 'M' | 'F')} className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium appearance-none text-sm">
                        <option value="M">ប្រុស (M)</option>
                        <option value="F">ស្រី (F)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ថ្ងៃខែឆ្នាំកំណើត (DOB)</label>
                      <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">លេខទូរស័ព្ទ (Phone)</label>
                      <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="012 345 678" className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ទីលំនៅ (Address)</label>
                      <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="អាសយដ្ឋាន..." className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-slate-100">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors">
                      បោះបង់
                    </button>
                    {editingStudent && (
                      <button 
                        type="button"
                        onClick={() => {
                          removeStudent(editingStudent.id);
                          setIsModalOpen(false);
                        }}
                        className="px-5 py-2.5 bg-rose-50 text-rose-600 font-semibold hover:bg-rose-100 rounded-xl transition-colors mr-auto"
                      >
                        លុប
                      </button>
                    )}
                    <button type="submit" disabled={!nameKhmer.trim() || !selectedClassId} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2.5 flex items-center justify-center gap-2 rounded-xl transition-all font-semibold shadow-sm shadow-blue-200 disabled:shadow-none">
                      <Plus size={18} />
                      <span>រក្សាទុក</span>
                    </button>
                 </div>
               </form>
              ) : (
                <div className="flex flex-col gap-4 h-[400px]">
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ស្វែងរកតាមឈ្មោះ ឬ លេខទូរស័ព្ទ..."
                    className="w-full border border-slate-200 bg-slate-50 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm"
                  />
                  {existingStudents.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                      <p>មិនមានសិស្សផ្សេងទៀតទេ</p>
                    </div>
                  ) : (
                    <ul className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                      {existingStudents.map((student) => {
                        const oldClass = classes.find(c => c.id === student.classId);
                        const isSelected = selectedExistingStudentIds.includes(student.id);
                        return (
                          <li 
                            key={student.id} 
                            className={`flex items-center gap-3 p-3 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/50' : ''}`}
                            onClick={() => toggleSelectExisting(student.id)}
                          >
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => {}} // handled by parent li click
                              className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                            />
                            <div className="flex flex-col flex-1">
                              <span className="font-bold text-slate-800">{student.nameKhmer}</span>
                              <span className="text-xs text-slate-500 mt-0.5">មកពី: {oldClass?.name || 'គ្មានថ្នាក់'}</span>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                 <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-slate-100 shrink-0">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors">
                      បោះបង់
                    </button>
                    <button 
                      type="button" 
                      onClick={importStudents} 
                      disabled={selectedExistingStudentIds.length === 0}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2.5 flex items-center justify-center gap-2 rounded-xl transition-all font-semibold shadow-sm shadow-blue-200 disabled:shadow-none"
                    >
                      <Plus size={18} />
                      <span>បញ្ចូលសិស្ស ({selectedExistingStudentIds.length})</span>
                    </button>
                 </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 4. Staffs View ---
function StaffsView({ 
  staffs, setStaffs, setDeleteInfo, showToast
}: { 
  staffs: Staff[]; 
  setStaffs: React.Dispatch<React.SetStateAction<Staff[]>>;
  setDeleteInfo: React.Dispatch<React.SetStateAction<{isOpen: boolean, message: string, onConfirm: () => void} | null>>;
  showToast: (msg: string, type: Toast['type']) => void;
}) {
  const [nameKhmer, setNameKhmer] = useState('');
  const [nameLatin, setNameLatin] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mInTime, setMInTime] = useState('');
  const [mOutTime, setMOutTime] = useState('');
  const [aInTime, setAInTime] = useState('');
  const [aOutTime, setAOutTime] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  useEffect(() => {
    if (!isModalOpen) {
      setEditingStaff(null);
      setNameKhmer('');
      setNameLatin('');
      setGender('M');
      setPhoneNumber('');
      setMInTime('');
      setMOutTime('');
      setAInTime('');
      setAOutTime('');
    }
  }, [isModalOpen]);

  const saveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameKhmer.trim()) return;
    
    const staffData: Staff = editingStaff ? {
      ...editingStaff,
      nameKhmer: nameKhmer.trim(),
      nameLatin: nameLatin.trim(),
      gender,
      phoneNumber: phoneNumber.trim(),
      mInTime: mInTime.trim(),
      mOutTime: mOutTime.trim(),
      aInTime: aInTime.trim(),
      aOutTime: aOutTime.trim()
    } : {
      id: crypto.randomUUID(),
      nameKhmer: nameKhmer.trim(),
      nameLatin: nameLatin.trim(),
      gender,
      phoneNumber: phoneNumber.trim(),
      mInTime: mInTime.trim(),
      mOutTime: mOutTime.trim(),
      aInTime: aInTime.trim(),
      aOutTime: aOutTime.trim()
    };

    firebaseService.saveStaff(staffData);
    setIsModalOpen(false);
  };

  const openEditStaff = (staff: Staff) => {
    setEditingStaff(staff);
    setNameKhmer(staff.nameKhmer);
    setNameLatin(staff.nameLatin);
    setGender(staff.gender);
    setPhoneNumber(staff.phoneNumber || '');
    setMInTime(staff.mInTime || '');
    setMOutTime(staff.mOutTime || '');
    setAInTime(staff.aInTime || '');
    setAOutTime(staff.aOutTime || '');
    setIsModalOpen(true);
  };

  const removeStaff = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteInfo({
      isOpen: true,
      message: 'តើអ្នកប្រាកដជាចង់លុបបុគ្គលិកនេះមែនទេ?',
      onConfirm: () => {
        firebaseService.deleteStaff(id);
      }
    });
  };

  const unbindDevice = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const staff = staffs.find(s => s.id === id);
    if (!staff) return;

    setDeleteInfo({
      isOpen: true,
      message: `តើអ្នកប្រាកដជាចង់ Reset ឧបករណ៍សម្រាប់បុគ្គលិក "${staff.nameKhmer}" មែនទេ? វានឹងអនុញ្ញាតឱ្យគាត់ចុះវត្តមានពីឧបករណ៍ថ្មីបាន។`,
      onConfirm: () => {
        firebaseService.saveStaff({ ...staff, deviceId: undefined });
        showToast('បាន Reset ឧបករណ៍ដោយជោគជ័យ!', 'success');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Staff List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Briefcase size={20} className="text-blue-600" />
            <span>បញ្ជីឈ្មោះបុគ្គលិក</span>
          </h2>
          <div className="flex items-center gap-3">
            <span className="bg-blue-100 text-blue-700 text-xs sm:text-sm font-bold px-3 py-1 rounded-full hidden sm:inline-block">
              ចំនួន: {staffs.length} នាក់
            </span>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-xl transition-colors shadow-sm flex items-center gap-1 px-3 sm:px-4"
              aria-label="Add Staff"
            >
              <Plus size={18} />
              <span className="text-sm font-semibold hidden sm:inline">បន្ថែមបុគ្គលិក</span>
            </button>
          </div>
        </div>

        {staffs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Briefcase size={48} className="mb-4 text-slate-200" />
            <p className="mb-2">មិនទាន់មានទិន្នន័យនៅឡើយទេ។</p>
            <p className="text-sm opacity-70">សូមចុចប៊ូតុងខាងលើដើម្បីបន្ថែមបុគ្គលិក។</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {staffs.map((staff, idx) => (
              <li key={staff.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-400 w-6 text-right">{idx + 1}.</span>
                  <div className="flex flex-col flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-bold text-slate-800 text-base sm:text-lg">{staff.nameKhmer}</span>
                      {staff.nameLatin && <span className="font-semibold text-slate-500 text-xs sm:text-sm">{staff.nameLatin}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${staff.gender === 'F' ? 'bg-pink-50 text-pink-600' : 'bg-cyan-50 text-cyan-600'}`}>
                        {staff.gender === 'F' ? 'ស្ត្រី - F' : 'បុរស - M'}
                      </span>
                      {staff.phoneNumber && (
                        <a href={`tel:${staff.phoneNumber}`} className="text-blue-600 hover:text-blue-700 hover:underline text-xs flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          📞 {staff.phoneNumber}
                        </a>
                      )}
                    </div>
                    {(staff.mInTime || staff.mOutTime || staff.aInTime || staff.aOutTime) && (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div className="text-[10px] flex items-center gap-1">
                          <span className="text-slate-400 font-bold w-12">ព្រឹក:</span>
                          <span className="text-slate-600 font-semibold">{staff.mInTime || '-'} ➔ {staff.mOutTime || '-'}</span>
                        </div>
                        <div className="text-[10px] flex items-center gap-1">
                          <span className="text-slate-400 font-bold w-12">ល្ងាច:</span>
                          <span className="text-slate-600 font-semibold">{staff.aInTime || '-'} ➔ {staff.aOutTime || '-'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {staff.deviceId && (
                    <button 
                      onClick={(e) => unbindDevice(staff.id, e)}
                      className="p-2 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                      title="Reset Device Binding"
                    >
                      <RefreshCcw size={18} />
                    </button>
                  )}
                  <button 
                    onClick={() => openEditStaff(staff)}
                    className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title="កែប្រែ"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    type="button"
                    onClick={(e) => removeStaff(staff.id, e)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="លុប"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Staff Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <UserPlus size={20} className="text-blue-600" />
                  <span>{editingStaff ? 'កែប្រែព័ត៌មានបុគ្គលិក' : 'បញ្ចូលបុគ្គលិកថ្មី'}</span>
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <XCircle size={24} />
                </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">
               <form onSubmit={saveStaff} className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ឈ្មោះខ្មែរ (Name Khmer) *</label>
                      <input type="text" value={nameKhmer} onChange={(e) => setNameKhmer(e.target.value)} required placeholder="ឈ្មោះខ្មែរ" className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ឈ្មោះឡាតាំង (Name Latin)</label>
                      <input type="text" value={nameLatin} onChange={(e) => setNameLatin(e.target.value)} placeholder="Name in Latin" className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ភេទ (Gender)</label>
                      <select value={gender} onChange={(e) => setGender(e.target.value as 'M' | 'F')} className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium appearance-none text-sm">
                        <option value="M">ប្រុស (M)</option>
                        <option value="F">ស្រី (F)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">លេខទូរស័ព្ទ (Phone)</label>
                      <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="012 345 678" className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm" />
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                       <Clock size={16} className="text-blue-600" />
                       <span>កាលវិភាគការងារ (Standard Shift Times)</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ចូលព្រឹក</label>
                        <input type="time" value={formatTimeToInput(mInTime)} onChange={(e) => setMInTime(formatInputToTime(e.target.value))} className="w-full border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs font-medium" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ចេញព្រឹក</label>
                        <input type="time" value={formatTimeToInput(mOutTime)} onChange={(e) => setMOutTime(formatInputToTime(e.target.value))} className="w-full border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs font-medium" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ចូលល្ងាច</label>
                        <input type="time" value={formatTimeToInput(aInTime)} onChange={(e) => setAInTime(formatInputToTime(e.target.value))} className="w-full border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs font-medium" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ចេញល្ងាច</label>
                        <input type="time" value={formatTimeToInput(aOutTime)} onChange={(e) => setAOutTime(formatInputToTime(e.target.value))} className="w-full border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs font-medium" />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-slate-100">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors">
                      បោះបង់
                    </button>
                    {editingStaff && (
                      <button 
                        type="button"
                        onClick={() => {
                          removeStaff(editingStaff.id);
                          setIsModalOpen(false);
                        }}
                        className="px-5 py-2.5 bg-rose-50 text-rose-600 font-semibold hover:bg-rose-100 rounded-xl transition-colors mr-auto"
                      >
                        លុប
                      </button>
                    )}
                    <button type="submit" disabled={!nameKhmer.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2.5 flex items-center justify-center gap-2 rounded-xl transition-all font-semibold shadow-sm shadow-blue-200 disabled:shadow-none">
                      <Plus size={18} />
                      <span>រក្សាទុក</span>
                    </button>
                 </div>
               </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// --- Settings View ---
function SettingsView({ settings, setSettings, showToast }: { settings: AppSettings, setSettings: React.Dispatch<React.SetStateAction<AppSettings>>, showToast: (message: string, type: Toast['type']) => void }) {
  const [botToken, setBotToken] = useState(settings.telegramBotToken || '');
  const [chatId, setChatId] = useState(settings.telegramChatId || '');
  const [lat, setLat] = useState(settings.schoolLatitude?.toString() || '');
  const [lng, setLng] = useState(settings.schoolLongitude?.toString() || '');
  const [radius, setRadius] = useState(settings.allowedRadius?.toString() || '100');
  const [requirePhoto, setRequirePhoto] = useState(settings.requirePhoto || false);
  const [enableDeviceBinding, setEnableDeviceBinding] = useState(settings.enableDeviceBinding || false);
  const [isTesting, setIsTesting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isTelegramExpanded, setIsTelegramExpanded] = useState(false);
  const [isLocationExpanded, setIsLocationExpanded] = useState(false);
  const [isAntiFraudExpanded, setIsAntiFraudExpanded] = useState(false);

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    let trimmedToken = botToken.trim();
    
    // Remove "bot" prefix if user accidentally included it
    if (trimmedToken.toLowerCase().startsWith('bot')) {
      trimmedToken = trimmedToken.substring(3);
    }
    
    firebaseService.saveSettings({
      telegramBotToken: trimmedToken,
      telegramChatId: chatId.trim(),
      schoolLatitude: lat ? parseFloat(lat) : undefined,
      schoolLongitude: lng ? parseFloat(lng) : undefined,
      allowedRadius: radius ? parseInt(radius) : undefined,
      requirePhoto,
      enableDeviceBinding
    });
    showToast('រក្សាទុកបានជោគជ័យ!', 'success');
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Browser របស់អ្នកមិនគាំទ្រ Geolocation ទេ', 'error');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toString());
        setLng(position.coords.longitude.toString());
        setIsGettingLocation(false);
        showToast('ទទួលបានទីតាំងបច្ចុប្បន្ន!', 'success');
      },
      (error) => {
        setIsGettingLocation(false);
        showToast(`មិនអាចទាញយកទីតាំងបានទេ: ${error.message}`, 'error');
      },
      { enableHighAccuracy: true }
    );
  };

  const testConnection = async () => {
    let trimmedToken = botToken.trim();
    const trimmedChatId = chatId.trim();

    // Remove "bot" prefix if user accidentally included it
    if (trimmedToken.toLowerCase().startsWith('bot')) {
      trimmedToken = trimmedToken.substring(3);
    }

    if (!trimmedToken || !trimmedChatId) {
      showToast('សូមបំពេញ Token និង Chat ID ជាមុនសិន!', 'warning');
      return;
    }

    setIsTesting(true);
    console.log('Testing Telegram connection with chat_id:', trimmedChatId);
    
    try {
      const response = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: trimmedToken,
          chat_id: trimmedChatId,
          text: '🔔 <b>ការសាកល្បងការតភ្ជាប់</b>\n\nនេះគឺជាសារសាកល្បងពីកម្មវិធី SmartSchool Attendance System។ ការតភ្ជាប់របស់អ្នកទទួលបានជោគជ័យ!',
          parse_mode: 'HTML'
        })
      });

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Server returned non-JSON response:', text);
        data = { 
          ok: false, 
          description: text.includes('<!DOCTYPE html>') 
            ? 'Backend Server not found (404 HTML). Please ensure you are running the custom Express server.' 
            : 'Invalid JSON response from server' 
        };
      }
      
      console.log('Test Connection Result:', data);

      if (data.ok) {
        showToast('✅ ការតភ្ជាប់ជោគជ័យ!', 'success');
      } else {
        let helpTip = '';
        const desc = data.description?.toLowerCase() || '';
        
        if (desc.includes('chat not found')) {
          helpTip = '\n\n💡 បញ្ជាក់៖\n- ប្រសិនបើជា Group៖ សូមបន្ថែម Bot ចូលក្នុង Group ហើយផ្ដល់សិទ្ធិជា Admin។';
        } else if (desc.includes('unauthorized')) {
          helpTip = '\n\n💡 បញ្ជាក់៖ Bot Token មិនត្រឹមត្រូវទេ។';
        } else if (desc.includes('backend server not found')) {
          helpTip = '\n\n💡 ដំណោះស្រាយ៖\n- ប្រសិនបើអ្នកនៅ Vercel៖ កម្មវិធីនេះត្រូវការ Backend Server (Express) ដើម្បីដំណើរការ។';
        }
        
        showToast(`❌ ការតភ្ជាប់បរាជ័យ: ${data.description || 'Unknown error'}${helpTip}`, 'error');
      }
    } catch (error: any) {
      console.error('Test Connection Network Error:', error);
      showToast(`⚠️ បញ្ហាការតភ្ជាប់៖ មិនអាចទាក់ទងទៅកាន់ Server បានទេ។ ${error.message || ''}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <SettingsIcon size={20} className="text-blue-600" />
            <span>ការកំណត់ប្រព័ន្ធ (System Settings)</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">គ្រប់គ្រងការកំណត់ Telegram Bot សម្រាប់ការជូនដំណឹង។</p>
        </div>
        
        <div className="p-4 sm:p-6">
          <form onSubmit={saveSettings} className="space-y-6">
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/30">
                <button 
                  type="button"
                  onClick={() => setIsTelegramExpanded(!isTelegramExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors font-bold text-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <Send size={18} className="text-blue-500" />
                    <span>Telegram Bot</span>
                  </div>
                  {isTelegramExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                
                {isTelegramExpanded && (
                  <div className="p-4 space-y-6 border-t border-slate-100 bg-white">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <Send size={16} className="text-blue-500" />
                          <span>Telegram Bot Token</span>
                        </label>
                        <input 
                          type="password" 
                          value={botToken} 
                          onChange={(e) => setBotToken(e.target.value)}
                          placeholder="Paste your bot token here..."
                          className="w-full border border-slate-200 bg-slate-50 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono text-sm"
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                          ទទួលបាន Token ពី <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">@BotFather</a> លើ Telegram។
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <LayoutDashboard size={16} className="text-blue-500" />
                          <span>Telegram Chat ID</span>
                        </label>
                        <input 
                          type="password" 
                          value={chatId} 
                          onChange={(e) => setChatId(e.target.value)}
                          placeholder="Example: -100123456789 or 123456789"
                          className="w-full border border-slate-200 bg-slate-50 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono text-sm"
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                          លេខសម្គាល់ក្រុម (Group ID) ឬអ្នកប្រើប្រាស់ (User ID) ដែលត្រូវផ្ញើសារទៅកាន់។
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <button 
                          type="button"
                          onClick={testConnection}
                          disabled={isTesting}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-2.5 rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isTesting ? (
                            <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <Send size={16} />
                          )}
                          សាកល្បងការតភ្ជាប់
                        </button>
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 text-start">
                      <div className="bg-amber-100 p-2 rounded-lg h-fit text-amber-600">
                        <Clock size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-amber-900 text-[13px] mb-1">របៀបស្វែងរក Chat ID</h4>
                        <ol className="text-amber-800 text-[11px] space-y-1 ml-4 list-decimal leading-relaxed">
                          <li>ស្វែងរក <b>@userinfobot</b> ក្នុង Telegram ដើម្បីរកលេខសម្គាល់ផ្ទាល់ខ្លួន (User ID)។</li>
                          <li>សម្រាប់ក្រុម (Group): បន្ថែម <b>@getidsbot</b> ចូលក្នុងក្រុម រួចវាយ <b>/id</b> ។</li>
                          <li><b>សំខាន់៖</b> លេខសម្គាល់ក្រុម (Group ID) ត្រូវតែមានសញ្ញាដក <b>-</b> នៅពីមុខ (ឧទាហរណ៍៖ <b>-100123456789</b>)។</li>
                          <li>យកលេខនោះមកបំពេញក្នុងប្រអប់ <b>Telegram Chat ID</b> ខាងលើ។</li>
                          <li>កុំភ្លេចបន្ថែម Bot របស់អ្នកចូលក្នុងក្រុម និងផ្ដល់សិទ្ធិជា <b>Admin</b> ផងដែរ!</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/30">
                <button 
                  type="button"
                  onClick={() => setIsLocationExpanded(!isLocationExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors font-bold text-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-blue-500" />
                    <span>ទីតាំងសាលា (School Geofencing)</span>
                  </div>
                  {isLocationExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                
                {isLocationExpanded && (
                  <div className="p-4 space-y-4 border-t border-slate-100 bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Latitude</label>
                        <input 
                          type="number" 
                          step="any"
                          value={lat} 
                          onChange={(e) => setLat(e.target.value)}
                          placeholder="Ex: 11.5564"
                          className="w-full border border-slate-200 bg-slate-50 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Longitude</label>
                        <input 
                          type="number" 
                          step="any"
                          value={lng} 
                          onChange={(e) => setLng(e.target.value)}
                          placeholder="Ex: 104.9282"
                          className="w-full border border-slate-200 bg-slate-50 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row gap-4 items-end">
                      <div className="flex-1 w-full">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Radius (ម៉ែត្រ)</label>
                        <input 
                          type="number" 
                          value={radius} 
                          onChange={(e) => setRadius(e.target.value)}
                          placeholder="Default: 100"
                          className="w-full border border-slate-200 bg-slate-50 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
                        />
                      </div>
                      <button 
                        type="button"
                        onClick={getCurrentLocation}
                        disabled={isGettingLocation}
                        className="w-full sm:w-auto bg-blue-50 hover:bg-blue-100 text-blue-600 px-4 py-2 rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2"
                      >
                        {isGettingLocation ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Clock size={16} />}
                        យកទីតាំងបច្ចុប្បន្ន
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      កំណត់ទីតាំងសាលា និងចម្ងាយ (Radius) ដែលអនុញ្ញាតឱ្យបុគ្គលិកចុះវត្តមាន។
                    </p>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/30">
                <button 
                  type="button"
                  onClick={() => setIsAntiFraudExpanded(!isAntiFraudExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors font-bold text-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-orange-500" />
                    <span>សុវត្ថិភាពការចុះវត្តមាន (Anti-Fraud Settings)</span>
                  </div>
                  {isAntiFraudExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                
                {isAntiFraudExpanded && (
                  <div className="p-4 space-y-4 border-t border-slate-100 bg-white">
                    <div className="space-y-4">
                      <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
                            <Camera size={18} />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-700 block">តម្រូវឱ្យថតរូប Selfie</span>
                            <span className="text-[10px] text-slate-500">បុគ្គលិកត្រូវថតរូបផ្ទាល់ខ្លួននៅពេលចុះវត្តមាន</span>
                          </div>
                        </div>
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 accent-orange-500 rounded border-slate-300"
                          checked={requirePhoto}
                          onChange={(e) => setRequirePhoto(e.target.checked)}
                        />
                      </label>

                      <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                            <MapPin size={18} />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-700 block">ភ្ជាប់គណនីជាមួយទូរស័ព្ទ (Device Binding)</span>
                            <span className="text-[10px] text-slate-500">អនុញ្ញាតឱ្យប្រើទូរស័ព្ទតែមួយសម្រាប់គណនីនីមួយៗ</span>
                          </div>
                        </div>
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 accent-blue-500 rounded border-slate-300"
                          checked={enableDeviceBinding}
                          onChange={(e) => setEnableDeviceBinding(e.target.checked)}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button 
                type="submit" 
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl transition-all font-bold shadow-md shadow-blue-100 flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                រក្សាទុកការកំណត់
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


// --- 5. Report View ---

function ReportView({ students, attendance, classes, selectedClassId, setSelectedClassId }: { students: Student[]; attendance: AttendanceState; classes: Class[]; selectedClassId: string; setSelectedClassId: (id: string) => void }) {
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [showTopStats, setShowTopStats] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const filteredStudents = useMemo(() => (students || []).filter(s => s.classId === selectedClassId), [students, selectedClassId]);

  // Create an aggregated summary across selected time range
  const summary = useMemo(() => {
    return (filteredStudents || []).map(student => {
      let present = 0, absent = 0, late = 0, excused = 0, total = 0;
      
      Object.keys(attendance || {}).forEach(date => {
        if (date >= startDate && date <= endDate) {
          const dRec = attendance[date];
          if (dRec && dRec[student.id]) {
            total++;
            const st = dRec[student.id];
            if (st === 'present') present++;
            else if (st === 'absent') absent++;
            else if (st === 'late') late++;
            else if (st === 'excused') excused++;
          }
        }
      });

      const percentage = total > 0 ? ((present + late) / total) * 100 : 0; // considering late as somewhat present

      return {
        ...student,
        present, absent, late, excused, total, percentage
      };
    });
  }, [filteredStudents, attendance, startDate, endDate]);

  const topAbsentees = useMemo(() => {
    return [...summary]
      .filter(s => s.absent > 0)
      .sort((a, b) => b.absent - a.absent)
      .slice(0, 5);
  }, [summary]);

  if ((filteredStudents || []).length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center flex flex-col items-center">
        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center text-slate-400 mb-4">
          <BarChart3 size={32} />
        </div>
        <h3 className="text-slate-800 text-lg font-semibold mb-2">មិនមានទិន្នន័យដើម្បីពិនិត្យទេ</h3>
        <p className="text-slate-500 text-sm mb-6">សូមបញ្ចូលសិស្សនិងកត់ត្រាវត្តមានសិន។</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showTopStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Users size={20} className="text-rose-600" />
              <span>សិស្សអវត្តមានច្រើនជាងគេ (Top Absentees)</span>
            </h3>
            <div className="space-y-3">
              {topAbsentees.length > 0 ? (
                topAbsentees.map((s, idx) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-rose-50/50 rounded-2xl border border-rose-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 line-clamp-1">{s.nameKhmer}</p>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{s.nameLatin}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-rose-600">{s.absent}</span>
                      <span className="text-[10px] block font-bold text-rose-400 uppercase">ដង (Absences)</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center flex flex-col items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <Smile size={32} className="text-slate-300 mb-2" />
                  <p className="text-slate-400 text-sm font-medium">មិនមានសិស្សអវត្តមានក្នុងកាលបរិច្ឆេទនេះទេ</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex flex-col justify-center items-center text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <CalendarIcon size={32} />
            </div>
            <h4 className="text-slate-800 font-bold mb-1">រយៈពេលរបាយការណ៍</h4>
            <p className="text-slate-500 text-sm font-bold">{startDate} ដល់ {endDate}</p>
            <div className="mt-4 flex gap-4">
              <div className="text-center">
                <p className="text-2xl font-black text-slate-800">{summary.length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">សិស្សសរុប</p>
              </div>
              <div className="w-px h-10 bg-slate-100 mx-2" />
              <div className="text-center">
                <p className="text-2xl font-black text-slate-800">
                  {Math.round(summary.reduce((acc, curr) => acc + curr.percentage, 0) / (summary.length || 1))}%
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">វត្តមានមធ្យម</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex flex-col">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-600" />
                  <span>របាយការណ៍សរុប (Overall Report)</span>
                </h2>
                <p className="text-blue-600 text-xs font-bold mt-0.5">ថ្នាក់: {selectedClass?.name || '---'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsModalOpen(true)} className="bg-white border-2 border-slate-100 text-slate-600 text-xs sm:text-sm px-4 py-2 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2">
                    <LayoutList size={16} />
                    <span>តម្រង</span>
                </button>
                <button 
                  onClick={() => setShowTopStats(!showTopStats)} 
                  className={`${showTopStats ? 'bg-rose-500 text-white shadow-rose-100' : 'bg-white border-2 border-slate-100 text-slate-600 hover:bg-slate-50'} text-xs sm:text-sm px-4 py-2 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2`}
                >
                  <Users size={16} />
                  <span>អវត្តមានច្រើន</span>
                </button>
                <DateRangeModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    startDate={startDate} 
                    setStartDate={setStartDate} 
                    endDate={endDate} 
                    setEndDate={setEndDate}
                    classes={classes}
                    selectedClassId={selectedClassId}
                    setSelectedClassId={setSelectedClassId}
                  />
                <button 
                    onClick={() => {
                       const csvRows = [];
                       const headers = ['ឈ្មោះសិស្ស', 'វត្តមាន', 'អវត្តមាន', 'យឺត', 'ច្បាប់', 'អត្រាវត្តមាន (%)'];
                       csvRows.push(headers.join(','));
                       for (const row of summary) {
                         const values = [row.nameKhmer, row.present, row.absent, row.late, row.excused, row.percentage.toFixed(2)];
                         csvRows.push(values.join(','));
                       }
                       const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                       const url = window.URL.createObjectURL(blob);
                       const a = document.createElement('a');
                       a.setAttribute('href', url);
                       a.setAttribute('download', `attendance_report_${selectedClass?.name || 'all'}.csv`);
                       a.click();
                    }}
                    className="bg-emerald-600 text-white text-xs sm:text-sm px-4 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2">
                    <Download size={16} />
                    <span>នាំចេញជា CSV</span>
                </button>
            </div>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">ទិន្នន័យវត្តមានសរុបរបស់សិស្សម្នាក់ៗតាមកាលបរិច្ឆេទ។</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-white border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ឈ្មោះសិស្ស</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">វត្តមាន</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">អវត្តមាន</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">យឺត</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">ច្បាប់</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">អត្រាវត្តមាន (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(summary || []).map((row, idx) => (
                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                     <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-400 w-5">{idx + 1}.</span>
                      <span className="font-medium text-slate-800">{row.nameKhmer}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold ${row.present > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{row.present}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold ${row.absent > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{row.absent}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold ${row.late > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{row.late}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                     <span className={`font-bold ${row.excused > 0 ? 'text-blue-600' : 'text-slate-300'}`}>{row.excused}</span>
                  </td>
                  <td className="px-4 py-3">

                    <div className="flex items-center gap-2 w-full max-w-[120px] mx-auto">
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex-1">
                        <div 
                          className={`h-full rounded-full ${row.percentage >= 80 ? 'bg-emerald-500' : row.percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                          style={{ width: `${row.percentage}%` }} 
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-600 w-8">{row.percentage.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- User Management View ---
function UserManagementView({ 
  users, 
  setUsers, 
  staffs, 
  setStaffs,
  currentUser,
  setDeleteInfo,
  showToast
}: { 
  users: AppUser[], 
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>, 
  staffs: Staff[], 
  setStaffs: React.Dispatch<React.SetStateAction<Staff[]>>,
  currentUser: AppUser | null,
  setDeleteInfo: (info: any) => void,
  showToast: (msg: string, type: Toast['type']) => void
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [role, setRole] = useState<AppUserRole>('user');

  const visibleUsers = users.filter(u => {
    if (currentUser?.role === 'master_admin') return true;
    // Admins can only see other admins and users, not master_admins
    return u.role !== 'master_admin';
  });

  const handleConfirmUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      firebaseService.saveUser({ ...user, isConfirmed: true });
      showToast('បានបញ្ជាក់អ្នកប្រើប្រាស់ជោគជ័យ!', 'success');
    }
  };

  const openEditModal = (user: AppUser) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword(user.passwordHash);
    setSelectedStaffId(user.staffId);
    setRole(user.role);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setUsername('');
    setPassword('');
    setSelectedStaffId('');
    setRole('user');
  };
  
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !selectedStaffId) {
      showToast('សូមបំពេញព័ត៌មានឱ្យបានគ្រប់គ្រាន់', 'warning');
      return;
    }

    const userData: AppUser = editingUser ? {
      ...editingUser,
      username,
      passwordHash: password,
      staffId: selectedStaffId,
      role
    } : {
      id: crypto.randomUUID(),
      staffId: selectedStaffId,
      username,
      passwordHash: password,
      role,
      isConfirmed: true // Admin added users are confirmed by default
    };

    firebaseService.saveUser(userData);
    showToast(editingUser ? 'បានកែប្រែអ្នកប្រើប្រាស់ជោគជ័យ!' : 'បានបន្ថែមអ្នកប្រើប្រាស់ជោគជ័យ!', 'success');
    handleCloseModal();
  };

  const handleDeleteUser = (user: AppUser) => {
    if (user.role === 'master_admin' && currentUser?.role !== 'master_admin') {
      showToast('អ្នកមិនមានសិទ្ធិលុប Master Admin ទេ', 'error');
      return;
    }
    
    if (user.id === 'default-admin' || user.id === currentUser?.id) {
      showToast('អ្នកមិនអាចលុបគណនីនេះបានទេ', 'error');
      return;
    }

    setDeleteInfo({
      isOpen: true,
      message: `តើអ្នកប្រាកដជាចង់លុបអ្នកប្រើប្រាស់ "${user.username}" មែនទេ?`,
      onConfirm: () => {
        firebaseService.deleteUser(user.id);
        showToast('បានលុបអ្នកប្រើប្រាស់ជោគជ័យ!', 'success');
      }
    });
  };

  const unbindDevice = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const staff = staffs.find(s => s.id === id);
    if (!staff) return;

    setDeleteInfo({
      isOpen: true,
      message: `តើអ្នកប្រាកដជាចង់ Reset ឧបករណ៍សម្រាប់បុគ្គលិក "${staff.nameKhmer}" មែនទេ?`,
      onConfirm: () => {
        firebaseService.saveStaff({ ...staff, deviceId: undefined });
        showToast('បាន Reset ឧបករណ៍ដោយជោគជ័យ!', 'success');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck size={20} className="text-blue-600" />
              <span>គ្រប់គ្រងអ្នកប្រើប្រាស់</span>
            </h2>
            <p className="text-slate-500 text-xs mt-1">គ្រប់គ្រងគណនី និងការភ្ជាប់ឧបករណ៍ (Device Binding)។</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2"
          >
            <UserPlus size={18} />
            <span>បន្ថែមអ្នកប្រើប្រាស់</span>
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
              <thead>
                  <tr className="bg-white border-b border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Username</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Staff Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Device Binding</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {visibleUsers.map(user => {
                      const staff = staffs.find(s => s.id === user.staffId);
                      return (
                          <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-800">{user.username}</td>
                              <td className="px-6 py-4">
                                <span className="font-semibold text-slate-700">{staff?.nameKhmer || 'Unknown'}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${user.role === 'master_admin' ? 'bg-indigo-50 text-indigo-600' : user.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                  {user.role === 'master_admin' ? 'Master Admin' : user.role === 'admin' ? 'Admin' : 'Staff'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {staff?.deviceId ? (
                                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold">
                                    <CheckCircle2 size={14} />
                                    <span>បានភ្ជាប់ (Bound)</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
                                    <Smartphone size={14} />
                                    <span>មិនទាន់ភ្ជាប់</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  {staff?.deviceId && (
                                    <button 
                                      onClick={(e) => unbindDevice(staff.id, e)}
                                      className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                                      title="Reset Device Binding"
                                    >
                                      <RefreshCcw size={18} />
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => openEditModal(user)}
                                    className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                    title="Edit User"
                                  >
                                    <Edit2 size={18} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteUser(user)}
                                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                    title="Delete User"
                                    disabled={user.id === 'default-admin' || user.id === currentUser?.id}
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                  {!user.isConfirmed && (
                                    <button 
                                      onClick={() => handleConfirmUser(user.id)} 
                                      className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all"
                                    >
                                      Confirm
                                    </button>
                                  )}
                                </div>
                              </td>
                          </tr>
                      )
                  })}
              </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">{editingUser ? 'កែប្រែអ្នកប្រើប្រាស់' : 'បន្ថែមអ្នកប្រើប្រាស់'}</h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">បុគ្គលិក</label>
                  <select 
                    value={selectedStaffId} 
                    onChange={e => setSelectedStaffId(e.target.value)} 
                    className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium disabled:opacity-50"
                    required
                    disabled={!!editingUser && editingUser.id === 'default-admin'}
                  >
                      <option value="">ជ្រើសរើសបុគ្គលិក...</option>
                      {staffs.map(s => <option key={s.id} value={s.id}>{s.nameKhmer}</option>)}
                      {editingUser?.id === 'default-admin' && (
                        <option value="none">System Admin</option>
                      )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Username</label>
                  <input 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    placeholder="Username" 
                    className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Password</label>
                  <input 
                    type="text" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="Password" 
                    className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">តួនាទី (Role)</label>
                  <select 
                    value={role} 
                    onChange={e => setRole(e.target.value as AppUserRole)} 
                    className="w-full border border-slate-200 bg-slate-50 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium disabled:opacity-50"
                    disabled={!!editingUser && editingUser.id === 'default-admin'}
                  >
                      <option value="user">User (Staff)</option>
                      <option value="admin">Admin</option>
                      {currentUser?.role === 'master_admin' && <option value="master_admin">Master Admin</option>}
                  </select>
                </div>

                <div className="pt-2 flex gap-3">
                  <button 
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    បោះបង់
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    <span>រក្សាទុក</span>
                  </button>
                </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
