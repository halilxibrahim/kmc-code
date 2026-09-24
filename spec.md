# spec.md — Security & Trust Architecture Specification (v0.1)

> This document is the project's primary specification. Its purpose is to
> reason systematically, before any code is written, about the risks
> introduced by the permissions granted to the agent (this LLM-based
> coding tool) — drawing on the design notes from Hixie's `llmdevsilo`
> and on the design philosophy behind Claude Code (Boris Cherny).
>
> The architecture is not yet finalized (backend language, sandbox
> technology, single-machine vs. multi-client — all still open). This
> document exists to clarify *what threats the system is being designed
> against* before those decisions are made.

## 0. Scope and two guiding influences

This document draws on two complementary mindsets:

- **Spec-first discipline (Hixie):** every system behavior and edge case
  is reasoned through on paper before code is written. Security-critical,
  expensive-to-change decisions — sandbox boundaries, trust boundaries —
  are handled with this discipline.
- **Minimalism and dogfooding (Boris Cherny):** "do the simplest thing
  first," avoid building unnecessary complexity around today's
  assumptions. Accordingly, this document covers **only the trust and
  security layer** — it does not address UI, feature scope, or technology
  choices; those are separate, lighter-weight, iterative decisions.

The sections below apply a threat-modeling process (capability inventory
→ worst case per capability → trust boundaries → attacker goals → known
incidents → self-red-team checklist) to this specific project.

## 1. Capabilities

Before the architecture is finalized, the capabilities the agent will
likely be granted are listed here at a general level. This list must be
updated whenever a new capability is added.

| # | Capability | Description |
|---|---|---|
| C1 | File read | Read files within the project directory |
| C2 | File write / edit | Write to the project directory, modify existing files |
| C3 | Command execution (Bash/Exec) | Run programs such as compilers, test runners, package managers |
| C4 | Network access | Download dependencies, call external APIs, perform web searches |
| C5 | LLM provider communication | Prompt and code content sent to the Anthropic/OpenAI/local model API |
| C6 | Session/history persistence | Conversation history, file diffs, etc. stored on disk |
| C7 | Credential access | Access to API keys, `.env`-style secrets (where required) |
| C8 | Multi-client / remote connection *(future, optional)* | Connecting to the harness from another device (e.g. phone) — inspired by Silo |

## 2. Worst case per capability

| Capability | Worst case |
|---|---|
| C1 – Read | A secret file in the project directory (`.env`, an SSH key, a credential) enters the LLM's context and is unintentionally carried into conversation history or the request sent to the LLM provider. |
| C2 – Write | A manipulated dependency or file (containing a prompt injection) tricks the LLM into quietly writing a backdoor into the project — which could be committed unnoticed. |
| C3 – Bash/Exec | Arbitrary code execution — potential full system compromise: disk wipe, reverse shell, resource exhaustion (cryptomining), reaching into other projects/files. |
| C4 – Network | Data exfiltration triggered by prompt injection (POSTing secrets to an external server), DNS tunneling, installing typosquatted/dependency-confusion packages. |
| C5 – LLM communication | Prompt/code content logged on the provider side, or traffic intercepted (MITM) — a particular concern for closed-source, sensitive projects. |
| C6 – Session persistence | Secrets left over from history stored in plaintext on disk, readable by another process/user. |
| C7 – Credential access | Misconfiguration mounts secrets into the sandbox, making them visible to the LLM. |
| C8 – Multi-client | A weak pairing mechanism lets an unauthorized device connect to the harness and gain full control. |

## 3. Trust boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  User's host machine                       (HIGHEST TRUST)   │
│                                                               │
│   ┌───────────────────────────────────────────────────┐     │
│   │  Harness / backend process                          │     │
│   │  - manages LLM requests                             │     │
│   │  - sets up / tears down the sandbox                 │     │
│   │  - holds secrets/credentials here (never in sandbox)│     │
│   │                                                      │     │
│   │   ┌─────────────────────────────────────────┐      │     │
│   │   │  Sandbox (where the agent actually runs)  │      │     │
│   │   │  - treated as "adversarial by default"    │      │     │
│   │   │  - C1, C2, C3 happen here                 │      │     │
│   │   │  - only outside connection: proxy (C4)    │      │     │
│   │   └─────────────────────────────────────────┘      │     │
│   └───────────────────────────────────────────────────┘     │
└───────────────┬───────────────────────────┬─────────────────┘
                │ (C5: API call)             │ (C4: via proxy,
                ▼                            │  allow-listed)
      ┌──────────────────┐                   ▼
      │ LLM provider       │        ┌──────────────────────┐
      │ (Anthropic/OpenAI/ │        │ Internet / third-party │
      │  local model)       │        │ dependencies           │
      │ SEPARATE TRUST      │        │ UNTRUSTED              │
      │ BOUNDARY            │        └──────────────────────┘
      └──────────────────┘

  (Future, if C8 is enabled: "remote clients" — phone/other machine —
   become a separate trust boundary, requiring pairing + asymmetric-key
   authentication.)
```

**Rule:** every data flow crossing from the sandbox to the host, or from
the host to the LLM provider, must be **deliberate and controlled** — no
flow should be "open by default."

## 4. The attacker's goal — not just the mechanism

When designing a security control, asking "what is the attacker's actual
goal" produces more durable protection than asking "what mechanism am I
blocking" — mechanisms change, goals don't. Likely attacker goals:

1. **Exfiltration:** extracting secrets, source code, or user data.
   *(The most likely and most dangerous goal — C1, C4, C5, C6, C7 can all
   serve it.)*
2. **Persistence / backdoor:** quietly inserting code into a CI/CD
   pipeline, git hooks, or dependency files — maintaining undetected
   access over time. *(C2, C3 serve this goal.)*
3. **Sabotage:** wiping a disk, corrupting a repository, causing data
   loss. *(C2, C3.)*
4. **Resource abuse:** draining API quota/budget, using the sandbox for
   cryptomining. *(C3, C4.)*
5. **Lateral movement:** pivoting from the sandbox to the host, or (in a
   multi-client architecture) from one user to another. *(C3, C8.)*

The question to ask for every new feature/capability: **"Which of the
five goals above could this serve an attacker?"**

## 5. Known incidents (external references)

These are not arbitrary — they represent well-known failure classes. See
the sources for full detail; only the mapping to the goals above is
noted here:

- **Coding agents unintentionally exfiltrating secrets from environment
  variables/files** — an example of Goal 1 (exfiltration).
- **A coding agent wiping a disk outside the user's intent** — an example
  of Goal 3 (sabotage); typically caused by an over-broad or
  misinterpreted command.
- **The "lethal trifecta" (Simon Willison):** when an agent simultaneously
  (a) has access to private data, (b) processes untrusted content, and
  (c) can communicate externally, exfiltration risk becomes nearly
  unavoidable. Source: <https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/>
- **OWASP GenAI/LLM Top 10 (2026):** prompt injection and "excessive
  agency" (granting an agent more capability than it needs) rank at the
  top. Source: <https://genai.owasp.org/>
- **llmdevsilo design notes:** a concrete implementation of the
  sandbox + proxy + allow-list approach that inspired this project.

## 6. Attacking our own system — self-red-team checklist

> **Note:** this list was written before any system existed, as the
> questions that must not be forgotten. Items are checked off as the
> v0 agent is actually tested against them. It is not a substitute for a
> real security review.

- [x] **Path traversal via `run_command`** — *confirmed in manual testing
      of v0:* the path-guard only covered `read_file`/`write_file`, so the
      agent could run `cat ../../backend/.env` and read a real secret.
      Now blocked by the Level 0 classifier (§8), with a regression test
      for the exact commands observed.
- [ ] **Symlink escape** — still open. Neither the classifier nor the
      path-guard resolves symlinks: a symlink inside the workspace that
      points outside it would pass both.
- [ ] Even with network access disabled, can data still be exfiltrated
      via DNS queries (DNS tunneling)?
- [ ] Do any conversation/operation logs store secrets in plaintext
      anywhere? *(The classifier's decision log — §8 — stores task, plan
      and command text locally; it is gitignored but not redacted.)*
- [ ] (If C8 is enabled) Can the pairing code be brute-forced — how many
      attempts, how long would it take?
- [ ] Is there any control against dependency-confusion / typosquatting
      attacks during dependency installation?
- [ ] Can the sandbox process consume unlimited host CPU/memory/disk
      (resource exhaustion / DoS)?
- [ ] In any given request to the LLM, has a secret that should *not* be
      in the sandbox accidentally entered the context (e.g. a wrong
      mount, a wrong env var)?

This list will serve as the starting point when a real security review /
penetration test is performed — for now it is recorded simply as
"questions we must not forget."

## 7. Open questions / next steps

This spec deliberately does **not** answer the following (per Boris
Cherny's "do the simplest thing first" principle — it is still early):

- What sandbox technology will be used? (Docker, gVisor, Firecracker, or
  something simpler — plain process isolation?)
- What language will the backend be written in?
- Single machine, or a harness/UI split with multiple clients, as in
  Silo?
- Network policy: fully closed by default, or an allow-list defined from
  the start? *(Interim answer at the command level: the §8 classifier
  blocks known network commands unless `AGENT_ALLOW_NETWORK=true`. This
  is not network isolation — see §8 limitations.)*
- Human confirmation: irreversible actions are currently blocked
  outright. Should they instead pause and ask the user (turning the
  classifier's `block` into `ask`)?

These questions will be answered in new sections added to this document
as the architecture becomes clearer.

## 8. Pre-execution action classifier

### Why it exists

Manual testing against the §6 checklist found a real gap in v0: the
path-guard only protected `read_file` and `write_file`, while
`run_command` could leave the workspace and read `backend/.env`. The
real fix is a sandbox, but the sandbox technology is still an open
question (§7). A classifier that inspects every tool call *before* it
runs is a layer that can ship now and still earns its place once a
sandbox exists.

### Inspiration: Jev (TypeSafe AI)

[Jev](https://www.firecrawl.dev/blog/what-is-jev) is the first model
from TypeSafe AI. It does not generate text; it is a "System One" model
built for fast, structured decisions — in their words, a smart `if`
statement. In an agent harness, before each bash/write/edit call, the
harness sends Jev the task, the agent's stated plan and the pending
command, and gets four typed answers back in roughly 250 ms:

1. Is this irreversible?
2. Is it off-task?
3. Does it mutate anything?
4. What is its scope?

Plain code then decides whether the call runs. This project adopts the
same shape: the four questions, the same inputs, and a decision made by
code rather than by the model being judged.

This is deliberately *not* "the model watches itself." The judge is a
separate, narrow component that never sees the conversation, so a
prompt injection that fools the main model does not automatically fool
the judge. Level 0 below has no model at all — it cannot be talked out
of a decision.

### Interface

Every level implements the same contract, so the agent loop never
changes when the engine behind it does:

```ts
classifyToolCall({ task, plan, tool, input }) → {
  irreversible: boolean
  offTask: boolean | null   // null = this level cannot judge intent
  mutates: boolean
  scope: 'workspace' | 'outside_workspace' | 'unknown'
  network: boolean
  privileged: boolean
  decision: 'allow' | 'block'
  reasons: string[]
  classifier: string        // which engine made the call, e.g. 'rules-v0'
}
```

### Roadmap: four levels

| Level | Engine | Status | What it adds | Trade-off |
|---|---|---|---|---|
| 0 | Deterministic rules over a parsed command line | **Implemented** (`backend/src/classifier.ts`) | Instant, free, cannot be prompt-injected | Cannot judge `offTask`; only sees the command line |
| 1 | A small, cheap LLM as a judge with structured (JSON) output | Planned | Can answer `offTask` using task + plan | Slower, costs per call, can itself be prompt-injected |
| 2 | A small open model (sub-1B, or an encoder) fine-tuned on the decision log | Planned | Jev-like speed and cost, learns project-specific judgment | Needs a reviewed, labeled dataset |
| 3 | Pretraining a model from scratch | Out of scope | — | Not feasible or necessary for a narrow classification task |

### Level 0 policy

| Condition | Decision |
|---|---|
| Scope is `outside_workspace` or `unknown` | block |
| Privilege escalation (`sudo`, `su`, `doas`) | block |
| Irreversible (`rm`, `dd`, `find -delete`, `git reset --hard`, `git push --force`, ...) | block — no human-confirmation flow exists yet |
| Network (`curl`, `npm install`, `git pull`, `npx`, ...) | block, unless `AGENT_ALLOW_NETWORK=true` |
| Anything else, including writes inside the workspace | allow |

A blocked call is never executed. The model receives the reasons as the
tool result, and its system prompt tells it not to retry the same call
but to find an in-workspace alternative or explain why it cannot
proceed. The frontend shows these as `BLOCK` events.

Level 0 treats as `unknown` — and therefore blocks — anything whose
effect it cannot see in the command line: variable expansion and
command substitution (`$HOME`, `$(...)`, backticks), inline interpreter
code (`bash -c`, `node -e`, `python -c`), and commands that run other
commands (`eval`, `xargs`, `find -exec`). Two parser pitfalls are
handled explicitly and covered by tests: the shell parser silently
expands unknown variables to empty strings, and it treats newlines as
whitespace, which would otherwise let a second command hide as an
argument of the first.

### Known limitations of Level 0

- **It classifies the command line, not what programs do.** `npm test`,
  `node script.js` or `bash build.sh` can read and write anything the
  process can. A script the agent wrote itself via `write_file` bypasses
  Level 0 entirely. Only a sandbox closes this.
- **Symlinks are not resolved** (see §6).
- **`offTask` is always `null`.** Intent needs context; rules have none.
- **No deletion inside the workspace.** `rm` is blocked even on the
  agent's own scratch files. This is deliberate until an "ask the user"
  flow exists (§7).
- **Overwrites via `write_file` count as reversible**, although the
  previous content is lost.
- **Network detection is list-based.** A program with network access
  that is not on the list is not flagged. This is command-level policy,
  not network isolation.

### Two hosts, one classifier

The classifier reports facts; each host that uses it owns its policy.

- **Our own agent** has no human-confirmation flow yet, so it uses the
  Level 0 policy above: anything risky is blocked.
- **Claude Code**, through a `PreToolUse` hook
  (`backend/src/claude-code-hook.ts`), does have a permission prompt. There,
  outside-the-project paths and privilege escalation are **denied**, while
  irreversible, network and unknown-scope calls become **ask**, because
  `rm` or `npm install` are routine in real projects. Everything else gets
  no opinion, so Claude Code's own rules apply unchanged.

The hook never returns `allow`: that would bypass Claude Code's own
permission settings. A guard should only ever add friction. On its own
bugs (for example, unparseable input) it returns `ask` — neither
silently allowing nor locking the user out.

For the hook, the workspace boundary is the project Claude Code runs in
(`CLAUDE_PROJECT_DIR`), relative paths resolve from the actual current
directory, and Claude Code's own scratchpad directory counts as inside.
Its main value for this project is dogfooding: it exposes the classifier
to real daily work, and those decisions feed the same log as the agent's.

### Data flywheel

Every decision — from our agent and from the Claude Code hook, tagged by
`source` — is appended to `backend/logs/tool-decisions.jsonl` with the
task, the plan, the tool, its input and the verdict. (The hook does not
receive the task or plan directly; it could read them from Claude Code's
transcript, which is a Level 1 prerequisite.) This file is
the future training set for Level 2: today's rules become the labeler,
and human review corrects them. The log is gitignored because task,
plan and command text can contain sensitive data (§1, C6).

### Relation to the sandbox

The classifier answers *"should this call run?"*. A sandbox answers
*"how much damage can it do if that answer is wrong?"*. They complement
each other; neither replaces the other, and the sandbox questions in §7
remain open.
