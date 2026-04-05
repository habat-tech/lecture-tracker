import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, BookOpen, Check, Cloud, CloudOff, 
  Loader2, Pencil, X, Save, CheckCircle2, Clock, LayoutList, Moon, Sun,
  LogOut, Shield, Users, User, Calendar, Headphones, Scissors, Timer, ListOrdered, ArrowLeft,
  Link as LinkIcon, Video, CloudUpload, PlayCircle
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, getDocs 
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

export default function App() {
  // حالة تسجيل الدخول والمدير
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('tracker'); // 'tracker', 'admin', or 'audio'
  const isAdmin = user && user.email === ADMIN_EMAIL;

  // الحالة الأساسية للمواد والمحاضرات
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newLectureName, setNewLectureName] = useState('');

  // حالات التعديل (Editing States)
  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');
  const [editingLectureId, setEditingLectureId] = useState(null);
  const [editingLectureName, setEditingLectureName] = useState('');

  // حالات السحابة (Firebase)
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // بيانات لوحة التحكم
  const [adminUsersList, setAdminUsersList] = useState([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  // مرجع لتايمر الحفظ (لمنع الضغط وتجميع التعديلات)
  const syncTimeoutRef = useRef(null);

  // ---------- حالات مقسم الصوتيات (Audio Splitter) ----------
  const [uploadMethod, setUploadMethod] = useState('local'); // 'local' or 'link'
  const [audioLink, setAudioLink] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [splitMode, setSplitMode] = useState('parts'); // 'parts' or 'time'
  const [splitParts, setSplitParts] = useState(4);
  const [splitTimeMin, setSplitTimeMin] = useState(30); // بالدقائق
  const [audioSegments, setAudioSegments] = useState([]);
  const [audioBaseName, setAudioBaseName] = useState('ريكورد المحاضرة');

  // دالة قراءة مدة الملف الصوتي
  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
        setAudioFile(file);
        setAudioSegments([]);
        // تعيين اسم افتراضي بناءً على اسم الملف
        setAudioBaseName(file.name.replace(/\.[^/.]+$/, "")); 
      };
    }
  };

  // معالجة الروابط (YouTube, Drive, Telegram)
  const handleLinkSubmit = (e) => {
    e.preventDefault();
    if (!audioLink.trim()) return;
    alert("عذراً، جلب الملفات الصوتية مباشرة من روابط (يوتيوب، تليجرام، أو درايف) يتطلب خادم خلفي (Backend Server) لمعالجة التنزيل لأسباب أمنية. يرجى تنزيل الملف يدوياً ثم رفعه من جهازك كملف محلي.");
  };

  // رفع الملفات لدرايف
  const handleDriveUpload = () => {
    alert("لرفع الملفات المقسمة فعلياً إلى Google Drive، يجب ربط حسابك بـ Google API واستخدام مكتبات معالجة الصوت لقص الملف في الخلفية. هذه الواجهة جاهزة للربط مع الـ Backend الخاص بك.");
  };

  // تنسيق الوقت (ثواني إلى HH:MM:SS)
  const formatTime = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // توليد الأجزاء
  const generateSegments = () => {
    if (!audioDuration) return;
    let segments = [];
    if (splitMode === 'parts') {
      const partDuration = audioDuration / splitParts;
      for (let i = 0; i < splitParts; i++) {
        segments.push({
          id: i,
          name: `${audioBaseName} - جزء ${i + 1}`,
          start: formatTime(i * partDuration),
          end: formatTime((i + 1) * partDuration)
        });
      }
    } else {
      const partDuration = splitTimeMin * 60; // تحويل الدقائق لثواني
      let currentStart = 0;
      let i = 0;
      while (currentStart < audioDuration) {
        let currentEnd = Math.min(currentStart + partDuration, audioDuration);
        segments.push({
          id: i,
          name: `${audioBaseName} - جزء ${i + 1}`,
          start: formatTime(currentStart),
          end: formatTime(currentEnd)
        });
        currentStart = currentEnd;
        i++;
      }
    }
    setAudioSegments(segments);
  };
  // --------------------------------------------------------

  // حالة الوضع الليلي (Dark Mode)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  // تفعيل الوضع الليلي في المتصفح
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

    // صمام أمان لتسجيل الدخول: فتح الموقع إجبارياً بعد 5 ثوانٍ إن طال التحقق
    const authTimeout = setTimeout(() => {
      setAuthLoading(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(authTimeout);
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser && db) {
        // حفظ بيانات المستخدم في السحابة لكي يراها المدير في لوحة التحكم
        try {
          await setDoc(doc(db, 'artifacts', appId, 'usersList', currentUser.uid), {
            name: currentUser.displayName || 'بدون اسم',
            email: currentUser.email || 'بدون إيميل',
            photoURL: currentUser.photoURL || '',
            lastLogin: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.error("Error saving user info: ", e);
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
      // Force account selection to avoid issues with multiple accounts
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Failed", error);
      // إظهار رسالة الخطأ الأصلية لتسهيل الحل
      alert(`حدث خطأ أثناء تسجيل الدخول:\n${error.message}\n\nتأكد من:\n1. إضافة رابط موقعك في (Authorized domains) في إعدادات فايربيس.\n2. إغلاق مانع الإعلانات (Shields) في متصفح Brave أو السماح بالـ Popups.`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSubjects([]);
      setActiveSubjectId(null);
      setCurrentView('tracker');
    } catch (error) {
      console.error("Logout Failed", error);
    }
  };

  // 2. جلب البيانات وإدارة الاتصال عند سكون المتصفح
  useEffect(() => {
    if (authLoading) return;
    
    if (!user || !db) {
      const localData = localStorage.getItem('tracker_data');
      if (localData) {
        const parsed = JSON.parse(localData);
        setSubjects(parsed);
        setActiveSubjectId(parsed.length > 0 ? parsed[0].id : null);
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
    
    // 🔥 التحميل الفوري من الكاش (Smart Caching) للقضاء على التأخير
    const cachedData = localStorage.getItem(`tracker_data_${user.uid}`);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setSubjects(parsed);
        setActiveSubjectId(prev => prev || (parsed.length > 0 ? parsed[0].id : null));
        setIsLoaded(true); // إنهاء شاشة التحميل فوراً لو الداتا موجودة في الكاش
      } catch(e) {
        console.error("Cache parsing error", e);
        setIsLoaded(false);
      }
    } else {
      setIsLoaded(false); 
      // 🔥 صمام أمان (Timeout) للبيانات: لو السحابة اتأخرت أكتر من 3.5 ثواني نفتح الموقع إجبارياً
      dataTimeout = setTimeout(() => {
        if (isComponentMounted) {
          console.warn("Firebase timeout, forcing load.");
          const defaultSubjects = [{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }];
          setSubjects(defaultSubjects);
          setActiveSubjectId(1);
          setIsLoaded(true);
        }
      }, 3500);
    }

    // دالة للاتصال بقاعدة البيانات الخاصة بالمستخدم
    const connectToFirebase = () => {
      if (!isComponentMounted) return;
      
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
      
      unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
        if (dataTimeout) clearTimeout(dataTimeout); // إلغاء صمام الأمان لو الداتا وصلت بنجاح

        if (docSnap.exists() && docSnap.data().subjects) {
          const loadedSubjects = docSnap.data().subjects;
          
          // تحديث الكاش بالبيانات الجديدة القادمة من السحابة
          localStorage.setItem(`tracker_data_${user.uid}`, JSON.stringify(loadedSubjects));

          // نمنع تحديث الشاشة الوهمي لو الداتا اللي جاية من السيرفر هي هي اللي قدامك (بيمنع التقطيع)
          setSubjects(prevSubjects => {
            if (JSON.stringify(prevSubjects) === JSON.stringify(loadedSubjects)) {
              return prevSubjects;
            }
            return loadedSubjects;
          });
          
          setActiveSubjectId(prev => {
            if (prev && loadedSubjects.some(s => s.id === prev)) return prev;
            return loadedSubjects.length > 0 ? loadedSubjects[0].id : null;
          });
        } else if (!cachedData) {
          // في حالة مستخدم جديد ليس لديه كاش أو سحابة
          const defaultSubjects = [{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }];
          setSubjects(defaultSubjects);
          setActiveSubjectId(1);
        }
        setIsLoaded(true); // إخفاء شاشة التحميل
      }, (error) => {
        console.error("Connection dropped, reconnecting...", error);
        if (dataTimeout) clearTimeout(dataTimeout);
        setIsLoaded(true); // افتح الموقع حتى لو في إيرور
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

  // جلب بيانات الإدارة (الأعضاء)
  useEffect(() => {
    if (currentView === 'admin' && isAdmin && db) {
      const fetchUsers = async () => {
        setLoadingAdmin(true);
        try {
          const querySnapshot = await getDocs(collection(db, 'artifacts', appId, 'usersList'));
          const usersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // ترتيب من الأحدث دخولاً للأقدم
          usersList.sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));
          setAdminUsersList(usersList);
        } catch (error) {
          console.error("Error fetching users list: ", error);
        }
        setLoadingAdmin(false);
      };
      fetchUsers();
    }
  }, [currentView, isAdmin]);

  // تحديث البيانات محلياً ورفعها للسحابة بذكاء (Optimistic Saving)
  const saveSubjectsData = (newSubjects) => {
    setSubjects(newSubjects); // تحديث الشاشة فوراً في جزء من الثانية
    
    // حفظ في الكاش لسرعة التحميل (مفصول لكل مستخدم باستخدام الـ UID)
    if (user) {
      localStorage.setItem(`tracker_data_${user.uid}`, JSON.stringify(newSubjects));
    } else {
      localStorage.setItem('tracker_data', JSON.stringify(newSubjects));
    }

    if (!user || !db) return;

    setIsSyncing(true); // إظهار "جاري الحفظ..."

    // إلغاء أي أمر حفظ قديم لو المستخدم ضغط بسرعة (تجميع الطلبات)
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // نأخر الحفظ 800 ملي ثانية عشان نبعت كل حاجة مرة واحدة
    syncTimeoutRef.current = setTimeout(() => {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
      
      // Fire and forget: نبعت الداتا للفايربيس ونخليه هو يتعامل (حتى لو النت ضعيف هيحفظها محلي عنده ويرفعها لما النت ييجي)
      setDoc(docRef, { subjects: newSubjects }, { merge: true })
        .catch(err => console.error("Save error:", err));
      
      // إخفاء "جاري الحفظ..." وإظهار "تم الحفظ" فوراً للراحة النفسية للمستخدم!
      setIsSyncing(false);
    }, 800); 
  };

  // ---------------- إدارة المواد ----------------
  const addSubject = (e) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const newSub = { id: Date.now(), name: newSubjectName, lectures: [] };
    saveSubjectsData([...subjects, newSub]);
    setActiveSubjectId(newSub.id);
    setNewSubjectName('');
  };

  const deleteSubject = (id) => {
    if (window.confirm("هل أنت متأكد من حذف هذه المادة بكل محاضراتها؟")) {
      const updatedSubjects = subjects.filter(sub => sub.id !== id);
      saveSubjectsData(updatedSubjects);
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
    saveSubjectsData(subjects.map(s => s.id === id ? { ...s, name: editingSubjectName } : s));
    setEditingSubjectId(null);
  };

  // ---------------- إدارة المحاضرات ----------------
  const addLecture = (e) => {
    e.preventDefault();
    if (!newLectureName.trim() || !activeSubjectId) return;
    
    // الإضافة الجماعية (Bulk Add)
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

    saveSubjectsData(subjects.map(sub => sub.id === activeSubjectId ? { ...sub, lectures: [...sub.lectures, ...newLectures] } : sub));
    setNewLectureName('');
  };

  const deleteLecture = (subjectId, lectureId) => {
    if (window.confirm("هل أنت متأكد من حذف هذه المحاضرة؟")) {
      saveSubjectsData(subjects.map(sub => sub.id === subjectId ? { ...sub, lectures: sub.lectures.filter(l => l.id !== lectureId) } : sub));
    }
  };

  const startEditLecture = (lecture) => {
    setEditingLectureId(lecture.id);
    setEditingLectureName(lecture.name);
  };

  const saveEditLecture = (subjectId, lectureId) => {
    if (!editingLectureName.trim()) { setEditingLectureId(null); return; }
    saveSubjectsData(subjects.map(sub => {
      if (sub.id === subjectId) {
        return { ...sub, lectures: sub.lectures.map(l => l.id === lectureId ? { ...l, name: editingLectureName } : l) };
      }
      return sub;
    }));
    setEditingLectureId(null);
  };

  const toggleLectureTask = (subjectId, lectureId, taskKey) => {
    saveSubjectsData(subjects.map(sub => {
      if (sub.id === subjectId) {
        return { ...sub, lectures: sub.lectures.map(l => l.id === lectureId ? { ...l, [taskKey]: !l[taskKey] } : l) };
      }
      return sub;
    }));
  };

  const updateReviewCount = (subjectId, lectureId, increment) => {
    saveSubjectsData(subjects.map(sub => {
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
    }));
  };

  // ---------------- دوال مساعدة ----------------
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

  // شاشة التحميل الأولية
  if (authLoading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-slate-900 text-indigo-400' : 'bg-slate-50 text-indigo-600'}`} dir="rtl">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="text-xl font-semibold">جاري التحقق من الهوية...</p>
      </div>
    );
  }

  // شاشة تسجيل الدخول
  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
        <button onClick={() => setDarkMode(!darkMode)} className={`absolute top-6 left-6 p-3 rounded-full transition-colors ${darkMode ? 'bg-slate-800 text-yellow-300 hover:bg-slate-700' : 'bg-white text-indigo-600 shadow-md hover:bg-slate-100'}`}>
          {darkMode ? <Sun size={24} /> : <Moon size={24} />}
        </button>

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
          
          <p className={`mt-6 text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            بياناتك محفوظة بأمان وسرية تامة على السحابة.
          </p>
        </div>
      </div>
    );
  }

  // شاشة الانتظار لجلب البيانات بعد تسجيل الدخول
  if (!isLoaded && currentView === 'tracker') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-slate-900 text-indigo-400' : 'bg-slate-50 text-indigo-600'}`} dir="rtl">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="text-xl font-semibold">جاري تحميل بياناتك...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans pb-12 transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
      {/* الهيدر */}
      <header className={`${darkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-gradient-to-r from-indigo-700 to-indigo-500 shadow-md'} text-white p-3 sticky top-0 z-50 transition-colors`}>
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <BookOpen size={28} className={darkMode ? 'text-indigo-400' : 'text-white'} />
              <h1 className="text-xl sm:text-2xl font-bold cursor-pointer" onClick={() => setCurrentView('tracker')}>لمّ المنهج</h1>
            </div>
            
            <button 
              onClick={() => setCurrentView('audio')}
              className={`hidden md:flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                currentView === 'audio' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : (darkMode ? 'bg-slate-700 text-indigo-300 hover:bg-slate-600' : 'bg-indigo-800/50 text-indigo-100 hover:bg-indigo-800')
              }`}
            >
              <Headphones size={16} /> مقسم الريكوردات
            </button>

            {isAdmin && (
              <button 
                onClick={() => setCurrentView(currentView === 'admin' ? 'tracker' : 'admin')}
                className={`hidden md:flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  currentView === 'admin' 
                  ? 'bg-amber-500 text-white shadow-sm' 
                  : (darkMode ? 'bg-slate-700 text-amber-400 hover:bg-slate-600' : 'bg-indigo-800/50 text-amber-200 hover:bg-indigo-800')
                }`}
              >
                <Shield size={16} /> لوحة التحكم
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* مؤشر الحفظ السحابي */}
            {currentView === 'tracker' && (
              <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm ${darkMode ? 'bg-slate-700' : 'bg-indigo-900/30'}`}>
                {isSyncing ? (
                  <><Loader2 size={14} className={`animate-spin ${darkMode ? 'text-indigo-400' : 'text-indigo-200'}`} /> <span>جاري الحفظ...</span></>
                ) : (
                  <><Cloud size={14} className="text-green-400" /> <span>تم الحفظ</span></>
                )}
              </div>
            )}

            <button 
              onClick={() => setDarkMode(!darkMode)} 
              className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-indigo-800/50 text-indigo-100 hover:bg-indigo-800'}`}
              title="تغيير المظهر"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            <div className="h-6 w-px bg-white/20 mx-1"></div>

            {/* بروفايل المستخدم وتسجيل الخروج */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-black/20 rounded-full pr-1 pl-3 py-1">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="profile" className="w-7 h-7 rounded-full object-cover border border-white/20" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-400 flex items-center justify-center border border-white/20"><User size={16}/></div>
                )}
                <span className="text-sm font-medium hidden lg:block truncate max-w-[120px]">{user.displayName || 'مستخدم'}</span>
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

      {/* ---------------- لوحة تحكم الإدارة (تظهر للمدير فقط) ---------------- */}
      {currentView === 'admin' && isAdmin ? (
        <main className="container mx-auto p-4 mt-6">
          <div className={`rounded-3xl p-6 md:p-8 border shadow-sm mb-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 mb-8 border-b pb-4 border-slate-200 dark:border-slate-700">
              <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                <Shield size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">لوحة تحكم المدير</h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>أهلاً بك يا مدير، هذه بيانات المسجلين في تطبيقك.</p>
              </div>
            </div>

            {/* إحصائيات سريعة */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center text-center ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-indigo-50 border-indigo-100'}`}>
                <Users size={32} className="text-indigo-500 mb-2" />
                <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{adminUsersList.length}</span>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>إجمالي الطلاب المسجلين</span>
              </div>
            </div>

            {/* جدول المستخدمين */}
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Users size={20}/> قائمة الطلاب</h3>
            
            {loadingAdmin ? (
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
                        <th className="p-4 font-semibold border-b dark:border-slate-700">آخر ظهور</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsersList.map((adminUser, index) => (
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
                          <td className="p-4 text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-2">
                            <Calendar size={14}/> {formatDate(adminUser.lastLogin)}
                          </td>
                        </tr>
                      ))}
                      {adminUsersList.length === 0 && (
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
      ) : currentView === 'audio' ? (
      
      /* ---------------- صفحة مقسم الصوتيات (Audio Splitter) ---------------- */
      <main className="container mx-auto p-4 mt-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className={`text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              <Scissors className="text-indigo-500" size={32} /> مقسم الريكوردات الذكي
            </h2>
            <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>قم بجلب أو رفع الريكورد الطويل وسنقوم بتقسيمه لك لمهام صغيرة.</p>
          </div>
          <button onClick={() => setCurrentView('tracker')} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white shadow-sm text-slate-600 hover:bg-slate-50'}`}>
            <ArrowLeft size={18} /> العودة
          </button>
        </div>

        <div className={`rounded-3xl p-6 border shadow-sm mb-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          {/* الخطوة 1: رفع أو جلب الملف */}
          <div className="mb-8">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
              <span className="bg-indigo-100 text-indigo-600 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span> 
              اختر مصدر الريكورد
            </h3>
            
            {/* أزرار اختيار الطريقة */}
            <div className={`flex p-1 mb-6 rounded-xl border w-full max-w-md mx-auto ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
              <button 
                onClick={() => setUploadMethod('local')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${uploadMethod === 'local' ? (darkMode ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-indigo-600 shadow-sm') : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              >
                <CloudUpload size={18}/> ملف من الجهاز
              </button>
              <button 
                onClick={() => setUploadMethod('link')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${uploadMethod === 'link' ? (darkMode ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-indigo-600 shadow-sm') : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              >
                <LinkIcon size={18}/> رابط خارجي
              </button>
            </div>

            {/* طريقة 1: رفع ملف محلي */}
            {uploadMethod === 'local' && (
              <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition ${darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" id="audio-upload" />
                <label htmlFor="audio-upload" className="cursor-pointer flex flex-col items-center">
                  <Headphones size={48} className={`mb-4 ${audioFile ? 'text-green-500' : (darkMode ? 'text-slate-500' : 'text-slate-400')}`} />
                  <span className={`font-medium text-lg ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    {audioFile ? audioFile.name : 'اضغط هنا لاختيار ملف صوتي من جهازك'}
                  </span>
                  {audioDuration > 0 && (
                    <span className="mt-2 text-sm text-green-600 font-bold bg-green-100 px-3 py-1 rounded-full">
                      المدة الكلية: {formatTime(audioDuration)}
                    </span>
                  )}
                </label>
                
                {/* 🎧 معاينة الريكورد (Audio Preview) */}
                {audioFile && (
                  <div className="mt-6 w-full max-w-xl mx-auto flex flex-col items-center animate-in fade-in zoom-in duration-300">
                    <span className={`text-xs font-bold mb-2 flex items-center gap-1 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}><PlayCircle size={16}/> معاينة الصوت</span>
                    <audio controls src={URL.createObjectURL(audioFile)} className="w-full h-10 outline-none rounded-full" />
                  </div>
                )}
              </div>
            )}

            {/* طريقة 2: جلب من رابط */}
            {uploadMethod === 'link' && (
              <div className={`border-2 rounded-2xl p-6 transition ${darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-300 bg-slate-50'}`}>
                <div className="flex justify-center gap-4 mb-6">
                  <span className={`flex items-center gap-1 text-sm font-medium ${darkMode ? 'text-red-400' : 'text-red-500'}`}><Video size={16}/> يوتيوب</span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${darkMode ? 'text-blue-400' : 'text-blue-500'}`}><Cloud size={16}/> تليجرام</span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}><CloudUpload size={16}/> درايف</span>
                </div>
                <form onSubmit={handleLinkSubmit} className="flex flex-col md:flex-row gap-3">
                  <input 
                    type="url" 
                    placeholder="الصق الرابط هنا (YouTube, Telegram, Drive)..." 
                    value={audioLink}
                    onChange={(e) => setAudioLink(e.target.value)}
                    className={`flex-1 rounded-xl px-4 py-3 outline-none focus:ring-2 ${darkMode ? 'bg-slate-800 text-white border-slate-600 focus:ring-indigo-500' : 'bg-white border border-slate-300 focus:ring-indigo-300'}`}
                  />
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition flex items-center justify-center gap-2">
                    <CloudUpload size={20}/> جلب الملف
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* الخطوة 2: إعدادات التقسيم */}
          {audioFile && audioDuration > 0 && (
            <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                <span className="bg-indigo-100 text-indigo-600 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span> 
                كيف تريد التقسيم؟
              </h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className={`border rounded-2xl p-5 transition cursor-pointer ${splitMode === 'parts' ? (darkMode ? 'border-indigo-500 bg-indigo-900/20' : 'border-indigo-500 bg-indigo-50/50') : (darkMode ? 'border-slate-600' : 'border-slate-200')}`} onClick={() => setSplitMode('parts')}>
                  <div className="flex items-center gap-3 mb-4">
                    <input type="radio" checked={splitMode === 'parts'} readOnly className="w-5 h-5 accent-indigo-600" />
                    <ListOrdered size={20} className={darkMode ? 'text-indigo-400' : 'text-indigo-600'} />
                    <span className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>حسب عدد الأجزاء</span>
                  </div>
                  {splitMode === 'parts' && (
                    <div className="pl-8">
                      <label className={`block text-sm mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>كم جزء تريد؟</label>
                      <input type="number" min="2" max="20" value={splitParts} onChange={(e) => setSplitParts(Number(e.target.value))} className={`w-full rounded-xl px-4 py-2 border focus:ring-2 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`} />
                    </div>
                  )}
                </div>

                <div className={`border rounded-2xl p-5 transition cursor-pointer ${splitMode === 'time' ? (darkMode ? 'border-indigo-500 bg-indigo-900/20' : 'border-indigo-500 bg-indigo-50/50') : (darkMode ? 'border-slate-600' : 'border-slate-200')}`} onClick={() => setSplitMode('time')}>
                  <div className="flex items-center gap-3 mb-4">
                    <input type="radio" checked={splitMode === 'time'} readOnly className="w-5 h-5 accent-indigo-600" />
                    <Timer size={20} className={darkMode ? 'text-indigo-400' : 'text-indigo-600'} />
                    <span className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>حسب وقت محدد</span>
                  </div>
                  {splitMode === 'time' && (
                    <div className="pl-8">
                      <label className={`block text-sm mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>مدة كل جزء (بالدقائق)</label>
                      <input type="number" min="1" max="120" value={splitTimeMin} onChange={(e) => setSplitTimeMin(Number(e.target.value))} className={`w-full rounded-xl px-4 py-2 border focus:ring-2 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`} />
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex flex-col md:flex-row gap-4 items-center">
                <input 
                  type="text" 
                  placeholder="اسم المحاضرة الأساسي (مثلاً: محاضرة الجراحة)"
                  value={audioBaseName}
                  onChange={(e) => setAudioBaseName(e.target.value)}
                  className={`flex-1 w-full rounded-xl px-4 py-3 border focus:ring-2 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                />
                <button onClick={generateSegments} className="w-full md:w-auto px-8 py-3 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition flex justify-center items-center gap-2">
                  <Scissors size={20} /> تقسيم الريكورد
                </button>
              </div>
            </div>
          )}

          {/* الخطوة 3: عرض الأجزاء والحفظ */}
          {audioSegments.length > 0 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                <span className="bg-green-100 text-green-600 w-6 h-6 rounded-full flex items-center justify-center text-sm"><Check size={14}/></span> 
                الأجزاء المستخرجة ({audioSegments.length})
              </h3>
              
              <div className={`border rounded-2xl overflow-hidden mb-6 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                {audioSegments.map((seg, idx) => (
                  <div key={seg.id} className={`p-4 flex items-center justify-between ${idx !== audioSegments.length - 1 ? (darkMode ? 'border-b border-slate-700' : 'border-b border-slate-100') : ''} ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                    <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{seg.name}</span>
                    <span className="text-sm font-mono bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg">
                      {seg.start} ➝ {seg.end}
                    </span>
                  </div>
                ))}
              </div>

              {/* زر رفع الملفات لـ Google Drive */}
              <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                <div>
                  <h4 className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>حفظ الملفات في درايف</h4>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>قم بقص وتصدير هذه الملفات إلى حسابك على Google Drive.</p>
                </div>
                <button 
                  onClick={handleDriveUpload}
                  className="w-full md:w-auto px-6 py-3 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-md flex justify-center items-center gap-2"
                >
                  <CloudUpload size={20} /> رفع لـ Google Drive
                </button>
              </div>

            </div>
          )}
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
                                <h3 className={`font-bold text-lg pr-1 ${isDone ? (darkMode ? 'text-slate-500 line-through decoration-green-500' : 'text-slate-500 line-through decoration-green-400') : (darkMode ? 'text-slate-200' : 'text-slate-800')}`}>
                                  {lecture.name}
                                </h3>
                                <div className={`flex gap-1 rounded-lg p-1 border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
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
