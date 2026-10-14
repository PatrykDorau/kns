// Jednorazowo: klucze do powiadomień na telefon. Uruchom:  node skrypty/klucze-powiadomien.cjs
// i wklej wynik do Netlify (zmienne środowiskowe) oraz hasło do skryptu przypomnienia w Google.
// Nie zapisuj tych wartości w repozytorium.
const crypto = require('node:crypto')
const ecdh = crypto.createECDH('prime256v1')
ecdh.generateKeys()
console.log('\nNetlify → Project configuration → Environment variables → Add a variable:\n')
console.log('  VAPID_PRIVATE =', ecdh.getPrivateKey().toString('base64url'))
const secret = crypto.randomBytes(24).toString('base64url')
console.log('  PUSH_SECRET   =', secret)
console.log('\nTo samo hasło (PUSH_SECRET) wpisz w skrypcie przypomnienia (pushSecret).\n')
