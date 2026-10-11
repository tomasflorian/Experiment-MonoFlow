<br><br><br>

> **Archived: Use this repo instead: (https://github.com/tomasflorian/DataStudies).**



<br><br><br>

# MonoFlow

MonoFlow is a TypeScript experiment for unsupervised text segmentation. It starts with single-character tokens, repeatedly builds a directed transition graph over the token stream, and promotes frequent graph structure into longer compound tokens.

The current implementation is a CLI prototype in `src/monoflow2.ts`. It prints the generated graph, reports simple English-dictionary statistics, and writes each run to `log/`.

## Repository Layout

```text
src/monoflow2.ts     Main CLI and graph-building implementation
corpus/              Sample input texts
log/                 Saved run outputs
graph.graphml        Existing graph export/artifact
run.sh               Hand-picked sample runs
run-auto.sh          Replays unique commands stored in log files
package.json         Node/TypeScript dependency metadata
tsconfig.json        TypeScript compiler settings
```

## Requirements

- Node.js 18 or newer
- npm
- A local English word list at `/usr/share/dict/american-english`

On Debian/Ubuntu systems, the dictionary is usually provided by packages such as `wamerican`.

## Install

```bash
npm install
```

## Run

Run the CLI directly with `tsx`:

```bash
npx tsx src/monoflow2.ts thecatwasoldandhappy --cycles=2
```

Run against a file:

```bash
npx tsx src/monoflow2.ts --file=alice.txt --cycles=2
```

Bare file names are resolved relative to `corpus/` when a matching file exists. Paths containing `/` or `\` are used as provided.

Available flags:

```text
--cycles=N       Maximum compounding cycles to run. Default: 2
--min-degree=N   Minimum outgoing degree required to keep compounding. Default: 2
--file=PATH      Read input text from a file instead of the positional argument
```

If no positional input or `--file` is provided, the CLI uses:

```text
thecatwasoldandhappy
```

## Output

Each run prints:

- the command that can reproduce the run
- stop status and cycle count
- graph edges in `source -> targets` form
- token statistics checked against `/usr/share/dict/american-english`

Example:

```text
npx tsx src/monoflow2.ts catisoldandcatiscalm --cycles=3
status: max-cycles cycles=3
^ -> c, ca, cat
a -> l, n, t
c -> a
d -> a, c, ca
i -> s
l -> d, da, m
n -> d
o -> l
s -> c, ca, o
t -> i, is
ca -> l, t
da -> n, nd
is -> cal, ol, olda
nd -> ca
ol -> da
cal -> m
cat -> is
tis -> cal
ndca -> tis
olda -> ndca
tokens: 21
tokens length >= 3: 6
english length >= 3: 2/6 33.33%
english sentences: 0/0 0.00%
english dictionary: /usr/share/dict/american-english
english dictionary entries: 102485
```

The same output body is saved under `log/` using a deterministic input-based name, for example:

```text
log/catiso-1033ab-iscalm-3.log
log/thecat-9e096f-dhappy-2.log
```

Long token names are shortened as:

```text
first 6 chars + sha256 middle hash prefix + last 6 chars
```

## Algorithm Notes

At a high level, `build()` performs these steps:

1. Seed the token set with `^` plus every character in the normalized input.
2. Traverse the input with longest-known-token matching.
3. Build directed edges between adjacent tokens in the stream.
4. Find nodes with the largest outgoing degree that have not already been processed.
5. For each selected node, create compound tokens from the previous token plus the selected token.
6. Repeat until `--cycles` is reached, no new tokens are added, or the best outgoing degree falls below `--min-degree`.

Input normalization currently removes carriage returns and newlines, then lowercases the text. Other spacing and punctuation are preserved unless the caller preprocesses the input.

Stop statuses:

```text
max-cycles        Reached the requested cycle limit
stable            A cycle selected nodes but created no new tokens
below-threshold   The highest available outgoing degree was below --min-degree
```

## Helper Scripts

Run the curated sample commands:

```bash
./run.sh
```

Replay unique commands recorded as the first line of existing log files:

```bash
./run-auto.sh
```

`run-auto.sh` uses `eval` on commands read from `log/*.log`, so only run it with trusted log files.

## Current Caveats

- `npm start` currently points to `src/monoflow.ts`, but the repository contains `src/monoflow2.ts`. Use `npx tsx src/monoflow2.ts ...` unless the script is updated.
- There is no test script in `package.json`.
- `npx tsc --noEmit` failed in this checkout because `node_modules/typescript/bin/tsc` contains `require('../lib/**')`, which appears to be an invalid local install artifact. Reinstalling dependencies should regenerate a normal TypeScript binary.
- The CLI requires `/usr/share/dict/american-english`; it does not currently fall back when the dictionary is missing.
