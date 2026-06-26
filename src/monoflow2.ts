declare const process: { argv: string[] };
declare const require: (module: string) => {
  createHash?: Function;
  existsSync?: Function;
  mkdirSync?: Function;
  readFileSync?: Function;
  writeFileSync?: Function;
};

type Edge = `${string}->${string}`;
type Token = {
  id: string;
  text: string;
};
type Trie = {
  children: Map<string, Trie>;
  tokens: Token[];
};
type StopReason = (
  "max-cycles"
  | "stable"
  | "below-threshold"
);
type BuildResult = {
  edges: Set<Edge>;
  tokens: Map<string, Token>;
  stopReason: StopReason;
  cyclesRun: number;
};

const START = "^";
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const existsSync = fs.existsSync;
const mkdirSync = fs.mkdirSync;
const readFileSync = fs.readFileSync;
const writeFileSync = fs.writeFileSync;
const CORPUS_DIR = "corpus";

// Adds one directed graph edge.
// input  edges, from="t", to="wa"
// output
// state  edges now has "t->wa"
function add(
  edges: Set<Edge>,
  from: string,
  to: string,
): void {
  edges.add(`${from}->${to}`);
}

// Builds the graph by repeated compounding.
// input  "thecatwasoldandhappy"
//        cycles=2, minDegree=2
// output edges include "cat->wa"
//        "d->hap", "hap->p"
// state
function build(
  input: string,
  cycles: number,
  minDegree: number,
): BuildResult {
  const tokens = new Map<string, Token>();
  const done = new Set<string>();
  let edges = new Set<Edge>();

  addToken(tokens, START);
  for (const char of input) {
    addToken(tokens, char);
  }

  for (let cycle = 0; cycle < cycles; cycle++) {
    const stream = traverse(input, tokens);
    merge(edges, graphFrom(stream));

    const outgoing = outgoingByNode(edges);
    const available = [...outgoing]
      .filter(([node]) => !done.has(node));
    const degrees = available
      .map(([, to]) => to.size);
    const top = Math.max(0, ...degrees);

    if (top < minDegree) {
      merge(edges, graphFrom(traverse(input, tokens)));
      return {
        edges,
        tokens,
        stopReason: "below-threshold",
        cyclesRun: cycle,
      };
    }

    const selected = available
      .filter(([, to]) => to.size === top)
      .map(([node]) => node)
      .sort();

    let added = false;

    for (const node of selected) {
      done.add(node);
      for (let i = 1; i < stream.length; i++) {
        if (stream[i].id !== node) continue;

        const compound = stream[i - 1].text
          + stream[i].text;
        if (addToken(tokens, compound)) {
          added = true;
        }
      }
    }

    if (!added) {
      merge(edges, graphFrom(traverse(input, tokens)));
      return {
        edges,
        tokens,
        stopReason: "stable",
        cyclesRun: cycle + 1,
      };
    }
  }

  merge(edges, graphFrom(traverse(input, tokens)));
  return {
    edges,
    tokens,
    stopReason: "max-cycles",
    cyclesRun: cycles,
  };
}

// Adds all edges from one set into another.
// input  target={"a->t"}, source={"a->s"}
// output
// state  target has {"a->t", "a->s"}
function merge(
  target: Set<Edge>,
  source: Set<Edge>,
): void {
  for (const edge of source) {
    target.add(edge);
  }
}

// Adds a known token with a deterministic ID.
// input  tokens, text="thecatwasoldandhappy"
// output
// state  tokens has id "thecat-9e096f-dhappy"
function addToken(
  tokens: Map<string, Token>,
  text: string,
): boolean {
  const id = tokenId(text);
  const existing = tokens.get(id);

  if (existing?.text !== undefined) {
    if (existing.text !== text) {
      throw new Error(`Token ID collision: ${id}`);
    }
    return false;
  }

  tokens.set(id, { id, text });
  return true;
}

// Builds the ID for a token.
// input  "thecatwasoldandhappy"
// output "thecat-9e096f-dhappy"
// state
function tokenId(text: string): string {
  if (text.length <= 12) return text;

  const head = text.slice(0, 6);
  const middle = text.slice(6, -6);
  const tail = text.slice(-6);

  return [head, hash6(middle), tail].join("-");
}

// Tokenizes input with longest known tokens.
// input  "thecatwasoldandhappy"
// output starts with "^", "t", "h", "e"
// state  throws on equal-length ambiguity
function traverse(
  input: string,
  tokens: Map<string, Token>,
): Token[] {
  const stream = [tokens.get(START)!];
  const trie = trieFrom(tokens);

  for (let index = 0; index < input.length;) {
    const winners = longestAt(input, index, trie);

    if (winners.length !== 1) {
      const names = winners
        .map(token => token.id)
        .join(", ");
      throw new Error(
        `Ambiguous traversal at ${index}: ${names}`,
      );
    }

    stream.push(winners[0]);
    index += winners[0].text.length;
  }

  return stream;
}

// Builds a trie from known tokens.
// input  tokens include "cat", "ca"
// output trie matching "cat" before "ca"
// state
function trieFrom(tokens: Map<string, Token>): Trie {
  const root = newTrie();

  for (const token of tokens.values()) {
    if (token.text === START) continue;
    let node = root;

    for (const char of token.text) {
      if (!node.children.has(char)) {
        node.children.set(char, newTrie());
      }
      node = node.children.get(char)!;
    }

    node.tokens.push(token);
  }

  return root;
}

// Creates an empty trie node.
// input
// output Trie with no children or tokens
// state
function newTrie(): Trie {
  return {
    children: new Map(),
    tokens: [],
  };
}

// Finds longest matching tokens at one index.
// input  "thecat", index=3, trie has "ca"
// output token "ca"
// state
function longestAt(
  input: string,
  index: number,
  trie: Trie,
): Token[] {
  let node = trie;
  let longest: Token[] = [];

  for (let i = index; i < input.length; i++) {
    const next = node.children.get(input[i]);
    if (next === undefined) break;

    node = next;
    if (node.tokens.length > 0) {
      longest = node.tokens;
    }
  }

  return longest;
}

// Builds graph edges from a token stream.
// input  ["^", "t", "he"]
// output edges include "^->t", "t->he"
// state
function graphFrom(stream: Token[]): Set<Edge> {
  const edges = new Set<Edge>();

  for (let i = 0; i < stream.length - 1; i++) {
    add(edges, stream[i].id, stream[i + 1].id);
  }

  return edges;
}

// Groups edges by their source node.
// input  {"a->t", "a->s", "wa->s"}
// output "a" -> {"t", "s"}
//        "wa" -> {"s"}
// state
function outgoingByNode(
  edges: Set<Edge>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const edge of edges) {
    const [from, to] = edge.split("->");
    if (!out.has(from)) out.set(from, new Set());
    out.get(from)!.add(to);
  }
  return out;
}

// Formats graph edges as sorted text lines.
// input  {"a->t", "a->s"}
// output ["a -> s, t"]
// state
function lines(edges: Set<Edge>): string[] {
  const result: string[] = [];
  const outgoing = outgoingByNode(edges);

  const rows = [...outgoing]
    .sort(([a], [b]) => {
      return a.length - b.length
        || a.localeCompare(b);
    });

  for (const [from, to] of rows) {
    const targets = [...to].sort();
    result.push(
      `${from} -> ${targets.join(", ")}`,
    );
  }

  return result;
}

// Reads a numeric --name=value CLI flag.
// input  process.argv has "--cycles=2"
// output arg("cycles", 1) returns 2
// state
function arg(
  name: string,
  fallback: number,
): number {
  const prefix = `--${name}=`;
  const match = process.argv
    .find(a => a.startsWith(prefix));
  const value = match?.split("=")[1];

  if (value === undefined) return fallback;
  return Number(value);
}

// Reads a string --name=value CLI flag.
// input  process.argv has "--file=input.txt"
// output argText("file") returns "input.txt"
// state
function argText(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv
    .find(a => a.startsWith(prefix));

  return match?.slice(prefix.length);
}

// Resolves bare --file names against the corpus directory.
// input  "alice.txt"
// output "corpus/alice.txt" when it exists
// state
function inputFilePath(file: string): string {
  if (file.includes("/") || file.includes("\\")) {
    return file;
  }

  const corpusFile = `${CORPUS_DIR}/${file}`;
  if (existsSync!(corpusFile)) return corpusFile;

  return file;
}

// Normalizes input before graph building.
// input  "The\nCat"
// output "thecat"
// state
function normalizeInput(value: string): string {
  return value
    .replaceAll("\r", "")
    .replaceAll("\n", "")
    .toLocaleLowerCase();
}

// Quotes a command argument when needed.
// input  "thecatwasoldandhappy"
// output "thecatwasoldandhappy"
// state
function shellArg(value: string): string {
  const plain = /^[A-Za-z0-9_./:=+-]+$/;
  if (plain.test(value)) return value;

  return `'${value.replaceAll("'", "'\\''")}'`;
}

// Hashes omitted filename text to 6 chars.
// input  "wasoldan"
// output "9e096f"
// state
function hash6(value: string): string {
  return createHash!("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 6);
}

// Builds the readable part of a log name.
// input  "thecatwasoldandhappy"
// output "thecat-9e096f-dhappy"
// state
function logNameFor(input: string): string {
  return tokenId(input);
}

// Reads the local English dictionary.
// input  "/usr/share/dict/american-english"
// output Set with 102485 unique words
// state
function readDictionary(path: string): Set<string> {
  const text = String(readFileSync!(path, "utf8"));
  const words = text
    .split(/\r?\n/)
    .map(word => word.trim().toLocaleLowerCase())
    .filter(word => word.length > 0);

  return new Set(words);
}

// Converts text into dictionary-check words.
// input  "boat, in;"
// output ["boat", "in"]
// state
function sentenceWords(text: string): string[] {
  return text
    .replaceAll(/[^a-z ]/g, "")
    .split(" ")
    .filter(word => word.length > 0);
}

// Checks whether all sentence words are English.
// input  "boat in"
// output true
// state
function isEnglishSentence(
  text: string,
  dictionary: Set<string>,
): boolean {
  const words = sentenceWords(text);
  if (words.length < 2) return false;

  return words.every(word => {
    return dictionary.has(word);
  });
}

// Formats token dictionary statistics.
// input  tokens from "thecatwasoldandhappy"
// output lines with token and English counts
// state
function statsLines(
  tokens: Map<string, Token>,
  dictionary: Set<string>,
  dictionaryPath: string,
): string[] {
  const texts = [...tokens.values()]
    .map(token => token.text)
    .filter(text => text !== START);
  const wordLike = texts
    .filter(text => text.length >= 3);
  const matches = wordLike
    .filter(text => dictionary.has(text));
  const sentences = texts
    .filter(text => sentenceWords(text).length >= 2);
  const englishSentences = sentences
    .filter(text => {
      return isEnglishSentence(text, dictionary);
    });
  const percent = wordLike.length === 0
    ? "0.00"
    : (matches.length / wordLike.length * 100)
      .toFixed(2);
  const sentencePercent = sentences.length === 0
    ? "0.00"
    : (
      englishSentences.length
      / sentences.length
      * 100
    ).toFixed(2);

  return [
    `tokens: ${texts.length}`,
    `tokens length >= 3: ${wordLike.length}`,
    [
      "english length >= 3:",
      `${matches.length}/${wordLike.length}`,
      `${percent}%`,
    ].join(" "),
    [
      "english sentences:",
      `${englishSentences.length}/${sentences.length}`,
      `${sentencePercent}%`,
    ].join(" "),
    `english dictionary: ${dictionaryPath}`,
    `english dictionary entries: ${dictionary.size}`,
  ];
}

// Parses args, builds graph, prints output.
// input  npx tsx src/monoflow2.ts \
//        thecatwasoldandhappy --cycles=2
// output console graph lines
// state  writes log/thecat-9e096f-dhappy-2.log
const args = process.argv.slice(2);
const file = argText("file");
const cliInput = args
  .find(a => !a.startsWith("--"))
  ?? "thecatwasoldandhappy";
const input = file === undefined
  ? normalizeInput(cliInput)
  : normalizeInput(
    String(readFileSync!(inputFilePath(file), "utf8")).trim(),
  );
const cycles = arg("cycles", 2);
const minDegree = arg("min-degree", 2);
const result = build(input, cycles, minDegree);
const output = lines(result.edges);
const dictionaryPath = "/usr/share/dict/american-english";
const dictionary = readDictionary(dictionaryPath);
const stats = statsLines(
  result.tokens,
  dictionary,
  dictionaryPath,
);
const status = [
  `status: ${result.stopReason}`,
  `cycles=${result.cyclesRun}`,
].join(" ");

const flags = args
  .filter(a => a.startsWith("--"));

// Builds the command recorded in the log.
// input  args and resolved input
// output "npx tsx src/monoflow2.ts ..."
// state
const command = [
  "npx",
  "tsx",
  "src/monoflow2.ts",
  file === undefined ? input : undefined,
  ...flags,
].filter(value => value !== undefined)
  .map(shellArg)
  .join(" ");

console.log(command);
console.log(status);
for (const line of output) console.log(line);
for (const line of stats) console.log(line);

const name = logNameFor(input);
const fileName = `${name}-${cycles}.log`;
const path = `log/${fileName}`;
const body = [
  status,
  ...output,
  ...stats,
].join("\n");

// Builds the complete log file contents.
// input  command and graph body
// output log text
// state
const text = `${command}\n${body}\n`;

mkdirSync!("log", { recursive: true });
writeFileSync!(path, text);

export {};
