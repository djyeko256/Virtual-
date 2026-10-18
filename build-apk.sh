#!/bin/bash
set -e

echo "=== Building DJ YEKO Web Application ==="
npm run build

echo "=== Packaging Web Assets into Android Assets ==="
mkdir -p android/app/src/main/assets/public
rm -rf android/app/src/main/assets/public/*
cp -r dist/* android/app/src/main/assets/public/

echo "=== Assembling Android Debug APK ==="
cd android
chmod +x gradlew || true
./gradlew assembleDebug --no-daemon

echo "=== APK Successfully Built ==="
echo "Output: android/app/build/outputs/apk/debug/app-debug.apk"
