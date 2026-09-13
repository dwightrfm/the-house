#!/bin/bash
# Bump the build number everywhere so phones pick up changes instead of sitting
# on a cached copy. Run before every push that touches app.js or styles.css.
cd "$(dirname "$0")"
CUR=$(grep -o 'app.js?v=[0-9]*' index.html | head -1 | grep -o '[0-9]*')
NEW=$((CUR + 1))
sed -i '' "s/?v=$CUR/?v=$NEW/g" index.html
sed -i '' "s/^const BUILD = [0-9]*;/const BUILD = $NEW;/" app.js
echo "$NEW" > version.txt
echo "build $NEW"
