import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash, BookOpen, Check, Cloud, 
  Loader2, Pencil, X, Save, CheckCircle, Clock, List, Moon, Sun,
  LogOut, Shield, Users, User, Calendar, Timer, Play, Pause, RotateCcw, 
  Settings, BarChart, Coffee, Brain, Trophy, Download,
  UploadCloud, Link as LinkIcon, Server, RefreshCw, UserCheck, UserX, AlertCircle, FileAudio, PlayCircle, DownloadCloud
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
  const [isIOS, setIsIOS] = useState(false);

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
  const [inputType, setInputType] = useState('local'); // 'url' or 'local'
  const [sourceUrl, setSourceUrl] = useState('');
  const [localFile, setLocalFile] = useState(null);
  const [splitMethod, setSplitMethod] = useState('time'); // 'time' or 'parts'
  const [splitValueTime, setSplitValueTime] = useState('00:30:00');
  const [splitValueParts, setSplitValueParts] = useState('4');
  const [autoUploadDrive, setAutoUploadDrive] = useState(false);
  
  const [isProcessingServer, setIsProcessingServer] = useState(false);
  const [serverResult, setServerResult] = useState(null);

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
    
    const ua = window.navigator.userAgent;
    const ios = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
    const webkit = !!ua.match(/WebKit/i);
    setIsIOS(ios && webkit && !ua.match(/CriOS/i));

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    } else if (isIOS) {
      alert('لتثبيت التطبيق على الآيفون 📱:\n1. اضغط على زر المشاركة (Share) في المتصفح أسفل الشاشة.\n2. اختر "إضافة للشاشة الرئيسية" (Add to Home Screen).');
    } else {
      alert('التطبيق مثبت بالفعل، أو المتصفح لا يدعم التثبيت المباشر. تأكد من فتح الموقع من جوجل كروم.');
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
      await signInWithPopup(auth, provider);
    } catch (error) { alert(`حدث خطأ: ${error.message}`); }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSubjects([]); setStats([]); setActiveSubjectId(null);
      setCurrentView('tracker'); setIsActive(false);
      setIsAdmin(false);
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
    let dataTimeout;
    
    const cachedData = localStorage.getItem(`tracker_data_${user.uid}`);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setSubjects(parsed.subjects || []);
        setStats(parsed.stats || []);
        setActiveSubjectId(prev => prev || ((parsed.subjects && parsed.subjects.length > 0) ? parsed.subjects[0].id : null));
        setIsLoaded(true);
      } catch(e) { setIsLoaded(false); }
    } else {
      setIsLoaded(false); 
      dataTimeout = setTimeout(() => {
        if (isComponentMounted) {
          setSubjects([{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }]);
          setStats([]); setActiveSubjectId(1); setIsLoaded(true);
        }
      }, 3500);
    }

    const connectToFirebase = () => {
      if (!isComponentMounted) return;
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
      
      unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
        if (dataTimeout) clearTimeout(dataTimeout);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const loadedSubjects = data.subjects || [];
          const loadedStats = data.stats || [];
          
          localStorage.setItem(`tracker_data_${user.uid}`, JSON.stringify({ subjects: loadedSubjects, stats: loadedStats }));
          setSubjects(prev => JSON.stringify(prev) === JSON.stringify(loadedSubjects) ? prev : loadedSubjects);
          setStats(prev => JSON.stringify(prev) === JSON.stringify(loadedStats) ? prev : loadedStats);
          setActiveSubjectId(prev => (prev && loadedSubjects.some(s => s.id === prev)) ? prev : (loadedSubjects.length > 0 ? loadedSubjects[0].id : null));
        } else if (!cachedData) {
          setSubjects([{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }]);
          setStats([]); setActiveSubjectId(1);
        }
        setIsLoaded(true);
      }, (error) => {
        console.error(error);
        if (dataTimeout) clearTimeout(dataTimeout);
        setIsLoaded(true);
        if (isComponentMounted) setTimeout(() => { unsubscribeSnapshot(); connectToFirebase(); }, 3000);
      });
    };

    connectToFirebase();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isComponentMounted) {
        unsubscribeSnapshot(); connectToFirebase();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isComponentMounted = false;
      if (dataTimeout) clearTimeout(dataTimeout);
      unsubscribeSnapshot();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, authLoading]);

  useEffect(() => {
    if ((currentView === 'admin' && isAdmin) || currentView === 'leaderboard') {
      if (!db) return;
      setLoadingUsers(true);
      const q = collection(db, 'artifacts', appId, 'usersList');
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentView === 'leaderboard') {
          usersData.sort((a, b) => (b.totalStudyTime || 0) - (a.totalStudyTime || 0));
        } else {
          usersData.sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));
        }
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
        const publicDocRef = doc(db, 'artifacts', appId, 'usersList', user.uid);
        await setDoc(publicDocRef, { totalStudyTime: totalSecs, completedPomodoros: newStats.length }, { merge: true });
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
    } else {
      setTimerMode('work');
    }
  };

  const toggleTimer = () => {
    if (timerMode === 'work' && !selectedSubjectForTimer && !isActive && subjects.length > 0) {
      alert("تنبيه: لم تختر المادة التي ستذاكرها. يفضل اختيارها لتسجيلها بدقة في إحصائياتك!");
    }
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(pomodoroSettings[timerMode] * 60);
  };

  const formatTimerDisplay = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ==========================================
  // 7. دوال الأتمتة السحابية الشاملة
  // ==========================================
  const handleServerProcess = async (e) => {
    e.preventDefault();
    if (inputType === 'url' && !sourceUrl.trim()) return alert('أدخل الرابط أولاً!');
    if (inputType === 'local' && !localFile) return alert('اختر ملفاً من جهازك أولاً!');
    if (!HUGGING_FACE_API.includes('hf.space')) return alert('يرجى التأكد من وضع رابط سيرفر Hugging Face الصحيح في كود التطبيق.');

    setIsProcessingServer(true);
    setServerResult(null);

    try {
      const formData = new FormData();
      formData.append('inputType', inputType);
      formData.append('split_mode', splitMethod);
      formData.append('split_value', splitMethod === 'time' ? splitValueTime : splitValueParts);
      formData.append('auto_upload', autoUploadDrive ? 'true' : 'false');
      
      if (inputType === 'local' && localFile) {
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
      setServerResult(data);
    } catch (error) {
      console.error("API Error:", error);
      alert(`حدث خطأ أثناء المعالجة!\n\nتفاصيل الخطأ التقني: ${error.message}\nتأكد أن السيرفر يعمل بشكل صحيح.`);
    } finally {
      setIsProcessingServer(false);
    }
  };

  // ==========================================
  // 8. دوال إدارة المواد والمحاضرات
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
    if (window.confirm("هل أنت متأكد من حذف هذه المادة بكل محاضراتها؟")) {
      const updatedSubjects = subjects.filter(sub => sub.id !== id);
      saveDataAndSync(updatedSubjects, stats);
      if (activeSubjectId === id && updatedSubjects.length > 0) setActiveSubjectId(updatedSubjects[0].id);
      else if (updatedSubjects.length === 0) setActiveSubjectId(null);
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
    const lectureNames = newLectureName.split(/[\n,]+/).map(name => name.trim().replace(/^-\s*/, '')).filter(name => name.length > 0);
    const newLectures = lectureNames.map((name, index) => ({
      id: Date.now() + index, name: name,
      studied: false, listenedRecord: false, transcribed: false,
      createdQuestions: false, solvedOwnQuestions: false, solvedNewQuestions: false,
      reviewCount: 0
    }));
    saveDataAndSync(subjects.map(sub => sub.id === activeSubjectId ? { ...sub, lectures: [...sub.lectures, ...newLectures] } : sub), stats);
    setNewLectureName('');
  };

  const deleteLecture = (subjectId, lectureId) => {
    if (window.confirm("هل أنت متأكد من حذف هذه المحاضرة؟")) {
      saveDataAndSync(subjects.map(sub => sub.id === subjectId ? { ...sub, lectures: sub.lectures.filter(l => l.id !== lectureId) } : sub), stats);
    }
  };

  const saveEditLecture = (subjectId, lectureId) => {
    if (!editingLectureName.trim()) return setEditingLectureId(null);
    saveDataAndSync(subjects.map(sub => sub.id === subjectId ? { ...sub, lectures: sub.lectures.map(l => l.id === lectureId ? { ...l, name: editingLectureName } : l) } : sub), stats);
    setEditingLectureId(null);
  };

  const toggleLectureTask = (subjectId, lectureId, taskKey) => {
    saveDataAndSync(subjects.map(sub => sub.id === subjectId ? { ...sub, lectures: sub.lectures.map(l => l.id === lectureId ? { ...l, [taskKey]: !l[taskKey] } : l) } : sub), stats);
  };

  const updateReviewCount = (subjectId, lectureId, increment) => {
    saveDataAndSync(subjects.map(sub => sub.id === subjectId ? { ...sub, lectures: sub.lectures.map(l => l.id === lectureId ? { ...l, reviewCount: increment ? l.reviewCount + 1 : Math.max(0, l.reviewCount - 1) } : l) } : sub), stats);
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

  const calculateStudyTime = (period, customStats = stats) => {
    const now = new Date();
    let totalSeconds = 0;
    customStats.forEach(stat => {
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

  const activeSubject = subjects.find(s => s.id === activeSubjectId);
  const myTotalStudy = calculateStudyTime('all');
  const myRank = getUserRank(myTotalStudy.totalSeconds);

  const taskDefinitions = [
    { key: 'studied', label: 'ذاكرتها', color: 'text-green-600 dark:text-green-400', bgChecked: 'peer-checked:bg-green-600 peer-checked:border-green-600' },
    { key: 'listenedRecord', label: 'الريكورد', color: 'text-blue-600 dark:text-blue-400', bgChecked: 'peer-checked:bg-blue-600 peer-checked:border-blue-600' },
    { key: 'transcribed', label: 'التفريغ', color: 'text-purple-600 dark:text-purple-400', bgChecked: 'peer-checked:bg-purple-600 peer-checked:border-purple-600' },
    { key: 'createdQuestions', label: 'عملت أسئلة', color: 'text-orange-600 dark:text-orange-400', bgChecked: 'peer-checked:bg-orange-600 peer-checked:border-orange-600' },
    { key: 'solvedOwnQuestions', label: 'حليتها', color: 'text-indigo-600 dark:text-indigo-400', bgChecked: 'peer-checked:bg-indigo-600 peer-checked:border-indigo-600' },
    { key: 'solvedNewQuestions', label: 'أسئلة جديدة', color: 'text-teal-600 dark:text-teal-400', bgChecked: 'peer-checked:bg-teal-600 peer-checked:border-teal-600' }
  ];

  // ==========================================
  // 9. دوال الإدارة
  // ==========================================
  const adminDeleteUser = async (userId, userName, userEmail) => {
    if (userEmail === ADMIN_EMAIL) return alert("لا يمكنك حذف المالك الأساسي للموقع!");
    if (window.confirm(`هل أنت متأكد من حذفك للمستخدم "${userName}" نهائياً من الموقع؟`)) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'usersList', userId));
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'trackerData', 'main'));
        alert('تم الحذف بنجاح.');
      } catch (error) { alert('حدث خطأ أثناء الحذف.'); }
    }
  };

  const toggleAdminRole = async (targetUserId, currentRole, targetEmail) => {
    if (targetEmail === ADMIN_EMAIL) return alert("هذا هو المالك الأساسي، لا يمكن تغيير صلاحياته!");
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (window.confirm(`هل أنت متأكد من ${newRole === 'admin' ? 'ترقية إلى أدمن' : 'سحب صلاحيات الأدمن من'} هذا المستخدم؟`)) {
      try { await setDoc(doc(db, 'artifacts', appId, 'usersList', targetUserId), { role: newRole }, { merge: true }); } 
      catch (error) { console.error(error); }
    }
  };

  // ==========================================
  // الشاشات (Render)
  // ==========================================

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={48} /></div>;

  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
        <div className="absolute top-6 left-6 flex gap-2">
          <button onClick={handleInstallClick} className={`p-3 rounded-full transition-colors ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800' : 'bg-white text-indigo-600 shadow-md hover:bg-slate-100'}`} title="تثبيت التطبيق"><Download size={24} /></button>
          <button onClick={() => setDarkMode(!darkMode)} className={`p-3 rounded-full transition-colors ${darkMode ? 'bg-slate-800 text-yellow-300 hover:bg-slate-700' : 'bg-white text-indigo-600 shadow-md hover:bg-slate-100'}`}>{darkMode ? <Sun size={24} /> : <Moon size={24} />}</button>
        </div>
        <div className={`w-full max-w-md p-8 rounded-3xl shadow-xl text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
          <BookOpen size={48} className={`mx-auto mb-6 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
          <h1 className="text-3xl font-bold mb-2">لمّ المنهج</h1>
          <p className={`mb-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>نظم وقتك، تتبع محاضراتك المتراكمة، وانجح بتفوق!</p>
          <button onClick={handleGoogleLogin} className={`w-full py-3 px-4 rounded-xl font-bold flex justify-center items-center gap-2 ${darkMode ? 'bg-white text-slate-900' : 'bg-indigo-600 text-white'}`}>سجل دخولك بواسطة جوجل</button>
        </div>
      </div>
    );
  }

  if (!isLoaded && currentView === 'tracker') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-slate-900 text-indigo-400' : 'bg-slate-50 text-indigo-600'}`} dir="rtl">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="text-xl font-semibold">جاري تحميل بياناتك...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans pb-24 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
      
      {/* ---------------- الهيدر العام ---------------- */}
      <header className={`${darkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-gradient-to-r from-indigo-700 to-indigo-500 shadow-md'} text-white p-3 sticky top-0 z-50`}>
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('tracker')}>
              <BookOpen size={24} className={darkMode ? 'text-indigo-400' : 'text-white'} />
              <h1 className="text-xl font-bold">لمّ المنهج</h1>
            </div>
            
            <div className="flex gap-2 bg-black/10 rounded-xl p-1 backdrop-blur-sm">
              <button onClick={() => setCurrentView('tracker')} className={`p-2 rounded-lg transition ${currentView === 'tracker' ? 'bg-white text-indigo-600 shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="الجدول"><List size={18} /></button>
              <button onClick={() => setCurrentView('pomodoro')} className={`p-2 rounded-lg transition ${currentView === 'pomodoro' ? 'bg-white text-indigo-600 shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="بومودورو والإحصائيات"><Timer size={18} /></button>
              <button onClick={() => setCurrentView('leaderboard')} className={`p-2 rounded-lg transition ${currentView === 'leaderboard' ? 'bg-amber-400 text-slate-900 shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="لوحة الشرف"><Trophy size={18} /></button>
              <button onClick={() => setCurrentView('automation')} className={`p-2 rounded-lg transition ${currentView === 'automation' ? 'bg-amber-400 text-slate-900 shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="المعالج السحابي"><Server size={18} /></button>
              {isAdmin && <button onClick={() => setCurrentView('admin')} className={`p-2 rounded-lg transition ${currentView === 'admin' ? 'bg-red-500 text-white shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="لوحة التحكم"><Shield size={18} /></button>}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button onClick={handleInstallClick} className={`hidden sm:flex p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-indigo-300 hover:bg-slate-600' : 'bg-indigo-800/50 text-indigo-100 hover:bg-indigo-800'}`} title="تثبيت التطبيق"><Download size={18} /></button>
            {currentView === 'tracker' && (
              <div className="flex items-center gap-1">
                <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm ${darkMode ? 'bg-slate-700' : 'bg-indigo-900/30'}`}>
                  {isSyncing ? <><Loader2 size={14} className={`animate-spin ${darkMode ? 'text-indigo-400' : 'text-indigo-200'}`} /> <span>جاري الحفظ...</span></> : <><Cloud size={14} className="text-green-400" /> <span>تم الحفظ</span></>}
                </div>
                <button onClick={forceManualSync} className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-green-400 hover:bg-slate-600' : 'bg-indigo-800/50 text-green-300 hover:bg-indigo-800'}`} title="مزامنة وتحديث البيانات">
                  <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                </button>
              </div>
            )}
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-indigo-800/50 text-indigo-100 hover:bg-indigo-800'}`} title="تغيير المظهر">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="h-6 w-px bg-white/20 mx-1"></div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-black/20 rounded-full pr-1 pl-3 py-1 group cursor-pointer relative" title={`رتبتك الحالية: ${myRank.name}`}>
                <img src={user.photoURL || 'https://via.placeholder.com/150'} alt="profile" className="w-8 h-8 rounded-full object-cover border border-white/30" />
                <div className="hidden lg:flex flex-col">
                  <span className="text-sm font-medium truncate max-w-[120px] leading-tight">{user.displayName || 'مستخدم'}</span>
                  <span className={`text-[10px] font-bold ${myRank.color}`}>{myRank.icon} {myRank.name}</span>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 rounded-full bg-red-500/20 text-red-200 hover:bg-red-500 hover:text-white transition-colors" title="تسجيل الخروج"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- الشاشات الفرعية ---------------- */}

      {currentView === 'automation' ? (
        <main className="container mx-auto p-4 mt-6 max-w-4xl animate-in fade-in slide-in-from-bottom-4">
          {/* --- 1. المعالج السحابي --- */}
          <div className="mb-8">
            <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}><Server size={36} /> المعالج السحابي الذكي</h2>
            <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>اقطع المحاضرات الصوتية، استمع للمعاينة، وارفعها لجوجل درايف بضغطة زر!</p>
          </div>
          
          <div className={`rounded-3xl p-6 md:p-8 border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            
            <div className="flex mb-8 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
              <button 
                onClick={() => { setInputType('local'); setServerResult(null); }}
                className={`flex-1 py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${inputType === 'local' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <FileAudio size={20} /> رفع من الجهاز (آمن وسريع)
              </button>
              <button 
                onClick={() => { setInputType('url'); setServerResult(null); }}
                className={`flex-1 py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${inputType === 'url' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <LinkIcon size={20} /> رابط (يوتيوب)
              </button>
            </div>

            <form onSubmit={handleServerProcess} className="space-y-6">
              
              {inputType === 'url' ? (
                <div className="animate-in fade-in">
                  <label className="block font-bold mb-2">رابط المحاضرة (يوتيوب أو رابط مباشر):</label>
                  <div className="relative">
                    <LinkIcon className="absolute right-4 top-3.5 text-slate-400" size={20} />
                    <input type="url" required value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://youtube.com/..." className={`w-full rounded-xl pr-12 pl-4 py-3 border focus:ring-2 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-300'}`} />
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in">
                  <label className="block font-bold mb-2">اختر ملف صوت/فيديو من جهازك:</label>
                  <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition ${darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                    <input type="file" required accept="audio/*,video/*" onChange={(e) => setLocalFile(e.target.files[0])} className="hidden" id="local-upload" />
                    <label htmlFor="local-upload" className="cursor-pointer flex flex-col items-center">
                      <FileAudio size={48} className={`mb-4 ${localFile ? 'text-green-500' : (darkMode ? 'text-slate-500' : 'text-slate-400')}`} />
                      <span className={`font-medium text-lg ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {localFile ? localFile.name : 'اضغط هنا لاختيار ملف من جهازك'}
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-indigo-50/50 border-indigo-100'}`}>
                <h3 className="font-bold mb-4 flex items-center gap-2"><Timer size={18}/> نظام التقطيع</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer ${splitMethod === 'time' ? 'border-indigo-500 bg-indigo-500/10' : (darkMode ? 'border-slate-600' : 'border-slate-200')}`}>
                    <input type="radio" checked={splitMethod === 'time'} onChange={() => setSplitMethod('time')} className="w-5 h-5 accent-indigo-500" />
                    <div><span className="font-bold block">بالوقت (HH:MM:SS)</span><p className="text-xs text-slate-500">تقطيع كل مدة زمنية محددة</p></div>
                  </label>
                  <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer ${splitMethod === 'parts' ? 'border-indigo-500 bg-indigo-500/10' : (darkMode ? 'border-slate-600' : 'border-slate-200')}`}>
                    <input type="radio" checked={splitMethod === 'parts'} onChange={() => setSplitMethod('parts')} className="w-5 h-5 accent-indigo-500" />
                    <div><span className="font-bold block">بعدد الأجزاء</span><p className="text-xs text-slate-500">تقسيم الملف بالتساوي</p></div>
                  </label>
                </div>
                <div className="mt-4">
                  {splitMethod === 'time' ? (
                    <div>
                      <label className="block text-sm font-bold mb-1">صيغة الوقت:</label>
                      <input type="text" pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}" value={splitValueTime} onChange={(e) => setSplitValueTime(e.target.value)} placeholder="00:30:00" className={`w-full md:w-1/2 text-center font-mono text-lg tracking-widest rounded-xl px-4 py-2 border outline-none ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300'}`} />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-bold mb-1">عدد الأجزاء الكلي:</label>
                      <input type="number" min="2" max="20" value={splitValueParts} onChange={(e) => setSplitValueParts(e.target.value)} className={`w-full md:w-1/2 rounded-xl px-4 py-2 border outline-none ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300'}`} />
                    </div>
                  )}
                </div>
              </div>

              <div className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer ${autoUploadDrive ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-200 dark:border-slate-700 bg-transparent'}`} onClick={() => setAutoUploadDrive(!autoUploadDrive)}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${autoUploadDrive ? 'bg-green-100 text-green-600 dark:bg-green-800 dark:text-green-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                    <UploadCloud size={20} />
                  </div>
                  <div>
                    <h4 className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>الرفع التلقائي لـ Google Drive</h4>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>السيرفر هيحتفظ بنسخة في درايف الخاص بك</p>
                  </div>
                </div>
                <div className={`w-12 h-6 rounded-full relative transition-colors ${autoUploadDrive ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${autoUploadDrive ? 'left-1' : 'right-1'}`}></div>
                </div>
              </div>

              <button type="submit" disabled={isProcessingServer} className={`w-full py-4 rounded-xl font-black text-lg transition flex justify-center items-center gap-3 shadow-lg ${isProcessingServer ? 'bg-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white'}`}>
                {isProcessingServer ? <><Loader2 className="animate-spin" size={24} /> جاري معالجة وتقطيع المحاضرة...</> : <><UploadCloud size={24} /> بدء المعالجة {autoUploadDrive ? 'والرفع لدرايف' : ''}</>}
              </button>
            </form>

            {serverResult && (
              <div className={`mt-8 p-6 rounded-2xl border bg-slate-50 dark:bg-slate-800 dark:border-slate-700 animate-in zoom-in`}>
                <h3 className="text-green-600 dark:text-green-400 font-black text-xl flex items-center gap-2 mb-2"><CheckCircle size={24}/> تمت العملية بنجاح!</h3>
                <p className="font-bold mb-6 text-slate-700 dark:text-slate-300">{serverResult.title}</p>
                
                <div className="space-y-4">
                  {serverResult.parts.map((part, idx) => (
                    <div key={idx} className="p-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                          <PlayCircle size={18}/> {part.name}
                        </span>
                        <div className="flex gap-2">
                          {part.drive_link && (
                            <a href={part.drive_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 rounded-lg hover:bg-green-200 transition">
                              <UploadCloud size={14}/> درايف
                            </a>
                          )}
                          <a href={`${HUGGING_FACE_API}${part.preview_url}`} download className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 rounded-lg hover:bg-indigo-200 transition">
                            <DownloadCloud size={14}/> تحميل
                          </a>
                        </div>
                      </div>
                      <audio controls className="w-full h-10 rounded-full outline-none" src={`${HUGGING_FACE_API}${part.preview_url}`}></audio>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

      ) : currentView === 'pomodoro' ? (
        <main className="container mx-auto p-4 mt-6 max-w-5xl">
          {/* --- 2. بومودورو والإحصائيات --- */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}><Timer className="text-indigo-500" size={32} /> مؤقت المذاكرة</h2>
              <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>حدد المادة والمحاضرة، ركز في دراستك، وسجل إنجازك.</p>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className={`rounded-3xl p-8 border shadow-sm flex flex-col items-center justify-center relative overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className={`flex p-1 mb-8 rounded-xl border w-full max-w-sm z-10 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                <button onClick={() => { setTimerMode('work'); setIsActive(false); }} className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'work' ? 'bg-indigo-600 text-white shadow-sm' : (darkMode ? 'text-slate-400' : 'text-slate-500')}`}><Brain size={16}/> تركيز</button>
                <button onClick={() => { setTimerMode('shortBreak'); setIsActive(false); }} className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'shortBreak' ? 'bg-green-500 text-white shadow-sm' : (darkMode ? 'text-slate-400' : 'text-slate-500')}`}><Coffee size={16}/> بريك قصير</button>
                <button onClick={() => { setTimerMode('longBreak'); setIsActive(false); }} className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'longBreak' ? 'bg-blue-500 text-white shadow-sm' : (darkMode ? 'text-slate-400' : 'text-slate-500')}`}><Coffee size={16}/> بريك طويل</button>
              </div>
              <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center mb-8 z-10">
                <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90">
                  <circle cx="50%" cy="50%" r="48%" fill="none" strokeWidth="8" className={`${darkMode ? 'stroke-slate-700' : 'stroke-slate-100'}`} />
                  <circle cx="50%" cy="50%" r="48%" fill="none" strokeWidth="8" strokeLinecap="round" className={`transition-all duration-1000 ease-linear ${timerMode === 'work' ? 'stroke-indigo-500' : timerMode === 'shortBreak' ? 'stroke-green-500' : 'stroke-blue-500'}`} strokeDasharray={`${2 * Math.PI * (window.innerWidth >= 768 ? 150 : 120)}`} strokeDashoffset={`${(1 - (timeLeft / (pomodoroSettings[timerMode] * 60))) * (2 * Math.PI * (window.innerWidth >= 768 ? 150 : 120))}`} />
                </svg>
                <div className="text-center">
                  <span className={`text-6xl md:text-7xl font-black font-mono block ${timerMode === 'work' ? 'text-indigo-500' : timerMode === 'shortBreak' ? 'text-green-500' : 'text-blue-500'}`}>{formatTimerDisplay(timeLeft)}</span>
                  <span className={`text-sm font-medium uppercase tracking-widest mt-2 block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{timerMode === 'work' ? 'وقت التركيز' : 'وقت الراحة'}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 z-10">
                <button onClick={resetTimer} className={`w-14 h-14 rounded-full flex items-center justify-center transition border-2 ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><RotateCcw size={24} /></button>
                <button onClick={toggleTimer} className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition transform hover:scale-105 ${isActive ? 'bg-red-500 text-white' : (timerMode === 'work' ? 'bg-indigo-600 text-white' : timerMode === 'shortBreak' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white')}`}>{isActive ? <Pause size={32} /> : <Play size={32} className="ml-2" />}</button>
                <button onClick={() => setShowTimerSettings(!showTimerSettings)} className={`w-14 h-14 rounded-full flex items-center justify-center transition border-2 ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Settings size={24} /></button>
              </div>
              {timerMode === 'work' && (
                <div className="mt-8 w-full max-w-sm z-10 flex flex-col gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1 text-right ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>المادة:</label>
                    <select value={selectedSubjectForTimer} onChange={(e) => { setSelectedSubjectForTimer(e.target.value); setSelectedLectureForTimer(''); }} className={`w-full rounded-xl px-4 py-3 outline-none focus:ring-2 border ${darkMode ? 'bg-slate-700 text-white border-slate-600' : 'bg-white border-slate-300'}`}>
                      <option value="">-- مذاكرة عامة (بدون مادة) --</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  {selectedSubjectForTimer && subjects.find(s => s.id.toString() === selectedSubjectForTimer.toString())?.lectures.length > 0 && (
                    <div className="animate-in fade-in">
                      <label className={`block text-xs font-bold mb-1 text-right ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>المحاضرة (اختياري):</label>
                      <select value={selectedLectureForTimer} onChange={(e) => setSelectedLectureForTimer(e.target.value)} className={`w-full rounded-xl px-4 py-2 text-sm outline-none border ${darkMode ? 'bg-indigo-900/30 text-indigo-200 border-indigo-700' : 'bg-indigo-50 border-indigo-200'}`}>
                        <option value="">-- حدد المحاضرة --</option>
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
                  <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}><Settings size={20}/> إعدادات الأوقات</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className="block text-xs font-bold mb-1 text-indigo-500">التركيز</label><input type="number" min="1" max="120" value={pomodoroSettings.work} onChange={(e) => setPomodoroSettings({...pomodoroSettings, work: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2 text-center outline-none border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                    <div><label className="block text-xs font-bold mb-1 text-green-500">بريك قصير</label><input type="number" min="1" max="30" value={pomodoroSettings.shortBreak} onChange={(e) => setPomodoroSettings({...pomodoroSettings, shortBreak: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2 text-center outline-none border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                    <div><label className="block text-xs font-bold mb-1 text-blue-500">بريك طويل</label><input type="number" min="1" max="60" value={pomodoroSettings.longBreak} onChange={(e) => setPomodoroSettings({...pomodoroSettings, longBreak: Number(e.target.value)})} className={`w-full rounded-xl px-3 py-2 text-center outline-none border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} /></div>
                  </div>
                </div>
              )}
              <div className={`rounded-3xl p-6 border shadow-sm flex-1 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <h3 className={`text-xl font-bold flex items-center gap-2 pb-3 border-b mb-6 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}><BarChart className="text-indigo-500" size={24}/> حصاد المذاكرة</h3>
                <div className="grid grid-cols-1 gap-4 mb-6">
                  <div className={`p-5 rounded-2xl border flex items-center justify-between ${darkMode ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-indigo-50 border-indigo-100'}`}>
                    <div><span className={`block text-sm font-bold mb-1 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>اليوم</span><span className={`text-2xl font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{calculateStudyTime('day').hours} <span className="text-sm font-medium">س</span> و {calculateStudyTime('day').minutes} <span className="text-sm font-medium">د</span></span></div>
                    <Clock className="text-indigo-500" size={32} />
                  </div>
                  <div className={`p-5 rounded-2xl border flex items-center justify-between ${darkMode ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-100'}`}>
                    <div><span className={`block text-sm font-bold mb-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>هذا الأسبوع</span><span className={`text-2xl font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{calculateStudyTime('week').hours} <span className="text-sm font-medium">س</span> و {calculateStudyTime('week').minutes} <span className="text-sm font-medium">د</span></span></div>
                    <Calendar className="text-green-500" size={32} />
                  </div>
                  <div className={`p-5 rounded-2xl border flex items-center justify-between ${darkMode ? 'bg-purple-900/20 border-purple-500/30' : 'bg-purple-50 border-purple-100'}`}>
                    <div><span className={`block text-sm font-bold mb-1 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>هذا الشهر</span><span className={`text-2xl font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{calculateStudyTime('month').hours} <span className="text-sm font-medium">س</span> و {calculateStudyTime('month').minutes} <span className="text-sm font-medium">د</span></span></div>
                    <BarChart className="text-purple-500" size={32} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

      ) : currentView === 'leaderboard' ? (
        <main className="container mx-auto p-4 mt-6 max-w-4xl">
          {/* --- 3. لوحة الشرف والمنافسة --- */}
          <div className="mb-8">
            <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-yellow-400' : 'text-amber-600'}`}><Trophy size={36} /> لوحة الشرف لأبطال الدفعة</h2>
            <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>تنافس مع زملائك وكن من الأوائل! الترتيب مبني على إجمالي ساعات المذاكرة.</p>
          </div>
          {loadingUsers ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-500" size={48} /></div> : (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row justify-center items-end gap-4 md:gap-8 mb-12 mt-8">
                {usersList[1] && (
                  <div className="flex flex-col items-center order-2 md:order-1 transform md:translate-y-8">
                    <div className="relative"><img src={usersList[1].photoURL || 'https://via.placeholder.com/150'} alt="2nd" className="w-20 h-20 rounded-full border-4 border-slate-300 object-cover shadow-lg" /><div className="absolute -bottom-3 -right-3 bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm">2</div></div>
                    <span className={`font-bold mt-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{(usersList[1].name || 'مستخدم').split(' ')[0]}</span>
                    <span className="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded-full mt-1">🥈 {Math.floor((usersList[1].totalStudyTime || 0) / 3600)} ساعة</span>
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
                    <div className="relative"><img src={usersList[2].photoURL || 'https://via.placeholder.com/150'} alt="3rd" className="w-16 h-16 rounded-full border-4 border-amber-700/50 object-cover shadow-md" /><div className="absolute -bottom-2 -right-2 bg-amber-700/50 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold border-2 border-white text-xs">3</div></div>
                    <span className={`font-bold mt-3 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{(usersList[2].name || 'مستخدم').split(' ')[0]}</span>
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
                        <span className={`font-bold w-6 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{idx + 4}</span>
                        <img src={u.photoURL || 'https://via.placeholder.com/150'} alt="user" className="w-10 h-10 rounded-full object-cover" />
                        <div>
                          <h4 className={`font-bold flex items-center gap-2 ${u.id === user?.uid ? 'text-indigo-500' : (darkMode ? 'text-slate-200' : 'text-slate-800')}`}>{u.name} {u.id === user?.uid && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">أنت</span>}</h4>
                          <span className={`text-xs font-bold ${rnk.color}`}>{rnk.icon} {rnk.name}</span>
                        </div>
                      </div>
                      <div className="text-left">
                        <span className={`block font-black text-lg ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{Math.floor((u.totalStudyTime || 0) / 3600)}</span>
                        <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>ساعة</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>

      ) : currentView === 'admin' && isAdmin ? (
        <main className="container mx-auto p-4 mt-6">
          {/* --- 4. لوحة تحكم الإدارة --- */}
          <div className={`rounded-3xl p-6 md:p-8 border shadow-sm mb-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 mb-8 border-b pb-4 border-slate-200 dark:border-slate-700">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl"><Shield size={32} /></div>
              <div>
                <h2 className="text-2xl font-bold">لوحة تحكم المدير</h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>أهلاً بك يا مدير، يمكنك من هنا إدارة صلاحيات المستخدمين وحذفهم.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center text-center ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-indigo-50 border-indigo-100'}`}>
                <Users size={32} className="text-indigo-500 mb-2" />
                <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{usersList.length}</span>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>الطلاب المسجلين</span>
              </div>
              <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center text-center ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-amber-50 border-amber-100'}`}>
                <Shield size={32} className="text-amber-500 mb-2" />
                <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">{usersList.filter(u => u.role === 'admin' || u.email === ADMIN_EMAIL).length}</span>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>المديرين (Admins)</span>
              </div>
            </div>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Users size={20}/> إدارة الطلاب</h3>
            {loadingUsers ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-500" size={40} /></div> : (
              <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className={`text-sm ${darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                        <th className="p-4 border-b dark:border-slate-700">الطالب</th>
                        <th className="p-4 border-b dark:border-slate-700">الدور</th>
                        <th className="p-4 border-b dark:border-slate-700 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((u) => {
                        const isThisSuperAdmin = u.email === ADMIN_EMAIL;
                        const isThisAdmin = isThisSuperAdmin || u.role === 'admin';
                        return (
                        <tr key={u.id} className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <img src={u.photoURL || 'https://via.placeholder.com/150'} alt="Avatar" className="w-8 h-8 rounded-full" />
                              <span className="font-bold">{u.name}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            {isThisSuperAdmin ? <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-lg text-xs font-bold">مالك</span> : 
                             isThisAdmin ? <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-lg text-xs font-bold">أدمن</span> : 
                             <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-xs font-bold">مستخدم</span>}
                          </td>
                          <td className="p-4">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => toggleAdminRole(u.id, u.role, u.email)} className={`p-2 rounded-lg ${isThisAdmin ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-600'}`} title="تغيير الصلاحيات">{isThisAdmin ? <UserX size={18} /> : <UserCheck size={18} />}</button>
                              <button onClick={() => adminDeleteUser(u.id, u.name, u.email)} className="p-2 rounded-lg bg-red-100 text-red-600" title="حذف نهائي"><Trash size={18} /></button>
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

      ) : (

      <main className="container mx-auto p-4 flex flex-col lg:flex-row gap-6 mt-6">
        {/* --- 5. واجهة المتعقب الأساسية (Tracker) --- */}
        <aside className={`w-full lg:w-1/4 rounded-2xl p-4 border h-fit sticky top-24 ${darkMode ? 'bg-slate-800 border-slate-700 shadow-none' : 'bg-white border-slate-200 shadow-sm'}`}>
          <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 border-b pb-3 ${darkMode ? 'text-slate-200 border-slate-700' : 'text-slate-700 border-slate-200'}`}>
            <List size={20} className={darkMode ? 'text-indigo-400' : 'text-indigo-500'}/> المواد الدراسية
          </h2>
          
          <form onSubmit={addSubject} className="mb-4 flex gap-2">
            <input type="text" placeholder="اسم المادة الجديدة..." className={`flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 border ${darkMode ? 'bg-slate-700 border-slate-600 text-white focus:ring-indigo-900' : 'bg-white border-slate-300 focus:ring-indigo-200'}`} value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} />
            <button type="submit" className="bg-indigo-600 text-white p-2 rounded-xl"><Plus size={20} /></button>
          </form>

          <ul className="space-y-2 max-h-[40vh] lg:max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
            {subjects.map(subject => (
              <li key={subject.id} className="group relative">
                {editingSubjectId === subject.id ? (
                  <div className={`flex items-center gap-2 p-2 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-indigo-50 border-indigo-200'}`}>
                    <input type="text" className={`flex-1 rounded px-2 py-1 text-sm outline-none ${darkMode ? 'bg-slate-600 text-white' : 'bg-white'}`} value={editingSubjectName} onChange={(e) => setEditingSubjectName(e.target.value)} autoFocus />
                    <button onClick={() => saveEditSubject(subject.id)} className="text-green-500"><Save size={18} /></button>
                    <button onClick={() => setEditingSubjectId(null)} className="text-slate-400"><X size={18} /></button>
                  </div>
                ) : (
                  <div className={`flex items-center justify-between transition-all rounded-xl overflow-hidden border ${activeSubjectId === subject.id ? (darkMode ? 'border-indigo-500/50 bg-indigo-900/30' : 'border-indigo-200 bg-indigo-50/50') : (darkMode ? 'border-transparent hover:border-slate-600 hover:bg-slate-700' : 'border-transparent hover:border-slate-200 hover:bg-slate-50')}`}>
                    <button onClick={() => setActiveSubjectId(subject.id)} className="flex-1 text-right px-3 py-3 relative">
                      <div className={`absolute top-0 right-0 h-full transition-all duration-500 -z-10 ${darkMode ? 'bg-indigo-900/40' : 'bg-indigo-100/60'}`} style={{ width: `${getProgress(subject)}%` }}></div>
                      <div className="flex justify-between items-center z-10 relative">
                        <span className={`font-medium ${activeSubjectId === subject.id ? (darkMode ? 'text-indigo-300 font-bold' : 'text-indigo-800 font-bold') : (darkMode ? 'text-slate-300' : 'text-slate-700')}`}>{subject.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border backdrop-blur-sm ${darkMode ? 'text-indigo-300 bg-slate-800/80 border-slate-600' : 'text-indigo-700 bg-white/80 border-indigo-100'}`}>{getProgress(subject)}%</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditSubject(subject)} className={`p-1.5 rounded-md ${darkMode ? 'text-slate-400 hover:text-indigo-400 hover:bg-slate-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-100'}`}><Pencil size={14} /></button>
                      <button onClick={() => deleteSubject(subject.id)} className={`p-1.5 rounded-md ${darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-slate-600' : 'text-slate-400 hover:text-red-600 hover:bg-red-100'}`}><Trash size={14} /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
            {subjects.length === 0 && <p className={`text-sm text-center py-6 rounded-xl border border-dashed ${darkMode ? 'text-slate-400 bg-slate-800 border-slate-600' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>لا توجد مواد مضافة.</p>}
          </ul>
        </aside>

        <section className="w-full lg:w-3/4">
          {activeSubject ? (
            <div className="space-y-6">
              
              <div className={`rounded-2xl p-5 md:p-6 border transition-colors ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                  <div className="w-full md:w-1/2">
                    <h2 className={`text-2xl md:text-3xl font-bold mb-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{activeSubject.name}</h2>
                    <div className={`w-full rounded-full h-3 mb-2 overflow-hidden border shadow-inner ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                      <div className="bg-gradient-to-l from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${getProgress(activeSubject)}%` }}></div>
                    </div>
                    <div className={`flex gap-4 text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <span className="flex items-center gap-1"><CheckCircle size={14} className="text-green-500"/> إنجاز المادة: {getProgress(activeSubject)}%</span>
                      <span className="flex items-center gap-1"><BookOpen size={14} className={darkMode ? 'text-indigo-400' : 'text-indigo-500'}/> المحاضرات: {activeSubject.lectures.length}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2 shrink-0">
                    <form onSubmit={addLecture} className="flex flex-1 sm:flex-none gap-2">
                      <textarea rows={1} placeholder="الصق المحاضرات هنا..." className={`flex-1 sm:w-48 lg:w-64 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 resize-none overflow-hidden ${darkMode ? 'bg-slate-700 border-slate-600 text-white focus:ring-indigo-900' : 'bg-white border-slate-300 focus:ring-indigo-200'}`} value={newLectureName} onChange={(e) => setNewLectureName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addLecture(e); } }} />
                      <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded-xl hover:bg-green-700 shadow-sm"><Plus size={18} /></button>
                    </form>
                  </div>
                </div>
              </div>

              {activeSubject.lectures.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
                    {activeSubject.lectures.map(lecture => {
                      const isDone = isFullyCompleted(lecture);
                      return (
                        <div key={lecture.id} className={`border rounded-2xl p-4 transition-all ${isDone ? (darkMode ? 'border-green-500/50 bg-green-900/20' : 'border-green-300 bg-green-50/30') : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')}`}>
                          <div className={`flex justify-between items-start mb-4 border-b pb-3 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                            {editingLectureId === lecture.id ? (
                              <div className="flex items-center gap-2 w-full">
                                <input type="text" className={`flex-1 rounded-lg px-2 py-1 text-sm outline-none border ${darkMode ? 'bg-slate-700 text-white border-slate-500' : 'bg-white border-indigo-300'}`} value={editingLectureName} onChange={(e) => setEditingLectureName(e.target.value)} autoFocus />
                                <button onClick={() => saveEditLecture(activeSubject.id, lecture.id)} className="text-green-500 p-1"><Save size={18} /></button>
                                <button onClick={() => setEditingLectureId(null)} className="text-slate-400 p-1"><X size={18} /></button>
                              </div>
                            ) : (
                              <>
                                <h3 className={`font-bold text-lg pr-1 flex items-center gap-2 ${isDone ? (darkMode ? 'text-slate-500 line-through decoration-green-500' : 'text-slate-500 line-through decoration-green-400') : (darkMode ? 'text-slate-200' : 'text-slate-800')}`}>{lecture.name}</h3>
                                <div className={`flex gap-1 rounded-lg p-1 border shrink-0 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                                  <button onClick={() => startEditLecture(lecture)} className={`p-1.5 ${darkMode ? 'text-slate-400 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'}`}><Pencil size={14} /></button>
                                  <button onClick={() => deleteLecture(activeSubject.id, lecture.id)} className={`p-1.5 ${darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-600'}`}><Trash size={14} /></button>
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
                                <span className={`text-sm font-medium ${lecture[task.key] ? (darkMode ? 'text-slate-500 line-through' : 'text-slate-400 line-through') : (darkMode ? 'text-slate-300' : 'text-slate-600')}`}>{task.label}</span>
                              </label>
                            ))}
                          </div>
                          <div className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                            <span className={`text-sm font-semibold flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}><Clock size={16}/> المراجعات</span>
                            <div className="flex items-center gap-3">
                              <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, false)} className={`w-7 h-7 rounded-lg border flex items-center justify-center ${darkMode ? 'bg-slate-600 border-slate-500 text-slate-300' : 'bg-white shadow-sm text-slate-600'}`}>-</button>
                              <span className={`w-4 text-center font-bold ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>{lecture.reviewCount}</span>
                              <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, true)} className={`w-7 h-7 rounded-lg flex items-center justify-center ${darkMode ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>+</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={`hidden lg:block rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700 shadow-none' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse min-w-[850px]">
                        <thead>
                          <tr className={`text-sm border-b ${darkMode ? 'bg-slate-700/50 text-slate-300 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
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
                                      <button onClick={() => saveEditLecture(activeSubject.id, lecture.id)} className="text-green-500"><Save size={16} /></button>
                                      <button onClick={() => setEditingLectureId(null)} className="text-slate-400"><X size={16} /></button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 group/name">
                                      {isDone && <Check Circle size={16} className="text-green-500 shrink-0" />}
                                      <span className={`truncate max-w-[180px] ${isDone ? (darkMode ? 'text-slate-500 line-through decoration-green-500' : 'text-slate-500 line-through decoration-green-400') : (darkMode ? 'text-slate-200' : 'text-slate-800')}`}>{lecture.name}</span>
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
                                    <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, true)} className={`w-6 h-6 rounded-full flex items-center justify-center text-lg leading-none ${darkMode ? 'bg-slate-600 text-indigo-400' : 'bg-white shadow-sm text-indigo-600'}`}>+</button>
                                    <span className={`w-4 text-center font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{lecture.reviewCount}</span>
                                    <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, false)} className={`w-6 h-6 rounded-full flex items-center justify-center text-lg leading-none ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-white shadow-sm text-slate-500'}`}>-</button>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => startEditLecture(lecture)} className={`p-1.5 rounded-lg ${darkMode ? 'text-slate-400 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'}`} title="تعديل المحاضرة"><Pencil size={16} /></button>
                                    <button onClick={() => deleteLecture(activeSubject.id, lecture.id)} className={`p-1.5 rounded-lg ${darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-600'}`} title="حذف المحاضرة"><Trash size={16} /></button>
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
                  <h3 className={`text-lg font-bold mb-1 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>لا توجد محاضرات هنا</h3>
                  <p className={`text-sm mb-6 max-w-sm mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>ابدأ بإضافة المحاضرات المتراكمة لتتمكن من تنظيم مهامك ومتابعة تقدمك.</p>
                  <button onClick={() => document.querySelector('textarea[placeholder="الصق المحاضرات هنا..."]')?.focus()} className={`px-6 py-2 rounded-xl font-medium transition ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/80' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>إضافة أول محاضرة</button>
                </div>
              )}
            </div>
          ) : (
            <div className={`h-full flex items-center justify-center rounded-2xl p-12 border min-h-[50vh] ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="text-center">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}><List size={40} className={darkMode ? 'text-indigo-400' : 'text-indigo-400'} /></div>
                <h2 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>أهلاً بك في لمّ المنهج! 👋</h2>
                <p className={`max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>قم باختيار مادة من القائمة الجانبية أو أضف مادة دراسية جديدة للبدء في تنظيم وقتك ولم المنهج بنجاح.</p>
              </div>
            </div>
          )}
        </section>
      </main>
      )}
    </div>
  );
}
