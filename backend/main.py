from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import chromadb
import os
import re
import base64
import uuid
import tempfile
from openai import OpenAI
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

load_dotenv()

# --- CLIENTS ---
# Groq is still used for Vision and Voice (it has a free tier)
groq_client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.getenv("GROQ_API_KEY")
)

# --- FREE LOCAL EMBEDDER (No OpenAI needed) ---
# This downloads ~80MB on first run and runs entirely on your machine.
local_embedder = SentenceTransformer('all-MiniLM-L6-v2')

app = FastAPI(title="Momento API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DIRECTORIES ---
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs("./chroma_db", exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# --- DATABASE ---
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="momento_memory")

# --- MODELS ---
class NoteCapture(BaseModel):
    text: str
    offset: float
    session_id: str

class ScreenCapture(BaseModel):
    image_base64: str
    offset: float
    session_id: str

class SearchQuery(BaseModel):
    query: str

def redact_sensitive_data(text: str) -> str:
    text = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', '[REDACTED_EMAIL]', text)
    text = re.sub(r'(sk-[a-zA-Z0-9]{20,})', '[REDACTED_API_KEY]', text)
    text = re.sub(r'(?i)(password|passwd|pwd)[\s:=]+[^\s]+', r'\1: [REDACTED]', text)
    return text

def get_embedding(text):
    # Free local embedding (no API key, no cost)
    embedding = local_embedder.encode(text)
    return embedding.tolist()

@app.get("/")
def read_root():
    return {"status": "Momento API is running"}

@app.post("/capture/note")
async def capture_note(note: NoteCapture):
    safe_text = redact_sensitive_data(note.text)
    embedding = get_embedding(safe_text)
    collection.add(
        embeddings=[embedding],
        documents=[safe_text],
        metadatas=[{
            "type": "note", 
            "offset": note.offset, 
            "session_id": note.session_id
        }],
        ids=[f"note_{note.session_id}_{note.offset}"]
    )
    return {"status": "success", "message": "Note saved", "offset": note.offset}

@app.post("/capture/screen")
async def capture_screen(screen: ScreenCapture):
    base64_data = screen.image_base64.split(",")[1]
    filename = f"{uuid.uuid4()}.jpg"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    with open(filepath, "wb") as f:
        f.write(base64.b64decode(base64_data))
    
    try:
        response = groq_client.chat.completions.create(
            model="qwen/qwen3.8-27b", 
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe the key information, code, or text visible in this screenshot in one sentence."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_data}"}}
                    ]
                }
            ],
            max_tokens=100
        )
        description = response.choices[0].message.content
        safe_text = redact_sensitive_data(description)
        embedding = get_embedding(safe_text)
        
        collection.add(
            embeddings=[embedding],
            documents=[safe_text],
            metadatas=[{
                "type": "screen", 
                "offset": screen.offset, 
                "session_id": screen.session_id,
                "image_url": f"/uploads/{filename}"
            }],
            ids=[f"screen_{screen.session_id}_{screen.offset}"]
        )
        return {"status": "success", "description": safe_text, "image_url": f"/uploads/{filename}"}
    except Exception as e:
        print(f"Screen Error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/capture/voice")
async def capture_voice(
    audio: UploadFile = File(...), 
    offset: float = Form(...), 
    session_id: str = Form(...)
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
            temp_audio.write(await audio.read())
            temp_path = temp_audio.name

        with open(temp_path, "rb") as f:
            transcription = groq_client.audio.transcriptions.create(
                file=(temp_path, f.read()),
                model="whisper-large-v3-turbo",
                response_format="text"
            )
        
        os.remove(temp_path)
        
        safe_text = redact_sensitive_data(str(transcription))
        embedding = get_embedding(safe_text)
        
        collection.add(
            embeddings=[embedding],
            documents=[safe_text],
            metadatas=[{"type": "voice", "offset": offset, "session_id": session_id}],
            ids=[f"voice_{session_id}_{offset}"]
        )
        return {"status": "success", "transcription": safe_text, "offset": offset}
        
    except Exception as e:
        print(f"Voice Error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/search")
async def search_memory(query: SearchQuery):
    query_embedding = get_embedding(query.query)
    results = collection.query(query_embeddings=[query_embedding], n_results=5)
    
    formatted_results = []
    for i in range(len(results['documents'][0])):
        # Distance threshold: filter out results that are too far (irrelevant)
        if results['distances'][0][i] < 0.7: 
            formatted_results.append({
                "text": results['documents'][0][i],
                "metadata": results['metadatas'][0][i]
            })
    
    if not formatted_results:
        return {"query": query.query, "results": [], "message": "No relevant memories found."}
        
    return {"query": query.query, "results": formatted_results}