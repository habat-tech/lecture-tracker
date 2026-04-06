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
  const [currentView, setCurrentView] = useState('tracker'); 
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
  const [timerMode, setTimerMode] = useState('work'); 
  const [isActive, setIsActive] = useState(false);
  const [pomodoroSettings, setPomodoroSettings] = useState({ work: 25, shortBreak: 5, longBreak: 15 });
  const [timeLeft, setTimeLeft] = useState(pomodoroSettings.work * 60);
  const [selectedSubjectForTimer, setSelectedSubjectForTimer] = useState('');
  const [selectedLectureForTimer, setSelectedLectureForTimer] = useState('');
  const [showTimerSettings, setShowTimerSettings] = useState(false);

  // ==========================================
  // 4. حالات نظام الرفع والأتمتة السحابية
  // ==========================================
  const [inputType, setInputType] = useState('local'); 
  const [sourceUrl, setSourceUrl] = useState('');
  const [localFile, setLocalFile] = useState(null);
  const [splitMethod, setSplitMethod] = useState('time'); 
  const [splitValueTime, setSplitValueTime] = useState('00:30:00');
  const [splitValueParts, setSplitValueParts] = useState('4');
  const [autoUploadDrive, setAutoUploadDrive] = useState(false);
  
  const [isProcessingServer, setIsProcessingServer] = useState(false);
  const [serverResult, setServerResult] = useState(null);

  const [driveToken, setDriveToken] = useState(null);
  const [driveFiles, setDriveFiles] = useState([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);

  // تعريف المادة النشطة للاستخدام في كافة الشاشات
  const activeSubject = subjects.find(s => s.id === activeSubjectId);

  // ==========================================
  // 5. التأثيرات الجانبية والوظائف
  // ==========================================
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
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
    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    } else {
      alert('لتثبيت التطبيق 📱: يرجى استخدام متصفح يدعم الـ PWA مثل جوجل كروم.');
    }
  };

  useEffect(() => {
    if (!auth) return setAuthLoading(false);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser && db) {
        setIsAdmin(currentUser.email === ADMIN_EMAIL);
        const userRef = doc(db, 'artifacts', appId, 'usersList', currentUser.uid);
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists() && docSnap.data().role === 'admin') setIsAdmin(true);
        });
        try {
          await setDoc(userRef, {
            name: currentUser.displayName || 'مستخدم',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || '',
            lastLogin: new Date().toISOString()
          }, { merge: true });
        } catch (e) { console.error(e); }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/drive.readonly');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) setDriveToken(credential.accessToken);
    } catch (error) { alert(`خطأ في تسجيل الدخول: ${error.message}`); }
  };

  const connectDrive = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/drive.readonly');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setDriveToken(credential.accessToken);
        alert("تم ربط درايف بنجاح!");
      }
    } catch (e) { alert("فشل الربط."); }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !db) {
      const localData = localStorage.getItem('tracker_data');
      if (localData) {
        const parsed = JSON.parse(localData);
        setSubjects(parsed.subjects || []);
        setStats(parsed.stats || []);
        setActiveSubjectId(parsed.subjects?.length > 0 ? parsed.subjects[0].id : null);
      }
      setIsLoaded(true);
      return;
    }

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trackerData', 'main');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSubjects(data.subjects || []);
        setStats(data.stats || []);
        setActiveSubjectId(prev => (prev && data.subjects?.some(s => s.id === prev)) ? prev : (data.subjects?.length > 0 ? data.subjects[0].id : null));
      } else {
        setSubjects([]);
      }
      setIsLoaded(true);
    }, (err) => { console.error(err); setIsLoaded(true); });

    return () => unsubscribe();
  }, [user, authLoading]);

  const fetchDriveList = async () => {
    if (!driveToken) return connectDrive();
    setIsLoadingDrive(true);
    try {
      const res = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType contains 'audio/' or mimeType contains 'video/'&fields=files(id,name,mimeType)&orderBy=modifiedTime desc&pageSize=20", {
        headers: { Authorization: `Bearer ${driveToken}` }
      });
      const data = await res.json();
      setDriveFiles(data.files || []);
    } catch (e) { alert("فشل جلب الملفات."); }
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
      alert("تم استيراد الملف بنجاح!");
    } catch (e) { alert("فشل التحميل من درايف."); }
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
        await setDoc(doc(db, 'artifacts', appId, 'usersList', user.uid), { totalStudyTime: totalSecs }, { merge: true });
      } catch(err) { console.error(err); } finally { setIsSyncing(false); }
    }, 800); 
  };

  const handleServerProcess = async (e) => {
    e.preventDefault();
    if (inputType === 'url' && !sourceUrl.trim()) return alert('أدخل الرابط!');
    if ((inputType === 'local' || inputType === 'drive') && !localFile) return alert('اختر ملفاً!');
    
    setIsProcessingServer(true);
    setServerResult(null);

    try {
      const formData = new FormData();
      formData.append('inputType', inputType === 'drive' ? 'local' : inputType);
      formData.append('split_mode', splitMethod);
      formData.append('split_value', splitMethod === 'time' ? splitValueTime : splitValueParts);
      formData.append('auto_upload', 'false');
      if (localFile) formData.append('file', localFile);
      else formData.append('url', sourceUrl);

      const response = await fetch(`${HUGGING_FACE_API}/process-audio`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('فشل السيرفر.');
      const data = await response.json();

      if (autoUploadDrive && driveToken && data.parts) {
        const newParts = [];
        for (let i = 0; i < data.parts.length; i++) {
          const part = data.parts[i];
          const audioRes = await fetch(`${HUGGING_FACE_API}${part.preview_url}`);
          const audioBlob = await audioRes.blob();
          const uploadRes = await uploadToDriveFrontend(audioBlob, `${data.title} - ${i+1}.mp3`, driveToken);
          newParts.push({ ...part, drive_link: uploadRes.webViewLink });
        }
        data.parts = newParts;
      }
      setServerResult(data);
    } catch (error) { alert(`خطأ: ${error.message}`); }
    finally { setIsProcessingServer(false); }
  };

  const addSubject = (e) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const newSub = { id: Date.now(), name: newSubjectName, lectures: [] };
    saveDataAndSync([...subjects, newSub], stats);
    setActiveSubjectId(newSub.id);
    setNewSubjectName('');
  };

  const addLecture = (e) => {
    e.preventDefault();
    if (!newLectureName.trim() || !activeSubjectId) return;
    const lecNames = newLectureName.split('\n').flatMap(n => n.split(',')).map(n => n.trim()).filter(n => n.length > 0);
    const newLecs = lecNames.map((n, i) => ({
      id: Date.now() + i, name: n, studied: false, listenedRecord: false, transcribed: false,
      createdQuestions: false, solvedOwnQuestions: false, solvedNewQuestions: false, reviewCount: 0
    }));
    saveDataAndSync(subjects.map(s => s.id === activeSubjectId ? { ...s, lectures: [...s.lectures, ...newLecs] } : s), stats);
    setNewLectureName('');
  };

  const formatTimerDisplay = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={48} /></div>;

  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200`} dir="rtl">
        <div className="w-full max-w-md p-8 rounded-3xl shadow-xl text-center border dark:bg-slate-800 dark:border-slate-700">
          <BookOpen size={48} className="mx-auto mb-6 text-indigo-500" />
          <h1 className="text-3xl font-bold mb-8">لمّ المنهج</h1>
          <button onClick={handleGoogleLogin} className="w-full py-3 px-4 rounded-xl font-bold bg-indigo-600 text-white">سجل دخولك بواسطة جوجل</button>
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full bg-white/10">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={() => signOut(auth)} className="p-2 rounded-full bg-red-500/20"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      {currentView === 'automation' ? (
        <main className="container mx-auto p-4 mt-6 max-w-4xl animate-in fade-in">
          <div className="mb-8">
            <h2 className="text-3xl font-bold flex items-center gap-3"><Server size={36} className="text-amber-500" /> المعالج السحابي</h2>
            <p className="opacity-70 mt-2 text-sm">قطع ملفات المحاضرات واستمع للمعاينة أو ارفعها لدرايف.</p>
          </div>
          <div className={`rounded-3xl p-6 border dark:bg-slate-800 dark:border-slate-700 bg-white`}>
            <div className="flex mb-6 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl gap-1">
              <button onClick={() => setInputType('local')} className={`flex-1 py-3 rounded-lg font-bold ${inputType === 'local' ? 'bg-white dark:bg-slate-800 text-indigo-600' : 'text-slate-500'}`}>الجهاز</button>
              <button onClick={() => setInputType('drive')} className={`flex-1 py-3 rounded-lg font-bold ${inputType === 'drive' ? 'bg-white dark:bg-slate-800 text-indigo-600' : 'text-slate-500'}`}>Google Drive</button>
              <button onClick={() => setInputType('url')} className={`flex-1 py-3 rounded-lg font-bold ${inputType === 'url' ? 'bg-white dark:bg-slate-800 text-indigo-600' : 'text-slate-500'}`}>يوتيوب</button>
            </div>

            <form onSubmit={handleServerProcess} className="space-y-6">
              {inputType === 'url' ? (
                <input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="رابط يوتيوب..." className="w-full rounded-xl p-3 border dark:bg-slate-700 dark:border-slate-600" />
              ) : inputType === 'local' ? (
                <div className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer dark:border-slate-600" onClick={() => document.getElementById('file-up').click()}>
                  <input type="file" id="file-up" className="hidden" onChange={e => setLocalFile(e.target.files[0])} />
                  <FileAudio size={40} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm font-bold">{localFile ? localFile.name : 'اختر ملف صوت من جهازك'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {!driveToken ? <button type="button" onClick={connectDrive} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-md">ربط Google Drive</button> :
                    <div className="border dark:border-slate-600 rounded-xl p-4">
                      <button type="button" onClick={fetchDriveList} className="w-full mb-4 py-2 bg-slate-50 dark:bg-slate-700 rounded-lg border text-xs font-bold">تحديث قائمة الملفات</button>
                      {isLoadingDrive ? <Loader2 className="animate-spin mx-auto text-indigo-500" /> : 
                        <ul className="max-h-40 overflow-y-auto space-y-2">
                          {driveFiles.map(f => <li key={f.id} onClick={() => handleDriveFileSelect(f)} className={`p-2 rounded border text-xs cursor-pointer ${localFile?.id === f.id ? 'bg-indigo-600 text-white' : 'dark:border-slate-600'}`}>{f.name}</li>)}
                        </ul>
                      }
                    </div>
                  }
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 p-4 border rounded-xl dark:border-slate-700">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold"><input type="radio" checked={splitMethod === 'time'} onChange={() => setSplitMethod('time')} /> بالوقت (HH:MM:SS)</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold"><input type="radio" checked={splitMethod === 'parts'} onChange={() => setSplitMethod('parts')} /> بعدد الأجزاء</label>
                <input type="text" value={splitMethod === 'time' ? splitValueTime : splitValueParts} onChange={e => splitMethod === 'time' ? setSplitValueTime(e.target.value) : setSplitValueParts(e.target.value)} className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 text-center font-bold" />
              </div>

              <div className="p-4 border dark:border-slate-700 rounded-xl flex items-center justify-between cursor-pointer" onClick={() => setAutoUploadDrive(!autoUploadDrive)}>
                <span className="font-bold text-sm">الرفع التلقائي لـ Google Drive</span>
                <div className={`w-10 h-5 rounded-full transition-colors ${autoUploadDrive ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform mt-0.5 ${autoUploadDrive ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
              </div>

              <button type="submit" disabled={isProcessingServer} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex justify-center items-center gap-2 shadow-lg">
                {isProcessingServer ? <><Loader2 className="animate-spin" /> جاري المعالجة...</> : <><UploadCloud /> بدء التقطيع</>}
              </button>
            </form>

            {serverResult && (
              <div className="mt-8 space-y-4 animate-in zoom-in">
                <h3 className="text-xl font-bold text-green-500 flex items-center gap-2"><CheckCircle size={20}/> {serverResult.title}</h3>
                {serverResult.parts.map((p, i) => (
                  <div key={i} className="p-4 border dark:border-slate-700 rounded-xl dark:bg-slate-900 bg-slate-50 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm">{p.name}</span>
                      <div className="flex gap-2">
                        {p.drive_link && <a href={p.drive_link} target="_blank" rel="noreferrer" className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold">درايف</a>}
                        <a href={`${HUGGING_FACE_API}${p.preview_url}`} download className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold">تحميل</a>
                      </div>
                    </div>
                    <audio controls className="w-full h-8" src={`${HUGGING_FACE_API}${p.preview_url}`}></audio>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : currentView === 'pomodoro' ? (
        <main className="container mx-auto p-4 mt-6 max-w-4xl flex flex-col items-center">
           <h2 className="text-6xl font-black mb-8 font-mono">{formatTimerDisplay(timeLeft)}</h2>
           <div className="flex gap-6">
              <button onClick={() => setIsActive(!isActive)} className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl ${isActive ? 'bg-red-500' : 'bg-indigo-600'}`}>{isActive ? <Pause size={32} /> : <Play size={32} />}</button>
              <button onClick={() => { setIsActive(false); setTimeLeft(pomodoroSettings[timerMode]*60); }} className="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center"><RotateCcw size={32} /></button>
           </div>
        </main>
      ) : (
        <main className="container mx-auto p-4 flex flex-col lg:flex-row gap-6 mt-6">
          <aside className="w-full lg:w-1/4 rounded-2xl p-4 border dark:bg-slate-800 dark:border-slate-700 bg-white h-fit">
            <h2 className="font-bold mb-4 flex items-center gap-2"><List size={18} /> المواد الدراسية</h2>
            <form onSubmit={addSubject} className="flex gap-2 mb-4">
              <input type="text" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="مادة جديدة" className="flex-1 p-2 rounded-lg border dark:bg-slate-700 dark:border-slate-600 text-sm" />
              <button type="submit" className="bg-indigo-600 text-white p-2 rounded-lg"><Plus size={18}/></button>
            </form>
            <ul className="space-y-2">
              {subjects.map(s => <li key={s.id} onClick={() => setActiveSubjectId(s.id)} className={`p-3 rounded-xl border cursor-pointer font-bold transition text-sm ${activeSubjectId === s.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>{s.name}</li>)}
            </ul>
          </aside>
          <section className="w-full lg:w-3/4">
            {activeSubject ? (
              <div className="space-y-6">
                <div className="p-6 border rounded-2xl dark:bg-slate-800 dark:border-slate-700 bg-white shadow-sm">
                  <h2 className="text-2xl font-bold mb-4">{activeSubject.name}</h2>
                  <form onSubmit={addLecture} className="flex gap-2">
                    <input type="text" value={newLectureName} onChange={e => setNewLectureName(e.target.value)} placeholder="اسم المحاضرة (أو عدة أسماء مفصولة بفاصلة)..." className="flex-1 p-3 rounded-xl border dark:bg-slate-700 dark:border-slate-600 text-sm" />
                    <button type="submit" className="bg-green-600 text-white px-6 rounded-xl font-bold hover:bg-green-700 transition">إضافة</button>
                  </form>
                </div>
                <div className="space-y-3">
                  {activeSubject.lectures.map(l => (
                    <div key={l.id} className="p-4 border rounded-2xl dark:bg-slate-800 dark:border-slate-700 bg-white flex flex-col gap-4 shadow-sm hover:shadow-md transition">
                      <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
                        <span className="font-bold">{l.name}</span>
                        <button onClick={() => deleteLecture(activeSubject.id, l.id)} className="text-red-400 hover:text-red-600"><Trash2 size={18} /></button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {['studied', 'listenedRecord', 'transcribed', 'createdQuestions', 'solvedOwnQuestions', 'solvedNewQuestions'].map(k => (
                          <button key={k} onClick={() => toggleLectureTask(activeSubject.id, l.id, k)} className={`p-2 rounded-lg text-[10px] font-bold border transition ${l[k] ? 'bg-indigo-600 text-white border-indigo-600' : 'dark:border-slate-700 hover:border-indigo-400'}`}>{k === 'studied' ? 'المذاكرة' : k === 'listenedRecord' ? 'الريكورد' : k === 'transcribed' ? 'التفريغ' : k === 'createdQuestions' ? 'الأسئلة' : k === 'solvedOwnQuestions' ? 'الحل' : 'أسئلة جديدة'}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="text-center p-20 opacity-50"><BookOpen size={64} className="mx-auto mb-4" /> اختر مادة للبدء</div>}
          </section>
        </main>
      )}
    </div>
  );
}
