#!/bin/bash
# Generates the iOS project from source (same steps Codemagic's CI runs) and
# opens it in Xcode. Run this on a Mac — the ios/ project isn't committed to
# the repo (it's regenerated fresh each time), and `pod install` requires
# macOS/CocoaPods, so there's no ready-made .xcodeproj to hand over directly.
#
# Usage:
#   chmod +x scripts/open_in_xcode.sh
#   ./scripts/open_in_xcode.sh

set -e
cd "$(dirname "$0")/.."

echo "== 1/4  Install npm dependencies =="
npm install --legacy-peer-deps

echo "== 2/4  Build web app =="
npm run build

echo "== 3/4  Add iOS platform + sync =="
npx cap add ios 2>/dev/null || true
npx cap sync ios

echo "== 4/4  Install CocoaPods =="
(cd ios/App && pod install)

echo ""
echo "Opening ios/App/App.xcworkspace in Xcode..."
echo "(Always open the .xcworkspace, not the bare .xcodeproj — CocoaPods needs it.)"
open ios/App/App.xcworkspace
