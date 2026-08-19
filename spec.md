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

## 6. Attacking our own system — documented, not performed

> **Note:** this section does **not** describe an attack that was
> actually carried out. Because the architecture (sandbox technology,
> backend, etc.) is not yet chosen, there is no running system to attack.
> The list below is a **self-red-team checklist** — a living document to
> be used once the architecture is finalized and a first implementation
> exists; for now it records the questions that must not be forgotten.

Questions to ask once the sandbox becomes operational:

- [ ] Can a symlink or path-traversal trick, starting from the directory
      given to the sandbox, reach another file on the host?
- [ ] Even with network access disabled, can data still be exfiltrated
      via DNS queries (DNS tunneling)?
- [ ] Do any conversation/operation logs store secrets in plaintext
      anywhere?
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
  the start?

These questions will be answered in new sections added to this document
as the architecture becomes clearer.
