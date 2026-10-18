#!/usr/bin/env bash
# Test aplikacji na telefon w trybie bazy danych bez Supabase i bez Google: prawdziwy schemat i reguły
# (supabase/schema.sql) w PGlite w przeglądarce + udawany Dysk i logowanie Google (udawane-google.js).
#   bash skrypty/test-ui/przygotuj-baza.sh && npx vite "$TEMP/kns-stest" --port 5184
# W przeglądarce: localStorage 'mock-user' = adres, którym „logujesz się” (admin@kns.pl jest administratorem).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
out="${TEMP:-/tmp}/kns-stest"
rm -rf "$out" && cp -r "$here/../../mobile" "$out"
cp "$here/udawane-google.js" "$out/mock.js"
cp "$here/udawana-baza.js" "$out/udawana-baza.js"
cp "$here/../../supabase/fake-client.mjs" "$here/../../supabase/schema.sql" "$here/../../supabase/powiadomienia.sql" "$here/../../supabase/kalendarz.sql" "$here/../../supabase/zatwierdzanie.sql" "$here/../../supabase/profil.sql" "$here/../../supabase/sluzby.sql" "$here/../../supabase/skrzynka.sql" "$here/../../supabase/zapisy.sql" "$here/../../supabase/posluchaj.sql" "$here/../../supabase/asb.sql" "$here/../../supabase/wiadomosci.sql" "$here/../../supabase/materialy.sql" "$here/../../supabase/przeczytane.sql" "$here/../../supabase/cele.sql" "$out/"
cd "$out"
sed -i "s/^  folderId: '[^']*',/  folderId: '',/" config.js
sed -i 's#<script src="https://accounts.google.com/gsi/client" async defer></script>#<script src="mock.js"></script>#' index.html
sed -i 's#<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>#<script src="udawana-baza.js"></script>#' index.html
sed -i "s#navigator.serviceWorker.register('sw.js')#Promise.resolve()#" index.html
sed -i "s#appUrl: 'https://kns-nabo.netlify.app'#appUrl: 'http://localhost:5184'#" config.js
grep -q udawana-baza.js index.html && echo "Gotowe: $out"
