#!/bin/bash

# --- 0. ARIA2C O'RNATISH (YUKLASH TEZLIGI UCHUN) ---
if ! command -v aria2c &> /dev/null; then
    echo "aria2c topilmadi. O'rnatilmoqda..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y aria2
    fi
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

# Zaruriy kutubxonalarni ComfyUI-ning o'z muhitiga o'rnatish
$PIP_CMD install --no-cache-dir opencv-python-headless accelerate deepdiff

for d in */; do
    if [ -f "$d/requirements.txt" ]; then
        echo "Installing requirements for $d..."
        $PIP_CMD install --no-cache-dir -r "$d/requirements.txt"
    fi
done

# --- 4. MODELLARNI ARIA2C BILAN YUKLASH (MAX TEZLIKDA) ---
echo "=== Modellarni yuklash boshlandi ==="

# 1. SAM 3.1 Checkpoint
cd /workspace/ComfyUI/models/checkpoints/
if [ ! -f "sam3.1-multiplex-fp16.safetensors" ]; then
    aria2c -x 16 -s 16 -k 1M -o "sam3.1-multiplex-fp16.safetensors" "https://huggingface.co/Comfy-Org/sam3.1/resolve/main/checkpoints/sam3.1_multiplex_fp16.safetensors"
fi

# 2. darkHUB MotionBase BF48 (Shaxsiy HF - Token orqali)
cd /workspace/ComfyUI/models/diffusion_models/
if [ ! -f "darkHUB-MotionBase-BF48.safetensors" ]; then
    aria2c --header="Authorization: Bearer $HF_TOKEN" -x 16 -s 16 -k 1M -o "darkHUB-MotionBase-BF48.safetensors" "https://huggingface.co/darkenHUB/darkHUB-MotionBase-BF48/resolve/main/darkHUB-MotionBase-BF48.safetensors"
fi

# 3. Wan 2.1 VAE
cd /workspace/ComfyUI/models/vae/
if [ ! -f "wan_2.1_vae_Comfy-Org.safetensors" ]; then
    aria2c -x 16 -s 16 -k 1M -o "wan_2.1_vae_Comfy-Org.safetensors" "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors"
fi

# 4. CLIP Vision
cd /workspace/ComfyUI/models/clip_vision/
if [ ! -f "clip_vision_vit_h.safetensors" ]; then
    aria2c -x 16 -s 16 -k 1M -o "clip_vision_vit_h.safetensors" "https://huggingface.co/comfyanonymous/clip_vision_g/resolve/main/clip_vision_vit_h.safetensors"
fi

# 5. UMT5 XXL Text Encoder
cd /workspace/ComfyUI/models/text_encoders/
if [ ! -f "umt5_xxl_fp8_e4m3fn_scaled.safetensors" ]; then
    aria2c -x 16 -s 16 -k 1M -o "umt5_xxl_fp8_e4m3fn_scaled.safetensors" "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"
fi

# 6. Wan 2.1 Distilled Image-To-Video LoRA
cd /workspace/ComfyUI/models/loras/
if [ ! -f "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors" ]; then
    aria2c -x 16 -s 16 -k 1M -o "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors" "https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors"
fi

# 7. Wan 2.1 14B SCAIL 2 (FP16)
cd /workspace/ComfyUI/models/diffusion_models/
if [ ! -f "wan2.1_14B_SCAIL_2_fp16.safetensors" ]; then
    aria2c -x 16 -s 16 -k 1M -o "wan2.1_14B_SCAIL_2_fp16.safetensors" "https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/wan2.1_14B_SCAIL_2_fp16.safetensors"
fi