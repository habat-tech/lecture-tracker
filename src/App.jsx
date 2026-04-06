import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash, BookOpen, Check, Cloud, 
  Loader2, Pencil, X, Save, CheckCircle, Clock, List, Moon, Sun,
  LogOut, Shield, Users, Calendar, Timer, Play, Pause, RotateCcw, 
  Settings, BarChart, Coffee, Brain, Trophy, Download, Target,
  RefreshCw, UserCheck, UserX
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
      alert('لتثبيت التطبيق على الآيفون 📱:\n1. اضغط على زر المشاركة (Share) في المتصفح أسفل الشاشة.\n2. اختر "إضافة للشاشة الرئيسية".');
    } else {
      alert('التطبيق مثبت بالفعل، أو المتصفح لا يدعم التثبيت المباشر.');
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
    } catch (error) { alert(`خطأ: ${error.message}`); }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSubjects([]); setStats([]); setActiveSubjectId(null);
      setCurrentView('tracker'); setIsActive(false); setIsAdmin(false);
    } catch (error) { console.error(error); }
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
    setIsSyncing(true); setTimeout(() => setIsSyncing(false), 1000);
    saveDataAndSync(subjects, stats);
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
      if (updatedStats.length % 4 === 0) setTimerMode('longBreak');
      else setTimerMode('shortBreak');
    } else setTimerMode('work');
  };

  const toggleTimer = () => {
    if (timerMode === 'work' && !selectedSubjectForTimer && !isActive && subjects.length > 0) {
      alert("يفضل اختيار المادة لتسجيلها بدقة في إحصائياتك!");
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
  };

  const deleteSubject = (id) => {
    if (window.confirm("حذف المادة بكافة محاضراتها؟")) {
      const updatedSubjects = subjects.filter(sub => sub.id !== id);
      saveDataAndSync(updatedSubjects, stats);
      if (activeSubjectId === id) setActiveSubjectId(updatedSubjects.length > 0 ? updatedSubjects[0].id : null);
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
    const namesArray = newLectureName.split('\n').flatMap(n => n.split(',')).map(n => n.trim()).filter(n => n.length > 0);
    const newLectures = namesArray.map((name, index) => ({
      id: Date.now() + index, name: name, studied: false, listenedRecord: false, transcribed: false,
      createdQuestions: false, solvedOwnQuestions: false, solvedNewQuestions: false, reviewCount: 0
    }));
    saveDataAndSync(subjects.map(sub => sub.id === activeSubjectId ? { ...sub, lectures: [...sub.lectures, ...newLectures] } : sub), stats);
    setNewLectureName('');
  };

  const deleteLecture = (subId, lecId) => {
    if (window.confirm("حذف المحاضرة؟")) {
      saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.filter(l => l.id !== lecId) } : sub), stats);
    }
  };

  const saveEditLecture = (subId, lecId) => {
    if (!editingLectureName.trim()) return setEditingLectureId(null);
    saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.map(l => l.id === lecId ? { ...l, name: editingLectureName } : l) } : sub), stats);
    setEditingLectureId(null);
  };

  const toggleLectureTask = (subId, lecId, key) => {
    saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.map(l => l.id === lecId ? { ...l, [key]: !l[key] } : l) } : sub), stats);
  };

  const updateReviewCount = (subId, lecId, inc) => {
    saveDataAndSync(subjects.map(sub => sub.id === subId ? { ...sub, lectures: sub.lectures.map(l => l.id === lecId ? { ...l, reviewCount: inc ? l.reviewCount + 1 : Math.max(0, l.reviewCount - 1) } : l) } : sub), stats);
  };

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

  // تعريف المتغيرات للاستخدام في JSX بشكل آمن وتخزينها لتحسين الأداء
  const activeSubject = subjects.find(s => s.id === activeSubjectId);
  const activeSubjectProgress = getProgress(activeSubject);
  
  const allStudy = calculateStudyTime('all');
  const dayStudy = calculateStudyTime('day');
  const weekStudy = calculateStudyTime('week');
  const monthStudy = calculateStudyTime('month');
  const myRank = getUserRank(allStudy.totalSeconds);

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
    if (userEmail === ADMIN_EMAIL) return alert("لا يمكنك حذف المالك!");
    if (window.confirm(`حذف "${userName}"؟`)) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'usersList', userId));
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'trackerData', 'main'));
      } catch (error) { alert('حدث خطأ.'); }
    }
  };

  const toggleAdminRole = async (targetUserId, currentRole, targetEmail) => {
    if (targetEmail === ADMIN_EMAIL) return alert("هذا المالك الأساسي!");
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (window.confirm(`تغيير الصلاحيات؟`)) {
      try { await setDoc(doc(db, 'artifacts', appId, 'usersList', targetUserId), { role: newRole }, { merge: true }); } 
      catch (error) { console.error(error); }
    }
  };

  // ==========================================
  // Render
  // ==========================================

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={48} /></div>;

  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
        <div className="absolute top-6 left-6 flex gap-2">
          <button onClick={handleInstallClick} title="تثبيت التطبيق" className={`p-3 rounded-full transition-colors ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800' : 'bg-white text-indigo-600 shadow-md hover:bg-slate-100'}`}><Download size={24} /></button>
          <button onClick={() => setDarkMode(!darkMode)} title="تغيير المظهر" className={`p-3 rounded-full transition-colors ${darkMode ? 'bg-slate-800 text-yellow-300' : 'bg-white text-indigo-600 shadow-md'}`}>{darkMode ? <Sun size={24} /> : <Moon size={24} />}</button>
        </div>
        <div className={`w-full max-w-md p-8 rounded-3xl shadow-xl text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
          <BookOpen size={48} className="mx-auto mb-6 text-indigo-500" />
          <h1 className="text-3xl font-bold mb-8">لمّ المنهج</h1>
          <button onClick={handleGoogleLogin} className="w-full py-3 px-4 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition">سجل دخولك بواسطة جوجل</button>
        </div>
      </div>
    );
  }

  if (!isLoaded && currentView === 'tracker') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-slate-900 text-indigo-400' : 'bg-slate-50 text-indigo-600'}`} dir="rtl">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="font-bold">جاري تحميل بياناتك...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans pb-24 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
      {/* Header */}
      <header className={`${darkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-gradient-to-r from-indigo-700 to-indigo-500 shadow-md'} text-white p-3 sticky top-0 z-50`}>
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('tracker')}>
              <BookOpen size={24} className={darkMode ? 'text-indigo-400' : 'text-white'} />
              <h1 className="text-xl font-bold">لمّ المنهج</h1>
            </div>
            
            <div className="flex gap-2 bg-black/10 rounded-xl p-1 backdrop-blur-sm">
              <button onClick={() => setCurrentView('tracker')} title="المتعقب" className={`p-2 rounded-lg transition ${currentView === 'tracker' ? 'bg-white text-indigo-600' : 'hover:bg-white/20'}`}><List size={18} /></button>
              <button onClick={() => setCurrentView('pomodoro')} title="المؤقت" className={`p-2 rounded-lg transition ${currentView === 'pomodoro' ? 'bg-white text-indigo-600' : 'hover:bg-white/20'}`}><Timer size={18} /></button>
              <button onClick={() => setCurrentView('leaderboard')} title="لوحة الشرف" className={`p-2 rounded-lg transition ${currentView === 'leaderboard' ? 'bg-amber-400 text-slate-900' : 'hover:bg-white/20'}`}><Trophy size={18} /></button>
              {isAdmin && <button onClick={() => setCurrentView('admin')} title="لوحة التحكم" className={`p-2 rounded-lg transition ${currentView === 'admin' ? 'bg-red-500 text-white' : 'hover:bg-white/20'}`}><Shield size={18} /></button>}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button onClick={handleInstallClick} title="تثبيت التطبيق" className={`hidden sm:flex p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-indigo-800/50 hover:bg-indigo-800'}`}><Download size={18} /></button>
            {currentView === 'tracker' && (
              <div className="flex items-center gap-1">
                <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm ${darkMode ? 'bg-slate-700' : 'bg-indigo-900/30'}`}>
                  {isSyncing ? <><Loader2 size={14} className="animate-spin" /> <span>جاري الحفظ...</span></> : <><Cloud size={14} className="text-green-400" /> <span>تم الحفظ</span></>}
                </div>
                <button onClick={forceManualSync} title="تحديث يدوي" className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-green-400' : 'bg-indigo-800/50 text-green-300'}`}><RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /></button>
              </div>
            )}
            <button onClick={() => setDarkMode(!darkMode)} title="تغيير المظهر" className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-yellow-300' : 'bg-indigo-800/50 text-indigo-100'}`}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="h-6 w-px bg-white/20 mx-1"></div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-black/20 rounded-full pr-1 pl-3 py-1">
                <img src={user.photoURL || 'https://via.placeholder.com/150'} alt="profile" className="w-8 h-8 rounded-full object-cover border border-white/30" />
                <div className="hidden lg:flex flex-col">
                  <span className="text-sm font-medium truncate max-w-[120px] leading-tight">{user.displayName || 'مستخدم'}</span>
                  <span className={`text-[10px] font-bold ${myRank.color}`}>{myRank.icon} {myRank.name}</span>
                </div>
              </div>
              <button onClick={handleLogout} title="تسجيل الخروج" className="p-2 rounded-full bg-red-500/20 text-red-200 hover:bg-red-500 transition-colors"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </header>

      {/* Views */}
      {currentView === 'pomodoro' && (
        <main className="container mx-auto p-4 mt-6 max-w-5xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}><Timer className="text-indigo-500" size={32} /> مؤقت المذاكرة</h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            
            {/* بطاقة المؤقت */}
            <div className={`rounded-3xl p-8 border shadow-sm flex flex-col items-center justify-center relative overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className={`flex p-1 mb-8 rounded-xl border w-full max-w-sm z-10 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                <button onClick={() => { setTimerMode('work'); setIsActive(false); }} className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'work' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}><Brain size={16}/> تركيز</button>
                <button onClick={() => { setTimerMode('shortBreak'); setIsActive(false); }} className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'shortBreak' ? 'bg-green-500 text-white shadow-sm' : 'text-slate-500'}`}><Coffee size={16}/> بريك قصير</button>
                <button onClick={() => { setTimerMode('longBreak'); setIsActive(false); }} className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'longBreak' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-500'}`}><Coffee size={16}/> بريك طويل</button>
              </div>
              
              <div className="relative w-64 h-64 flex items-center justify-center mb-8 z-10 drop-shadow-2xl">
                <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90">
                  <circle cx="50%" cy="50%" r="48%" fill="none" strokeWidth="8" className={`${darkMode ? 'stroke-slate-700' : 'stroke-slate-100'}`} />
                  <circle cx="50%" cy="50%" r="48%" fill="none" strokeWidth="8" strokeLinecap="round" className={`transition-all duration-1000 ease-linear ${timerMode === 'work' ? 'stroke-indigo-500' : timerMode === 'shortBreak' ? 'stroke-green-500' : 'stroke-blue-500'}`} strokeDasharray="150" strokeDashoffset="0" />
                </svg>
                <div className="text-center">
                  <span className={`text-6xl font-black font-mono block drop-shadow-md ${timerMode === 'work' ? 'text-indigo-500' : timerMode === 'shortBreak' ? 'text-green-500' : 'text-blue-500'}`}>{formatTimerDisplay(timeLeft)}</span>
                  <span className="text-sm font-bold uppercase tracking-widest mt-2 block opacity-70">{timerMode === 'work' ? 'وقت التركيز' : 'وقت الراحة'}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 z-10">
                <button onClick={resetTimer} title="إعادة تعيين" className={`w-14 h-14 rounded-full flex items-center justify-center transition border-2 ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><RotateCcw size={24} /></button>
                <button onClick={toggleTimer} title="تشغيل / إيقاف" className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition transform hover:scale-105 ${isActive ? 'bg-red-500 text-white' : (timerMode === 'work' ? 'bg-indigo-600 text-white shadow-indigo-500/50' : timerMode === 'shortBreak' ? 'bg-green-500 text-white shadow-green-500/50' : 'bg-blue-500 text-white shadow-blue-500/50')}`}>{isActive ? <Pause size={32} /> : <Play size={32} className="ml-2" />}</button>
                <button onClick={() => setShowTimerSettings(!showTimerSettings)} title="الإعدادات" className={`w-14 h-14 rounded-full flex items-center justify-center transition border-2 ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Settings size={24} /></button>
              </div>

              {timerMode === 'work' && (
                <div className="mt-8 w-full max-w-sm z-10 flex flex-col gap-3 animate-in fade-in">
                  <select value={selectedSubjectForTimer} onChange={(e) => { setSelectedSubjectForTimer(e.target.value); setSelectedLectureForTimer(''); }} className={`w-full rounded-xl px-4 py-3 outline-none focus:ring-2 border font-bold ${darkMode ? 'bg-slate-700 text-white border-slate-600 focus:ring-indigo-500' : 'bg-white border-slate-300 focus:ring-indigo-200'}`}>
                    <option value="">-- مذاكرة عامة (بدون تحديد مادة) --</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  
                  {/* اختيار المحاضرة */}
                  {selectedSubjectForTimer && subjects.find(s => s.id.toString() === selectedSubjectForTimer.toString())?.lectures.length > 0 && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                      <select value={selectedLectureForTimer} onChange={(e) => setSelectedLectureForTimer(e.target.value)} className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border ${darkMode ? 'bg-indigo-900/30 text-indigo-300 border-indigo-700' : 'bg-indigo-50 text-indigo-800 border-indigo-200'}`}>
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
                <div className={`rounded-3xl p-6 border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Settings size={20}/> إعدادات الأوقات (بالدقائق)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className="block text-xs font-bold mb-1 text-indigo-500">التركيز</label><input type="number" min="1" max="120" value={pomodoroSettings.work} onChange={(e) => setPomodoroSettings({...pomodoroSettings, work: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2 text-center font-bold outline-none border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                    <div><label className="block text-xs font-bold mb-1 text-green-500">بريك قصير</label><input type="number" min="1" max="30" value={pomodoroSettings.shortBreak} onChange={(e) => setPomodoroSettings({...pomodoroSettings, shortBreak: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2 text-center font-bold outline-none border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                    <div><label className="block text-xs font-bold mb-1 text-blue-500">بريك طويل</label><input type="number" min="1" max="60" value={pomodoroSettings.longBreak} onChange={(e) => setPomodoroSettings({...pomodoroSettings, longBreak: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2 text-center font-bold outline-none border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                  </div>
                </div>
              )}
              
              <div className={`rounded-3xl p-6 border shadow-sm flex-1 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <h3 className="text-xl font-bold flex items-center gap-2 pb-3 border-b mb-6 dark:border-slate-700"><BarChart className="text-indigo-500" size={24}/> إحصائيات المذاكرة والتركيز</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {/* إحصائية عدد الجلسات */}
                  <div className={`col-span-1 sm:col-span-2 p-5 rounded-2xl border flex items-center justify-between shadow-sm ${darkMode ? 'bg-orange-900/20 border-orange-500/30' : 'bg-orange-50 border-orange-100'}`}>
                    <div>
                      <span className="block text-sm font-bold mb-1 text-orange-500">إجمالي عدد الجلسات (البومودورو)</span>
                      <span className="text-2xl font-black">{stats.length} <span className="text-sm font-bold opacity-70">جلسة مكتملة</span></span>
                    </div>
                    <Target className="text-orange-500 drop-shadow-md" size={36} />
                  </div>

                  <div className={`p-5 rounded-2xl border flex items-center justify-between shadow-sm ${darkMode ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-indigo-50 border-indigo-100'}`}>
                    <div><span className="block text-sm font-bold mb-1 text-indigo-500">مذاكرة اليوم</span><span className="text-2xl font-black">{dayStudy.hours} <span className="text-sm font-medium">س</span> و {dayStudy.minutes} <span className="text-sm font-medium">د</span></span></div>
                    <Clock className="text-indigo-500 drop-shadow-md" size={32} />
                  </div>
                  
                  <div className={`p-5 rounded-2xl border flex items-center justify-between shadow-sm ${darkMode ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-100'}`}>
                    <div><span className="block text-sm font-bold mb-1 text-green-500">هذا الأسبوع</span><span className="text-2xl font-black">{weekStudy.hours} <span className="text-sm font-medium">س</span> و {weekStudy.minutes} <span className="text-sm font-medium">د</span></span></div>
                    <Calendar className="text-green-500 drop-shadow-md" size={32} />
                  </div>
                  
                  <div className={`col-span-1 sm:col-span-2 p-5 rounded-2xl border flex items-center justify-between shadow-sm ${darkMode ? 'bg-purple-900/20 border-purple-500/30' : 'bg-purple-50 border-purple-100'}`}>
                    <div><span className="block text-sm font-bold mb-1 text-purple-500">حصاد هذا الشهر</span><span className="text-2xl font-black">{monthStudy.hours} <span className="text-sm font-medium">ساعة</span> و {monthStudy.minutes} <span className="text-sm font-medium">دقيقة</span></span></div>
                    <BarChart className="text-purple-500 drop-shadow-md" size={32} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {currentView === 'leaderboard' && (
        <main className="container mx-auto p-4 mt-6 max-w-4xl">
          <div className="mb-8">
            <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-yellow-400' : 'text-amber-600'}`}><Trophy size={36} /> لوحة الشرف لأبطال الدفعة</h2>
            <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>تنافس مع زملائك وكن من الأوائل! الترتيب مبني على إجمالي ساعات المذاكرة.</p>
          </div>
          {loadingUsers ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-500" size={48} /></div> : (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row justify-center items-end gap-4 md:gap-8 mb-12 mt-8">
                {usersList[1] && (
                  <div className="flex flex-col items-center order-2 md:order-1 transform md:translate-y-8">
                    <div className="relative"><img src={usersList[1].photoURL || 'https://via.placeholder.com/150'} alt="2nd" className="w-20 h-20 rounded-full border-4 border-slate-300 object-cover shadow-lg" /><div className="absolute -bottom-3 -right-3 bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm text-slate-800">2</div></div>
                    <span className="font-bold mt-4">{(usersList[1].name || 'مستخدم').split(' ')[0]}</span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-full mt-1">🥈 {Math.floor((usersList[1].totalStudyTime || 0) / 3600)} ساعة</span>
                  </div>
                )}
                {usersList[0] && (
                  <div className="flex flex-col items-center order-1 md:order-2 z-10">
                    <div className="relative"><Trophy size={32} className="absolute -top-10 left-1/2 transform -translate-x-1/2 text-yellow-400 animate-bounce" /><img src={usersList[0].photoURL || 'https://via.placeholder.com/150'} alt="1st" className="w-28 h-28 rounded-full border-4 border-yellow-400 object-cover shadow-xl shadow-yellow-500/20" /><div className="absolute -bottom-4 -right-2 bg-yellow-400 text-yellow-900 w-10 h-10 rounded-full flex items-center justify-center font-black border-2 border-white shadow-md text-lg">1</div></div>
                    <span className={`font-black text-xl mt-5 ${darkMode ? 'text-yellow-400' : 'text-amber-600'}`}>{(usersList[0].name || 'مستخدم').split(' ')[0]}</span>
                    <span className="text-sm font-bold bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full mt-1">🥇 {Math.floor((usersList[0].totalStudyTime || 0) / 3600)} ساعة</span>
                  </div>
                )}
                {usersList[2] && (
                  <div className="flex flex-col items-center order-3 transform md:translate-y-12">
                    <div className="relative"><img src={usersList[2].photoURL || 'https://via.placeholder.com/150'} alt="3rd" className="w-16 h-16 rounded-full border-4 border-amber-700/50 object-cover shadow-md" /><div className="absolute -bottom-2 -right-2 bg-amber-700/50 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs border-2 border-white">3</div></div>
                    <span className="font-bold mt-3 text-sm">{(usersList[2].name || 'مستخدم').split(' ')[0]}</span>
                    <span className="text-[10px] text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded-full mt-1">🥉 {Math.floor((usersList[2].totalStudyTime || 0) / 3600)} س</span>
                  </div>
                )}
              </div>
              <div className={`rounded-3xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                {usersList.slice(3).map((u, idx) => {
                  const rnk = getUserRank(u.totalStudyTime || 0);
                  return (
                    <div key={u.id} className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'} ${u.id === user?.uid ? (darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50') : ''}`}>
                      <div className="flex items-center gap-4">
                        <span className="font-bold w-6 text-center opacity-50">{idx + 4}</span>
                        <img src={u.photoURL || 'https://via.placeholder.com/150'} alt="user" className="w-10 h-10 rounded-full object-cover" />
                        <div>
                          <h4 className="font-bold flex items-center gap-2">{u.name} {u.id === user?.uid && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">أنت</span>}</h4>
                          <span className={`text-xs font-bold ${rnk.color}`}>{rnk.icon} {rnk.name}</span>
                        </div>
                      </div>
                      <div className="text-left">
                        <span className="block font-black text-lg">{Math.floor((u.totalStudyTime || 0) / 3600)}</span>
                        <span className="text-[10px] font-bold opacity-50">ساعة</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      )}

      {currentView === 'admin' && isAdmin && (
        <main className="container mx-auto p-4 mt-6">
          <div className={`rounded-3xl p-6 md:p-8 border shadow-sm mb-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 mb-8 border-b pb-4 dark:border-slate-700">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl"><Shield size={32} /></div>
              <div><h2 className="text-2xl font-bold">لوحة تحكم المدير</h2></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className={`p-6 rounded-2xl border flex flex-col items-center text-center ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-indigo-50 border-indigo-100'}`}>
                <Users size={32} className="text-indigo-500 mb-2" />
                <span className="text-3xl font-bold text-indigo-500">{usersList.length}</span>
                <span className="text-sm font-medium">الطلاب المسجلين</span>
              </div>
            </div>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Users size={20}/> إدارة الطلاب</h3>
            {loadingUsers ? <Loader2 className="animate-spin text-indigo-500 mx-auto" size={40} /> : (
              <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className={`text-sm ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                        <th className="p-4">الطالب</th><th className="p-4">الدور</th><th className="p-4 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((u) => {
                        const isSuper = u.email === ADMIN_EMAIL;
                        const isAdm = isSuper || u.role === 'admin';
                        return (
                        <tr key={u.id} className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                          <td className="p-4 flex items-center gap-3"><img src={u.photoURL || 'https://via.placeholder.com/150'} alt="Avatar" className="w-8 h-8 rounded-full" /><span className="font-bold">{u.name}</span></td>
                          <td className="p-4">{isSuper ? 'مالك' : isAdm ? 'أدمن' : 'مستخدم'}</td>
                          <td className="p-4 flex justify-center gap-2">
                            <button onClick={() => toggleAdminRole(u.id, u.role, u.email)} title="تبديل الصلاحيات" className="p-2 rounded-lg bg-indigo-100 text-indigo-600 hover:bg-indigo-200"><UserCheck size={18} /></button>
                            <button onClick={() => adminDeleteUser(u.id, u.name, u.email)} title="حذف المستخدم" className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"><Trash size={18} /></button>
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
        <main className="container mx-auto p-4 flex flex-col lg:flex-row gap-6 mt-6">
          {/* Sidebar */}
          <aside className={`w-full lg:w-1/4 rounded-2xl p-4 border h-fit sticky top-24 ${darkMode ? 'bg-slate-800 border-slate-700 shadow-none' : 'bg-white border-slate-200 shadow-sm'}`}>
            <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 border-b pb-3 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}><List size={20} className="text-indigo-500"/> المواد الدراسية</h2>
            <form onSubmit={addSubject} className="mb-4 flex gap-2">
              <input type="text" placeholder="اسم المادة..." className={`flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`} value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} />
              <button type="submit" title="إضافة مادة" className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition"><Plus size={20} /></button>
            </form>
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              {subjects.map(subject => (
                <li key={subject.id} className="group relative">
                  {editingSubjectId === subject.id ? (
                    <div className={`flex items-center gap-2 p-2 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-indigo-50 border-indigo-200'}`}>
                      <input type="text" className={`flex-1 rounded px-2 py-1 text-sm outline-none ${darkMode ? 'bg-slate-600 text-white' : 'bg-white'}`} value={editingSubjectName} onChange={(e) => setEditingSubjectName(e.target.value)} autoFocus />
                      <button onClick={() => saveEditSubject(subject.id)} title="حفظ" className="text-green-500"><Save size={18} /></button>
                      <button onClick={() => setEditingSubjectId(null)} title="إلغاء" className="text-slate-400"><X size={18} /></button>
                    </div>
                  ) : (
                    <div className={`flex items-center justify-between transition-all rounded-xl overflow-hidden border ${activeSubjectId === subject.id ? (darkMode ? 'border-indigo-500/50 bg-indigo-900/30' : 'border-indigo-200 bg-indigo-50/50') : (darkMode ? 'border-transparent hover:border-slate-600 hover:bg-slate-700' : 'border-transparent hover:border-slate-200 hover:bg-slate-50')}`}>
                      <button onClick={() => setActiveSubjectId(subject.id)} className="flex-1 text-right px-3 py-3 relative">
                        <div className={`absolute top-0 right-0 h-full transition-all duration-500 -z-10 ${darkMode ? 'bg-indigo-900/40' : 'bg-indigo-100/60'}`} style={{ width: `${getProgress(subject)}%` }}></div>
                        <div className="flex justify-between items-center z-10 relative">
                          <span className={`font-medium ${activeSubjectId === subject.id ? (darkMode ? 'text-indigo-300 font-bold' : 'text-indigo-800 font-bold') : ''}`}>{subject.name}</span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border backdrop-blur-sm ${darkMode ? 'text-indigo-300 bg-slate-800/80 border-slate-600' : 'text-indigo-700 bg-white/80 border-indigo-100'}`}>{getProgress(subject)}%</span>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingSubjectId(subject.id); setEditingSubjectName(subject.name); }} title="تعديل المادة" className="p-1.5 text-slate-400 hover:text-indigo-500"><Pencil size={14} /></button>
                        <button onClick={() => deleteSubject(subject.id)} title="حذف المادة" className="p-1.5 text-slate-400 hover:text-red-500"><Trash size={14} /></button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {subjects.length === 0 && <p className="text-sm text-center py-6 rounded-xl border border-dashed opacity-50">لا توجد مواد مضافة.</p>}
            </ul>
          </aside>

          {/* Main Content */}
          <section className="w-full lg:w-3/4">
            {activeSubject ? (
              <div className="space-y-6">
                {/* Header */}
                <div className={`rounded-2xl p-5 md:p-6 border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div className="w-full md:w-1/2">
                      <h2 className="text-2xl md:text-3xl font-bold mb-3">{activeSubject.name}</h2>
                      <div className={`w-full rounded-full h-3 mb-2 overflow-hidden border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                        <div className={`h-full rounded-full transition-all duration-1000 bg-gradient-to-l ${activeSubjectProgress === 100 ? 'from-green-400 to-green-600 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : 'from-indigo-500 to-purple-500'}`} style={{ width: `${activeSubjectProgress}%` }}></div>
                      </div>
                      <div className={`flex gap-4 text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span className="flex items-center gap-1"><CheckCircle size={14} className="text-green-500"/> إنجاز المادة: {activeSubjectProgress}%</span>
                        <span className="flex items-center gap-1"><BookOpen size={14} className={darkMode ? 'text-indigo-400' : 'text-indigo-500'}/> المحاضرات: {activeSubject.lectures.length}</span>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2 shrink-0">
                      <form onSubmit={addLecture} className="flex flex-1 sm:flex-none gap-2">
                        <textarea ref={lectureInputRef} rows={1} placeholder="اسم المحاضرة..." className={`flex-1 sm:w-48 lg:w-64 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 resize-none overflow-hidden ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`} value={newLectureName} onChange={(e) => setNewLectureName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addLecture(e); } }} />
                        <button type="submit" title="إضافة محاضرة" className="bg-green-600 text-white px-5 py-2 rounded-xl hover:bg-green-700"><Plus size={18} /></button>
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
                          <div key={lecture.id} className={`border rounded-2xl p-4 transition-all ${isDone ? (darkMode ? 'border-green-500/50 bg-green-900/20' : 'border-green-300 bg-green-50/30') : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')}`}>
                            <div className={`flex justify-between items-start mb-4 border-b pb-3 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                              {editingLectureId === lecture.id ? (
                                <div className="flex items-center gap-2 w-full">
                                  <input type="text" className={`flex-1 rounded-lg px-2 py-1 text-sm outline-none border ${darkMode ? 'bg-slate-700 text-white border-slate-500' : 'bg-white border-indigo-300'}`} value={editingLectureName} onChange={(e) => setEditingLectureName(e.target.value)} autoFocus />
                                  <button onClick={() => saveEditLecture(activeSubject.id, lecture.id)} title="حفظ" className="text-green-500 p-1"><Save size={18} /></button>
                                  <button onClick={() => setEditingLectureId(null)} title="إلغاء" className="text-slate-400 p-1"><X size={18} /></button>
                                </div>
                              ) : (
                                <>
                                  <h3 className={`font-bold text-lg pr-1 ${isDone ? 'line-through opacity-50' : ''}`}>{lecture.name}</h3>
                                  <div className={`flex gap-1 rounded-lg p-1 border shrink-0 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                                    <button onClick={() => { setEditingLectureId(lecture.id); setEditingLectureName(lecture.name); }} title="تعديل المحاضرة" className="p-1.5 text-slate-400 hover:text-indigo-500"><Pencil size={14} /></button>
                                    <button onClick={() => deleteLecture(activeSubject.id, lecture.id)} title="حذف المحاضرة" className="p-1.5 text-slate-400 hover:text-red-500"><Trash size={14} /></button>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-y-3 gap-x-2 mb-4">
                              {taskDefinitions.map((task) => (
                                <label key={task.key} className={`flex items-center gap-2 p-2 rounded-lg border border-transparent cursor-pointer transition ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}>
                                  <div className="relative flex items-center justify-center">
                                    <input type="checkbox" className="peer sr-only" checked={lecture[task.key]} onChange={() => toggleLectureTask(activeSubject.id, lecture.id, task.key)} />
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${darkMode ? 'bg-slate-700 border-slate-500' : 'bg-white border-slate-300'} ${task.bgChecked}`}>
                                      {lecture[task.key] && <Check size={14} className="text-white" strokeWidth={3} />}
                                    </div>
                                  </div>
                                  <span className={`text-sm font-medium ${lecture[task.key] ? 'line-through opacity-50' : ''}`}>{task.label}</span>
                                </label>
                              ))}
                            </div>
                            <div className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                              <span className="text-sm font-semibold flex items-center gap-2"><Clock size={16}/> المراجعات</span>
                              <div className="flex items-center gap-3">
                                <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, false)} title="تقليل المراجعات" className={`w-7 h-7 rounded-lg border flex items-center justify-center ${darkMode ? 'bg-slate-600 border-slate-500 text-slate-300' : 'bg-white shadow-sm text-slate-600'}`}>-</button>
                                <span className={`w-4 text-center font-bold ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>{lecture.reviewCount}</span>
                                <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, true)} title="زيادة المراجعات" className={`w-7 h-7 rounded-lg flex items-center justify-center ${darkMode ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>+</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop View */}
                    <div className={`hidden lg:block rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-right border-collapse min-w-[850px]">
                          <thead>
                            <tr className={`text-sm border-b ${darkMode ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                              <th className="p-4 font-semibold w-1/4">المحاضرة</th>
                              {taskDefinitions.map(task => <th key={task.key} className="p-3 font-semibold text-center">{task.label}</th>)}
                              <th className="p-3 font-semibold text-center w-24">مراجعات</th>
                              <th className="p-3 font-semibold text-center w-24">إجراء</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeSubject.lectures.map((lecture) => {
                              const isDone = isFullyCompleted(lecture);
                              return (
                                <tr key={lecture.id} className={`border-b transition duration-300 ${isDone ? (darkMode ? 'bg-green-900/20 border-slate-700' : 'bg-green-50/40 border-slate-100') : (darkMode ? 'hover:bg-slate-700/50 border-slate-700' : 'hover:bg-slate-50 border-slate-100')}`}>
                                  <td className="p-4 font-medium">
                                    {editingLectureId === lecture.id ? (
                                      <div className="flex items-center gap-2">
                                        <input type="text" className={`flex-1 rounded px-2 py-1 text-sm outline-none border ${darkMode ? 'bg-slate-700 text-white border-slate-500' : 'bg-white border-indigo-300'}`} value={editingLectureName} onChange={(e) => setEditingLectureName(e.target.value)} autoFocus />
                                        <button onClick={() => saveEditLecture(activeSubject.id, lecture.id)} title="حفظ" className="text-green-500"><Save size={16} /></button>
                                        <button onClick={() => setEditingLectureId(null)} title="إلغاء" className="text-slate-400"><X size={16} /></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        {isDone && <CheckCircle size={16} className="text-green-500 shrink-0" />}
                                        <span className={`truncate max-w-[180px] ${isDone ? 'line-through opacity-50' : ''}`}>{lecture.name}</span>
                                      </div>
                                    )}
                                  </td>
                                  {taskDefinitions.map((task) => (
                                    <td key={task.key} className="p-3 text-center">
                                      <label className="inline-flex items-center justify-center cursor-pointer w-full h-full">
                                        <input type="checkbox" className="peer sr-only" checked={lecture[task.key]} onChange={() => toggleLectureTask(activeSubject.id, lecture.id, task.key)} />
                                        <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${darkMode ? 'bg-slate-700 border-slate-500' : 'bg-white border-slate-300'} ${task.bgChecked}`}>
                                          {lecture[task.key] && <Check size={16} className="text-white" strokeWidth={3} />}
                                        </div>
                                      </label>
                                    </td>
                                  ))}
                                  <td className="p-3">
                                    <div className={`flex items-center justify-center gap-2 rounded-full p-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                                      <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, true)} title="زيادة المراجعات" className={`w-6 h-6 rounded-full flex items-center justify-center text-lg leading-none ${darkMode ? 'bg-slate-600 text-indigo-400' : 'bg-white shadow-sm text-indigo-600'}`}>+</button>
                                      <span className={`w-4 text-center font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{lecture.reviewCount}</span>
                                      <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, false)} title="تقليل المراجعات" className={`w-6 h-6 rounded-full flex items-center justify-center text-lg leading-none ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-white shadow-sm text-slate-500'}`}>-</button>
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div className="flex items-center justify-center gap-2">
                                      <button onClick={() => { setEditingLectureId(lecture.id); setEditingLectureName(lecture.name); }} title="تعديل المحاضرة" className={`p-1.5 rounded-lg ${darkMode ? 'text-slate-400 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'}`}><Pencil size={16} /></button>
                                      <button onClick={() => deleteLecture(activeSubject.id, lecture.id)} title="حذف المحاضرة" className={`p-1.5 rounded-lg ${darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-600'}`}><Trash size={16} /></button>
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
                  <div className={`text-center py-16 rounded-2xl border-2 border-dashed ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}><BookOpen size={32} className={darkMode ? 'text-indigo-400' : 'text-indigo-300'} /></div>
                    <h3 className="text-lg font-bold mb-1">لا توجد محاضرات هنا</h3>
                    <p className="text-sm mb-6 max-w-sm mx-auto opacity-70">ابدأ بإضافة المحاضرات المتراكمة لتتمكن من تنظيم مهامك ومتابعة تقدمك.</p>
                    <button onClick={() => lectureInputRef.current?.focus()} className={`px-6 py-2 rounded-xl font-medium transition ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/80' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>إضافة أول محاضرة</button>
                  </div>
                )}
              </div>
            ) : (
              <div className={`h-full flex items-center justify-center rounded-2xl p-12 border min-h-[50vh] ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="text-center">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}><List size={40} className={darkMode ? 'text-indigo-400' : 'text-indigo-400'} /></div>
                  <h2 className="text-2xl font-bold mb-2">أهلاً بك يا بطل! 👋</h2>
                  <p className="max-w-md mx-auto opacity-70">قم باختيار مادة من القائمة الجانبية أو أضف مادة دراسية جديدة للبدء في تنظيم وقتك بنجاح.</p>
                </div>
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
