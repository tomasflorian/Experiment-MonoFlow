#!/usr/bin/env bash
set -euo pipefail

npx tsx src/monoflow2.ts thecatwasoldandhappy --cycles=2
npx tsx src/monoflow2.ts thecatwasoldandhappy --cycles=1
npx tsx src/monoflow2.ts thecatwasoldandhappy --cycles=3
npx tsx src/monoflow2.ts thecatwasoldandhappy --cycles=4
npx tsx src/monoflow2.ts thecatwasoldandhappy --cycles=5
npx tsx src/monoflow2.ts abc --cycles=1
npx tsx src/monoflow2.ts thecatwasoldandhappyitwasonatreeandlookingdownthedaywassunny --cycles=1
