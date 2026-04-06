import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, BookOpen, Check, Cloud, 
  Loader2, Pencil, X, Save, CheckCircle, Clock, List, Moon, Sun,
  LogOut, Shield, Users, User, Calendar, Timer, Play, Pause, RotateCcw, 
  Settings, BarChart, Coffee, Brain, Trophy, Download,
  UploadCloud, Link as LinkIcon, Server, RefreshCw, UserCheck, UserX, AlertCircle, FileAudio, PlayCircle, DownloadCloud, HardDrive
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection 
} from 'firebase/firestore';

// ==========================================
// 1. إعدادات Firebase الخاصة بمشروعك
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBj7ZV1HD3FnCqcPCv4wmu6tkordntcv8k",
  authDomain: "lecture-tracker-3d731.firebaseapp.com",
  projectId: "lecture-tracker-3d731",
  storageBucket: "lecture-tracker-3d731.firebasestorage.app",
  messagingSenderId: "804793313202",
  appId: "1:804793313202:web:bbdf4798380879d59466ab",
  measurementId: "G-J67PJTJEB5"
};

// ⚠️ ضع إيميلك الشخصي هنا (للحصول على صلاحيات المالك)
const ADMIN_EMAIL = "ahmed.ragab.alproda@gmail.com"; 

// ⚠️ رابط سيرفر Hugging Face الخاص بك للمعالجة السحابية
const HUGGING_FACE_API = "https://alproda-audio-processor-api.hf.space";

let app, auth, db, appId;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = "lecture-tracker-3d731";
} catch (error) {
  console.error('Firebase error:', error);
}

// دالة حساب الرتبة بناءً على ساعات المذاكرة
const getUserRank = (totalSeconds) => {
  const hours = totalSeconds / 3600;
  if (hours >= 100) return { name: 'أسطورة الدفعة', icon: '👑', color: 'text-yellow-500' };
  if (hours >= 50) return { name: 'دحيح محترف', icon: '🤓', color: 'text-purple-500' };
  if (hours >= 20) return { name: 'طالب مجتهد', icon: '📚', color: 'text-blue-500' };
  if (hours >= 5) return { name: 'بطل صاعد', icon: '⭐', color: 'text-green-500' };
  return { name: 'مبتدئ', icon: '🌱', color: 'text-slate-500' };
};

export default function App() {
  // ==========================================
  // 2. الحالات الأساسية (States)
  // ==========================================
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('tracker'); // 'tracker', 'admin', 'pomodoro', 'leaderboard', 'automation'
  const [isAdmin, setIsAdmin] = useState(false);

  const [subjects, setSubjects] = useState([]);
  const [stats, setStats] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newLectureName, setNewLectureName] = useState('');

  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');
  const [editingLectureId, setEditingLectureId] = useState(null);
  const [editingLectureName, setEditingLectureName] = useState('');

  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const syncTimeoutRef = useRef(null);

  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // ==========================================
  // 3. حالات مؤقت بومودورو
  // ==========================================
  const [timerMode, setTimerMode] = useState('work'); // 'work', 'shortBreak', 'longBreak'
  const [isActive, setIsActive] = useState(false);
  const [pomodoroSettings, setPomodoroSettings] = useState({ work: 25, shortBreak: 5, longBreak: 15 });
  const [timeLeft, setTimeLeft] = useState(pomodoroSettings.work * 60);
  const [selectedSubjectForTimer, setSelectedSubjectForTimer] = useState('');
  const [selectedLectureForTimer, setSelectedLectureForTimer] = useState('');
  const [showTimerSettings, setShowTimerSettings] = useState(false);

  // ==========================================
  // 4. حالات نظام الرفع والأتمتة السحابية
  // ==========================================
  const [inputType, setInputType] = useState('local'); // 'url', 'local', or 'drive'
  const [sourceUrl, setSourceUrl] = useState('');
  const [localFile, setLocalFile] = useState(null);
  const [splitMethod, setSplitMethod] = useState('time'); // 'time' or 'parts'
  const [splitValueTime, setSplitValueTime] = useState('00:30:00');
  const [splitValueParts, setSplitValueParts] = useState('4');
  const [autoUploadDrive, setAutoUploadDrive] = useState(false);
  
  const [isProcessingServer, setIsProcessingServer] = useState(false);
  const [serverResult, setServerResult] = useState(null);

  const [driveToken, setDriveToken] = useState(null);
  const [driveFiles, setDriveFiles] = useState([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);

  // ==========================================
  // 5. التأثيرات الجانبية (UseEffects) والوظائف
  // ==========================================
  
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    } else {
      alert('لتثبيت التطبيق 📱:\n1. إذا كنت على آيفون، اضغط زر المشاركة ثم "إضافة للشاشة الرئيسية".\n2. إذا كنت على أندرويد، تأكد أنك تستخدم جوجل كروم.');
    }
  };

  useEffect(() => {
    if (!auth) return setAuthLoading(false);
    const authTimeout = setTimeout(() => setAuthLoading(false), 5000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(authTimeout);
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser && db) {
        const isOwner = currentUser.email === ADMIN_EMAIL;
        const userRef = doc(db, 'artifacts', appId, 'usersList', currentUser.uid);
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setIsAdmin(isOwner || data.role === 'admin');
          } else {
            setIsAdmin(isOwner);
          }
        });

        try {
          await setDoc(userRef, {
            name: currentUser.displayName || 'بدون اسم',
            email: currentUser.email || 'بدون إيميل',
            photoURL: currentUser.photoURL || '',
            lastLogin: new Date().toISOString()
          }, { merge: true });
        } catch (e) { console.error("Error saving user info: ", e); }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/drive.readonly');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        setDriveToken(credential.accessToken);
      }
    } catch (error) { alert(`حدث خطأ: ${error.message}`); }
  };

  const connectDrive = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/drive.readonly');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        setDriveToken(credential.accessToken);
        alert("تم ربط Google Drive بنجاح!");
      }
    } catch (error) {
      console.error(error);
      alert("تعذر الربط بـ Google Drive.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSubjects([]); setStats([]); setActiveSubjectId(null);
      setCurrentView('tracker'); setIsActive(false);
      setIsAdmin(false);
      setDriveToken(null);
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !db) {
      const localData = localStorage.getItem('tracker_data');
      if (localData) {
        const parsed = JSON.parse(localData);
        setSubjects(parsed.subjects || []);
        setStats(parsed.stats || []);
        setActiveSubjectId((parsed.subjects && parsed.subjects.length > 0) ? parsed.subjects[0].id : null);
      } else {
        const defaultSubjects = [{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }];
        setSubjects(defaultSubjects);
        setActiveSubjectId(1);
      }
      setIsLoaded(true);
      return;
    }

    let isComponentMounted = true;
    let unsubscribeSnapshot = () => {};
    
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
    unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSubjects(data.subjects || []);
        setStats(data.stats || []);
        setActiveSubjectId(prev => (prev && data.subjects?.some(s => s.id === prev)) ? prev : (data.subjects?.length > 0 ? data.subjects[0].id : null));
      } else {
        setSubjects([{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }]);
        setStats([]); setActiveSubjectId(1);
      }
      setIsLoaded(true);
    }, (error) => {
      console.error(error);
      setIsLoaded(true);
    });

    return () => {
      isComponentMounted = false;
      unsubscribeSnapshot();
    };
  }, [user, authLoading]);

  const fetchDriveList = async () => {
    if (!driveToken) return connectDrive();
    setIsLoadingDrive(true);
    try {
      const res = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType contains 'audio/' or mimeType contains 'video/'&fields=files(id,name,mimeType)&orderBy=modifiedTime desc&pageSize=20", {
        headers: { Authorization: `Bearer ${driveToken}` }
      });
      if (!res.ok) throw new Error('فشل جلب الملفات');
      const data = await res.json();
      setDriveFiles(data.files || []);
    } catch (e) {
      console.error(e);
      alert("فشل جلب الملفات من جوجل درايف. تأكد من منح الصلاحيات.");
    }
    setIsLoadingDrive(false);
  };

  const handleDriveFileSelect = async (file) => {
    setIsLoadingDrive(true);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${driveToken}` }
      });
      const blob = await res.blob();
      const f = new File([blob], file.name, { type: blob.type || 'audio/mpeg' });
      f.isDrive = true;
      setLocalFile(f);
      alert(`تم استيراد ${file.name} بنجاح! جاهز للتقطيع.`);
    } catch (e) {
      console.error(e);
      alert('فشل تحميل الملف من درايف.');
    }
    setIsLoadingDrive(false);
  };

  const uploadToDriveFrontend = async (blob, filename, token) => {
    const metadata = { name: filename, mimeType: 'audio/mpeg' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
    });
    return await res.json();
  };

  const saveDataAndSync = (newSubjects, newStats) => {
    setSubjects(newSubjects); 
    setStats(newStats);
    if (!user || !db) return;
    setIsSyncing(true);
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
        await setDoc(docRef, { subjects: newSubjects, stats: newStats }, { merge: true });
        const totalSecs = newStats.reduce((acc, curr) => acc + curr.durationSeconds, 0);
        await setDoc(doc(db, 'artifacts', appId, 'usersList', user.uid), { totalStudyTime: totalSecs, completedPomodoros: newStats.length }, { merge: true });
      } catch(err) { console.error(err); } finally { setIsSyncing(false); }
    }, 800); 
  };

  const forceManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 1000);
    saveDataAndSync(subjects, stats);
  };

  // ==========================================
  // 6. دوال مؤقت بومودورو
  // ==========================================
  useEffect(() => {
    if (!isActive) setTimeLeft(pomodoroSettings[timerMode] * 60);
  }, [timerMode, pomodoroSettings]);

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(time => time - 1), 1000);
    } else if (isActive && timeLeft === 0) {
      handleTimerComplete();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const handleTimerComplete = () => {
    setIsActive(false);
    if (timerMode === 'work') {
      const newStat = {
        id: Date.now(),
        date: new Date().toISOString(),
        durationSeconds: pomodoroSettings.work * 60,
        subjectId: selectedSubjectForTimer || 'general',
        lectureId: selectedLectureForTimer || null
      };
      const updatedStats = [...stats, newStat];
      saveDataAndSync(subjects, updatedStats);
      if (updatedStats.length % 4 === 0) setTimerMode('longBreak');
      else setTimerMode('shortBreak');
    } else {
      setTimerMode('work');
    }
  };

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => { setIsActive(false); setTimeLeft(pomodoroSettings[timerMode] * 60); };

  // ==========================================
  // 7. دوال الأتمتة السحابية
  // ==========================================
  const handleServerProcess = async (e) => {
    e.preventDefault();
    if (inputType === 'url' && !sourceUrl.trim()) return alert('أدخل الرابط أولاً!');
    if ((inputType === 'local' || inputType === 'drive') && !localFile) return alert('اختر ملفاً أولاً!');
    if (autoUploadDrive && !driveToken) return connectDrive();

    setIsProcessingServer(true);
    setServerResult(null);

    try {
      const formData = new FormData();
      formData.append('inputType', inputType === 'drive' ? 'local' : inputType);
      formData.append('split_mode', splitMethod);
      formData.append('split_value', splitMethod === 'time' ? splitValueTime : splitValueParts);
      formData.append('auto_upload', 'false'); 
      
      if ((inputType === 'local' || inputType === 'drive') && localFile) {
        formData.append('file', localFile);
      } else {
        formData.append('url', sourceUrl);
      }

      const response = await fetch(`${HUGGING_FACE_API}/process-audio`, {
        method: 'POST',
        body: formData 
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'فشل السيرفر في معالجة الطلب.');
      }

      const data = await response.json();

      if (autoUploadDrive && driveToken && data.parts) {
        const newParts = [];
        for (let i = 0; i < data.parts.length; i++) {
          const part = data.parts[i];
          try {
             const audioRes = await fetch(`${HUGGING_FACE_API}${part.preview_url}`);
             const audioBlob = await audioRes.blob();
             const uploadRes = await uploadToDriveFrontend(audioBlob, `${data.title} - الجزء ${i+1}.mp3`, driveToken);
             newParts.push({ ...part, drive_link: uploadRes.webViewLink });
          } catch(err) {
             console.error("Upload error", err);
             newParts.push(part); 
          }
        }
        data.parts = newParts;
      }
      setServerResult(data);
    } catch (error) {
      console.error(error);
      alert(`خطأ: ${error.message}`);
    } finally {
      setIsProcessingServer(false);
    }
  };

  // ==========================================
  // 8. دوال إدارة المواد
  // ==========================================
  const addSubject = (e) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const newSub = { id: Date.now(), name: newSubjectName, lectures: [] };
    saveDataAndSync([...subjects, newSub], stats);
    setActiveSubjectId(newSub.id);
    setNewSubjectName('');
  };

  const deleteSubject = (id) => {
    if (window.confirm("حذف المادة؟")) {
      const updatedSubjects = subjects.filter(sub => sub.id !== id);
      saveDataAndSync(updatedSubjects, stats);
    }
  };

  const saveEditSubject = (id) => {
    if (!editingSubjectName.trim()) return setEditingSubjectId(null);
    saveDataAndSync(subjects.map(s => s.id === id ? { ...s, name: editingSubjectName } : s), stats);
    setEditingSubjectId(null);
  };

  const addLecture = (e) => {
    e.preventDefault();
    if (!newLectureName.trim() || !activeSubjectId) return;
    const namesArray = newLectureName.split('\n').flatMap(n => n.split(','));
    const lectureNames = namesArray.map(name => name.trim()).filter(name => name.length > 0);
    const newLectures = lectureNames.map((name, index) => ({
      id: Date.now() + index, name: name,
      studied: false, listenedRecord: false, transcribed: false,
      createdQuestions: false, solvedOwnQuestions: false, solvedNewQuestions: false,
      reviewCount: 0
    }));
    saveDataAndSync(subjects.map(sub => sub.id === activeSubjectId ? { ...sub, lectures: [...sub.lectures, ...newLectures] } : sub), stats);
    setNewLectureName('');
  };

  const deleteLecture = (subId, lecId) => {
    if (window.confirm("حذف المحاضرة؟")) {
      saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.filter(l => l.id !== lecId) } : sub), stats);
    }
  };

  const toggleLectureTask = (subId, lecId, key) => {
    saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.map(l => l.id === lecId ? { ...l, [key]: !l[key] } : l) } : sub), stats);
  };

  const updateReviewCount = (subId, lecId, inc) => {
    saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.map(l => l.id === lecId ? { ...l, reviewCount: inc ? l.reviewCount + 1 : Math.max(0, l.reviewCount - 1) } : l) } : sub), stats);
  };

  const calculateStudyTime = (period) => {
    const now = new Date();
    let totalSeconds = 0;
    stats.forEach(stat => {
      const statDate = new Date(stat.date);
      if (period === 'all') totalSeconds += stat.durationSeconds;
      else if (period === 'day' && statDate.toDateString() === now.toDateString()) totalSeconds += stat.durationSeconds;
    });
    return { hours: Math.floor(totalSeconds / 3600), minutes: Math.floor((totalSeconds % 3600) / 60), totalSeconds };
  };

  // ==========================================
  // الشاشات
  // ==========================================

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={48} /></div>;

  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
        <div className={`w-full max-w-md p-8 rounded-3xl shadow-xl text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
          <BookOpen size={48} className="mx-auto mb-6 text-indigo-500" />
          <h1 className="text-3xl font-bold mb-2">لمّ المنهج</h1>
          <button onClick={handleGoogleLogin} className="w-full py-3 px-4 rounded-xl font-bold mt-8 flex justify-center items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 transition">سجل دخولك بواسطة جوجل</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans pb-24 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
      <header className={`${darkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-gradient-to-r from-indigo-700 to-indigo-500'} text-white p-3 sticky top-0 z-50`}>
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold cursor-pointer" onClick={() => setCurrentView('tracker')}>لمّ المنهج</h1>
            <div className="flex gap-1 bg-black/10 rounded-xl p-1">
              <button onClick={() => setCurrentView('tracker')} className={`p-2 rounded-lg ${currentView === 'tracker' ? 'bg-white text-indigo-600' : ''}`}><List size={18} /></button>
              <button onClick={() => setCurrentView('pomodoro')} className={`p-2 rounded-lg ${currentView === 'pomodoro' ? 'bg-white text-indigo-600' : ''}`}><Timer size={18} /></button>
              <button onClick={() => setCurrentView('automation')} className={`p-2 rounded-lg ${currentView === 'automation' ? 'bg-amber-400 text-slate-900' : ''}`}><Server size={18} /></button>
              {isAdmin && <button onClick={() => setCurrentView('admin')} className={`p-2 rounded-lg ${currentView === 'admin' ? 'bg-red-500 text-white' : ''}`}><Shield size={18} /></button>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full bg-white/10">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={handleLogout} className="p-2 rounded-full bg-red-500/20"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      {currentView === 'automation' ? (
        <main className="container mx-auto p-4 mt-6 max-w-4xl">
          <div className="mb-8">
            <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}><Server size={36} /> المعالج السحابي</h2>
          </div>
          
          <div className={`rounded-3xl p-6 border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex flex-col sm:flex-row mb-8 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl gap-1">
              <button onClick={() => setInputType('local')} className={`flex-1 py-3 rounded-lg font-bold ${inputType === 'local' ? 'bg-white dark:bg-slate-800 text-indigo-600' : 'text-slate-500'}`}>الجهاز</button>
              <button onClick={() => setInputType('drive')} className={`flex-1 py-3 rounded-lg font-bold ${inputType === 'drive' ? 'bg-white dark:bg-slate-800 text-indigo-600' : 'text-slate-500'}`}>Google Drive</button>
              <button onClick={() => setInputType('url')} className={`flex-1 py-3 rounded-lg font-bold ${inputType === 'url' ? 'bg-white dark:bg-slate-800 text-indigo-600' : 'text-slate-500'}`}>يوتيوب</button>
            </div>

            <form onSubmit={handleServerProcess} className="space-y-6">
              {inputType === 'url' ? (
                <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://youtube.com/..." className="w-full rounded-xl p-3 border dark:bg-slate-700 dark:border-slate-600" />
              ) : inputType === 'local' ? (
                <div className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer" onClick={() => document.getElementById('file-up').click()}>
                  <input type="file" id="file-up" className="hidden" onChange={(e) => setLocalFile(e.target.files[0])} />
                  <FileAudio size={40} className="mx-auto mb-2 text-slate-400" />
                  <p>{localFile ? localFile.name : 'اختر ملفاً'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {!driveToken ? <button type="button" onClick={connectDrive} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold">ربط Google Drive</button> :
                    <div className="border rounded-xl p-4 dark:bg-slate-700/50">
                      <button type="button" onClick={fetchDriveList} className="w-full mb-4 py-2 bg-white dark:bg-slate-800 rounded-lg border text-sm font-bold">تحديث الملفات</button>
                      {isLoadingDrive ? <Loader2 className="animate-spin mx-auto" /> : 
                        <ul className="max-h-40 overflow-y-auto space-y-2">
                          {driveFiles.map(f => <li key={f.id} onClick={() => handleDriveFileSelect(f)} className={`p-2 rounded border cursor-pointer text-xs ${localFile?.id === f.id ? 'bg-indigo-600 text-white' : ''}`}>{f.name}</li>)}
                        </ul>
                      }
                    </div>
                  }
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 p-4 border rounded-xl dark:border-slate-700">
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={splitMethod === 'time'} onChange={() => setSplitMethod('time')} /> بالوقت (HH:MM:SS)</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={splitMethod === 'parts'} onChange={() => setSplitMethod('parts')} /> بعدد الأجزاء</label>
                <input type="text" value={splitMethod === 'time' ? splitValueTime : splitValueParts} onChange={(e) => splitMethod === 'time' ? setSplitValueTime(e.target.value) : setSplitValueParts(e.target.value)} className="w-full p-2 border rounded dark:bg-slate-700" />
              </div>

              <div className="p-4 border rounded-xl flex items-center justify-between cursor-pointer" onClick={() => setAutoUploadDrive(!autoUploadDrive)}>
                <span className="font-bold">الرفع التلقائي لـ Google Drive</span>
                <div className={`w-10 h-5 rounded-full transition-colors ${autoUploadDrive ? 'bg-green-500' : 'bg-slate-400'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${autoUploadDrive ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
              </div>

              <button type="submit" disabled={isProcessingServer} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex justify-center items-center gap-2">
                {isProcessingServer ? <><Loader2 className="animate-spin" /> جاري المعالجة...</> : <><UploadCloud /> بدء العملية</>}
              </button>
            </form>

            {serverResult && (
              <div className="mt-8 space-y-4">
                <h3 className="text-xl font-bold text-green-500">تم بنجاح: {serverResult.title}</h3>
                {serverResult.parts.map((p, i) => (
                  <div key={i} className="p-4 border rounded-xl dark:bg-slate-900 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">{p.name}</span>
                      <div className="flex gap-2">
                        {p.drive_link && <a href={p.drive_link} target="_blank" rel="noreferrer" className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold">درايف</a>}
                        <a href={`${HUGGING_FACE_API}${p.preview_url}`} download className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold">تحميل</a>
                      </div>
                    </div>
                    <audio controls className="w-full" src={`${HUGGING_FACE_API}${p.preview_url}`}></audio>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : currentView === 'pomodoro' ? (
        <main className="container mx-auto p-4 mt-6 max-w-4xl flex flex-col items-center">
          <div className="text-center mb-8">
            <h2 className="text-6xl font-black mb-2">{formatTimerDisplay(timeLeft)}</h2>
            <p className="font-bold text-indigo-500 uppercase tracking-widest">{timerMode === 'work' ? 'تركيز' : 'راحة'}</p>
          </div>
          <div className="flex gap-4">
            <button onClick={toggleTimer} className="w-20 h-20 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg">{isActive ? <Pause size={32} /> : <Play size={32} />}</button>
            <button onClick={resetTimer} className="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center"><RotateCcw size={32} /></button>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4 w-full">
             <div className="p-6 bg-indigo-600 text-white rounded-3xl text-center">
               <span className="block text-sm opacity-80">اليوم</span>
               <span className="text-3xl font-black">{calculateStudyTime('day').hours} س</span>
             </div>
             <div className="p-6 bg-slate-800 text-white rounded-3xl text-center">
               <span className="block text-sm opacity-80">الإجمالي</span>
               <span className="text-3xl font-black">{calculateStudyTime('all').hours} س</span>
             </div>
          </div>
        </main>
      ) : (
        <main className="container mx-auto p-4 flex flex-col lg:flex-row gap-6 mt-6">
          <aside className="w-full lg:w-1/4 rounded-2xl p-4 border dark:bg-slate-800 h-fit">
            <h2 className="font-bold mb-4">المواد الدراسية</h2>
            <form onSubmit={addSubject} className="flex gap-2 mb-4">
              <input type="text" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="مادة جديدة" className="flex-1 p-2 rounded-lg border dark:bg-slate-700" />
              <button type="submit" className="bg-indigo-600 text-white p-2 rounded-lg"><Plus /></button>
            </form>
            <ul className="space-y-2">
              {subjects.map(s => <li key={s.id} onClick={() => setActiveSubjectId(s.id)} className={`p-3 rounded-xl border cursor-pointer font-bold transition ${activeSubjectId === s.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>{s.name}</li>)}
            </ul>
          </aside>
          <section className="w-full lg:w-3/4">
            {activeSubject ? (
              <div className="space-y-6">
                <div className="p-6 border rounded-2xl dark:bg-slate-800">
                  <h2 className="text-3xl font-bold mb-4">{activeSubject.name}</h2>
                  <form onSubmit={addLecture} className="flex gap-2">
                    <input type="text" value={newLectureName} onChange={e => setNewLectureName(e.target.value)} placeholder="اسم المحاضرة..." className="flex-1 p-3 rounded-xl border dark:bg-slate-700" />
                    <button type="submit" className="bg-green-600 text-white px-6 rounded-xl font-bold">إضافة</button>
                  </form>
                </div>
                <div className="space-y-4">
                  {activeSubject.lectures.map(l => (
                    <div key={l.id} className="p-4 border rounded-2xl dark:bg-slate-800 flex flex-col gap-4">
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="font-bold text-lg">{l.name}</span>
                        <button onClick={() => deleteLecture(activeSubject.id, l.id)} className="text-red-500"><Trash2 size={18} /></button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {['studied', 'listenedRecord', 'transcribed', 'createdQuestions', 'solvedOwnQuestions', 'solvedNewQuestions'].map(k => (
                          <button key={k} onClick={() => toggleLectureTask(activeSubject.id, l.id, k)} className={`p-2 rounded-lg text-xs font-bold border transition ${l[k] ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-transparent'}`}>{k}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-center p-20">اختر مادة للبدء</p>}
          </section>
        </main>
      )}
    </div>
  );
}
