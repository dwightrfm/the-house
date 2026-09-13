#!/bin/bash
# Bump the cache-busting version on every asset so phones never load stale code.
# Run this before every push that changes app.js or styles.css.
cd "$(dirname "$0")"
CUR=$(grep -o 'app.js?v=[0-9]*' index.html | head -1 | grep -o '[0-9]*')
NEW=$((CUR + 1))
sed -i '' "s/?v=$CUR/?v=$NEW/g" index.html
echo "assets bumped to v$NEW"
