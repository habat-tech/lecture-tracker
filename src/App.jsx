import os
import json
import uuid
import tempfile
import shutil
import asyncio
from typing import Optional
from fastapi import FastAPI, HTTPException, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import yt_dlp
from pydub import AudioSegment
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from pyrogram import Client, filters

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static_audio", exist_ok=True)
app.mount("/static", StaticFiles(directory="static_audio"), name="static")

def get_drive_service():
    creds_json = os.environ.get("GDRIVE_CREDENTIALS")
    if not creds_json:
        raise Exception("مفتاح Google Drive غير موجود في إعدادات السيرفر.")
    creds_dict = json.loads(creds_json)
    creds = service_account.Credentials.from_service_account_info(
        creds_dict, scopes=['https://www.googleapis.com/auth/drive.file']
    )
    return build('drive', 'v3', credentials=creds)

def time_str_to_ms(time_str):
    h, m, s = map(int, time_str.split(':'))
    return (h * 3600 + m * 60 + s) * 1000

@app.get("/")
def home():
    return {"message": "السيرفر يعمل بنجاح! 🚀"}

@app.post("/process-audio")
async def process_audio(
    inputType: str = Form(...),
    split_mode: str = Form(...),
    split_value: str = Form(...),
    auto_upload: str = Form(...),
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    temp_dir = tempfile.mkdtemp()
    base_name = f"Lecture_{uuid.uuid4().hex[:4]}"
    download_path = os.path.join(temp_dir, f"{base_name}.mp3")
    
    try:
        video_title = base_name
        if inputType == 'local':
            if not file: raise Exception("لم يتم استلام الملف.")
            video_title = file.filename.replace(".mp3", "").replace(".mp4", "")
            with open(download_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        elif inputType == 'url':
            if not url: raise Exception("لم يتم توفير رابط.")
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': download_path,
                'postprocessors': [{'key': 'FFmpegExtractAudio','preferredcodec': 'mp3'}],
                'quiet': True,
                'source_address': '0.0.0.0', 
                'geo_bypass': True
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                video_title = info.get('title', base_name)

        audio = AudioSegment.from_file(download_path)
        total_ms = len(audio)
        chunks = []

        if split_mode == 'time':
            chunk_length_ms = time_str_to_ms(split_value)
            for i in range(0, total_ms, chunk_length_ms):
                chunks.append(audio[i:i + chunk_length_ms])
        else:
            parts = int(split_value)
            chunk_length_ms = total_ms // parts
            for i in range(parts):
                start = i * chunk_length_ms
                end = start + chunk_length_ms if i < parts - 1 else total_ms
                chunks.append(audio[start:end])

        results = []
        drive_service = get_drive_service() if auto_upload == 'true' else None

        for i, chunk in enumerate(chunks):
            part_filename = f"Part_{i+1}_{base_name}.mp3"
            chunk_path = os.path.join("static_audio", part_filename)
            chunk.export(chunk_path, format="mp3")
            
            drive_link = None
            if auto_upload == 'true' and drive_service:
                file_metadata = {'name': f"{video_title} - Part {i+1}.mp3"}
                media = MediaFileUpload(chunk_path, mimetype='audio/mpeg')
                drive_file = drive_service.files().create(body=file_metadata, media_body=media, fields='id, webViewLink').execute()
                
                # إعطاء صلاحية عامة للرابط لتفادي خطأ 403
                drive_service.permissions().create(
                    fileId=drive_file.get('id'),
                    body={'type': 'anyone', 'role': 'reader'}
                ).execute()
                
                drive_link = drive_file.get('webViewLink')

            results.append({
                "name": f"الجزء {i+1}",
                "preview_url": f"/static/{part_filename}",
                "drive_link": drive_link
            })

        if os.path.exists(download_path): os.remove(download_path)
        return {"status": "success", "title": video_title, "parts": results}

    except Exception as e:
        if os.path.exists(download_path): os.remove(download_path)
        raise HTTPException(status_code=500, detail=str(e))

# ================= Telegram Bot =================
API_ID = os.environ.get("API_ID")
API_HASH = os.environ.get("API_HASH")
BOT_TOKEN = os.environ.get("BOT_TOKEN")

bot = None
if API_ID and API_HASH and BOT_TOKEN:
    bot = Client("lecture_bot", api_id=int(API_ID), api_hash=API_HASH, bot_token=BOT_TOKEN, in_memory=True)

    @bot.on_message(filters.audio | filters.voice | filters.document)
    async def handle_audio_message(client, message):
        msg = await message.reply_text("📥 جاري استلام الريكورد من تليجرام...")
        temp_dir = tempfile.mkdtemp()
        file_path = await message.download(file_name=temp_dir + "/")
        await msg.edit_text("✂️ جاري التقطيع والرفع لـ Google Drive...")
        
        try:
            audio = AudioSegment.from_file(file_path)
            parts = 4 
            chunk_length_ms = len(audio) // parts
            drive_service = get_drive_service()
            links = []
            base_name = f"Telegram_{uuid.uuid4().hex[:4]}"
            
            for i in range(parts):
                start = i * chunk_length_ms
                end = start + chunk_length_ms if i < parts - 1 else len(audio)
                chunk = audio[start:end]
                chunk_path = os.path.join(temp_dir, f"Part_{i+1}_{base_name}.mp3")
                chunk.export(chunk_path, format="mp3")
                
                file_metadata = {'name': f"{base_name} - Part {i+1}.mp3"}
                media = MediaFileUpload(chunk_path, mimetype='audio/mpeg')
                file = drive_service.files().create(body=file_metadata, media_body=media, fields='id, webViewLink').execute()
                drive_service.permissions().create(fileId=file.get('id'), body={'type': 'anyone', 'role': 'reader'}).execute()
                
                links.append(file.get('webViewLink'))
                os.remove(chunk_path)
                
            os.remove(file_path)
            reply_text = "🎉 تم التقطيع والرفع بنجاح!\n\n"
            for i, link in enumerate(links):
                reply_text += f"🔗 الجزء {i+1}:\n{link}\n\n"
            await msg.edit_text(reply_text)
        except Exception as e:
            await msg.edit_text(f"❌ خطأ:\n{str(e)}")

@app.on_event("startup")
async def startup_event():
    if bot: await bot.start()

@app.on_event("shutdown")
async def shutdown_event():
    if bot: await bot.stop()
