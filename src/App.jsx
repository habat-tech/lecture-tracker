import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, BookOpen, Check, Cloud, CloudOff, 
  Loader2, Pencil, X, Save, CheckCircle2, Clock, LayoutList, Moon, Sun
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

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
  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

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

  // 1. تسجيل الدخول
  useEffect(() => {
    if (!auth) {
      setIsLoaded(true);
      return;
    }
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error", error);
        setIsLoaded(true);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. جلب البيانات
  useEffect(() => {
    if (!user || !db) {
      // لو مفيش اتصال بالسحابة، هنجيب الداتا من المتصفح (Local Storage)
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
    
    // بما أن البيانات شخصية ولا نريد مشاركتها مع الجميع، نحفظها في مسار المستخدم
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().subjects) {
        const loadedSubjects = docSnap.data().subjects;
        setSubjects(loadedSubjects);
        setActiveSubjectId(prev => prev || (loadedSubjects.length > 0 ? loadedSubjects[0].id : null));
      } else {
        const defaultSubjects = [{ id: 1, name: 'المادة الأولى (مثال)', lectures: [] }];
        setSubjects(defaultSubjects);
        setActiveSubjectId(prev => prev || 1);
      }
      setIsLoaded(true);
    }, (error) => {
      console.error("Snapshot Error:", error);
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [user]);

  // تحديث البيانات محلياً ورفعها للسحابة
  const saveSubjectsData = async (newSubjects) => {
    setSubjects(newSubjects);
    // حفظ احتياطي في المتصفح عشان الداتا متضيعش أبداً
    localStorage.setItem('tracker_data', JSON.stringify(newSubjects));

    if (!user || !db) return;
    setIsSyncing(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
      await setDoc(docRef, { subjects: newSubjects }, { merge: true });
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setIsSyncing(false);
    }
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
    const newLecture = {
      id: Date.now(), name: newLectureName,
      studied: false, listenedRecord: false, transcribed: false,
      createdQuestions: false, solvedOwnQuestions: false, solvedNewQuestions: false,
      reviewCount: 0
    };
    saveSubjectsData(subjects.map(sub => sub.id === activeSubjectId ? { ...sub, lectures: [...sub.lectures, newLecture] } : sub));
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

  const activeSubject = subjects.find(s => s.id === activeSubjectId);
  // eslint-disable-next-line no-unused-vars
  const fullyCompletedLecturesCount = activeSubject?.lectures.filter(isFullyCompleted).length || 0;

  // إعدادات مهام المحاضرة
  const taskDefinitions = [
    { key: 'studied', label: 'ذاكرتها', color: 'text-green-600 dark:text-green-400', bgChecked: 'peer-checked:bg-green-600 peer-checked:border-green-600' },
    { key: 'listenedRecord', label: 'الريكورد', color: 'text-blue-600 dark:text-blue-400', bgChecked: 'peer-checked:bg-blue-600 peer-checked:border-blue-600' },
    { key: 'transcribed', label: 'التفريغ', color: 'text-purple-600 dark:text-purple-400', bgChecked: 'peer-checked:bg-purple-600 peer-checked:border-purple-600' },
    { key: 'createdQuestions', label: 'عملت أسئلة', color: 'text-orange-600 dark:text-orange-400', bgChecked: 'peer-checked:bg-orange-600 peer-checked:border-orange-600' },
    { key: 'solvedOwnQuestions', label: 'حليتها', color: 'text-indigo-600 dark:text-indigo-400', bgChecked: 'peer-checked:bg-indigo-600 peer-checked:border-indigo-600' },
    { key: 'solvedNewQuestions', label: 'أسئلة جديدة', color: 'text-teal-600 dark:text-teal-400', bgChecked: 'peer-checked:bg-teal-600 peer-checked:border-teal-600' }
  ];

  if (!isLoaded) {
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
      <header className={`${darkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-gradient-to-r from-indigo-700 to-indigo-500 shadow-md'} text-white p-4 sticky top-0 z-50 transition-colors`}>
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={28} className={darkMode ? 'text-indigo-400' : 'text-white'} />
            <h1 className="text-xl sm:text-2xl font-bold">لمّ المنهج</h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setDarkMode(!darkMode)} 
              className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-indigo-800/50 text-indigo-100 hover:bg-indigo-800'}`}
              title="تغيير المظهر"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm ${darkMode ? 'bg-slate-700' : 'bg-indigo-900/30'}`}>
              {user ? (
                isSyncing ? (
                  <><Loader2 size={16} className={`animate-spin ${darkMode ? 'text-indigo-400' : 'text-indigo-200'}`} /> <span>جاري الحفظ...</span></>
                ) : (
                  <><Cloud size={16} className="text-green-400" /> <span>محفوظ في السحابة</span></>
                )
              ) : (
                <><Save size={16} className={darkMode ? 'text-indigo-400' : 'text-indigo-200'} /> <span>محفوظ محلياً</span></>
              )}
            </div>
          </div>
        </div>
      </header>

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
                      <input
                        type="text"
                        placeholder="اسم المحاضرة..."
                        className={`flex-1 sm:w-48 lg:w-56 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${
                          darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-indigo-400 focus:ring-indigo-900' 
                          : 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500 focus:ring-indigo-200'
                        }`}
                        value={newLectureName}
                        onChange={(e) => setNewLectureName(e.target.value)}
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
                  <button onClick={() => document.querySelector('input[placeholder="اسم المحاضرة..."]')?.focus()} className={`px-6 py-2 rounded-xl font-medium transition ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/80' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
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
                <h2 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>أهلاً بك يا بطل! 👋</h2>
                <p className={`max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>قم باختيار مادة من القائمة الجانبية أو أضف مادة دراسية جديدة للبدء في تنظيم وقتك ولم المنهج بنجاح.</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
