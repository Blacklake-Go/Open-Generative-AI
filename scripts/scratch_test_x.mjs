import crypto from 'crypto';
import { execSync } from 'child_process';
import { Scraper, SearchMode } from 'agent-twitter-client';

const password = execSync('security find-generic-password -w -s "Chrome Safe Storage"').toString().trim();
const key = crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
const iv = Buffer.alloc(16, ' ');

function decryptRaw(hex) {
  const buf = Buffer.from(hex, 'hex');
  const ciphertext = buf.subarray(3);
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const auth_hex = '76313026D4273FBD2750725A381974A576C58FDF82188AF33D4570958B264EB718229A02AB3D652A9F68B09B58132CB96FEDDD4C9D475EF47C8D4BB318AB3F8E8B914552B04FEE4DD00D2489437F9FC01CB337';
const ct0_hex = '76313026D4273FBD2750725A381974A576C58FDF82188AF33D4570958B264EB718229A17D1AE7B72180370933AED5B7CD919B807C8271ACDCF8A43882C518BDEA5CC09D09013D888B8C83BDF8B38C9BC133C3FEC0D2CA635E5E8318D374BB3392837D8682322FD7903C000457659FEB19E948F7EC68CE7F855A9F57AB222C555827376155561AA3F984BC6113CD963ECC74A6FCAA3BB1DABCECAD55E80D7FCBD102FD415B431AB568CB2B4EB43723256CD5F527DAD1355FADB3C0DE7462AE8B5980B800250B205AFEDBEADEB96B1D26DA45B2C';

const authToken = decryptRaw(auth_hex).subarray(32).toString('utf8');
const ct0 = decryptRaw(ct0_hex).subarray(32).toString('utf8');

console.log('Decrypted authToken length:', authToken.length);
console.log('Decrypted ct0 length:', ct0.length);

async function test() {
  const scraper = new Scraper();
  
  // Set for twitter.com (twUrl is twitter.com in agent-twitter-client)
  await scraper.setCookies([
    `auth_token=${authToken}; Domain=twitter.com; Path=/; Secure; HttpOnly`,
    `ct0=${ct0}; Domain=twitter.com; Path=/; Secure`
  ]);

  console.log('Cookie String:', await scraper.auth.getCookieString());

  const loggedIn = await scraper.isLoggedIn();
  console.log('isLoggedIn:', loggedIn);

  if (!loggedIn) {
    console.log('Trying direct GraphQL / Search test...');
  }

  try {
    const iterator = scraper.searchTweets('Flux prompt', 3, SearchMode.Latest);
    for await (const t of iterator) {
      console.log('SUCCESS! Found tweet:', t.username, t.text.slice(0, 100));
      break;
    }
  } catch (err) {
    console.error('Search error:', err.message, err.data || '');
  }
}

test();
