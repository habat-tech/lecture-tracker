import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, Trash2, BookOpen, Check, Cloud, 
  Loader2, Pencil, X, Save, CheckCircle, Clock, List, Moon, Sun,
  LogOut, Shield, Users, Calendar, Timer, Play, Pause, RotateCcw, 
  Settings, BarChart, Coffee, Brain, Trophy, Download, Target,
  RefreshCw, UserCheck, UserX, AlertCircle, Info
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

// ⚠️ إيميل المالك
const ADMIN_EMAIL = "ahmed.ragab.alproda@gmail.com"; 

let app, auth, db, appId;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = "lecture-tracker-3d731";
} catch (error) {
  console.error('Firebase error:', error);
}

// حساب الرتب
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
  // States
  // ==========================================
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('tracker'); 
  const [isAdmin, setIsAdmin] = useState(false);

  // Tracker States
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
  const lectureInputRef = useRef(null);

  // Leaderboard/Admin States
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);

  // Pomodoro States
  const [timerMode, setTimerMode] = useState('work'); 
  const [isActive, setIsActive] = useState(false);
  const [pomodoroSettings, setPomodoroSettings] = useState({ work: 25, shortBreak: 5, longBreak: 15 });
  const [timeLeft, setTimeLeft] = useState(pomodoroSettings.work * 60);
  const [selectedSubjectForTimer, setSelectedSubjectForTimer] = useState('');
  const [selectedLectureForTimer, setSelectedLectureForTimer] = useState('');
  const [showTimerSettings, setShowTimerSettings] = useState(false);

  // Custom UI States (Toast & Modal)
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' | 'info' }
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

  // ==========================================
  // Helpers
  // ==========================================
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const confirmAction = (message, onConfirm) => {
    setConfirmDialog({ message, onConfirm });
  };

  // ==========================================
  // Effects & Core Functions
  // ==========================================
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('darkMode') === 'true';
    return false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    const handleInstall = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handleInstall);
    const ua = window.navigator.userAgent;
    const ios = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
    const webkit = !!ua.match(/WebKit/i);
    setIsIOS(ios && webkit && !ua.match(/CriOS/i));
    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    } else if (isIOS) {
      showToast('لتثبيت التطبيق على الآيفون 📱: اضغط على زر المشاركة ثم "إضافة للشاشة الرئيسية".', 'info');
    } else {
      showToast('التطبيق مثبت بالفعل، أو المتصفح لا يدعم التثبيت المباشر.', 'info');
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
          if (docSnap.exists()) setIsAdmin(isOwner || docSnap.data().role === 'admin');
          else setIsAdmin(isOwner);
        });

        try {
          await setDoc(userRef, {
            name: currentUser.displayName || 'مستخدم',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || '',
            lastLogin: new Date().toISOString()
          }, { merge: true });
        } catch (e) { console.error(e); }
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
      await signInWithPopup(auth, provider);
      showToast('تم تسجيل الدخول بنجاح!', 'success');
    } catch (error) { 
      showToast(`خطأ: ${error.message}`, 'error'); 
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSubjects([]); setStats([]); setActiveSubjectId(null);
      setCurrentView('tracker'); setIsActive(false); setIsAdmin(false);
      showToast('تم تسجيل الخروج', 'info');
    } catch (error) { 
      console.error(error); 
    }
  };

  // Firebase Sync
  useEffect(() => {
    if (authLoading) return;
    if (!user || !db) {
      const localData = localStorage.getItem('tracker_data');
      if (localData) {
        const parsed = JSON.parse(localData);
        setSubjects(parsed.subjects || []); setStats(parsed.stats || []);
        setActiveSubjectId(parsed.subjects?.length > 0 ? parsed.subjects[0].id : null);
      }
      setIsLoaded(true);
      return;
    }

    let isComponentMounted = true;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSubjects(data.subjects || []); setStats(data.stats || []);
        setActiveSubjectId(prev => (prev && data.subjects?.some(s => s.id === prev)) ? prev : (data.subjects?.length > 0 ? data.subjects[0].id : null));
      }
      setIsLoaded(true);
    }, (error) => { console.error(error); setIsLoaded(true); });

    return () => { isComponentMounted = false; unsubscribe(); };
  }, [user, authLoading]);

  // Leaderboard Sync
  useEffect(() => {
    if ((currentView === 'admin' && isAdmin) || currentView === 'leaderboard') {
      if (!db) return;
      setLoadingUsers(true);
      const q = collection(db, 'artifacts', appId, 'usersList');
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentView === 'leaderboard') usersData.sort((a, b) => (b.totalStudyTime || 0) - (a.totalStudyTime || 0));
        else usersData.sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));
        setUsersList(usersData);
        setLoadingUsers(false);
      });
      return () => unsubscribe();
    }
  }, [currentView, isAdmin]);

  const saveDataAndSync = (newSubjects, newStats) => {
    setSubjects(newSubjects); 
    setStats(newStats);
    const payload = { subjects: newSubjects, stats: newStats };
    if (user) localStorage.setItem(`tracker_data_${user.uid}`, JSON.stringify(payload));
    else localStorage.setItem('tracker_data', JSON.stringify(payload));

    if (!user || !db) return;
    setIsSyncing(true);
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
        await setDoc(docRef, payload, { merge: true });
        const totalSecs = newStats.reduce((acc, curr) => acc + curr.durationSeconds, 0);
        await setDoc(doc(db, 'artifacts', appId, 'usersList', user.uid), { totalStudyTime: totalSecs, completedPomodoros: newStats.length }, { merge: true });
      } catch(err) { console.error(err); } finally { setIsSyncing(false); }
    }, 800); 
  };

  const forceManualSync = () => {
    setIsSyncing(true); 
    setTimeout(() => setIsSyncing(false), 1000);
    saveDataAndSync(subjects, stats);
    showToast('تمت المزامنة والتحديث!', 'success');
  };

  // ==========================================
  // Pomodoro
  // ==========================================
  useEffect(() => { if (!isActive) setTimeLeft(pomodoroSettings[timerMode] * 60); }, [timerMode, pomodoroSettings]);
  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    else if (isActive && timeLeft === 0) handleTimerComplete();
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const handleTimerComplete = () => {
    setIsActive(false);
    try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play(); } catch(e){}

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
      showToast('عاش يا بطل! أتممت جلسة التركيز.', 'success');
      if (updatedStats.length % 4 === 0) setTimerMode('longBreak');
      else setTimerMode('shortBreak');
    } else {
      showToast('انتهت الراحة، حان وقت العودة للتركيز!', 'info');
      setTimerMode('work');
    }
  };

  const toggleTimer = () => {
    if (timerMode === 'work' && !selectedSubjectForTimer && !isActive && subjects.length > 0) {
      showToast("تنبيه: يُفضل اختيار المادة لتسجيلها بدقة في إحصائياتك!", "info");
    }
    setIsActive(!isActive);
  };
  const resetTimer = () => { setIsActive(false); setTimeLeft(pomodoroSettings[timerMode] * 60); };

  const formatTimerDisplay = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ==========================================
  // Tracker CRUD
  // ==========================================
  const addSubject = (e) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const newSub = { id: Date.now(), name: newSubjectName, lectures: [] };
    saveDataAndSync([...subjects, newSub], stats);
    setActiveSubjectId(newSub.id);
    setNewSubjectName('');
    showToast('تمت إضافة المادة بنجاح', 'success');
  };

  const deleteSubject = (id) => {
    confirmAction("هل أنت متأكد من حذف هذه المادة بكافة محاضراتها؟", () => {
      const updatedSubjects = subjects.filter(sub => sub.id !== id);
      saveDataAndSync(updatedSubjects, stats);
      if (activeSubjectId === id) setActiveSubjectId(updatedSubjects.length > 0 ? updatedSubjects[0].id : null);
      showToast('تم حذف المادة', 'success');
    });
  };

  const saveEditSubject = (id) => {
    if (!editingSubjectName.trim()) {
      setEditingSubjectId(null);
      return;
    }
    saveDataAndSync(subjects.map(s => s.id === id ? { ...s, name: editingSubjectName } : s), stats);
    setEditingSubjectId(null);
    showToast('تم تعديل اسم المادة', 'success');
  };

  const addLecture = (e) => {
    e.preventDefault();
    if (!newLectureName.trim() || !activeSubjectId) return;
    const namesArray = newLectureName.split('\n').flatMap(n => n.split(',')).map(n => n.trim()).filter(n => n.length > 0);
    const newLectures = namesArray.map((name, index) => ({
      id: Date.now() + index, name: name, studied: false, listenedRecord: false, transcribed: false,
      createdQuestions: false, solvedOwnQuestions: false, solvedNewQuestions: false, reviewCount: 0
    }));
    saveDataAndSync(subjects.map(sub => sub.id === activeSubjectId ? { ...sub, lectures: [...sub.lectures, ...newLectures] } : sub), stats);
    setNewLectureName('');
    showToast('تمت إضافة المحاضرات بنجاح', 'success');
  };

  const deleteLecture = (subId, lecId) => {
    confirmAction("هل أنت متأكد من حذف هذه المحاضرة؟", () => {
      saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.filter(l => l.id !== lecId) } : sub), stats);
      showToast('تم حذف المحاضرة', 'success');
    });
  };

  const saveEditLecture = (subId, lecId) => {
    if (!editingLectureName.trim()) {
      setEditingLectureId(null);
      return;
    }
    saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.map(l => l.id === lecId ? { ...l, name: editingLectureName } : l) } : sub), stats);
    setEditingLectureId(null);
  };

  const toggleLectureTask = (subId, lecId, key) => {
    saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.map(l => l.id === lecId ? { ...l, [key]: !l[key] } : l) } : sub), stats);
  };

  const updateReviewCount = (subId, lecId, inc) => {
    saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.map(l => l.id === lecId ? { ...l, reviewCount: inc ? l.reviewCount + 1 : Math.max(0, l.reviewCount - 1) } : l) } : sub), stats);
  };

  // ==========================================
  // Memoized Calculations for Performance
  // ==========================================
  const activeSubject = useMemo(() => subjects.find(s => s.id === activeSubjectId), [subjects, activeSubjectId]);

  const getProgress = (subject) => {
    if (!subject || !subject.lectures || subject.lectures.length === 0) return 0;
    const totalTasks = subject.lectures.length * 6;
    let completed = 0;
    subject.lectures.forEach(l => {
      if (l.studied) completed++; if (l.listenedRecord) completed++; if (l.transcribed) completed++;
      if (l.createdQuestions) completed++; if (l.solvedOwnQuestions) completed++; if (l.solvedNewQuestions) completed++;
    });
    return Math.round((completed / totalTasks) * 100);
  };

  const activeSubjectProgress = useMemo(() => getProgress(activeSubject), [activeSubject]);
  
  const isFullyCompleted = (lecture) => lecture.studied && lecture.listenedRecord && lecture.transcribed && lecture.createdQuestions && lecture.solvedOwnQuestions && lecture.solvedNewQuestions;

  const calculateStudyTime = (period) => {
    const now = new Date();
    let totalSeconds = 0;
    stats.forEach(stat => {
      const statDate = new Date(stat.date);
      if (period === 'all') totalSeconds += stat.durationSeconds;
      else if (period === 'day' && statDate.toDateString() === now.toDateString()) totalSeconds += stat.durationSeconds;
      else if (period === 'week') {
        const diffDays = Math.ceil(Math.abs(now - statDate) / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 7) totalSeconds += stat.durationSeconds;
      } else if (period === 'month') {
        if (statDate.getMonth() === now.getMonth() && statDate.getFullYear() === now.getFullYear()) totalSeconds += stat.durationSeconds;
      }
    });
    return { hours: Math.floor(totalSeconds / 3600), minutes: Math.floor((totalSeconds % 3600) / 60), totalSeconds };
  };

  const allStudy = useMemo(() => calculateStudyTime('all'), [stats]);
  const dayStudy = useMemo(() => calculateStudyTime('day'), [stats]);
  const weekStudy = useMemo(() => calculateStudyTime('week'), [stats]);
  const monthStudy = useMemo(() => calculateStudyTime('month'), [stats]);
  const myRank = useMemo(() => getUserRank(allStudy.totalSeconds), [allStudy.totalSeconds]);

  const taskDefinitions = [
    { key: 'studied', label: 'ذاكرتها', bgChecked: 'peer-checked:bg-green-600 peer-checked:border-green-600' },
    { key: 'listenedRecord', label: 'الريكورد', bgChecked: 'peer-checked:bg-blue-600 peer-checked:border-blue-600' },
    { key: 'transcribed', label: 'التفريغ', bgChecked: 'peer-checked:bg-purple-600 peer-checked:border-purple-600' },
    { key: 'createdQuestions', label: 'عملت أسئلة', bgChecked: 'peer-checked:bg-orange-600 peer-checked:border-orange-600' },
    { key: 'solvedOwnQuestions', label: 'حليتها', bgChecked: 'peer-checked:bg-indigo-600 peer-checked:border-indigo-600' },
    { key: 'solvedNewQuestions', label: 'أسئلة جديدة', bgChecked: 'peer-checked:bg-teal-600 peer-checked:border-teal-600' }
  ];

  // ==========================================
  // Admin Functions
  // ==========================================
  const adminDeleteUser = async (userId, userName, userEmail) => {
    if (userEmail === ADMIN_EMAIL) return showToast("لا يمكنك حذف المالك الأساسي!", "error");
    confirmAction(`هل أنت متأكد من حذف حساب "${userName}" وجميع بياناته نهائياً؟`, async () => {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'usersList', userId));
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'trackerData', 'main'));
        showToast('تم حذف المستخدم بنجاح.', 'success');
      } catch (error) { showToast('حدث خطأ أثناء الحذف.', 'error'); }
    });
  };

  const toggleAdminRole = async (targetUserId, currentRole, targetEmail) => {
    if (targetEmail === ADMIN_EMAIL) return showToast("لا يمكن تعديل صلاحيات المالك الأساسي!", "error");
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    confirmAction(`هل أنت متأكد من تغيير صلاحيات هذا المستخدم؟`, async () => {
      try { 
        await setDoc(doc(db, 'artifacts', appId, 'usersList', targetUserId), { role: newRole }, { merge: true });
        showToast('تم تحديث الصلاحيات بنجاح.', 'success');
      } 
      catch (error) { showToast('حدث خطأ أثناء تعديل الصلاحيات.', 'error'); }
    });
  };

  // ==========================================
  // Render Components
  // ==========================================
  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={48} /></div>;

  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
        {/* Custom Toast & Modal renders (handled globally below) */}
        <div className="absolute top-6 left-6 flex gap-2">
          <button onClick={handleInstallClick} title="تثبيت التطبيق" className={`p-3 rounded-full transition-all duration-300 ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800' : 'bg-white text-indigo-600 shadow-md hover:shadow-lg'}`}><Download size={24} /></button>
          <button onClick={() => setDarkMode(!darkMode)} title="تغيير المظهر" className={`p-3 rounded-full transition-all duration-300 ${darkMode ? 'bg-slate-800 text-yellow-300 hover:bg-slate-700' : 'bg-white text-indigo-600 shadow-md hover:shadow-lg'}`}>{darkMode ? <Sun size={24} /> : <Moon size={24} />}</button>
        </div>
        <div className={`w-full max-w-md p-8 rounded-3xl shadow-2xl text-center border transition-all duration-500 transform hover:scale-[1.02] ${darkMode ? 'bg-slate-800 border-slate-700 shadow-indigo-900/20' : 'bg-white border-slate-100 shadow-indigo-100'}`}>
          <div className="w-24 h-24 mx-auto mb-6 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
            <BookOpen size={48} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-4xl font-black mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">لمّ المنهج</h1>
          <p className={`mb-8 font-medium leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>نظم وقتك، تتبع محاضراتك المتراكمة، حوّل دراستك للعبة، وانجح بتفوق!</p>
          <button onClick={handleGoogleLogin} className="w-full py-4 px-4 rounded-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-indigo-500/50 flex items-center justify-center gap-3 text-lg">
             سجل دخولك وابدأ الآن
          </button>
        </div>
      </div>
    );
  }

  if (!isLoaded && currentView === 'tracker') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-slate-900 text-indigo-400' : 'bg-slate-50 text-indigo-600'}`} dir="rtl">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="font-bold text-lg animate-pulse">جاري تحضير مساحة عملك...</p>
      </div>
    );
  }

  // حساب محيط الدائرة لمؤقت بومودورو
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (timeLeft / (pomodoroSettings[timerMode] * 60)) * circumference;

  return (
    <div className={`min-h-screen font-sans pb-24 transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
      
      {/* Toast Notification System */}
      {toast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-5 duration-300">
          <div className={`px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-bold text-sm ${
            toast.type === 'error' ? 'bg-red-500 text-white' : 
            toast.type === 'info' ? 'bg-blue-500 text-white' : 
            'bg-green-500 text-white'
          }`}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : toast.type === 'info' ? <Info size={18} /> : <CheckCircle size={18} />}
            {toast.message}
          </div>
        </div>
      )}

      {/* Confirm Modal System */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-sm p-6 rounded-3xl shadow-2xl transform transition-all scale-100 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`}>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-500"><AlertCircle /> تأكيد الإجراء</h3>
            <p className="mb-8 font-medium">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition">نعم، متأكد</button>
              <button onClick={() => setConfirmDialog(null)} className={`flex-1 py-3 rounded-xl font-bold transition ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`${darkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-gradient-to-r from-indigo-700 to-purple-600 shadow-lg'} text-white p-3 sticky top-0 z-40 transition-colors duration-300`}>
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 cursor-pointer transition transform hover:scale-105" onClick={() => setCurrentView('tracker')}>
              <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
                <BookOpen size={24} className={darkMode ? 'text-indigo-300' : 'text-white'} />
              </div>
              <h1 className="text-xl font-black tracking-wide">لمّ المنهج</h1>
            </div>
            
            <div className="flex gap-1 bg-black/20 rounded-xl p-1 backdrop-blur-md">
              <button onClick={() => setCurrentView('tracker')} title="المتعقب" className={`p-2 rounded-lg transition-all duration-300 ${currentView === 'tracker' ? 'bg-white text-indigo-600 shadow-md transform scale-105' : 'hover:bg-white/20 text-indigo-100'}`}><List size={18} /></button>
              <button onClick={() => setCurrentView('pomodoro')} title="المؤقت والإحصائيات" className={`p-2 rounded-lg transition-all duration-300 ${currentView === 'pomodoro' ? 'bg-white text-indigo-600 shadow-md transform scale-105' : 'hover:bg-white/20 text-indigo-100'}`}><Timer size={18} /></button>
              <button onClick={() => setCurrentView('leaderboard')} title="لوحة الشرف" className={`p-2 rounded-lg transition-all duration-300 ${currentView === 'leaderboard' ? 'bg-amber-400 text-amber-900 shadow-md transform scale-105' : 'hover:bg-white/20 text-indigo-100'}`}><Trophy size={18} /></button>
              {isAdmin && <button onClick={() => setCurrentView('admin')} title="لوحة التحكم" className={`p-2 rounded-lg transition-all duration-300 ${currentView === 'admin' ? 'bg-red-500 text-white shadow-md transform scale-105' : 'hover:bg-white/20 text-indigo-100'}`}><Shield size={18} /></button>}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button onClick={handleInstallClick} title="تثبيت التطبيق" className={`hidden sm:flex p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-indigo-800/50 hover:bg-indigo-800'}`}><Download size={18} /></button>
            {currentView === 'tracker' && (
              <div className="flex items-center gap-1">
                <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm transition-all ${darkMode ? 'bg-slate-700/80' : 'bg-indigo-900/40'}`}>
                  {isSyncing ? <><Loader2 size={14} className="animate-spin text-indigo-300" /> <span className="text-indigo-100">جاري الحفظ...</span></> : <><Cloud size={14} className="text-green-400" /> <span className="text-green-100">تم الحفظ</span></>}
                </div>
                <button onClick={forceManualSync} title="تحديث السحابة" className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-green-400 hover:bg-slate-600' : 'bg-indigo-800/50 text-green-300 hover:bg-indigo-800'}`}><RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /></button>
              </div>
            )}
            <button onClick={() => setDarkMode(!darkMode)} title="تغيير المظهر" className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-indigo-800/50 text-yellow-300 hover:bg-indigo-800'}`}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="h-6 w-px bg-white/30 mx-1"></div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-black/20 rounded-full pr-1 pl-3 py-1 hover:bg-black/30 transition cursor-default">
                <img src={user.photoURL || 'https://via.placeholder.com/150'} alt="profile" className="w-8 h-8 rounded-full object-cover border border-white/50 shadow-sm" />
                <div className="hidden lg:flex flex-col">
                  <span className="text-sm font-bold truncate max-w-[120px] leading-tight">{user.displayName || 'مستخدم'}</span>
                  <span className={`text-[10px] font-black tracking-wide ${myRank.color}`}>{myRank.icon} {myRank.name}</span>
                </div>
              </div>
              <button onClick={() => confirmAction("هل أنت متأكد من تسجيل الخروج؟", handleLogout)} title="تسجيل الخروج" className="p-2 rounded-full bg-red-500/20 text-red-200 hover:bg-red-500 hover:text-white transition-all"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </header>

      {/* Views */}
      {currentView === 'pomodoro' && (
        <main className="container mx-auto p-4 mt-6 max-w-5xl animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className={`text-3xl font-black flex items-center gap-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}><Timer className="text-indigo-500" size={36} /> مؤقت التركيز (بومودورو)</h2>
              <p className={`mt-2 font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>حدد مادتك، ابدأ المؤقت، وتتبع إنجازك بدقة.</p>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            
            {/* بطاقة المؤقت */}
            <div className={`rounded-3xl p-8 border shadow-xl flex flex-col items-center justify-center relative overflow-hidden transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 shadow-indigo-900/10' : 'bg-white border-slate-100'}`}>
              <div className={`flex p-1.5 mb-8 rounded-2xl border w-full max-w-sm z-10 shadow-inner ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                <button onClick={() => { setTimerMode('work'); setIsActive(false); }} className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${timerMode === 'work' ? 'bg-indigo-600 text-white shadow-md transform scale-[1.02]' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><Brain size={18}/> تركيز</button>
                <button onClick={() => { setTimerMode('shortBreak'); setIsActive(false); }} className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${timerMode === 'shortBreak' ? 'bg-green-500 text-white shadow-md transform scale-[1.02]' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><Coffee size={18}/> بريك</button>
                <button onClick={() => { setTimerMode('longBreak'); setIsActive(false); }} className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${timerMode === 'longBreak' ? 'bg-blue-500 text-white shadow-md transform scale-[1.02]' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><Coffee size={18}/> بريك طويل</button>
              </div>
              
              <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center mb-10 z-10 drop-shadow-2xl">
                <svg viewBox="0 0 100 100" className="absolute top-0 left-0 w-full h-full transform -rotate-90">
                  <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="6" className={`${darkMode ? 'stroke-slate-700' : 'stroke-slate-100'}`} />
                  <circle 
                    cx="50" cy="50" r={radius} fill="none" strokeWidth="6" strokeLinecap="round" 
                    className={`transition-all duration-1000 ease-linear ${timerMode === 'work' ? 'stroke-indigo-500' : timerMode === 'shortBreak' ? 'stroke-green-500' : 'stroke-blue-500'}`} 
                    strokeDasharray={circumference} 
                    strokeDashoffset={strokeDashoffset} 
                  />
                </svg>
                <div className="text-center">
                  <span className={`text-6xl md:text-7xl font-black font-mono block drop-shadow-md tracking-tighter ${timerMode === 'work' ? 'text-indigo-500' : timerMode === 'shortBreak' ? 'text-green-500' : 'text-blue-500'}`}>{formatTimerDisplay(timeLeft)}</span>
                  <span className="text-sm font-bold uppercase tracking-widest mt-2 block opacity-60">{timerMode === 'work' ? 'وقت التركيز' : timerMode === 'shortBreak' ? 'استراحة قصيرة' : 'استراحة طويلة'}</span>
                </div>
              </div>

              <div className="flex items-center gap-6 z-10">
                <button onClick={resetTimer} title="إعادة تعيين" className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 shadow-sm ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600'}`}><RotateCcw size={24} /></button>
                <button onClick={toggleTimer} title="تشغيل / إيقاف" className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all transform hover:scale-110 active:scale-95 text-white ${isActive ? 'bg-red-500 hover:bg-red-600' : (timerMode === 'work' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/50' : timerMode === 'shortBreak' ? 'bg-green-500 hover:bg-green-600 shadow-green-500/50' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/50')}`}>{isActive ? <Pause size={36} fill="currentColor" /> : <Play size={36} className="ml-2" fill="currentColor" />}</button>
                <button onClick={() => setShowTimerSettings(!showTimerSettings)} title="الإعدادات" className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 shadow-sm ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600'}`}><Settings size={24} className={showTimerSettings ? 'animate-spin-slow' : ''} /></button>
              </div>

              {timerMode === 'work' && (
                <div className="mt-8 w-full max-w-sm z-10 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                  <select value={selectedSubjectForTimer} onChange={(e) => { setSelectedSubjectForTimer(e.target.value); setSelectedLectureForTimer(''); }} className={`w-full rounded-2xl px-5 py-3.5 outline-none focus:ring-4 border font-bold shadow-sm transition-all ${darkMode ? 'bg-slate-900 text-white border-slate-600 focus:ring-indigo-500/50' : 'bg-white border-slate-200 focus:ring-indigo-200'}`}>
                    <option value="">-- مذاكرة عامة (بدون تحديد مادة) --</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  
                  {selectedSubjectForTimer && subjects.find(s => s.id.toString() === selectedSubjectForTimer.toString())?.lectures.length > 0 && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                      <select value={selectedLectureForTimer} onChange={(e) => setSelectedLectureForTimer(e.target.value)} className={`w-full rounded-2xl px-5 py-3 text-sm font-bold outline-none border transition-all ${darkMode ? 'bg-indigo-900/30 text-indigo-200 border-indigo-700 focus:ring-2 focus:ring-indigo-500' : 'bg-indigo-50 text-indigo-800 border-indigo-200 focus:ring-2 focus:ring-indigo-300'}`}>
                        <option value="">-- حدد المحاضرة التي تذاكرها (اختياري) --</option>
                        {subjects.find(s => s.id.toString() === selectedSubjectForTimer.toString()).lectures.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6">
              {showTimerSettings && (
                <div className={`rounded-3xl p-6 border shadow-sm animate-in fade-in slide-in-from-top-4 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Settings size={20}/> إعدادات الأوقات (بالدقائق)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className="block text-xs font-bold mb-2 text-indigo-500">التركيز</label><input type="number" min="1" max="120" value={pomodoroSettings.work} onChange={(e) => setPomodoroSettings({...pomodoroSettings, work: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2.5 text-center font-bold outline-none border focus:ring-2 focus:ring-indigo-500 transition-all ${darkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                    <div><label className="block text-xs font-bold mb-2 text-green-500">بريك قصير</label><input type="number" min="1" max="30" value={pomodoroSettings.shortBreak} onChange={(e) => setPomodoroSettings({...pomodoroSettings, shortBreak: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2.5 text-center font-bold outline-none border focus:ring-2 focus:ring-green-500 transition-all ${darkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                    <div><label className="block text-xs font-bold mb-2 text-blue-500">بريك طويل</label><input type="number" min="1" max="60" value={pomodoroSettings.longBreak} onChange={(e) => setPomodoroSettings({...pomodoroSettings, longBreak: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2.5 text-center font-bold outline-none border focus:ring-2 focus:ring-blue-500 transition-all ${darkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                  </div>
                </div>
              )}
              
              <div className={`rounded-3xl p-6 md:p-8 border shadow-sm flex-1 flex flex-col ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <h3 className="text-2xl font-black flex items-center gap-3 pb-4 border-b mb-6 dark:border-slate-700"><BarChart className="text-indigo-500" size={28}/> إحصائياتك</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <div className={`col-span-1 sm:col-span-2 p-6 rounded-3xl border flex items-center justify-between shadow-sm hover:shadow-md transition-shadow ${darkMode ? 'bg-gradient-to-r from-orange-900/30 to-orange-800/10 border-orange-500/30' : 'bg-gradient-to-r from-orange-50 to-orange-100/50 border-orange-200'}`}>
                    <div>
                      <span className="block text-sm font-bold mb-1 text-orange-500 uppercase tracking-wide">إجمالي الجلسات (بومودورو)</span>
                      <span className="text-4xl font-black text-orange-600 dark:text-orange-400">{stats.length} <span className="text-lg font-bold opacity-70">جلسة</span></span>
                    </div>
                    <Target className="text-orange-500 drop-shadow-md opacity-80" size={48} />
                  </div>

                  <div className={`p-6 rounded-3xl border flex items-center justify-between shadow-sm hover:shadow-md transition-shadow ${darkMode ? 'bg-gradient-to-r from-indigo-900/30 to-indigo-800/10 border-indigo-500/30' : 'bg-gradient-to-r from-indigo-50 to-indigo-100/50 border-indigo-200'}`}>
                    <div><span className="block text-sm font-bold mb-1 text-indigo-500 uppercase tracking-wide">مذاكرة اليوم</span><span className="text-3xl font-black">{dayStudy.hours}<span className="text-sm mx-1">س</span> {dayStudy.minutes}<span className="text-sm mx-1">د</span></span></div>
                    <Clock className="text-indigo-500 opacity-80" size={36} />
                  </div>
                  
                  <div className={`p-6 rounded-3xl border flex items-center justify-between shadow-sm hover:shadow-md transition-shadow ${darkMode ? 'bg-gradient-to-r from-green-900/30 to-green-800/10 border-green-500/30' : 'bg-gradient-to-r from-green-50 to-green-100/50 border-green-200'}`}>
                    <div><span className="block text-sm font-bold mb-1 text-green-500 uppercase tracking-wide">هذا الأسبوع</span><span className="text-3xl font-black">{weekStudy.hours}<span className="text-sm mx-1">س</span> {weekStudy.minutes}<span className="text-sm mx-1">د</span></span></div>
                    <Calendar className="text-green-500 opacity-80" size={36} />
                  </div>
                  
                  <div className={`col-span-1 sm:col-span-2 p-6 rounded-3xl border flex items-center justify-between shadow-sm hover:shadow-md transition-shadow ${darkMode ? 'bg-gradient-to-r from-purple-900/30 to-purple-800/10 border-purple-500/30' : 'bg-gradient-to-r from-purple-50 to-purple-100/50 border-purple-200'}`}>
                    <div><span className="block text-sm font-bold mb-1 text-purple-500 uppercase tracking-wide">حصاد هذا الشهر</span><span className="text-4xl font-black">{monthStudy.hours} <span className="text-lg mx-1">ساعة</span> و {monthStudy.minutes} <span className="text-lg mx-1">دقيقة</span></span></div>
                    <BarChart className="text-purple-500 opacity-80" size={48} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {currentView === 'leaderboard' && (
        <main className="container mx-auto p-4 mt-6 max-w-4xl animate-in fade-in slide-in-from-bottom-4">
          <div className="mb-10 text-center">
            <h2 className={`text-4xl font-black mb-3 flex items-center justify-center gap-3 ${darkMode ? 'text-yellow-400' : 'text-amber-600'}`}><Trophy size={40} /> لوحة الشرف</h2>
            <p className={`text-lg font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>تنافس مع زملائك وكن أسطورة الدفعة! الترتيب مبني على إجمالي ساعات المذاكرة.</p>
          </div>
          {loadingUsers ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-500" size={48} /></div> : (
            <div className="space-y-4">
              {/* Top 3 Podium */}
              <div className="flex flex-col md:flex-row justify-center items-end gap-6 md:gap-10 mb-16 mt-10">
                {usersList[1] && (
                  <div className="flex flex-col items-center order-2 md:order-1 transform md:translate-y-10 animate-in slide-in-from-bottom-8 duration-700">
                    <div className="relative">
                      <img src={usersList[1].photoURL || 'https://via.placeholder.com/150'} alt="2nd" className="w-24 h-24 rounded-full border-4 border-slate-300 object-cover shadow-2xl" />
                      <div className="absolute -bottom-4 -right-2 bg-slate-200 text-slate-800 w-10 h-10 rounded-full flex items-center justify-center font-black border-4 border-white shadow-lg text-lg">2</div>
                    </div>
                    <span className="font-bold mt-5 text-lg">{(usersList[1].name || 'مستخدم').split(' ')[0]}</span>
                    <span className="text-sm font-bold bg-slate-200 text-slate-800 px-3 py-1.5 rounded-full mt-2 shadow-sm">🥈 {Math.floor((usersList[1].totalStudyTime || 0) / 3600)} س</span>
                  </div>
                )}
                {usersList[0] && (
                  <div className="flex flex-col items-center order-1 md:order-2 z-10 animate-in slide-in-from-bottom-12 duration-500">
                    <div className="relative">
                      <Trophy size={40} className="absolute -top-12 left-1/2 transform -translate-x-1/2 text-yellow-400 drop-shadow-md animate-pulse" />
                      <img src={usersList[0].photoURL || 'https://via.placeholder.com/150'} alt="1st" className="w-32 h-32 rounded-full border-4 border-yellow-400 object-cover shadow-[0_0_30px_rgba(250,204,21,0.4)]" />
                      <div className="absolute -bottom-5 -right-2 bg-yellow-400 text-yellow-900 w-12 h-12 rounded-full flex items-center justify-center font-black border-4 border-white shadow-lg text-xl">1</div>
                    </div>
                    <span className={`font-black text-2xl mt-6 ${darkMode ? 'text-yellow-400' : 'text-amber-600'}`}>{(usersList[0].name || 'مستخدم').split(' ')[0]}</span>
                    <span className="text-base font-black bg-gradient-to-r from-yellow-200 to-yellow-400 text-yellow-900 px-4 py-1.5 rounded-full mt-2 shadow-md">🥇 {Math.floor((usersList[0].totalStudyTime || 0) / 3600)} س</span>
                  </div>
                )}
                {usersList[2] && (
                  <div className="flex flex-col items-center order-3 transform md:translate-y-14 animate-in slide-in-from-bottom-6 duration-1000">
                    <div className="relative">
                      <img src={usersList[2].photoURL || 'https://via.placeholder.com/150'} alt="3rd" className="w-20 h-20 rounded-full border-4 border-amber-700/60 object-cover shadow-xl" />
                      <div className="absolute -bottom-3 -right-2 bg-amber-700/80 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold border-4 border-white text-sm shadow-md">3</div>
                    </div>
                    <span className="font-bold mt-4">{(usersList[2].name || 'مستخدم').split(' ')[0]}</span>
                    <span className="text-xs font-bold bg-amber-100 text-amber-900 px-3 py-1 rounded-full mt-2 shadow-sm">🥉 {Math.floor((usersList[2].totalStudyTime || 0) / 3600)} س</span>
                  </div>
                )}
              </div>

              {/* The rest of the list */}
              <div className={`rounded-3xl border shadow-xl overflow-hidden ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-100'}`}>
                {usersList.slice(3).map((u, idx) => {
                  const rnk = getUserRank(u.totalStudyTime || 0);
                  return (
                    <div key={u.id} className={`flex items-center justify-between p-5 border-b transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${darkMode ? 'border-slate-700' : 'border-slate-100'} ${u.id === user?.uid ? (darkMode ? 'bg-indigo-900/40' : 'bg-indigo-50/80') : ''}`}>
                      <div className="flex items-center gap-5">
                        <span className="font-black text-lg w-8 text-center opacity-40">{idx + 4}</span>
                        <img src={u.photoURL || 'https://via.placeholder.com/150'} alt="user" className="w-12 h-12 rounded-full object-cover shadow-sm" />
                        <div>
                          <h4 className="font-bold text-lg flex items-center gap-2">{u.name} {u.id === user?.uid && <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full shadow-sm">أنت</span>}</h4>
                          <span className={`text-sm font-bold ${rnk.color}`}>{rnk.icon} {rnk.name}</span>
                        </div>
                      </div>
                      <div className="text-left bg-slate-100 dark:bg-slate-900 px-4 py-2 rounded-2xl">
                        <span className="block font-black text-xl">{Math.floor((u.totalStudyTime || 0) / 3600)}</span>
                        <span className="text-xs font-bold opacity-60">ساعة</span>
                      </div>
                    </div>
                  )
                })}
                {usersList.length <= 3 && <div className="p-8 text-center opacity-50 font-bold">لا يوجد المزيد من الطلاب في القائمة.</div>}
              </div>
            </div>
          )}
        </main>
      )}

      {currentView === 'admin' && isAdmin && (
        <main className="container mx-auto p-4 mt-6 animate-in fade-in">
          <div className={`rounded-3xl p-6 md:p-8 border shadow-xl mb-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center gap-4 mb-8 border-b pb-6 dark:border-slate-700">
              <div className="p-4 bg-red-100 text-red-600 rounded-2xl shadow-sm"><Shield size={36} /></div>
              <div>
                <h2 className="text-3xl font-black">لوحة تحكم الإدارة</h2>
                <p className="opacity-70 font-medium mt-1">أهلاً بك، تحكم بصلاحيات المستخدمين من هنا.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
              <div className={`p-6 rounded-3xl border flex items-center gap-4 shadow-sm ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-indigo-50 border-indigo-100'}`}>
                <div className="p-4 bg-indigo-100 text-indigo-600 rounded-2xl"><Users size={32} /></div>
                <div>
                  <span className="block text-sm font-bold text-indigo-500 mb-1">إجمالي الطلاب</span>
                  <span className="text-4xl font-black">{usersList.length}</span>
                </div>
              </div>
              <div className={`p-6 rounded-3xl border flex items-center gap-4 shadow-sm ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-amber-50 border-amber-100'}`}>
                <div className="p-4 bg-amber-100 text-amber-600 rounded-2xl"><Shield size={32} /></div>
                <div>
                  <span className="block text-sm font-bold text-amber-500 mb-1">المديرين</span>
                  <span className="text-4xl font-black">{usersList.filter(u => u.role === 'admin' || u.email === ADMIN_EMAIL).length}</span>
                </div>
              </div>
            </div>
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-2"><Users size={24} className="text-indigo-500"/> سجل الطلاب</h3>
            {loadingUsers ? <Loader2 className="animate-spin text-indigo-500 mx-auto" size={40} /> : (
              <div className={`rounded-2xl border overflow-hidden shadow-sm ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className={`text-sm ${darkMode ? 'bg-slate-700/80 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                        <th className="p-5 font-bold">الطالب</th>
                        <th className="p-5 font-bold">الدور</th>
                        <th className="p-5 font-bold text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((u) => {
                        const isSuper = u.email === ADMIN_EMAIL;
                        const isAdm = isSuper || u.role === 'admin';
                        return (
                        <tr key={u.id} className={`border-b transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                          <td className="p-4">
                            <div className="flex items-center gap-4">
                              <img src={u.photoURL || 'https://via.placeholder.com/150'} alt="Avatar" className="w-10 h-10 rounded-full object-cover shadow-sm" />
                              <div>
                                <span className="font-bold block">{u.name}</span>
                                <span className="text-xs opacity-60 font-mono mt-1">{u.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            {isSuper ? <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold border border-yellow-200">مالك النظام</span> : 
                             isAdm ? <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">مدير (أدمن)</span> : 
                             <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">طالب</span>}
                          </td>
                          <td className="p-4">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => toggleAdminRole(u.id, u.role, u.email)} title={isAdm ? "سحب الصلاحيات" : "ترقية لمدير"} className={`p-2.5 rounded-xl transition ${isAdm ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}>{isAdm ? <UserX size={18} /> : <UserCheck size={18} />}</button>
                              <button onClick={() => adminDeleteUser(u.id, u.name, u.email)} title="حذف المستخدم نهائياً" className="p-2.5 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition"><Trash size={18} /></button>
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {currentView === 'tracker' && (
        <main className="container mx-auto p-4 flex flex-col lg:flex-row gap-6 mt-6 animate-in fade-in slide-in-from-bottom-4">
          {/* Sidebar */}
          <aside className={`w-full lg:w-1/4 rounded-3xl p-5 border shadow-xl h-fit sticky top-24 transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 shadow-none' : 'bg-white border-slate-100'}`}>
            <h2 className={`text-xl font-black mb-5 flex items-center gap-3 border-b pb-4 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}><List size={24} className="text-indigo-500"/> المواد الدراسية</h2>
            <form onSubmit={addSubject} className="mb-5 flex gap-2 relative">
              <input type="text" placeholder="مادة جديدة..." className={`flex-1 rounded-xl pl-12 pr-4 py-3 text-sm font-bold outline-none border-2 focus:border-indigo-500 transition-colors ${darkMode ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200'}`} value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} />
              <button type="submit" title="إضافة مادة" className="absolute left-1.5 top-1.5 bottom-1.5 bg-indigo-600 text-white px-3 rounded-lg hover:bg-indigo-700 transition shadow-sm"><Plus size={20} /></button>
            </form>
            <ul className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {subjects.map(subject => (
                <li key={subject.id} className="group relative">
                  {editingSubjectId === subject.id ? (
                    <div className={`flex items-center gap-2 p-2.5 rounded-xl border-2 ${darkMode ? 'bg-slate-900 border-indigo-500/50' : 'bg-white border-indigo-300'}`}>
                      <input type="text" className={`flex-1 rounded px-2 py-1 text-sm font-bold outline-none ${darkMode ? 'bg-transparent text-white' : 'bg-transparent'}`} value={editingSubjectName} onChange={(e) => setEditingSubjectName(e.target.value)} autoFocus />
                      <button onClick={() => saveEditSubject(subject.id)} title="حفظ" className="text-green-500 bg-green-100 dark:bg-green-900/30 p-1.5 rounded-lg"><Save size={16} /></button>
                      <button onClick={() => setEditingSubjectId(null)} title="إلغاء" className="text-slate-400 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg"><X size={16} /></button>
                    </div>
                  ) : (
                    <div className={`flex items-center justify-between transition-all duration-300 rounded-xl overflow-hidden border-2 cursor-pointer ${activeSubjectId === subject.id ? (darkMode ? 'border-indigo-500 bg-indigo-900/40 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'border-indigo-400 bg-indigo-50 shadow-md transform scale-[1.02]') : (darkMode ? 'border-transparent hover:border-slate-600 hover:bg-slate-700/50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50')}`}>
                      <button onClick={() => setActiveSubjectId(subject.id)} className="flex-1 text-right px-4 py-3.5 relative overflow-hidden">
                        <div className={`absolute top-0 right-0 h-full transition-all duration-700 ease-out -z-10 ${activeSubjectId === subject.id ? (darkMode ? 'bg-indigo-600/20' : 'bg-indigo-200/50') : (darkMode ? 'bg-slate-700/50' : 'bg-slate-200/50')}`} style={{ width: `${getProgress(subject)}%` }}></div>
                        <div className="flex justify-between items-center z-10 relative">
                          <span className={`font-bold text-[15px] truncate max-w-[130px] ${activeSubjectId === subject.id ? 'text-indigo-700 dark:text-indigo-300' : ''}`}>{subject.name}</span>
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-md border shadow-sm backdrop-blur-sm ${activeSubjectId === subject.id ? (darkMode ? 'text-indigo-200 border-indigo-500/50 bg-indigo-900/80' : 'text-indigo-700 border-indigo-300 bg-white/90') : (darkMode ? 'text-slate-400 border-slate-600 bg-slate-800/80' : 'text-slate-500 border-slate-200 bg-white/80')}`}>{getProgress(subject)}%</span>
                        </div>
                      </button>
                      <div className="flex flex-col gap-1 px-2 opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-2 top-1/2 transform -translate-y-1/2 bg-white/90 dark:bg-slate-800/90 rounded-lg shadow-sm p-1 backdrop-blur-sm border dark:border-slate-600">
                        <button onClick={(e) => { e.stopPropagation(); setEditingSubjectId(subject.id); setEditingSubjectName(subject.name); }} title="تعديل المادة" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-md transition"><Pencil size={14} /></button>
                        <button onClick={(e) => { e.stopPropagation(); deleteSubject(subject.id); }} title="حذف المادة" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 rounded-md transition"><Trash size={14} /></button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {subjects.length === 0 && (
                <div className="text-center py-8 opacity-50 border-2 border-dashed rounded-2xl dark:border-slate-700">
                  <BookOpen size={32} className="mx-auto mb-2" />
                  <p className="text-sm font-bold">لا توجد مواد مضافة.</p>
                </div>
              )}
            </ul>
          </aside>

          {/* Main Content */}
          <section className="w-full lg:w-3/4">
            {activeSubject ? (
              <div className="space-y-6">
                {/* Header */}
                <div className={`rounded-3xl p-6 md:p-8 border shadow-xl transition-colors relative overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700 shadow-none' : 'bg-white border-slate-100'}`}>
                  {activeSubjectProgress === 100 && (
                    <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-l from-green-400 to-emerald-500 shadow-[0_0_15px_rgba(52,211,153,0.8)]"></div>
                  )}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 relative z-10">
                    <div className="w-full md:w-1/2">
                      <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">{activeSubject.name}</h2>
                      <div className={`w-full rounded-full h-4 mb-3 overflow-hidden border shadow-inner ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                        <div className={`h-full rounded-full transition-all duration-1000 ease-out ${activeSubjectProgress === 100 ? 'bg-gradient-to-l from-green-400 to-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-gradient-to-l from-indigo-500 to-purple-500'}`} style={{ width: `${activeSubjectProgress}%` }}></div>
                      </div>
                      <div className={`flex flex-wrap gap-4 text-sm font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-lg ${activeSubjectProgress === 100 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700'}`}><CheckCircle size={16} className={activeSubjectProgress === 100 ? 'text-green-600 dark:text-green-400' : ''}/> إنجاز: {activeSubjectProgress}%</span>
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-700"><BookOpen size={16} className="text-indigo-500"/> {activeSubject.lectures.length} محاضرات</span>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2 shrink-0">
                      <form onSubmit={addLecture} className="flex flex-1 sm:flex-none gap-2 relative">
                        <textarea ref={lectureInputRef} rows={1} placeholder="أضف محاضرة أو الصق عدة أسماء..." className={`flex-1 sm:w-64 lg:w-80 rounded-2xl pl-16 pr-5 py-3.5 text-sm font-bold focus:outline-none focus:ring-4 resize-none overflow-hidden transition-all shadow-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:ring-indigo-500/30' : 'bg-white border-slate-200 text-slate-800 focus:ring-indigo-200 border-2'}`} value={newLectureName} onChange={(e) => setNewLectureName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addLecture(e); } }} />
                        <button type="submit" title="أضف المحاضرة" className="absolute left-2 top-2 bottom-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 rounded-xl hover:from-green-600 hover:to-emerald-700 transition shadow-md flex items-center justify-center"><Plus size={20} strokeWidth={3} /></button>
                      </form>
                    </div>
                  </div>
                </div>

                {/* Lectures List */}
                {activeSubject.lectures.length > 0 ? (
                  <>
                    {/* Mobile View */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
                      {activeSubject.lectures.map(lecture => {
                        const isDone = isFullyCompleted(lecture);
                        return (
                          <div key={lecture.id} className={`border-2 rounded-3xl p-5 transition-all duration-300 shadow-sm ${isDone ? (darkMode ? 'border-green-500/30 bg-gradient-to-b from-green-900/10 to-transparent' : 'border-green-400/50 bg-gradient-to-b from-green-50/50 to-transparent') : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100')}`}>
                            <div className={`flex justify-between items-start mb-5 border-b pb-4 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                              {editingLectureId === lecture.id ? (
                                <div className="flex items-center gap-2 w-full">
                                  <input type="text" className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold outline-none border-2 focus:border-indigo-500 ${darkMode ? 'bg-slate-900 text-white border-slate-600' : 'bg-slate-50 border-indigo-200'}`} value={editingLectureName} onChange={(e) => setEditingLectureName(e.target.value)} autoFocus />
                                  <button onClick={() => saveEditLecture(activeSubject.id, lecture.id)} className="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 p-2 rounded-lg"><Save size={18} /></button>
                                  <button onClick={() => setEditingLectureId(null)} className="bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300 p-2 rounded-lg"><X size={18} /></button>
                                </div>
                              ) : (
                                <>
                                  <h3 className={`font-black text-lg pr-1 leading-snug ${isDone ? (darkMode ? 'text-green-400 opacity-80' : 'text-green-600') : (darkMode ? 'text-slate-100' : 'text-slate-800')}`}>
                                    {isDone && <CheckCircle size={18} className="inline mr-2 -mt-1 text-green-500" />}
                                    {lecture.name}
                                  </h3>
                                  <div className={`flex gap-1 rounded-xl p-1 border shrink-0 bg-slate-50 dark:bg-slate-900/50 ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
                                    <button onClick={() => { setEditingLectureId(lecture.id); setEditingLectureName(lecture.name); }} className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"><Pencil size={16} /></button>
                                    <button onClick={() => deleteLecture(activeSubject.id, lecture.id)} className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition"><Trash size={16} /></button>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-5">
                              {taskDefinitions.map((task) => (
                                <label key={task.key} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${lecture[task.key] ? (darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200') : (darkMode ? 'border-slate-700 hover:border-slate-500 bg-slate-800/50' : 'border-slate-100 hover:border-indigo-200 bg-white')}`}>
                                  <div className="relative flex items-center justify-center shrink-0">
                                    <input type="checkbox" className="peer sr-only" checked={lecture[task.key]} onChange={() => toggleLectureTask(activeSubject.id, lecture.id, task.key)} />
                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${lecture[task.key] ? task.bgChecked : (darkMode ? 'bg-slate-900 border-slate-500' : 'bg-white border-slate-300')}`}>
                                      {lecture[task.key] && <Check size={14} className="text-white" strokeWidth={4} />}
                                    </div>
                                  </div>
                                  <span className={`text-sm font-bold ${lecture[task.key] ? (darkMode ? 'text-slate-500 line-through' : 'text-slate-400 line-through') : (darkMode ? 'text-slate-300' : 'text-slate-700')}`}>{task.label}</span>
                                </label>
                              ))}
                            </div>
                            <div className={`flex items-center justify-between p-4 rounded-2xl border-2 ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                              <span className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}><Clock size={18} className="text-indigo-500"/> المراجعات</span>
                              <div className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl p-1 border shadow-sm dark:border-slate-600">
                                <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition">-</button>
                                <span className="w-6 text-center font-black text-lg text-indigo-600 dark:text-indigo-400">{lecture.reviewCount}</span>
                                <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-xl font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-800 transition">+</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop View */}
                    <div className={`hidden lg:block rounded-3xl border shadow-xl overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-right border-collapse min-w-[900px]">
                          <thead>
                            <tr className={`text-sm border-b-2 ${darkMode ? 'bg-slate-900/50 text-slate-300 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              <th className="p-5 font-black text-base w-[28%]">اسم المحاضرة</th>
                              {taskDefinitions.map(task => <th key={task.key} className="p-4 font-bold text-center text-xs tracking-wider uppercase opacity-80">{task.label}</th>)}
                              <th className="p-4 font-bold text-center w-32 text-xs tracking-wider uppercase opacity-80">المراجعات</th>
                              <th className="p-4 font-bold text-center w-24 text-xs tracking-wider uppercase opacity-80">إدارة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeSubject.lectures.map((lecture) => {
                              const isDone = isFullyCompleted(lecture);
                              return (
                                <tr key={lecture.id} className={`border-b transition-colors duration-300 ${isDone ? (darkMode ? 'bg-green-900/10 border-slate-700' : 'bg-green-50/50 border-slate-100') : (darkMode ? 'hover:bg-slate-700/30 border-slate-700' : 'hover:bg-slate-50 border-slate-100')}`}>
                                  <td className="p-5">
                                    {editingLectureId === lecture.id ? (
                                      <div className="flex items-center gap-2">
                                        <input type="text" className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold outline-none border-2 focus:border-indigo-500 ${darkMode ? 'bg-slate-900 text-white border-slate-600' : 'bg-white border-indigo-200'}`} value={editingLectureName} onChange={(e) => setEditingLectureName(e.target.value)} autoFocus />
                                        <button onClick={() => saveEditLecture(activeSubject.id, lecture.id)} className="bg-green-100 text-green-700 p-2 rounded-lg shadow-sm"><Save size={16} /></button>
                                        <button onClick={() => setEditingLectureId(null)} className="bg-slate-100 text-slate-600 p-2 rounded-lg shadow-sm"><X size={16} /></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${isDone ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-indigo-400'}`}></div>
                                        <span className={`font-black text-[15px] truncate max-w-[200px] ${isDone ? (darkMode ? 'text-slate-500 line-through decoration-2 decoration-green-500/50' : 'text-slate-400 line-through decoration-2 decoration-green-500/50') : (darkMode ? 'text-slate-200' : 'text-slate-800')}`}>{lecture.name}</span>
                                      </div>
                                    )}
                                  </td>
                                  
                                  {taskDefinitions.map((task) => (
                                    <td key={task.key} className="p-4 text-center align-middle">
                                      <label className="inline-flex items-center justify-center cursor-pointer w-full h-full group">
                                        <input type="checkbox" className="peer sr-only" checked={lecture[task.key]} onChange={() => toggleLectureTask(activeSubject.id, lecture.id, task.key)} />
                                        <div className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all transform group-hover:scale-110 shadow-sm ${lecture[task.key] ? task.bgChecked : (darkMode ? 'bg-slate-800 border-slate-500 group-hover:border-indigo-400' : 'bg-white border-slate-300 group-hover:border-indigo-300')}`}>
                                          {lecture[task.key] && <Check size={16} className="text-white drop-shadow-md" strokeWidth={4} />}
                                        </div>
                                      </label>
                                    </td>
                                  ))}

                                  <td className="p-4 text-center">
                                    <div className={`inline-flex items-center justify-center gap-1 rounded-xl p-1 border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                                      <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, true)} className={`w-7 h-7 rounded-lg flex items-center justify-center text-xl font-bold transition ${darkMode ? 'bg-slate-800 text-indigo-400 hover:bg-indigo-900/50' : 'bg-white text-indigo-600 hover:bg-indigo-50 shadow-sm'}`}>+</button>
                                      <span className={`w-6 text-center font-black text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{lecture.reviewCount}</span>
                                      <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, false)} className={`w-7 h-7 rounded-lg flex items-center justify-center text-xl font-bold transition ${darkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-white text-slate-500 hover:bg-slate-50 shadow-sm'}`}>-</button>
                                    </div>
                                  </td>

                                  <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <button onClick={() => { setEditingLectureId(lecture.id); setEditingLectureName(lecture.name); }} title="تعديل المحاضرة" className={`p-2 rounded-xl transition shadow-sm ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-indigo-600 hover:text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'}`}><Pencil size={16} /></button>
                                      <button onClick={() => deleteLecture(activeSubject.id, lecture.id)} title="حذف المحاضرة" className={`p-2 rounded-xl transition shadow-sm ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-red-600 hover:text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'}`}><Trash size={16} /></button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={`text-center py-20 rounded-3xl border-2 border-dashed transition-colors ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-100'}`}>
                      <BookOpen size={40} className={darkMode ? 'text-indigo-500/50' : 'text-indigo-300'} />
                    </div>
                    <h3 className="text-2xl font-black mb-2">رحلة الألف ميل تبدأ بخطوة!</h3>
                    <p className="text-base mb-8 max-w-md mx-auto opacity-70 font-medium">ابدأ بإضافة المحاضرات المتراكمة لتتمكن من تنظيم مهامك ومتابعة تقدمك في هذه المادة.</p>
                    <button onClick={() => lectureInputRef.current?.focus()} className="px-8 py-3.5 rounded-2xl font-black transition-all shadow-lg hover:shadow-indigo-500/30 transform hover:-translate-y-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">إضافة أول محاضرة الآن</button>
                  </div>
                )}
              </div>
            ) : (
              <div className={`h-full flex items-center justify-center rounded-3xl p-12 border min-h-[60vh] transition-colors ${darkMode ? 'bg-slate-800/50 border-slate-700 shadow-none' : 'bg-slate-50 border-slate-200 shadow-inner'}`}>
                <div className="text-center animate-in zoom-in duration-500">
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl ${darkMode ? 'bg-gradient-to-br from-indigo-900/50 to-purple-900/50 border border-indigo-500/30' : 'bg-gradient-to-br from-indigo-100 to-purple-100 border border-indigo-200'}`}>
                    <List size={56} className={darkMode ? 'text-indigo-400' : 'text-indigo-600'} />
                  </div>
                  <h2 className="text-4xl font-black mb-4 tracking-tight">أهلاً بك يا بطل! 👋</h2>
                  <p className="max-w-md mx-auto opacity-70 text-lg font-medium leading-relaxed">قم باختيار مادة من القائمة الجانبية أو أضف مادة دراسية جديدة للبدء في تنظيم وقتك ولم المنهج بنجاح.</p>
                </div>
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
