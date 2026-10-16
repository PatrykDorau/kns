#!/usr/bin/env bash
# Test aplikacji na telefon w prawdziwym trybie (logowanie w dwóch krokach, serwer kont, Dysk) bez Google:
# kopia mobile/ w katalogu tymczasowym z udawanym logowaniem, Dyskiem i serwerem (udawane-google.js).
#   bash skrypty/test-ui/przygotuj.sh && npx vite "$TEMP/kns-mtest" --port 5183
# W przeglądarce: localStorage 'mock-user' = adres zalogowanego (admin@kns.pl jest administratorem).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
out="${TEMP:-/tmp}/kns-mtest"
rm -rf "$out" && cp -r "$here/../../mobile" "$out" && cp "$here/udawane-google.js" "$out/mock.js"
cd "$out"
sed -i "s/^  folderId: '[^']*',/  folderId: '',/" config.js
sed -i 's#<script src="https://accounts.google.com/gsi/client" async defer></script>#<script src="mock.js"></script>#' index.html
sed -i "s#navigator.serviceWorker.register('sw.js')#Promise.resolve()#" index.html
sed -i "s#  apiUrl: '',#  apiUrl: 'https://mock.api/exec',#; s#appUrl: 'https://kns-nabo.netlify.app'#appUrl: 'http://localhost:5183'#" config.js
echo "Gotowe: $out"
