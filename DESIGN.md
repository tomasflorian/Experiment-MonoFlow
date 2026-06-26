# Monoflow — Design

## Invariant

```
∀ node N : |out(N)| ≤ 1
```

Every node has at most one outgoing edge. Many incoming edges are fine.

## What this builds

A character-level graph. Atoms are characters. Words, phrases, and concepts
are not input primitives — they emerge as multi-character nodes when
single-character identity is no longer sufficient to preserve the invariant.

The graph records only what has been attested, with enough prior context to
make each continuation deterministic.

## Data model

```typescript
type Graph = {
  out: Map<string, string>;      // node → its one successor
  in:  Map<string, Set<string>>; // node → all predecessors
};
```

Node IDs are plain strings. Single characters initially; longer strings when
context had to be extended. The ID is the label — no separate fields needed.

The `in` map is required for conflict resolution: when a node is pruned, all
of its predecessors must be redirected, not just the current path's.

## Insertion algorithm

Maintain a cursor `(prev, curr)` through the graph as the sequence is walked.

For each character `ch` in the input:

| Condition | Action |
|---|---|
| `out[curr]` absent | Add `curr → ch`. Advance. |
| `out[curr] == ch` | Already exists. Advance. |
| `out[curr] == other` | **Conflict.** Resolve. |

Advance means: `prev ← curr`, `curr ← ch`.

## Conflict resolution

When `out[curr] == other` but we need `curr → ch`, the conflicting node
is pruned entirely. No ambiguous node survives.

```
for each predecessor P of curr:
    newNode = P + curr
    out[P]       = newNode          // redirect P away from curr
    in[newNode]  = { P }
    in[curr].remove(P)

    if P pointed to curr for the "existing" path:
        out[newNode] = other        // carry forward existing outgoing
    else:                           // P is the current path's predecessor
        out[newNode] = ch           // new path continues

delete curr from graph              // pruned — no ambiguous node survives
cursor ← (prev + curr, ch)         // cursor reflects the new node name
```

Resolution may cascade: if a newly created `P + curr` node immediately
conflicts, resolve it the same way. For a single sentence this always
terminates because each resolution strictly increases minimum context length.

## Emerged vocabulary

After insertion, any node whose ID length > 1 is a discovered unit —
a context that had to be named because a single character was ambiguous.

## Phase 1 deliverable

Input: one string — `"the_cat_was_old"`

Output:
- all edges
- multi-character nodes highlighted
- walk from `^` reconstructing the original string via atom characters

No persistence. No server. No query language. No probability.

## Phase 2 (not yet)

Multiple strings. New behavior:
- shared paths merge naturally (two sentences sharing "the" converge)
- genuine branch points appear where backward context cannot resolve
  ambiguity even at sentence start — these are real choice points,
  not failures

## What is not in scope until it is needed

Probability, generalization, embeddings, tokenization, persistence,
provenance, compression, inference.
