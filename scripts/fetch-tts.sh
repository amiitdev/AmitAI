#!/usr/bin/env bash
# Fetches the offline voice stack: sherpa-onnx native libs + the two voices.
#
# Nothing here is committed to git (see .gitignore) — the binaries are ~150 MB.
# Run this once after cloning, before the first Android build.
#
#   ./scripts/fetch-tts.sh
#
# Versions are pinned on purpose:
#   * sherpa-onnx v1.12.40 — the Kotlin API in
#     android/app/src/main/java/com/k2fsa/sherpa/onnx/Tts.kt is copied from this
#     exact tag. Mixing tags throws `NoSuchFieldError: ... "lexicon"`.
#   * Kitty v0.2 fp16 — Kitten v0.8 is rejected by this sherpa build with
#     `style_dim[0] should be 1, given: 400`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/.tts-build"
JNI="$ROOT/android/app/src/main/jniLibs"
ASSETS="$ROOT/android/app/src/main/assets/tts"

SHERPA_VERSION="v1.12.40"
SHERPA_TAR="sherpa-onnx-${SHERPA_VERSION}-android.tar.bz2"
SHERPA_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/${SHERPA_VERSION}/${SHERPA_TAR}"

PIPER_DIR="vits-piper-en_US-lessac-low-int8"
PIPER_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${PIPER_DIR}.tar.bz2"

KITTEN_DIR="kitten-nano-en-v0_2-fp16"
KITTEN_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${KITTEN_DIR}.tar.bz2"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need curl
need tar
need bzip2
need rsync

mkdir -p "$BUILD" "$JNI" "$ASSETS"

fetch() { # url -> tarball path
  local url="$1" out="$2"
  if [ -f "$out" ]; then
    echo "have  $(basename "$out")"
  else
    echo "get   $(basename "$out")"
    curl -L --fail --retry 3 --progress-bar -o "$out.part" "$url"
    mv "$out.part" "$out"
  fi
}

# --- native libraries -------------------------------------------------------
if [ -f "$JNI/arm64-v8a/libsherpa-onnx-jni.so" ] && [ -f "$JNI/x86_64/libsherpa-onnx-jni.so" ]; then
  echo "have  jniLibs (arm64-v8a, x86_64)"
else
  fetch "$SHERPA_URL" "$BUILD/$SHERPA_TAR"
  rm -rf "$BUILD/sherpa"
  mkdir -p "$BUILD/sherpa"
  tar -xjf "$BUILD/$SHERPA_TAR" -C "$BUILD/sherpa"
  for abi in arm64-v8a x86_64; do
    mkdir -p "$JNI/$abi"
    find "$BUILD/sherpa" -path "*/$abi/*.so" -exec cp -f {} "$JNI/$abi/" \;
  done
  echo "done  jniLibs"
fi

# --- voices -----------------------------------------------------------------
install_voice() { # tarball dir-name asset-target
  local tarfile="$1" dirname="$2" target="$3"
  if [ -f "$target/tokens.txt" ]; then
    echo "have  voice $target"
    return
  fi
  fetch "$4" "$tarfile"
  rm -rf "$BUILD/extract"
  mkdir -p "$BUILD/extract"
  tar -xjf "$tarfile" -C "$BUILD/extract"
  mkdir -p "$target"
  rsync -a --delete "$BUILD/extract/$dirname"/ "$target"/
  rm -rf "$BUILD/extract"
  echo "done  voice $target"
}

install_voice "$BUILD/$PIPER_DIR.tar.bz2" "$PIPER_DIR" "$ASSETS/piper" "$PIPER_URL"
install_voice "$BUILD/$KITTEN_DIR.tar.bz2" "$KITTEN_DIR" "$ASSETS/kitten" "$KITTEN_URL"

du -sh "$JNI" "$ASSETS" 2>/dev/null || true
echo "offline voice stack ready"
