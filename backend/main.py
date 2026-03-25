import io
import time
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from ultralytics import YOLO

# =============================================================
# Path Configuration
# =============================================================
# Semua path dihitung relatif terhadap ROOT proyek (proyek_yolo/)
# bukan terhadap folder backend/, agar konsisten saat dijalankan
# dengan: uvicorn backend.main:app --reload (dari root)
BASE_DIR = Path(__file__).resolve().parent.parent  # → proyek_yolo/
MODEL_PATH = BASE_DIR / "model" / "best.pt"
FRONTEND_DIR = BASE_DIR / "frontend"

# =============================================================
# App & Middleware
# =============================================================
app = FastAPI(title="Sistem Deteksi Kerusakan Panel Surya")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================
# Load Model
# =============================================================
try:
    model = YOLO(str(MODEL_PATH))
    print(f"✅ Model berhasil dimuat dari: {MODEL_PATH}")
except Exception as e:
    print(f"❌ Error memuat model dari '{MODEL_PATH}': {e}")
    model = None

# =============================================================
# Static Files & Frontend
# =============================================================
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_root_html():
    index_path = FRONTEND_DIR / "index.html"
    with open(index_path, encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), status_code=200)

# =============================================================
# Endpoint Prediksi
# =============================================================
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if not model:
        return {"error": "Model tidak berhasil dimuat. Periksa log server."}

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    start_time = time.time()
    results = model(image)
    prediction_time = round(time.time() - start_time, 2)

    # Kirim semua hasil deteksi mentah dari model (filter dilakukan di frontend)
    predictions = []
    for result in results:
        class_names = result.names
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()
            confidence = box.conf[0].item()
            class_id = int(box.cls[0].item())
            label = class_names[class_id]
            predictions.append({
                "label": label,
                "confidence": round(confidence, 4),
                "box": [round(coord) for coord in xyxy]
            })

    return {
        "filename": file.filename,
        "predictions": predictions,
        "prediction_time": prediction_time
    }