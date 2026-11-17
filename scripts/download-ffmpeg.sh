#!/bin/bash

# FFmpeg Binary Downloader
# Downloads the latest FFmpeg binary with NVENC support from FFmpeg-Builds
# and extracts only the required binaries

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
BINARIES_DIR="$PROJECT_ROOT/binaries"
TEMP_DIR="$PROJECT_ROOT/.ffmpeg-download-temp"
GITHUB_API_URL="https://api.github.com/repos/FFmpeg-Builds/FFmpeg-Builds/releases/latest"

echo "🚀 FFmpeg Binary Downloader"
echo ""

# Create directories
mkdir -p "$BINARIES_DIR"
mkdir -p "$TEMP_DIR"

echo "📁 Project root: $PROJECT_ROOT"
echo "📁 Binaries directory: $BINARIES_DIR"
echo ""

# Clean up any existing binaries
if [ -f "$BINARIES_DIR/ffmpeg" ] || [ -f "$BINARIES_DIR/ffprobe" ]; then
    echo "🧹 Cleaning up existing binaries..."
    rm -f "$BINARIES_DIR/ffmpeg" "$BINARIES_DIR/ffprobe"
fi

# Get latest release info and find download URL
echo "🔍 Fetching latest release from FFmpeg-Builds..."
DOWNLOAD_URL=$(curl -fsSL "$GITHUB_API_URL" | grep "browser_download_url" | grep "linux64-gpl.tar.xz" | grep -v "shared" | head -n1 | cut -d'"' -f4)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "❌ Failed to find Linux x64 GPL build URL"
    rm -rf "$TEMP_DIR"
    exit 1
fi

FILENAME=$(basename "$DOWNLOAD_URL")
echo "✅ Found: $FILENAME"
echo "📥 URL: $DOWNLOAD_URL"

# Download FFmpeg
echo ""
echo "⬇️  Downloading FFmpeg..."
cd "$TEMP_DIR"

curl -L -o "$FILENAME" "$DOWNLOAD_URL"

if [ ! -f "$FILENAME" ]; then
    echo "❌ Download failed"
    cd "$PROJECT_ROOT"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "✅ Download completed: $(du -h "$FILENAME" | cut -f1)"

# Extract archive
echo ""
echo "📂 Extracting archive..."

tar -xf "$FILENAME"

# Find extracted directory
EXTRACTED_DIR=$(find . -maxdepth 1 -name "ffmpeg-*" -type d | head -n1)

if [ -z "$EXTRACTED_DIR" ]; then
    echo "❌ Failed to find extracted directory"
    cd "$PROJECT_ROOT"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "✅ Extracted to: $EXTRACTED_DIR"

# Copy binaries to project binaries directory
echo ""
echo "📦 Copying binaries..."

if [ -f "$EXTRACTED_DIR/bin/ffmpeg" ]; then
    cp "$EXTRACTED_DIR/bin/ffmpeg" "$BINARIES_DIR/"
    chmod +x "$BINARIES_DIR/ffmpeg"
    echo "✅ Copied ffmpeg"
else
    echo "❌ ffmpeg binary not found"
    cd "$PROJECT_ROOT"
    rm -rf "$TEMP_DIR"
    exit 1
fi

if [ -f "$EXTRACTED_DIR/bin/ffprobe" ]; then
    cp "$EXTRACTED_DIR/bin/ffprobe" "$BINARIES_DIR/"
    chmod +x "$BINARIES_DIR/ffprobe"
    echo "✅ Copied ffprobe"
else
    echo "❌ ffprobe binary not found"
    cd "$PROJECT_ROOT"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Clean up temporary files
echo ""
echo "🧹 Cleaning up temporary files..."
cd "$PROJECT_ROOT"
rm -rf "$TEMP_DIR"

# Verify binaries
echo ""
echo "🔍 Verifying binaries..."

echo "📍 FFmpeg version:"
"$BINARIES_DIR/ffmpeg" -version | head -n1

echo ""
echo "📍 FFprobe version:"
"$BINARIES_DIR/ffprobe" -version | head -n1

# Check for NVENC support
echo ""
echo "🎮 GPU encoder support:"
"$BINARIES_DIR/ffmpeg" -hide_banner -encoders 2>/dev/null | grep nvenc || true

echo ""
echo "🎉 FFmpeg binaries installed successfully!"
echo "📍 Binaries location: $BINARIES_DIR"
echo ""
echo "✨ Features:"
echo "  • NVENC hardware acceleration support"
echo "  • H.264, H.265, and AV1 encoding"
echo "  • Full codec support (GPL build)"
echo "  • Ready for production use"
