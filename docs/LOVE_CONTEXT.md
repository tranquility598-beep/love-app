\# LOVE — SYSTEM CONTEXT



\## 1. PROJECT SUMMARY



LOVE is a desktop realtime communication platform built on Electron.



Core features:

servers

channels and rooms

direct messages

friends system

voice communication (basic but unstable)

file uploads and attachments

settings system

desktop client with responsive UI



Status:

early product, architecture partially centralized



---



\## 2. CURRENT PHASE



PHASE 1: NAVIGATION SYSTEM — COMPLETED

\- navigationState centralized

\- setNavigationState unified control

\- applyNavigationState sync layer

\- UI active states unified

\- classList-based navigation removed



PHASE 1.6: UX CONSISTENCY HARDENING — COMPLETED

\- button system unified (radius, spacing, transitions)

\- modal system partially unified (base shell standardized)

\- design tokens introduced (space, radius, easing)

\- real-time vs UI interactions separated



CURRENT PHASE:

STABILITY PHASE



Focus:

system reliability

event lifecycle

memory safety

socket stability

voice stability

upload system safety



NO NEW FEATURES ARE ALLOWED



---



\## 3. ARCHITECTURE RULES



System is divided into layers:



\- navigation layer (UI state control)

\- event system (core communication bus)

\- socket layer (server communication)

\- voice layer (real-time audio)

\- file upload system

\- UI rendering layer



All layers MUST:

\- respect lifecycle (mount → update → unmount)

\- clean up listeners properly

\- avoid duplicate subscriptions

\- avoid hidden global state leaks



---



\## 4. EVENT SYSTEM RULES (CRITICAL)



Events can come from:

\- socket.on

\- window.addEventListener

\- custom event bus

\- UI internal emitters



RULES:

\- every listener MUST have a cleanup

\- no duplicate subscriptions allowed

\- no orphan listeners after UI destruction

\- no event logic outside lifecycle scope



CHECK:

\- where event is created

\- where it is removed

\- when it is recreated

\- whether it survives UI unmount



---



\## 5. SOCKET LAYER RULES



\- must support reconnect

\- must handle disconnect gracefully

\- must not duplicate handlers on reconnect

\- must clear listeners on logout / server switch



CHECK:

\- reconnect strategy

\- handler duplication

\- stale event delivery



---



\## 6. VOICE LAYER RULES



\- real-time feedback required

\- low latency interaction priority

\- state must sync with UI (muted, speaking, active)

\- must not block UI thread



CHECK:

\- state desync between UI and actual voice state

\- stuck speaking/muted states

\- cleanup on leave channel



---



\## 7. FILE UPLOAD SYSTEM RULES



\- uploads must be cancellable

\- no orphan upload processes

\- progress must not persist after UI close

\- retry logic must not duplicate uploads



CHECK:

\- cancel lifecycle

\- retry duplication

\- memory leaks from active uploads



---



\## 8. NAVIGATION LIFECYCLE



\- navigationState is single source of truth

\- UI must not maintain separate active state

\- switching context must cleanup previous listeners



CHECK:

\- stale UI state after navigation

\- double-render issues

\- leftover subscriptions per screen



---



\## 9. ENGINE BEHAVIOR RULES



The AI acting on this system must:



\- behave like a system engineer, not feature generator

\- never add new features without request

\- always start with diagnosis

\- explicitly state risk areas

\- stop when ambiguity exists

\- ask for confirmation before structural changes



---



\## 10. DEBUG PRIORITY ORDER



1\. event system (highest priority)

2\. socket layer

3\. navigation layer

4\. voice layer

5\. file upload system

6\. UI rendering



---



\## 11. CURRENT KNOWN STATE



\- UI consistency: SOLVED

\- navigation system: STABLE

\- event system: UNKNOWN (requires audit)

\- socket stability: UNKNOWN

\- voice stability: PARTIALLY STABLE

\- upload system: UNKNOWN



---



END OF CONTEXT

