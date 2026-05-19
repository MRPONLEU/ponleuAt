import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  query, 
  getDocs,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { Student, Class, Staff, AppSettings, AppUser, AttendanceState, StaffAttendanceState } from '../types';

export const firebaseService = {
  // Generic sync function
  syncCollection: <T>(path: string, callback: (data: T[]) => void) => {
    return onSnapshot(collection(db, path), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
      callback(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  },

  // Sync nested attendance
  syncAttendance: (date: string, callback: (records: Record<string, any>) => void) => {
    return onSnapshot(collection(db, `attendance/${date}/records`), (snapshot) => {
      const records: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        records[doc.id] = (doc.data() as any).status;
      });
      callback(records);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `attendance/${date}/records`);
    });
  },

  syncStaffAttendance: (date: string, callback: (records: Record<string, any>) => void) => {
    return onSnapshot(collection(db, `staffAttendance/${date}/records`), (snapshot) => {
      const records: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        records[doc.id] = doc.data();
      });
      callback(records);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `staffAttendance/${date}/records`);
    });
  },

  syncSettings: (callback: (settings: AppSettings) => void) => {
    return onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) {
        callback(doc.data() as AppSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });
  },

  // Write operations
  saveStudent: async (student: Student) => {
    const path = `students/${student.id}`;
    try {
      await setDoc(doc(db, 'students', student.id), student);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  deleteStudent: async (id: string) => {
    const path = `students/${id}`;
    try {
      await deleteDoc(doc(db, 'students', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  saveClass: async (cls: Class) => {
    const path = `classes/${cls.id}`;
    try {
      await setDoc(doc(db, 'classes', cls.id), cls);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  deleteClass: async (id: string) => {
    const path = `classes/${id}`;
    try {
      await deleteDoc(doc(db, 'classes', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  saveStaff: async (staff: Staff) => {
    const path = `staff/${staff.id}`;
    try {
      await setDoc(doc(db, 'staff', staff.id), staff);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  deleteStaff: async (id: string) => {
    const path = `staff/${id}`;
    try {
      await deleteDoc(doc(db, 'staff', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  saveUser: async (user: AppUser) => {
    const path = `users/${user.id}`;
    try {
      await setDoc(doc(db, 'users', user.id), user);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  deleteUser: async (id: string) => {
    const path = `users/${id}`;
    try {
      await deleteDoc(doc(db, 'users', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  saveSettings: async (settings: AppSettings) => {
    const path = 'settings/global';
    try {
      // Filter out undefined and NaN values as Firestore doesn't like them
      const cleanSettings = Object.fromEntries(
        Object.entries(settings)
          .filter(([_, v]) => v !== undefined && (typeof v !== 'number' || !isNaN(v)))
          .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
      );

      // Add a longer timeout to prevent infinite hang (60s)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('សំណើដាច់ (Timeout - 60s). សូមពិនិត្យមើលអ៊ីនធឺណិតរបស់អ្នក ឬព្យាយាមម្តងទៀត។')), 60000)
      );

      // Try with exponential backoff or simply retry once
      const saveOp = async () => {
        try {
          await setDoc(doc(db, 'settings', 'global'), cleanSettings);
        } catch (e) {
          // One retry
          await setDoc(doc(db, 'settings', 'global'), cleanSettings);
        }
      };

      await Promise.race([
        saveOp(),
        timeoutPromise
      ]);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
      throw e;
    }
  },

  saveAttendance: async (date: string, studentId: string, status: string) => {
    const path = `attendance/${date}/records/${studentId}`;
    try {
      await setDoc(doc(db, 'attendance', date, 'records', studentId), { status });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  saveStaffAttendance: async (date: string, staffId: string, data: any) => {
    const path = `staffAttendance/${date}/records/${staffId}`;
    try {
      await setDoc(doc(db, 'staffAttendance', date, 'records', staffId), data);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  }
};
