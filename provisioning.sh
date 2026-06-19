#!/bin/bash

# --- 0. ARIA2C VA BUILD TOOLS O'RNATISH ---
if ! command -v aria2c &> /dev/null || ! command -v gcc &> /dev/null; then
    echo "Zaruriy tizim paketlari o'rnatilmoqda..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y aria2 build-essential python3-dev
    fi
fi

# --- 0.1 COMFYUI YANGILASH ---
echo "=== ComfyUI-ni eng so'nggi versiyaga yangilash boshlandi ==="
if [ -d "/workspace/ComfyUI/.git" ]; then
    cd /workspace/ComfyUI
    git fetch --all
    git checkout master
    git reset --hard origin/master
    git pull
fi

# --- 1. PAPKALARNI TAYYORLASH ---
mkdir -p /workspace/ComfyUI/custom_nodes/
mkdir -p /workspace/ComfyUI/models/checkpoints/
mkdir -p /workspace/ComfyUI/models/diffusion_models/
mkdir -p /workspace/ComfyUI/models/vae/
mkdir -p /workspace/ComfyUI/models/clip_vision/
mkdir -p /workspace/ComfyUI/models/text_encoders/
mkdir -p /workspace/ComfyUI/models/loras/

# --- 2. CUSTOM NODE-LARNI O'RNATISH (CLONE) ---
cd /workspace/ComfyUI/custom_nodes/

echo "=== Custom Node-larni yuklash boshlandi ==="

# darkHUB Custom Node (GitHub Public Repo)
if [ ! -d "darkHUB" ]; then
    git clone https://github.com/Cyber05CC/darkHUB-Motion-V2-client.git darkHUB
fi

# Kijai's WanVideo Wrapper (Wan 2.1 va SCAIL-2 uchun)
if [ ! -d "ComfyUI-WanVideoWrapper" ]; then
    git clone https://github.com/kijai/ComfyUI-WanVideoWrapper.git
fi

# Kijai's KJNodes (SetNode/GetNode va ImageResize uchun)
if [ ! -d "ComfyUI-KJNodes" ]; then
    git clone https://github.com/kijai/ComfyUI-KJNodes.git
fi

# Frame Interpolation (GIMMVFI)
if [ ! -d "ComfyUI-Frame-Interpolation" ]; then
    git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git
fi

# VideoHelperSuite (Video yuklash/birlashtirish)
if [ ! -d "ComfyUI-VideoHelperSuite" ]; then
    git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
fi

# Crystools (Switch any node)
if [ ! -d "ComfyUI-Crystools" ]; then
    git clone https://github.com/crystian/ComfyUI-Crystools.git
fi

# Native Looping (TensorLoopOpen/Close uchun)
if [ ! -d "ComfyUI-NativeLooping_testing" ]; then
    git clone https://github.com/kijai/ComfyUI-NativeLooping_testing.git
fi

# Impact Pack (ToBinaryMask va boshqalar)
if [ ! -d "ComfyUI-Impact-Pack" ]; then
    git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack.git
fi

# Pythongosssss's Custom Scripts (PlaySound)
if [ ! -d "ComfyUI-Custom-Scripts" ]; then
    git clone https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git
fi

# Easy Use Nodes
if [ ! -d "comfyui-easy-use" ]; then
    git clone https://github.com/yolain/comfyui-easy-use.git
fi

# LayerStyle (CropByMask va boshqalar)
if [ ! -d "ComfyUI_LayerStyle" ]; then
    git clone https://github.com/chflame163/ComfyUI_LayerStyle.git
fi

# RGThree Nodes (Bookmarks)
if [ ! -d "rgthree-comfy" ]; then
    git clone https://github.com/rgthree/rgthree-comfy.git
fi

# WAS Node Suite
if [ ! -d "was-node-suite-comfyui" ]; then
    git clone https://github.com/WASasquatch/was-node-suite-comfyui.git
fi

# SeedVR2 Video Upscaler
if [ ! -d "ComfyUI-Video-Upscaler" ]; then
    git clone https://github.com/numz/ComfyUI-Video-Upscaler.git
fi

# --- 3. KUTUBXONALARNI O'RNATISH ---
echo "=== Python kutubxonalarini o'rnatish ==="
PIP_CMD="/venv/main/bin/pip"
if [ ! -f "$PIP_CMD" ]; then
    PIP_CMD="pip"
fi

# ComfyUI-ning o'z requirements.txt faylini o'rnatish/yangilash (comfy-aimdo kabi ichki kutubxonalarni moslashtirish uchun)
if [ -f "/workspace/ComfyUI/requirements.txt" ]; then
    echo "ComfyUI-ning asosiy kutubxonalarini yangilash..."
    $PIP_CMD install --no-cache-dir -r /workspace/ComfyUI/requirements.txt
fi

# Zaruriy kutubxonalar va Frontend-ni ComfyUI-ning o'z muhitiga o'rnatish/yangilash
$PIP_CMD install --no-cache-dir opencv-python-headless accelerate deepdiff comfyui-frontend-package

for d in */; do
    if [ -f "$d/requirements.txt" ]; then
        echo "Installing requirements for $d..."
        $PIP_CMD install --no-cache-dir -r "$d/requirements.txt"
    fi
done

# --- 3.1 darkHUB KODLARINI SHIFRLASH (CYTHON KOMPILYATSIYA) ---
if [ -d "darkHUB" ] && [ -f "darkHUB/nodes.py" ]; then
    cd darkHUB
    echo "=== darkHUB Node'larini shifrlash (Cython kompilyatsiyasi) boshlandi ==="
    $PIP_CMD install cython
    
    # setup.py yaratish
    cat << 'EOF' > setup.py
from setuptools import setup
from Cython.Build import cythonize
setup(
    ext_modules=cythonize("nodes.py", compiler_directives={'language_level': "3"})
)
EOF

    # Kompilyatsiya qilish
    /venv/main/bin/python setup.py build_ext --inplace
    
    # Asl kodlarni o'chirish (Mijoz ko'ra olmasligi uchun)
    if ls nodes*.so 1> /dev/null 2>&1; then
        echo "Kompilyatsiya bajarildi. Asl kodlar o'chirilmoqda..."
        rm -f nodes.py
        rm -f setup.py
        rm -f nodes.c
        rm -rf build
    else
        echo "Xavotirli holat: Kompilyatsiya o'xshamadi! Xavfsizlik uchun python fayli o'chirilmadi."
    fi
    cd ..
fi

# --- 4. MODELLARNI ARIA2C BILAN YUKLASH (MAX TEZLIKDA) ---
echo "=== Modellarni yuklash boshlandi ==="

download_file() {
    local dir=$1
    local filename=$2
    local url=$3
    local headers=$4

    mkdir -p "$dir"
    cd "$dir"
    if [ -f "$filename" ] && [ -s "$filename" ]; then
        echo "$filename allaqachon mavjud, yuklash shart emas."
        return 0
    fi

    echo "Yuklanmoqda: $filename..."
    local cmd="aria2c -x 16 -s 16 -k 1M -o \"$filename\""
    if [ -n "$headers" ]; then
        cmd="$cmd $headers"
    fi
    cmd="$cmd \"$url\""

    for i in {1..3}; do
        echo "Urinish $i/3..."
        # DNS warm up
        local domain=$(echo "$url" | awk -F/ '{print $3}')
        getent ahosts "$domain" > /dev/null 2>&1 || true
        
        eval $cmd
        if [ -f "$filename" ] && [ -s "$filename" ]; then
            echo "$filename muvaffaqiyatli yuklandi."
            return 0
        fi
        echo "Yuklashda xatolik bo'ldi. 5 soniyadan so'ng qayta urinib ko'riladi..."
        sleep 5
    done

    echo "Xato: $filename yuklab bo'linmadi!"
    return 1
}

# 1. SAM 3.1 Checkpoint
download_file "/workspace/ComfyUI/models/checkpoints/" "sam3.1-multiplex-fp16.safetensors" "https://huggingface.co/Comfy-Org/sam3.1/resolve/main/checkpoints/sam3.1_multiplex_fp16.safetensors"

# 2. darkHUB MotionBase BF48 (Shaxsiy HF - Token orqali)
download_file "/workspace/ComfyUI/models/diffusion_models/" "darkHUB-MotionBase-BF48.safetensors" "https://huggingface.co/darkenHUB/darkHUB-MotionBase-BF48/resolve/main/darkHUB-MotionBase-BF48.safetensors" "--header=\"Authorization: Bearer $HF_TOKEN\""

# 3. Wan 2.1 VAE
download_file "/workspace/ComfyUI/models/vae/" "wan_2.1_vae_Comfy-Org.safetensors" "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors"

# 4. CLIP Vision
download_file "/workspace/ComfyUI/models/clip_vision/" "clip_vision_vit_h.safetensors" "https://huggingface.co/lllyasviel/misc/resolve/main/clip_vision_vit_h.safetensors"

# 5. UMT5 XXL Text Encoder
download_file "/workspace/ComfyUI/models/text_encoders/" "umt5_xxl_fp8_e4m3fn_scaled.safetensors" "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"

# 6. Wan 2.1 Distilled Image-To-Video LoRA
download_file "/workspace/ComfyUI/models/loras/" "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors" "https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors"