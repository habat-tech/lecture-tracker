import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, BookOpen, Check, Cloud, CloudOff, 
  Loader2, Pencil, X, Save, CheckCircle2, Clock, LayoutList, Moon, Sun,
  LogOut, Shield, Users, User, Calendar, Timer, Play, Pause, RotateCcw, 
  Settings, BarChart2, Coffee, Brain, ArrowLeft, Trophy, Download, Medal, Star
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, getDocs, query, orderBy 
} from 'firebase/firestore';

// إعدادات Firebase الخاصة بمشروعك الحقيقي
const firebaseConfig = {
  apiKey: "AIzaSyBj7ZV1HD3FnCqcPCv4wmu6tkordntcv8k",
  authDomain: "lecture-tracker-3d731.firebaseapp.com",
  projectId: "lecture-tracker-3d731",
  storageBucket: "lecture-tracker-3d731.firebasestorage.app",
  messagingSenderId: "804793313202",
  appId: "1:804793313202:web:bbdf4798380879d59466ab",
  measurementId: "G-J67PJTJEB5"
};

// ⚠️ ضع إيميلك الشخصي هنا لكي يعتبرك الموقع "المدير" ويظهر لك لوحة التحكم
const ADMIN_EMAIL = "ahmed.ragab.alproda@gmail.com"; 

// تهيئة Firebase
let app, auth, db, appId;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = "lecture-tracker-3d731";
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// دالة حساب الرتبة والألقاب
const getUserRank = (totalSeconds) => {
  const hours = totalSeconds / 3600;
  if (hours >= 100) return { name: 'أسطورة الدفعة', icon: '👑', color: 'text-yellow-500' };
  if (hours >= 50) return { name: 'دحيح محترف', icon: '🤓', color: 'text-purple-500' };
  if (hours >= 20) return { name: 'طالب مجتهد', icon: '📚', color: 'text-blue-500' };
  if (hours >= 5) return { name: 'بطل صاعد', icon: '⭐', color: 'text-green-500' };
  return { name: 'مبتدئ', icon: '🌱', color: 'text-slate-500' };
};

export default function App() {
  // حالة تسجيل الدخول والمدير
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('tracker'); // 'tracker', 'admin', 'pomodoro', 'leaderboard'
  const isAdmin = user && user.email === ADMIN_EMAIL;

  // الحالة الأساسية للمواد والمحاضرات والإحصائيات
  const [subjects, setSubjects] = useState([]);
  const [stats, setStats] = useState([]); // [{ id, date, durationSeconds, subjectId, lectureId }]
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newLectureName, setNewLectureName] = useState('');

  // حالات التثبيت PWA
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);

  // حالات التعديل (Editing States)
  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');
  const [editingLectureId, setEditingLectureId] = useState(null);
  const [editingLectureName, setEditingLectureName] = useState('');

  // حالات السحابة (Firebase)
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // بيانات المستخدمين ولوحة التحكم
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // مرجع لتايمر الحفظ
  const syncTimeoutRef = useRef(null);

  // ---------- حالات مؤقت بومودورو (Pomodoro Timer) ----------
  const [timerMode, setTimerMode] = useState('work'); // 'work', 'shortBreak', 'longBreak'
  const [isActive, setIsActive] = useState(false);
  const [pomodoroSettings, setPomodoroSettings] = useState({
    work: 25,
    shortBreak: 5,
    longBreak: 15
  });
  const [timeLeft, setTimeLeft] = useState(pomodoroSettings.work * 60);
  const [selectedSubjectForTimer, setSelectedSubjectForTimer] = useState('');
  const [selectedLectureForTimer, setSelectedLectureForTimer] = useState('');
  const [showTimerSettings, setShowTimerSettings] = useState(false);

  // PWA & iOS Detection
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    const ua = window.navigator.userAgent;
    const ios = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
    const webkit = !!ua.match(/WebKit/i);
    const isSafari = ios && webkit && !ua.match(/CriOS/i);
    setIsIOS(ios);

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        setDeferredPrompt(null);
      });
    } else if (isIOS) {
      alert('لتثبيت التطبيق على الآيفون 📱:\n1. اضغط على زر المشاركة (Share) في المتصفح أسفل الشاشة.\n2. اختر "إضافة للشاشة الرئيسية" (Add to Home Screen).');
    } else {
      alert('التطبيق مثبت بالفعل، أو المتصفح لا يدعم التثبيت المباشر.');
    }
  };

  // تحديث الوقت عند تغيير الإعدادات أو الوضع
  useEffect(() => {
    if (!isActive) {
      setTimeLeft(pomodoroSettings[timerMode] * 60);
    }
  }, [timerMode, pomodoroSettings]);

  // تشغيل المؤقت
  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => time - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      handleTimerComplete();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const handleTimerComplete = () => {
    setIsActive(false);
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play();
    } catch(e){}

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

      const completedCount = updatedStats.length;
      if (completedCount % 4 === 0) {
        setTimerMode('longBreak');
      } else {
        setTimerMode('shortBreak');
      }
    } else {
      setTimerMode('work');
    }
  };

  const toggleTimer = () => {
    if (timerMode === 'work' && !selectedSubjectForTimer && !isActive && subjects.length > 0) {
      alert("يفضل اختيار المادة (والمحاضرة) التي ستذاكرها ليتم تسجيلها بدقة في إحصائياتك!");
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

  // --------------------------------------------------------

  // حالة الوضع الليلي (Dark Mode)
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

  // 1. إدارة تسجيل الدخول بجوجل
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const authTimeout = setTimeout(() => {
      setAuthLoading(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(authTimeout);
      setUser(currentUser);
      setAuthLoading(false);

      // We don't save public profile blindly here anymore, we save it in saveDataAndSync 
      // so it always has the updated totalStudyTime. But we can ensure basic info is there.
      if (currentUser && db) {
        try {
          await setDoc(doc(db, 'artifacts', appId, 'usersList', currentUser.uid), {
            name: currentUser.displayName || 'بدون اسم',
            email: currentUser.email || 'بدون إيميل',
            photoURL: currentUser.photoURL || '',
            lastLogin: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.error("Error saving basic user info: ", e);
        }
      }
    });

    return () => {
      clearTimeout(authTimeout);
      unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Failed", error);
      alert(`حدث خطأ أثناء تسجيل الدخول:\n${error.message}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSubjects([]);
      setStats([]);
      setActiveSubjectId(null);
      setCurrentView('tracker');
      setIsActive(false);
    } catch (error) {
      console.error("Logout Failed", error);
    }
  };

  // 2. جلب البيانات
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
      } catch(e) {
        console.error("Cache parsing error", e);
        setIsLoaded(false);
      }
    } else {
      setIsLoaded(false); 
      dataTimeout = setTimeout(() => {
        if (isComponentMounted) {
          const defaultSubjects = [{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }];
          setSubjects(defaultSubjects);
          setStats([]);
          setActiveSubjectId(1);
          setIsLoaded(true);
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

          setSubjects(prevSubjects => {
            if (JSON.stringify(prevSubjects) === JSON.stringify(loadedSubjects)) return prevSubjects;
            return loadedSubjects;
          });

          setStats(prevStats => {
             if (JSON.stringify(prevStats) === JSON.stringify(loadedStats)) return prevStats;
             return loadedStats;
          });
          
          setActiveSubjectId(prev => {
            if (prev && loadedSubjects.some(s => s.id === prev)) return prev;
            return loadedSubjects.length > 0 ? loadedSubjects[0].id : null;
          });
        } else if (!cachedData) {
          const defaultSubjects = [{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }];
          setSubjects(defaultSubjects);
          setStats([]);
          setActiveSubjectId(1);
        }
        setIsLoaded(true);
      }, (error) => {
        console.error("Connection dropped, reconnecting...", error);
        if (dataTimeout) clearTimeout(dataTimeout);
        setIsLoaded(true);
        if (isComponentMounted) {
          setTimeout(() => {
            unsubscribeSnapshot();
            connectToFirebase();
          }, 3000);
        }
      });
    };

    connectToFirebase();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isComponentMounted) {
        unsubscribeSnapshot();
        connectToFirebase();
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

  // جلب بيانات الإدارة والمنافسة (Leaderboard)
  useEffect(() => {
    if ((currentView === 'admin' && isAdmin) || currentView === 'leaderboard') {
      if (!db) return;
      const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
          const querySnapshot = await getDocs(collection(db, 'artifacts', appId, 'usersList'));
          const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          if (currentView === 'leaderboard') {
            // ترتيب تنازلي حسب ساعات المذاكرة
            usersData.sort((a, b) => (b.totalStudyTime || 0) - (a.totalStudyTime || 0));
          } else {
            // ترتيب حسب آخر ظهور في لوحة الإدارة
            usersData.sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));
          }
          setUsersList(usersData);
        } catch (error) {
          console.error("Error fetching users list: ", error);
        }
        setLoadingUsers(false);
      };
      fetchUsers();
    }
  }, [currentView, isAdmin]);

  // تحديث البيانات محلياً ورفعها للسحابة مع تحديث البروفايل العام للمنافسة
  const saveDataAndSync = (newSubjects, newStats) => {
    setSubjects(newSubjects); 
    setStats(newStats);
    
    const payload = { subjects: newSubjects, stats: newStats };

    if (user) {
      localStorage.setItem(`tracker_data_${user.uid}`, JSON.stringify(payload));
    } else {
      localStorage.setItem('tracker_data', JSON.stringify(payload));
    }

    if (!user || !db) return;

    setIsSyncing(true);

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      try {
        // حفظ الداتا الخاصة
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
        await setDoc(docRef, payload, { merge: true });

        // تحديث الداتا العامة (للوحة الشرف)
        const totalSecs = newStats.reduce((acc, curr) => acc + curr.durationSeconds, 0);
        const publicDocRef = doc(db, 'artifacts', appId, 'usersList', user.uid);
        await setDoc(publicDocRef, {
           totalStudyTime: totalSecs,
           completedPomodoros: newStats.length
        }, { merge: true });

      } catch(err) {
        console.error("Save error:", err);
      } finally {
        setIsSyncing(false);
      }
    }, 800); 
  };

  // ---------------- حذف مستخدم للمدير ----------------
  const adminDeleteUser = async (userId, userName) => {
    if (window.confirm(`هل أنت متأكد من حذفك للمستخدم "${userName}" نهائياً من الموقع؟`)) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'usersList', userId));
        // Optional: delete their tracker data (won't affect their Google Auth but clears app data)
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'trackerData', 'main'));
        setUsersList(prev => prev.filter(u => u.id !== userId));
        alert('تم الحذف بنجاح.');
      } catch (error) {
        console.error("Error deleting user: ", error);
        alert('حدث خطأ أثناء الحذف.');
      }
    }
  };

  // ---------------- إدارة المواد والمحاضرات ----------------
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
      if (activeSubjectId === id && updatedSubjects.length > 0) {
        setActiveSubjectId(updatedSubjects[0].id);
      } else if (updatedSubjects.length === 0) {
        setActiveSubjectId(null);
      }
    }
  };

  const startEditSubject = (subject) => {
    setEditingSubjectId(subject.id);
    setEditingSubjectName(subject.name);
  };

  const saveEditSubject = (id) => {
    if (!editingSubjectName.trim()) { setEditingSubjectId(null); return; }
    saveDataAndSync(subjects.map(s => s.id === id ? { ...s, name: editingSubjectName } : s), stats);
    setEditingSubjectId(null);
  };

  const addLecture = (e) => {
    e.preventDefault();
    if (!newLectureName.trim() || !activeSubjectId) return;
    
    const lectureNames = newLectureName
      .split(/[\n,]+/) 
      .map(name => name.trim().replace(/^-\s*/, ''))
      .filter(name => name.length > 0);

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

  const startEditLecture = (lecture) => {
    setEditingLectureId(lecture.id);
    setEditingLectureName(lecture.name);
  };

  const saveEditLecture = (subjectId, lectureId) => {
    if (!editingLectureName.trim()) { setEditingLectureId(null); return; }
    saveDataAndSync(subjects.map(sub => {
      if (sub.id === subjectId) {
        return { ...sub, lectures: sub.lectures.map(l => l.id === lectureId ? { ...l, name: editingLectureName } : l) };
      }
      return sub;
    }), stats);
    setEditingLectureId(null);
  };

  const toggleLectureTask = (subjectId, lectureId, taskKey) => {
    saveDataAndSync(subjects.map(sub => {
      if (sub.id === subjectId) {
        return { ...sub, lectures: sub.lectures.map(l => l.id === lectureId ? { ...l, [taskKey]: !l[taskKey] } : l) };
      }
      return sub;
    }), stats);
  };

  const updateReviewCount = (subjectId, lectureId, increment) => {
    saveDataAndSync(subjects.map(sub => {
      if (sub.id === subjectId) {
        return {
          ...sub, lectures: sub.lectures.map(l => {
            if (l.id === lectureId) {
              return { ...l, reviewCount: increment ? l.reviewCount + 1 : Math.max(0, l.reviewCount - 1) };
            }
            return l;
          })
        };
      }
      return sub;
    }), stats);
  };

  const getProgress = (subject) => {
    if (!subject || !subject.lectures || subject.lectures.length === 0) return 0;
    const totalTasks = subject.lectures.length * 6;
    let completed = 0;
    subject.lectures.forEach(l => {
      if (l.studied) completed++;
      if (l.listenedRecord) completed++;
      if (l.transcribed) completed++;
      if (l.createdQuestions) completed++;
      if (l.solvedOwnQuestions) completed++;
      if (l.solvedNewQuestions) completed++;
    });
    return Math.round((completed / totalTasks) * 100);
  };

  const isFullyCompleted = (lecture) => {
    return lecture.studied && lecture.listenedRecord && lecture.transcribed && 
           lecture.createdQuestions && lecture.solvedOwnQuestions && lecture.solvedNewQuestions;
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('ar-EG', { 
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    }).format(date);
  };

  // --- حساب الإحصائيات الزمنية للمذاكرة ---
  const calculateStudyTime = (period, customStats = stats) => {
    const now = new Date();
    let totalSeconds = 0;
    
    customStats.forEach(stat => {
      const statDate = new Date(stat.date);
      if (period === 'all') {
        totalSeconds += stat.durationSeconds;
      } else if (period === 'day' && statDate.toDateString() === now.toDateString()) {
        totalSeconds += stat.durationSeconds;
      } else if (period === 'week') {
        const diffTime = Math.abs(now - statDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 7) totalSeconds += stat.durationSeconds;
      } else if (period === 'month') {
        if (statDate.getMonth() === now.getMonth() && statDate.getFullYear() === now.getFullYear()) {
          totalSeconds += stat.durationSeconds;
        }
      }
    });

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return { hours, minutes, totalSeconds };
  };

  const myTotalStudy = calculateStudyTime('all');
  const myRank = getUserRank(myTotalStudy.totalSeconds);

  const activeSubject = subjects.find(s => s.id === activeSubjectId);

  const taskDefinitions = [
    { key: 'studied', label: 'ذاكرتها', color: 'text-green-600 dark:text-green-400', bgChecked: 'peer-checked:bg-green-600 peer-checked:border-green-600' },
    { key: 'listenedRecord', label: 'الريكورد', color: 'text-blue-600 dark:text-blue-400', bgChecked: 'peer-checked:bg-blue-600 peer-checked:border-blue-600' },
    { key: 'transcribed', label: 'التفريغ', color: 'text-purple-600 dark:text-purple-400', bgChecked: 'peer-checked:bg-purple-600 peer-checked:border-purple-600' },
    { key: 'createdQuestions', label: 'عملت أسئلة', color: 'text-orange-600 dark:text-orange-400', bgChecked: 'peer-checked:bg-orange-600 peer-checked:border-orange-600' },
    { key: 'solvedOwnQuestions', label: 'حليتها', color: 'text-indigo-600 dark:text-indigo-400', bgChecked: 'peer-checked:bg-indigo-600 peer-checked:border-indigo-600' },
    { key: 'solvedNewQuestions', label: 'أسئلة جديدة', color: 'text-teal-600 dark:text-teal-400', bgChecked: 'peer-checked:bg-teal-600 peer-checked:border-teal-600' }
  ];

  // ---------------- الشاشات ----------------

  if (authLoading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-slate-900 text-indigo-400' : 'bg-slate-50 text-indigo-600'}`} dir="rtl">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="text-xl font-semibold">جاري التحقق من الهوية...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
        <div className="absolute top-6 left-6 flex gap-2">
          <button onClick={handleInstallClick} className={`p-3 rounded-full transition-colors ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800' : 'bg-white text-indigo-600 shadow-md hover:bg-slate-100'}`} title="تثبيت التطبيق">
            <Download size={24} />
          </button>
          <button onClick={() => setDarkMode(!darkMode)} className={`p-3 rounded-full transition-colors ${darkMode ? 'bg-slate-800 text-yellow-300 hover:bg-slate-700' : 'bg-white text-indigo-600 shadow-md hover:bg-slate-100'}`}>
            {darkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
        </div>

        <div className={`w-full max-w-md p-8 rounded-3xl shadow-xl text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ${darkMode ? 'bg-indigo-900/50' : 'bg-indigo-50'}`}>
            <BookOpen size={48} className={darkMode ? 'text-indigo-400' : 'text-indigo-600'} />
          </div>
          <h1 className="text-3xl font-bold mb-2">لمّ المنهج</h1>
          <p className={`mb-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>نظم وقتك، تتبع محاضراتك المتراكمة، وانجح بتفوق!</p>
          
          <button 
            onClick={handleGoogleLogin}
            className={`w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 shadow-md ${
              darkMode ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
              </g>
            </svg>
            سجل دخولك بواسطة جوجل
          </button>
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
    <div className={`min-h-screen font-sans pb-24 transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
      
      {/* الهيدر */}
      <header className={`${darkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-gradient-to-r from-indigo-700 to-indigo-500 shadow-md'} text-white p-3 sticky top-0 z-50 transition-colors`}>
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          
          <div className="flex flex-wrap items-center justify-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('tracker')}>
              <BookOpen size={24} className={darkMode ? 'text-indigo-400' : 'text-white'} />
              <h1 className="text-xl font-bold">لمّ المنهج</h1>
            </div>
            
            <div className="flex gap-2 bg-black/10 rounded-xl p-1 backdrop-blur-sm">
              <button 
                onClick={() => setCurrentView('tracker')}
                className={`p-2 rounded-lg transition ${currentView === 'tracker' ? 'bg-white text-indigo-600 shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="الجدول"
              ><LayoutList size={18} /></button>
              
              <button 
                onClick={() => setCurrentView('pomodoro')}
                className={`p-2 rounded-lg transition ${currentView === 'pomodoro' ? 'bg-white text-indigo-600 shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="بومودورو والإحصائيات"
              ><Timer size={18} /></button>

              <button 
                onClick={() => setCurrentView('leaderboard')}
                className={`p-2 rounded-lg transition ${currentView === 'leaderboard' ? 'bg-amber-400 text-slate-900 shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="لوحة الشرف والمنافسة"
              ><Trophy size={18} /></button>

              {isAdmin && (
                <button 
                  onClick={() => setCurrentView('admin')}
                  className={`p-2 rounded-lg transition ${currentView === 'admin' ? 'bg-red-500 text-white shadow-sm' : 'text-indigo-100 hover:bg-white/20'}`} title="لوحة التحكم"
                ><Shield size={18} /></button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button onClick={handleInstallClick} className={`hidden sm:flex p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-indigo-300 hover:bg-slate-600' : 'bg-indigo-800/50 text-indigo-100 hover:bg-indigo-800'}`} title="تثبيت التطبيق">
              <Download size={18} />
            </button>

            <button 
              onClick={() => setDarkMode(!darkMode)} 
              className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-indigo-800/50 text-indigo-100 hover:bg-indigo-800'}`}
              title="تغيير المظهر"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            <div className="h-6 w-px bg-white/20 mx-1"></div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-black/20 rounded-full pr-1 pl-3 py-1 group cursor-pointer relative" title={`رتبتك الحالية: ${myRank.name}`}>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="profile" className="w-8 h-8 rounded-full object-cover border border-white/30" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center border border-white/30"><User size={16}/></div>
                )}
                <div className="flex flex-col hidden lg:flex">
                  <span className="text-sm font-medium truncate max-w-[120px] leading-tight">{user.displayName || 'مستخدم'}</span>
                  <span className={`text-[10px] font-bold ${myRank.color.replace('text-', 'text-')}`}>{myRank.icon} {myRank.name}</span>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 rounded-full bg-red-500/20 text-red-200 hover:bg-red-500 hover:text-white transition-colors"
                title="تسجيل الخروج"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- لوحة تحكم الإدارة ---------------- */}
      {currentView === 'admin' && isAdmin ? (
        <main className="container mx-auto p-4 mt-6">
          <div className={`rounded-3xl p-6 md:p-8 border shadow-sm mb-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 mb-8 border-b pb-4 border-slate-200 dark:border-slate-700">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                <Shield size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">لوحة تحكم المدير</h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>أهلاً بك يا مدير، هذه بيانات المسجلين في تطبيقك وإمكانية حذفهم.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center text-center ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-indigo-50 border-indigo-100'}`}>
                <Users size={32} className="text-indigo-500 mb-2" />
                <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{usersList.length}</span>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>إجمالي الطلاب المسجلين</span>
              </div>
            </div>

            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Users size={20}/> إدارة الطلاب</h3>
            
            {loadingUsers ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>
            ) : (
              <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className={`text-sm ${darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                        <th className="p-4 font-semibold border-b dark:border-slate-700">#</th>
                        <th className="p-4 font-semibold border-b dark:border-slate-700">الطالب</th>
                        <th className="p-4 font-semibold border-b dark:border-slate-700">الإيميل</th>
                        <th className="p-4 font-semibold border-b dark:border-slate-700 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((adminUser, index) => (
                        <tr key={adminUser.id} className={`border-b transition duration-300 ${darkMode ? 'border-slate-700 hover:bg-slate-700/50' : 'border-slate-100 hover:bg-slate-50'}`}>
                          <td className="p-4 font-medium text-slate-500">{index + 1}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {adminUser.photoURL ? (
                                <img src={adminUser.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center"><User size={16}/></div>
                              )}
                              <span className="font-bold">{adminUser.name}</span>
                            </div>
                          </td>
                          <td className="p-4 text-slate-500 dark:text-slate-400 font-mono text-sm" dir="ltr">{adminUser.email}</td>
                          <td className="p-4 flex justify-center">
                            <button 
                              onClick={() => adminDeleteUser(adminUser.id, adminUser.name)}
                              className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-600 hover:text-white transition"
                              title="حذف المستخدم نهائياً"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {usersList.length === 0 && (
                        <tr>
                          <td colSpan="4" className="text-center p-8 text-slate-500">لم يسجل أحد بعد.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>

      ) : currentView === 'leaderboard' ? (
      
      /* ---------------- صفحة لوحة الشرف (التنافس) ---------------- */
      <main className="container mx-auto p-4 mt-6 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-yellow-400' : 'text-amber-600'}`}>
              <Trophy size={36} /> لوحة الشرف لأبطال الدفعة
            </h2>
            <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>تنافس مع زملائك وكن من الأوائل! الترتيب مبني على إجمالي ساعات المذاكرة.</p>
          </div>
        </div>

        {loadingUsers ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-500" size={48} /></div>
        ) : (
          <div className="space-y-4">
            {/* عرض التوب 3 بشكل مميز */}
            <div className="flex flex-col md:flex-row justify-center items-end gap-4 md:gap-8 mb-12 mt-8">
              {usersList[1] && (
                <div className="flex flex-col items-center order-2 md:order-1 transform md:translate-y-8">
                  <div className="relative">
                    <img src={usersList[1].photoURL || 'https://via.placeholder.com/150'} alt="2nd" className="w-20 h-20 rounded-full border-4 border-slate-300 object-cover shadow-lg" />
                    <div className="absolute -bottom-3 -right-3 bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm">2</div>
                  </div>
                  <span className={`font-bold mt-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{usersList[1].name.split(' ')[0]}</span>
                  <span className="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded-full mt-1">🥈 {Math.floor((usersList[1].totalStudyTime || 0) / 3600)} ساعة</span>
                </div>
              )}
              
              {usersList[0] && (
                <div className="flex flex-col items-center order-1 md:order-2 z-10">
                  <div className="relative">
                    <Trophy size={32} className="absolute -top-10 left-1/2 transform -translate-x-1/2 text-yellow-400 animate-bounce" />
                    <img src={usersList[0].photoURL || 'https://via.placeholder.com/150'} alt="1st" className="w-28 h-28 rounded-full border-4 border-yellow-400 object-cover shadow-xl shadow-yellow-500/20" />
                    <div className="absolute -bottom-4 -right-2 bg-yellow-400 text-yellow-900 w-10 h-10 rounded-full flex items-center justify-center font-black border-2 border-white shadow-md text-lg">1</div>
                  </div>
                  <span className={`font-black text-xl mt-5 ${darkMode ? 'text-yellow-400' : 'text-amber-600'}`}>{usersList[0].name.split(' ')[0]}</span>
                  <span className="text-sm font-bold bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full mt-1">🥇 {Math.floor((usersList[0].totalStudyTime || 0) / 3600)} ساعة</span>
                </div>
              )}

              {usersList[2] && (
                <div className="flex flex-col items-center order-3 transform md:translate-y-12">
                  <div className="relative">
                    <img src={usersList[2].photoURL || 'https://via.placeholder.com/150'} alt="3rd" className="w-16 h-16 rounded-full border-4 border-amber-700/50 object-cover shadow-md" />
                    <div className="absolute -bottom-2 -right-2 bg-amber-700/50 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold border-2 border-white text-xs">3</div>
                  </div>
                  <span className={`font-bold mt-3 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{usersList[2].name.split(' ')[0]}</span>
                  <span className="text-[10px] text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded-full mt-1">🥉 {Math.floor((usersList[2].totalStudyTime || 0) / 3600)} س</span>
                </div>
              )}
            </div>

            {/* باقي القائمة */}
            <div className={`rounded-3xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              {usersList.slice(3).map((u, idx) => {
                const rnk = getUserRank(u.totalStudyTime || 0);
                return (
                  <div key={u.id} className={`flex items-center justify-between p-4 ${idx !== usersList.length - 4 ? (darkMode ? 'border-b border-slate-700' : 'border-b border-slate-100') : ''} ${u.id === user?.uid ? (darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50') : ''}`}>
                    <div className="flex items-center gap-4">
                      <span className={`font-bold w-6 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{idx + 4}</span>
                      <img src={u.photoURL || 'https://via.placeholder.com/150'} alt="user" className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <h4 className={`font-bold flex items-center gap-2 ${u.id === user?.uid ? 'text-indigo-500' : (darkMode ? 'text-slate-200' : 'text-slate-800')}`}>
                          {u.name} {u.id === user?.uid && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">أنت</span>}
                        </h4>
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

      ) : currentView === 'pomodoro' ? (
      
      /* ---------------- صفحة بومودورو والإحصائيات ---------------- */
      <main className="container mx-auto p-4 mt-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              <Timer className="text-indigo-500" size={32} /> مؤقت المذاكرة (بومودورو)
            </h2>
            <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>حدد المادة والمحاضرة، ركز في دراستك، وسنقوم بتسجيل إنجازك تلقائياً.</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* قسم المؤقت */}
          <div className={`rounded-3xl p-8 border shadow-sm flex flex-col items-center justify-center transition-colors relative overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {/* أزرار الوضع */}
            <div className={`flex p-1 mb-8 rounded-xl border w-full max-w-sm z-10 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
              <button 
                onClick={() => { setTimerMode('work'); setIsActive(false); }}
                className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'work' ? 'bg-indigo-600 text-white shadow-sm' : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              >
                <Brain size={16}/> تركيز
              </button>
              <button 
                onClick={() => { setTimerMode('shortBreak'); setIsActive(false); }}
                className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'shortBreak' ? 'bg-green-500 text-white shadow-sm' : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              >
                <Coffee size={16}/> بريك قصير
              </button>
              <button 
                onClick={() => { setTimerMode('longBreak'); setIsActive(false); }}
                className={`flex-1 py-2 px-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${timerMode === 'longBreak' ? 'bg-blue-500 text-white shadow-sm' : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              >
                <Coffee size={16}/> بريك طويل
              </button>
            </div>

            {/* دائرة المؤقت */}
            <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center mb-8 z-10">
              <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90">
                <circle 
                  cx="50%" cy="50%" r="48%" fill="none" strokeWidth="8" 
                  className={`${darkMode ? 'stroke-slate-700' : 'stroke-slate-100'}`} 
                />
                <circle 
                  cx="50%" cy="50%" r="48%" fill="none" strokeWidth="8" 
                  strokeLinecap="round"
                  className={`transition-all duration-1000 ease-linear ${timerMode === 'work' ? 'stroke-indigo-500' : timerMode === 'shortBreak' ? 'stroke-green-500' : 'stroke-blue-500'}`}
                  strokeDasharray={`${2 * Math.PI * (window.innerWidth >= 768 ? 150 : 120)}`}
                  strokeDashoffset={`${(1 - (timeLeft / (pomodoroSettings[timerMode] * 60))) * (2 * Math.PI * (window.innerWidth >= 768 ? 150 : 120))}`}
                />
              </svg>
              <div className="text-center">
                <span className={`text-6xl md:text-7xl font-black font-mono block ${timerMode === 'work' ? 'text-indigo-500' : timerMode === 'shortBreak' ? 'text-green-500' : 'text-blue-500'}`}>
                  {formatTimerDisplay(timeLeft)}
                </span>
                <span className={`text-sm md:text-base font-medium uppercase tracking-widest mt-2 block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {timerMode === 'work' ? 'وقت التركيز' : 'وقت الراحة'}
                </span>
              </div>
            </div>

            {/* أزرار التحكم */}
            <div className="flex items-center gap-4 z-10">
              <button 
                onClick={resetTimer}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition border-2 ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
              >
                <RotateCcw size={24} />
              </button>
              <button 
                onClick={toggleTimer}
                className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition transform hover:scale-105 ${
                  isActive 
                  ? 'bg-red-500 text-white shadow-red-500/30' 
                  : (timerMode === 'work' ? 'bg-indigo-600 text-white shadow-indigo-600/30' : timerMode === 'shortBreak' ? 'bg-green-500 text-white shadow-green-500/30' : 'bg-blue-500 text-white shadow-blue-500/30')
                }`}
              >
                {isActive ? <Pause size={32} /> : <Play size={32} className="ml-2" />}
              </button>
              <button 
                onClick={() => setShowTimerSettings(!showTimerSettings)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition border-2 ${showTimerSettings ? 'bg-slate-200 dark:bg-slate-600 border-transparent' : ''} ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
              >
                <Settings size={24} />
              </button>
            </div>

            {/* اختيار المادة والمحاضرة */}
            {timerMode === 'work' && (
              <div className="mt-8 w-full max-w-sm z-10 flex flex-col gap-3">
                <div>
                  <label className={`block text-xs font-bold mb-1 text-right ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>المادة:</label>
                  <select 
                    value={selectedSubjectForTimer} 
                    onChange={(e) => {
                      setSelectedSubjectForTimer(e.target.value);
                      setSelectedLectureForTimer(''); // Reset lecture when subject changes
                    }}
                    className={`w-full rounded-xl px-4 py-3 outline-none focus:ring-2 font-medium shadow-sm border ${darkMode ? 'bg-slate-700 text-white border-slate-600 focus:ring-indigo-500' : 'bg-white border-slate-300 focus:ring-indigo-300'}`}
                  >
                    <option value="">-- مذاكرة عامة (بدون مادة) --</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* تظهر فقط إذا اختار مادة وبها محاضرات */}
                {selectedSubjectForTimer && subjects.find(s => s.id.toString() === selectedSubjectForTimer.toString())?.lectures.length > 0 && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className={`block text-xs font-bold mb-1 text-right ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>المحاضرة (اختياري):</label>
                    <select 
                      value={selectedLectureForTimer} 
                      onChange={(e) => setSelectedLectureForTimer(e.target.value)}
                      className={`w-full rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 shadow-sm border ${darkMode ? 'bg-indigo-900/30 text-indigo-200 border-indigo-700 focus:ring-indigo-500' : 'bg-indigo-50 border-indigo-200 focus:ring-indigo-300'}`}
                    >
                      <option value="">-- حدد المحاضرة --</option>
                      {subjects.find(s => s.id.toString() === selectedSubjectForTimer.toString()).lectures.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            
            {/* خلفية تجميلية */}
            <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] rounded-full blur-3xl opacity-5 pointer-events-none ${timerMode === 'work' ? 'bg-indigo-500' : timerMode === 'shortBreak' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
          </div>

          {/* قسم الإحصائيات والإعدادات */}
          <div className="flex flex-col gap-6">
            
            {/* الإعدادات (تظهر عند الضغط على الترس) */}
            {showTimerSettings && (
              <div className={`rounded-3xl p-6 border shadow-sm animate-in slide-in-from-top-4 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}><Settings size={20}/> إعدادات الأوقات (بالدقائق)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>التركيز</label>
                    <input 
                      type="number" min="1" max="120" 
                      value={pomodoroSettings.work} 
                      onChange={(e) => {
                        setPomodoroSettings({...pomodoroSettings, work: Number(e.target.value)});
                        if(timerMode === 'work' && !isActive) setTimeLeft(Number(e.target.value) * 60);
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-center outline-none border focus:border-indigo-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>بريك قصير</label>
                    <input 
                      type="number" min="1" max="30" 
                      value={pomodoroSettings.shortBreak} 
                      onChange={(e) => {
                        setPomodoroSettings({...pomodoroSettings, shortBreak: Number(e.target.value)});
                        if(timerMode === 'shortBreak' && !isActive) setTimeLeft(Number(e.target.value) * 60);
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-center outline-none border focus:border-green-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>بريك طويل</label>
                    <input 
                      type="number" min="1" max="60" 
                      value={pomodoroSettings.longBreak} 
                      onChange={(e) => {
                        setPomodoroSettings({...pomodoroSettings, longBreak: Number(e.target.value)});
                        if(timerMode === 'longBreak' && !isActive) setTimeLeft(Number(e.target.value) * 60);
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-center outline-none border focus:border-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* الإحصائيات */}
            <div className={`rounded-3xl p-6 border shadow-sm flex-1 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className={`flex justify-between items-end pb-3 border-b mb-6 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                <h3 className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  <BarChart2 className="text-indigo-500" size={24}/> حصاد المذاكرة
                </h3>
                <div className="text-center">
                  <span className={`text-xs font-bold ${myRank.color}`}>{myRank.icon} رتبتك: {myRank.name}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-4 mb-6">
                <div className={`p-5 rounded-2xl border flex items-center justify-between ${darkMode ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-indigo-50 border-indigo-100'}`}>
                  <div>
                    <span className={`block text-sm font-bold mb-1 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>اليوم</span>
                    <span className={`text-2xl font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                      {calculateStudyTime('day').hours} <span className="text-sm font-medium">ساعة</span> و {calculateStudyTime('day').minutes} <span className="text-sm font-medium">دقيقة</span>
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
                    <Clock size={24} />
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border flex items-center justify-between ${darkMode ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-100'}`}>
                  <div>
                    <span className={`block text-sm font-bold mb-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>هذا الأسبوع</span>
                    <span className={`text-2xl font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                      {calculateStudyTime('week').hours} <span className="text-sm font-medium">ساعة</span> و {calculateStudyTime('week').minutes} <span className="text-sm font-medium">دقيقة</span>
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center">
                    <Calendar size={24} />
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border flex items-center justify-between ${darkMode ? 'bg-purple-900/20 border-purple-500/30' : 'bg-purple-50 border-purple-100'}`}>
                  <div>
                    <span className={`block text-sm font-bold mb-1 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>هذا الشهر</span>
                    <span className={`text-2xl font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                      {calculateStudyTime('month').hours} <span className="text-sm font-medium">ساعة</span> و {calculateStudyTime('month').minutes} <span className="text-sm font-medium">دقيقة</span>
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center">
                    <BarChart2 size={24} />
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-xl text-center text-sm font-medium ${darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                لقد أكملت <span className="font-bold text-indigo-500">{stats.length}</span> جلسات تركيز بنجاح منذ فتح الموقع! 👏
              </div>
            </div>

          </div>
        </div>
      </main>

      ) : (

      /* ---------------- واجهة التطبيق الرئيسية (المتعقب) ---------------- */
      <main className="container mx-auto p-4 flex flex-col lg:flex-row gap-6 mt-6">
        
        {/* الشريط الجانبي للمواد */}
        <aside className={`w-full lg:w-1/4 rounded-2xl p-4 border h-fit sticky top-24 transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 shadow-none' : 'bg-white border-slate-200 shadow-sm'}`}>
          <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 border-b pb-3 ${darkMode ? 'text-slate-200 border-slate-700' : 'text-slate-700 border-slate-200'}`}>
            <LayoutList size={20} className={darkMode ? 'text-indigo-400' : 'text-indigo-500'}/> المواد الدراسية
          </h2>
          
          <form onSubmit={addSubject} className="mb-4 flex gap-2">
            <input
              type="text"
              placeholder="اسم المادة الجديدة..."
              className={`flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${
                darkMode 
                ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-indigo-400 focus:ring-indigo-900' 
                : 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500 focus:ring-indigo-200'
              }`}
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
            />
            <button type="submit" className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition shadow-sm" title="إضافة مادة">
              <Plus size={20} />
            </button>
          </form>

          <ul className="space-y-2 max-h-[40vh] lg:max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
            {subjects.map(subject => (
              <li key={subject.id} className="group relative">
                {editingSubjectId === subject.id ? (
                  <div className={`flex items-center gap-2 p-2 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-indigo-50 border-indigo-200'}`}>
                    <input
                      type="text"
                      className={`flex-1 rounded px-2 py-1 text-sm outline-none ${darkMode ? 'bg-slate-600 text-white border-slate-500' : 'bg-white text-slate-800 border-indigo-300'}`}
                      value={editingSubjectName}
                      onChange={(e) => setEditingSubjectName(e.target.value)}
                      autoFocus
                    />
                    <button onClick={() => saveEditSubject(subject.id)} className="text-green-500 hover:text-green-400"><Save size={18} /></button>
                    <button onClick={() => setEditingSubjectId(null)} className="text-slate-400 hover:text-slate-300"><X size={18} /></button>
                  </div>
                ) : (
                  <div className={`flex items-center justify-between transition-all rounded-xl overflow-hidden border ${
                      activeSubjectId === subject.id 
                      ? (darkMode ? 'border-indigo-500/50 bg-indigo-900/30' : 'border-indigo-200 bg-indigo-50/50')
                      : (darkMode ? 'border-transparent hover:border-slate-600 hover:bg-slate-700' : 'border-transparent hover:border-slate-200 hover:bg-slate-50')
                    }`}>
                    
                    <button onClick={() => setActiveSubjectId(subject.id)} className="flex-1 text-right px-3 py-3 relative">
                      <div className={`absolute top-0 right-0 h-full transition-all duration-500 -z-10 ${darkMode ? 'bg-indigo-900/40' : 'bg-indigo-100/60'}`} style={{ width: `${getProgress(subject)}%` }}></div>
                      
                      <div className="flex justify-between items-center z-10 relative">
                        <span className={`font-medium ${activeSubjectId === subject.id ? (darkMode ? 'text-indigo-300 font-bold' : 'text-indigo-800 font-bold') : (darkMode ? 'text-slate-300' : 'text-slate-700')}`}>
                          {subject.name}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border backdrop-blur-sm ${darkMode ? 'text-indigo-300 bg-slate-800/80 border-slate-600' : 'text-indigo-700 bg-white/80 border-indigo-100'}`}>
                          {getProgress(subject)}%
                        </span>
                      </div>
                    </button>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditSubject(subject)} className={`p-1.5 rounded-md transition ${darkMode ? 'text-slate-400 hover:text-indigo-400 hover:bg-slate-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-100'}`}><Pencil size={14} /></button>
                      <button onClick={() => deleteSubject(subject.id)} className={`p-1.5 rounded-md transition ${darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-slate-600' : 'text-slate-400 hover:text-red-600 hover:bg-red-100'}`}><Trash2 size={14} /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
            {subjects.length === 0 && (
              <p className={`text-sm text-center py-6 rounded-xl border border-dashed ${darkMode ? 'text-slate-400 bg-slate-800 border-slate-600' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>لا توجد مواد مضافة.</p>
            )}
          </ul>
        </aside>

        {/* المساحة الرئيسية */}
        <section className="w-full lg:w-3/4">
          {activeSubject ? (
            <div className="space-y-6">
              
              {/* هيدر المادة والإحصائيات */}
              <div className={`rounded-2xl p-5 md:p-6 border transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 shadow-none' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                  <div className="w-full md:w-1/2">
                    <h2 className={`text-2xl md:text-3xl font-bold mb-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{activeSubject.name}</h2>
                    <div className={`w-full rounded-full h-3 mb-2 overflow-hidden border shadow-inner ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                      <div 
                        className="bg-gradient-to-l from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${getProgress(activeSubject)}%` }}
                      ></div>
                    </div>
                    <div className={`flex gap-4 text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <span className="flex items-center gap-1"><CheckCircle2 size={14} className="text-green-500"/> إنجاز المادة: {getProgress(activeSubject)}%</span>
                      <span className="flex items-center gap-1"><BookOpen size={14} className={darkMode ? 'text-indigo-400' : 'text-indigo-500'}/> المحاضرات: {activeSubject.lectures.length}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2 shrink-0">
                    <form onSubmit={addLecture} className="flex flex-1 sm:flex-none gap-2">
                      <textarea
                        rows={1}
                        placeholder="الصق قائمة المحاضرات هنا..."
                        className={`flex-1 sm:w-48 lg:w-64 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition-colors resize-none overflow-hidden ${
                          darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-indigo-400 focus:ring-indigo-900' 
                          : 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500 focus:ring-indigo-200'
                        }`}
                        value={newLectureName}
                        onChange={(e) => setNewLectureName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            addLecture(e);
                          }
                        }}
                      />
                      <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded-xl hover:bg-green-700 transition shadow-sm flex items-center gap-2 font-medium">
                        <Plus size={18} />
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              {/* قائمة المحاضرات */}
              {activeSubject.lectures.length > 0 ? (
                <>
                  {/* عرض الكروت للموبايل */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
                    {activeSubject.lectures.map(lecture => {
                      const isDone = isFullyCompleted(lecture);
                      return (
                        <div key={lecture.id} className={`border rounded-2xl p-4 transition-all ${
                          isDone 
                          ? (darkMode ? 'border-green-500/50 bg-green-900/20' : 'border-green-300 bg-green-50/30') 
                          : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')
                        }`}>
                          <div className={`flex justify-between items-start mb-4 border-b pb-3 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                            {editingLectureId === lecture.id ? (
                              <div className="flex items-center gap-2 w-full">
                                <input
                                  type="text"
                                  className={`flex-1 rounded-lg px-2 py-1 text-sm outline-none border ${darkMode ? 'bg-slate-700 text-white border-slate-500' : 'bg-white border-indigo-300'}`}
                                  value={editingLectureName}
                                  onChange={(e) => setEditingLectureName(e.target.value)}
                                  autoFocus
                                />
                                <button onClick={() => saveEditLecture(activeSubject.id, lecture.id)} className="text-green-500 p-1"><Save size={18} /></button>
                                <button onClick={() => setEditingLectureId(null)} className="text-slate-400 p-1"><X size={18} /></button>
                              </div>
                            ) : (
                              <>
                                <h3 className={`font-bold text-lg pr-1 flex items-center gap-2 ${isDone ? (darkMode ? 'text-slate-500 line-through decoration-green-500' : 'text-slate-500 line-through decoration-green-400') : (darkMode ? 'text-slate-200' : 'text-slate-800')}`}>
                                  {lecture.name}
                                </h3>
                                <div className={`flex gap-1 rounded-lg p-1 border shrink-0 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                                  <button onClick={() => startEditLecture(lecture)} className={`p-1.5 transition ${darkMode ? 'text-slate-400 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'}`}><Pencil size={14} /></button>
                                  <button onClick={() => deleteLecture(activeSubject.id, lecture.id)} className={`p-1.5 transition ${darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-600'}`}><Trash2 size={14} /></button>
                                </div>
                              </>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-y-3 gap-x-2 mb-4">
                            {taskDefinitions.map((task) => (
                              <label key={task.key} className={`flex items-center gap-2 p-2 rounded-lg border border-transparent cursor-pointer transition ${darkMode ? 'hover:bg-slate-700 hover:border-slate-600' : 'hover:bg-slate-50 hover:border-slate-100'}`}>
                                <div className="relative flex items-center justify-center">
                                  <input type="checkbox" className="peer sr-only" checked={lecture[task.key]} onChange={() => toggleLectureTask(activeSubject.id, lecture.id, task.key)} />
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${darkMode ? 'bg-slate-700 border-slate-500' : 'bg-white border-slate-300'} ${task.bgChecked}`}>
                                    {lecture[task.key] && <Check size={14} className="text-white" strokeWidth={3} />}
                                  </div>
                                </div>
                                <span className={`text-sm font-medium ${lecture[task.key] ? (darkMode ? 'text-slate-500 line-through' : 'text-slate-400 line-through') : (darkMode ? 'text-slate-300' : 'text-slate-600')}`}>{task.label}</span>
                              </label>
                            ))}
                          </div>

                          <div className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                            <span className={`text-sm font-semibold flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}><Clock size={16}/> عدد المراجعات</span>
                            <div className="flex items-center gap-3">
                              <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, false)} className={`w-7 h-7 rounded-lg border flex items-center justify-center ${darkMode ? 'bg-slate-600 border-slate-500 text-slate-300 hover:bg-slate-500' : 'bg-white shadow-sm text-slate-600 hover:bg-slate-100'}`}>-</button>
                              <span className={`w-4 text-center font-bold ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>{lecture.reviewCount}</span>
                              <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, true)} className={`w-7 h-7 rounded-lg flex items-center justify-center ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>+</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* عرض الجدول للشاشات الكبيرة */}
                  <div className={`hidden lg:block rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700 shadow-none' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse min-w-[850px]">
                        <thead>
                          <tr className={`text-sm border-b ${darkMode ? 'bg-slate-700/50 text-slate-300 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            <th className="p-4 font-semibold w-1/4">المحاضرة</th>
                            {taskDefinitions.map(task => (
                              <th key={task.key} className="p-3 font-semibold text-center">{task.label}</th>
                            ))}
                            <th className="p-3 font-semibold text-center w-24">مراجعات</th>
                            <th className="p-3 font-semibold text-center w-24">إجراء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeSubject.lectures.map((lecture) => {
                            const isDone = isFullyCompleted(lecture);
                            return (
                              <tr key={lecture.id} className={`border-b transition duration-300 ${
                                isDone 
                                ? (darkMode ? 'bg-green-900/20 hover:bg-green-900/30 border-slate-700' : 'bg-green-50/40 hover:bg-green-50 border-slate-100') 
                                : (darkMode ? 'hover:bg-slate-700/50 border-slate-700' : 'hover:bg-slate-50 border-slate-100')
                              }`}>
                                <td className="p-4 font-medium">
                                  {editingLectureId === lecture.id ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        className={`flex-1 rounded px-2 py-1 text-sm outline-none border focus:ring-1 focus:ring-indigo-500 ${darkMode ? 'bg-slate-700 text-white border-slate-500' : 'bg-white border-indigo-300'}`}
                                        value={editingLectureName}
                                        onChange={(e) => setEditingLectureName(e.target.value)}
                                        autoFocus
                                      />
                                      <button onClick={() => saveEditLecture(activeSubject.id, lecture.id)} className="text-green-500"><Save size={16} /></button>
                                      <button onClick={() => setEditingLectureId(null)} className="text-slate-400"><X size={16} /></button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 group/name">
                                      {isDone && <CheckCircle2 size={16} className="text-green-500 shrink-0" />}
                                      <span className={`truncate max-w-[180px] ${isDone ? (darkMode ? 'text-slate-500 line-through decoration-green-500' : 'text-slate-500 line-through decoration-green-400') : (darkMode ? 'text-slate-200' : 'text-slate-800')}`}>
                                        {lecture.name}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                
                                {taskDefinitions.map((task) => (
                                  <td key={task.key} className="p-3 text-center">
                                    <label className="inline-flex items-center justify-center cursor-pointer w-full h-full">
                                      <input type="checkbox" className="peer sr-only" checked={lecture[task.key]} onChange={() => toggleLectureTask(activeSubject.id, lecture.id, task.key)} />
                                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all hover:border-indigo-400 ${darkMode ? 'bg-slate-700 border-slate-500' : 'bg-white border-slate-300'} ${task.bgChecked}`}>
                                        {lecture[task.key] && <Check size={16} className="text-white" strokeWidth={3} />}
                                      </div>
                                    </label>
                                  </td>
                                ))}

                                <td className="p-3">
                                  <div className={`flex items-center justify-center gap-2 rounded-full p-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                                    <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, true)} className={`w-6 h-6 rounded-full flex items-center justify-center text-lg leading-none ${darkMode ? 'bg-slate-600 text-indigo-400 hover:bg-slate-500' : 'bg-white shadow-sm text-indigo-600 hover:bg-indigo-50'}`}>+</button>
                                    <span className={`w-4 text-center font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{lecture.reviewCount}</span>
                                    <button onClick={() => updateReviewCount(activeSubject.id, lecture.id, false)} className={`w-6 h-6 rounded-full flex items-center justify-center text-lg leading-none ${darkMode ? 'bg-slate-600 text-slate-300 hover:bg-slate-500' : 'bg-white shadow-sm text-slate-500 hover:bg-slate-50'}`}>-</button>
                                  </div>
                                </td>

                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => startEditLecture(lecture)} className={`p-1.5 rounded-lg transition ${darkMode ? 'text-slate-400 hover:text-indigo-400 hover:bg-slate-700' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`} title="تعديل المحاضرة">
                                      <Pencil size={16} />
                                    </button>
                                    <button onClick={() => deleteLecture(activeSubject.id, lecture.id)} className={`p-1.5 rounded-lg transition ${darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-slate-700' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`} title="حذف المحاضرة">
                                      <Trash2 size={16} />
                                    </button>
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
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}>
                    <BookOpen size={32} className={darkMode ? 'text-indigo-400' : 'text-indigo-300'} />
                  </div>
                  <h3 className={`text-lg font-bold mb-1 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>لا توجد محاضرات هنا</h3>
                  <p className={`text-sm mb-6 max-w-sm mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>ابدأ بإضافة المحاضرات المتراكمة لتتمكن من تنظيم مهامك ومتابعة تقدمك.</p>
                  <button onClick={() => document.querySelector('textarea[placeholder="الصق قائمة المحاضرات هنا..."]')?.focus()} className={`px-6 py-2 rounded-xl font-medium transition ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/80' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
                    إضافة أول محاضرة
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={`h-full flex items-center justify-center rounded-2xl p-12 border min-h-[50vh] ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="text-center">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}>
                  <LayoutList size={40} className={darkMode ? 'text-indigo-400' : 'text-indigo-400'} />
                </div>
                <h2 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>أهلاً بك في لمّ المنهج! 👋</h2>
                <p className={`max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>قم باختيار مادة من القائمة الجانبية أو أضف مادة دراسية جديدة للبدء في تنظيم وقتك بنجاح.</p>
              </div>
            </div>
          )}
        </section>
      </main>
      )}
    </div>
  );
}
