// =================================================================
// Inisialisasi Elemen DOM
// =================================================================
const imageUpload = document.getElementById('image-upload');
const predictButton = document.getElementById('predict-button');
const statusDiv = document.getElementById('status');
const resultsContainer = document.getElementById('results-container');
const modal = document.getElementById("zoomModal");
const imageBefore = document.getElementById("imageBefore");
const canvasAfter = document.getElementById("canvasAfter");
const closeBtn = document.getElementsByClassName("close")[0];

// =================================================================
// State untuk Fitur Zoom & Pan
// =================================================================
let transformState = {
    before: { scale: 1, offsetX: 0, offsetY: 0 },
    after: { scale: 1, offsetX: 0, offsetY: 0 }
};
let isDragging = false;
let activeElement = null;
let startPos = { x: 0, y: 0 };


// =================================================================
// Fungsi Handler untuk Zoom & Pan
// =================================================================
function applyTransform(element, stateKey) {
    const { scale, offsetX, offsetY } = transformState[stateKey];
    element.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

function resetTransforms() {
    transformState = {
        before: { scale: 1, offsetX: 0, offsetY: 0 },
        after: { scale: 1, offsetX: 0, offsetY: 0 }
    };
    applyTransform(imageBefore, 'before');
    applyTransform(canvasAfter, 'after');
}

function onWheel(event, element, stateKey) {
    event.preventDefault();
    const state = transformState[stateKey];
    const zoomSpeed = 0.1;
    
    state.scale += event.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    state.scale = Math.max(1, Math.min(5, state.scale));
    
    applyTransform(element, stateKey);
}

function onMouseDown(event, element, stateKey) {
    event.preventDefault();
    isDragging = true;
    activeElement = { element, stateKey };
    
    const state = transformState[stateKey];
    startPos.x = event.clientX - state.offsetX;
    startPos.y = event.clientY - state.offsetY;
    
    element.classList.add('grabbing');
}

function onMouseUp() {
    if (activeElement) {
        activeElement.element.classList.remove('grabbing');
    }
    isDragging = false;
    activeElement = null;
}

function onMouseMove(event) {
    if (!isDragging || !activeElement) return;
    
    const state = transformState[activeElement.stateKey];
    state.offsetX = event.clientX - startPos.x;
    state.offsetY = event.clientY - startPos.y;

    applyTransform(activeElement.element, activeElement.stateKey);
}

// =================================================================
// Event Listeners Utama
// =================================================================
closeBtn.onclick = () => { modal.style.display = "none"; };
modal.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        modal.style.display = "none";
    }
};

window.addEventListener('mouseup', onMouseUp);
window.addEventListener('mousemove', onMouseMove);

imageBefore.addEventListener('wheel', (e) => onWheel(e, imageBefore, 'before'));
canvasAfter.addEventListener('wheel', (e) => onWheel(e, canvasAfter, 'after'));
imageBefore.addEventListener('mousedown', (e) => onMouseDown(e, imageBefore, 'before'));
canvasAfter.addEventListener('mousedown', (e) => onMouseDown(e, canvasAfter, 'after'));

imageUpload.onchange = () => {
    const numFiles = imageUpload.files.length;
    if (numFiles > 0) {
        statusDiv.textContent = `${numFiles} gambar dipilih.`;
        predictButton.disabled = false;
        resultsContainer.innerHTML = '';
    } else {
        statusDiv.textContent = `Belum ada gambar dipilih`;
        predictButton.disabled = true;
    }
};

predictButton.onclick = async () => {
    const files = imageUpload.files;
    if (files.length === 0) return alert("Silakan pilih file gambar!");
    
    predictButton.disabled = true;
    statusDiv.textContent = 'Mempersiapkan...';
    resultsContainer.innerHTML = '';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        statusDiv.textContent = `Memproses gambar ${i + 1}/${files.length}: ${file.name}...`;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch('/predict', { method: 'POST', body: formData });
            if (!response.ok) throw new Error(`Error: ${response.statusText}`);
            const result = await response.json();
            await displayResult(file, result);
        } catch (error) {
            console.error("Gagal prediksi:", file.name, error);
        }
    }
    statusDiv.textContent = `Selesai! ${files.length} gambar diproses.`;
    predictButton.disabled = false;
};

// =================================================================
// Fungsi Logika Utama
// =================================================================
/** Membuat dan menampilkan kartu hasil deteksi. */
async function displayResult(file, result) {
    const { predictions, prediction_time } = result;

    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'canvas-container';
    const thumbnailCanvas = document.createElement('canvas');
    canvasContainer.appendChild(thumbnailCanvas);
    const infoDiv = document.createElement('div');
    infoDiv.className = 'info';
    const fileName = document.createElement('h3');
    fileName.textContent = file.name;
    const timeText = document.createElement('p');
    timeText.textContent = `Waktu deteksi: ${prediction_time.toFixed(2)} detik`;

    infoDiv.append(fileName, timeText);

    // --- PERBAIKAN FINAL DIMULAI DI SINI ---

    // 1. Definisikan ambang batas (pastikan semua key menggunakan huruf kecil)
    const thresholds = {
        'crack': 0.45,
        'snail track': 0.20,
        'burn': 0.20,
        'non defective': 0.50
    };

    // 2. Filter prediksi: Ubah label menjadi huruf kecil sebelum membandingkan
    const filteredPredictions = predictions.filter(p => {
        const label = p.label.toLowerCase().trim(); // Standarisasi label
        const threshold = thresholds[label] || 0; // Ambil threshold, atau 0 jika label tidak dikenal
        return p.confidence > threshold;
    });

    // 3. Pisahkan kerusakan nyata dari hasil yang SUDAH DIFILTER
    const defectPredictions = filteredPredictions.filter(p => {
        const label = p.label.toLowerCase().trim(); // Standarisasi label lagi saat membandingkan
        return label !== 'non defective';
    });

    // 4. Tampilkan pesan berdasarkan jumlah KERUSAKAN NYATA
    if (defectPredictions.length === 0) {
        const noDefectText = document.createElement('p');
        noDefectText.textContent = 'Tidak ada kerusakan ditemukan.';
        infoDiv.append(noDefectText);
    } else {
        const countText = document.createElement('p');
        countText.textContent = `Ditemukan ${defectPredictions.length} kerusakan:`;

        const detailsText = document.createElement('p');
        // Buat ringkasan HANYA dari array defectPredictions
        const labelCounts = defectPredictions.reduce((acc, p) => {
            acc[p.label] = (acc[p.label] || 0) + 1;
            return acc;
        }, {});
        const summary = Object.entries(labelCounts).map(([label, count]) => `${count} ${label}`).join(', ');
        detailsText.textContent = summary;

        infoDiv.append(countText, detailsText);
    }
    
    // --- PERBAIKAN SELESAI ---

    resultItem.append(canvasContainer, infoDiv);
    resultsContainer.appendChild(resultItem);

    const img = await loadImage(file);
    
    // PENTING: Gunakan 'filteredPredictions' untuk menggambar di kanvas
    // Ini memastikan semua yang lolos threshold (termasuk 'non defective') akan digambar
    drawThumbnail(thumbnailCanvas, img, filteredPredictions);

    canvasContainer.onclick = () => {
        resetTransforms();
        modal.style.display = "block";
        imageBefore.src = img.src;
        drawOnCanvas(canvasAfter, img, filteredPredictions, false);
    };
}

// =================================================================
// Fungsi Pembantu (Helpers)
// =================================================================
function loadImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function drawThumbnail(canvas, img, predictions) {
    const containerSize = canvas.parentElement.clientWidth;
    if (containerSize > 0) {
        canvas.width = containerSize;
        canvas.height = containerSize;
        drawOnCanvas(canvas, img, predictions, true);
    }
}

function drawOnCanvas(canvas, img, predictions, isCover) {
    const ctx = canvas.getContext('2d');
    let scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0;

    if (isCover) {
        const canvasAspect = canvas.width / canvas.height;
        const imgAspect = img.width / img.height;
        if (imgAspect > canvasAspect) {
            scaleY = canvas.height / img.height;
            scaleX = scaleY;
            offsetX = (canvas.width - img.width * scaleX) / 2;
        } else {
            scaleX = canvas.width / img.width;
            scaleY = scaleX;
            offsetY = (canvas.height - img.height * scaleY) / 2;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, offsetX, offsetY, img.width * scaleX, img.height * scaleY);
    } else {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
    }
    
    drawPredictions(ctx, predictions, { scaleX, scaleY, offsetX, offsetY }, isCover);
}

function drawPredictions(ctx, predictions, transform, isThumbnail) {
    const { scaleX, scaleY, offsetX, offsetY } = transform;
    let canvasFontSize, canvasLineWidth;

    if (isThumbnail) {
        const baseFontSize = 13;
        const baseLineWidth = 1.5;
        const viewScale = ctx.canvas.clientWidth > 0 ? ctx.canvas.clientWidth / ctx.canvas.width : 1;
        canvasFontSize = baseFontSize / viewScale;
        canvasLineWidth = baseLineWidth / viewScale;
    } else {
        canvasFontSize = ctx.canvas.height * 0.05;
        canvasLineWidth = canvasFontSize / 8;
    }

    const canvasFontHeight = canvasFontSize * 1.3;
    
    const colorMap = { 
        'burn': '#780000',
        'crack': '#141413ff',
        'snail track': '#669bbc',
        'non defective': '#136f63'
    };
    const defaultColor = 'magenta';
    
    ctx.font = `${canvasFontSize}px 'IBM Plex Mono'`;
    ctx.lineWidth = canvasLineWidth;

    const drawnLabels = [];
    const sortedPredictions = [...predictions].sort((a, b) => a.box[1] - b.box[1]);

    sortedPredictions.forEach(p => {
        // Gunakan label yang sudah distandarisasi untuk mencari warna
        const color = colorMap[p.label.toLowerCase().trim()] || defaultColor;
        const [origX1, origY1, origX2, origY2] = p.box;
        const x1 = origX1 * scaleX + offsetX;
        const y1 = origY1 * scaleY + offsetY;
        const x2 = origX2 * scaleX + offsetX;
        const y2 = origY2 * scaleY + offsetY;

        ctx.strokeStyle = color;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        
        const label = `${p.label} (${(p.confidence * 100).toFixed(1)}%)`;
        const textWidth = ctx.measureText(label).width;
        
        let xPos = x1 + 5;
        if (xPos + textWidth > ctx.canvas.width) {
            xPos = ctx.canvas.width - textWidth - 5;
        }
        
        let yPos = (y1 - canvasFontHeight > 0) ? y1 - canvasFontHeight : y1 + canvasLineWidth;
        let collision = true;
        while (collision) {
            collision = false;
            const currentLabelArea = { start: yPos, end: yPos + canvasFontHeight };
            for (const area of drawnLabels) {
                if (currentLabelArea.start < area.end && currentLabelArea.end > area.start) {
                    collision = true;
                    yPos = area.end + 2;
                    break;
                }
            }
        }
        drawnLabels.push({ start: yPos, end: yPos + canvasFontHeight });
        
        ctx.fillStyle = color;
        const padding = canvasFontSize * 0.4;
        ctx.fillRect(xPos - (padding / 2), yPos, textWidth + padding, canvasFontHeight);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, xPos, yPos + canvasFontSize * 0.9);
    });
}