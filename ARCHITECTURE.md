# ARCHITECTURE.md: AI Agent Global Map & Context Guide

**TARGET AUDIENCE:** AI Coding Agents (Cursor, Copilot, Gemini, etc.). 
**PURPOSE:** Prevent architectural side-effects, context blindness, and performance degradation during "Search and Edit" workflows. Read this document BEFORE proposing architectural changes, adding new features, or modifying core UI/data flows.

---

## 1. Project Overview & Core Stack
**App:** Advanced AI Chat Interface powered by the Google Gemini API (`@google/genai`). Features include multi-persona character mode, Agentic RAG (Long-Term Memory), Python execution (Pyodide), Text-to-Speech (Tone.js), and Novel Archiving.
**Core Stack:**
- **Frontend:** React 19 (TypeScript), Tailwind CSS v3, Vite.
- **UI Paradigm:** Zinc & Emerald Soft UI (Vercel/Linear aesthetic). Atomic Component Library.
- **State Management:** Zustand (Heavily modularized).
- **Persistence:** IndexedDB (Custom wrapper in `services/db/core.ts`).
- **Audio:** Tone.js (Web Audio API) for granular TTS playback.
- **Heavy Compute:** Web Workers (Python execution, MP3 encoding, ZIP Export/Import).

---

## 2. State Management & Data Flow
The app uses a highly modularized Zustand architecture. **NEVER** combine these stores or bloat them. 

### Core Data Stores (Persisted to IndexedDB)
- `useActiveChatStore`: Holds the *full* `currentChatSession` object (including all messages). This is the source of truth for the active UI.
- `useChatListStore`: Holds *summaries* (messages array stripped) of all chats for the sidebar.
- `useDataStore`: Handles direct IndexedDB syncs (e.g., `updateMessages`, `updateSettings`).

### Volatile / UI Stores (Not Persisted)
- `useStreamingStore`: **CRITICAL.** Holds the currently streaming text. Do NOT put streaming text into `useActiveChatStore` as it will cause the entire app to re-render on every token.
- `useGlobalUiStore`: Theme (light, dark, studio), language (RTL/LTR), font sizes.
- `useSettingsUI` / `useEditorUI` / `useConfirmationUI`: Manages modal visibility. **Rule:** Keep local UI toggles inside components via `useState`. Only use these stores for global overlays.

---

## 3. UI Architecture & Semantic Theming (STRICT RULES)
We use a **Semantic Theming System (Design Tokens)** and an Atomic Component Library. 
**CRITICAL RULE:** You are STRICTLY FORBIDDEN from using hardcoded color palettes (e.g., `zinc-900`, `gray-500`, `emerald-500`) or the `dark:` prefix for colors in any React component. 

The application is "Theme-Agnostic". Themes (`light`, `dark`, `studio`) are handled automatically via raw RGB CSS variables in `index.css` mapped through `tailwind.config.js`.

### A. The Atomic Library (`components/ui/`)
You MUST use the established UI primitives for all new features. NEVER use raw `<button>`, `<input>`, or `<select>` tags for standard UI elements.
- **`<Button>`**: Use variants (`primary`, `secondary`, `danger`, `ghost`, `outline`) and sizes (`sm`, `md`, `lg`, `icon`).
- **`<Input>` / `<Textarea>` / `<Select>` / `<Switch>`**: Use these for all forms.
- **`<Badge>`**: For status indicators (e.g., Active, Error).
- **`<Dropdown>`**: For all popup menus. It handles click-outside logic automatically. Do NOT write custom `useEffect` click-outside hooks.
- **`<Accordion>`**: For collapsible content. It uses native HTML `<details>` for zero React-state overhead.

### B. The Semantic Dictionary (Use These Classes ONLY)
Whenever you build or modify a component, you MUST use these semantic classes. They support Tailwind's opacity modifiers (e.g., `bg-bg-panel/50`).

**1. Surfaces & Backgrounds:**
- `bg-bg-app`: The deepest background of the application.
- `bg-bg-panel`: Modals, Sidebar, Header, and solid cards.
- `bg-bg-element`: Inputs, dropdowns, action chips, and neutral active states.
- `bg-bg-hover`: Standard hover state for elements.
- `bg-bg-overlay`: The backdrop behind modals (use with `/60` or `/80`).
- `bg-bubble-user` / `bg-bubble-ai`: Strictly for chat message bubbles.

**2. Typography:**
- `text-text-primary`: Main body text and headings.
- `text-text-secondary`: Descriptions, subtitles, and secondary info.
- `text-text-muted`: Placeholders, timestamps, and inactive icons.
- `text-text-on-brand`: Text placed on top of solid brand-colored buttons (always white/light).

**3. Borders & Shadows:**
- `border-border-base`: Standard dividers and borders.
- `border-border-light`: Faint dividers.
- `focus:ring-ring-focus`: Focus rings for inputs.
- `shadow-panel`: Standard shadow for modals and dropdowns.

**4. Brand Colors:**
- `bg-brand-primary` / `text-brand-primary` / `border-brand-primary`: The main brand accent (Teal/Emerald).
- `hover:bg-brand-hover`: Hover state for primary brand elements.

### C. The Tint System (For Colored Cards & Badges)
If you need to create a colored feature card, alert, or badge, you MUST use the Tint System. 
Available colors: `teal, emerald, fuchsia, indigo, rose, sky, amber, orange, red, cyan, purple, slate`.
- **Backgrounds:** `bg-tint-[color]-bg` (MUST use an opacity modifier like `/10` or `/15` to create a soft glass effect. NEVER use solid).
- **Borders:** `border-tint-[color]-border` (Use with `/20` or `/30` opacity).
- **Text/Icons:** `text-tint-[color]-text` (NEVER use opacity on text to maintain readability).

### D. Markdown Typography
Markdown elements follow a standardized color semantic across all themes (`--md-bold`, `--md-italic`, `--md-h3`, `--md-quote`, `--md-link`). Do not hardcode colors in markdown rendering.

---

## 4. Performance Critical Paths (DO NOT BREAK)

### A. `ChatMessageList.tsx` & `@tanstack/react-virtual`
- **Rule:** The message list is virtualized. Elements are absolutely positioned.
- **Gotcha:** Do NOT introduce CSS that breaks height calculations (e.g., unconstrained absolute children).
- **Gotcha:** Do NOT force scroll-to-bottom on every render. Rely on the `ResizeObserver` and `isPinned` logic.

### B. `MessageItem.tsx` (Streaming Performance)
- **Rule:** This component re-renders hundreds of times per second during AI streaming.
- **Gotcha:** NEVER use `motion/react` inside `MessageItem.tsx`.
- **Gotcha:** NEVER use `useState` for toggling UI elements (like Thoughts or Python code) inside a message. You MUST use the `components/ui/Accordion.tsx` (which relies on native HTML `<details>`) to prevent React state updates from lagging the stream.

### C. Anti-FOUC (Flash of Unstyled Content)
- **Rule:** Theme initialization happens via an inline script in `index.html` reading from `localStorage('global-ui-storage')`. Do not attempt to manage the initial theme class injection via React `useEffect`, as it will cause a white flash on load.

---

## 5. Highly Fragile Subsystems (HANDLE WITH EXTREME CARE)

### A. The Streaming Regex Trap (`useMessageSender.ts`)
- **Danger:** The app supports hiding "Thoughts" (e.g., `<thought>...</thought>`) from the UI *during* the live stream.
- **Rule:** If you modify the streaming logic, you MUST preserve the regex logic. Failing to do so will leak raw XML tags into the user's chat UI.

### B. Audio Chunking & Deletion (`useAudioStore.ts` & `audioDb.ts`)
- **Danger:** Long TTS audio is split into chunks to bypass API limits. They are stored in IndexedDB as `${messageId}_part_${i}`.
- **Rule:** If you write logic to delete a message, you CANNOT just delete `messageId`. You MUST loop through `message.cachedAudioSegmentCount` and delete every `_part_${i}`. Otherwise, you will cause massive IndexedDB memory leaks.

### C. IndexedDB Migrations (`services/db/core.ts`)
- **Dependency:** If you add a new Object Store or change a `keyPath`, you MUST increment `DB_VERSION` and add a new `if (oldVersion < X)` block inside the `onupgradeneeded` function. Failing to do this will corrupt the app for existing users.

### D. System Prompt Injection (`services/llm/chat.ts`)
- **Rule:** System instructions are built dynamically. The base persona is augmented with Lorebook entries, Memory Box profiles, and specific protocols (like Google Search Deep Research).
- **Cache Awareness:** Any dynamic injection (like Lorebook or Search Protocol) MUST happen *before* the cache fingerprint is generated, otherwise the context cache will not invalidate correctly when settings change.

---

## 6. Layout & Mobile UX Patterns

### A. Mobile Toolbars ("Fixed-Scroll-Fixed" Pattern)
- **Rule:** Toolbars (Selection ActionBar, PromptButtonsBar, CharacterBar) MUST use a three-part flex system: Fixed Start, Scrollable Center (`flex-1 min-w-0 overflow-x-auto`), and Fixed End.
- **Gotcha:** Never use flex items directly inside a scrollable flex container without an inner `w-max flex items-center` wrapper, as this causes unpredictable shrinking or hidden scrollbars.

### B. Logical CSS Properties
- **Rule:** Enforce the use of CSS Logical Properties (`ms-`, `me-`, `ps-`, `pe-`) instead of physical ones (`ml-`, `mr-`, `pl-`, `pr-`) to ensure universal RTL/LTR compatibility.

### C. Viewport-Aware Dropdowns
- **Rule:** All popup menus MUST use the unified `<Dropdown />` component (`components/ui/Dropdown.tsx`). It automatically handles viewport boundaries, RTL alignment, and click-outside logic.

---

## 7. STRICT DEVELOPMENT RULES (MANDATORY)

1. **Feature Isolation:** When introducing a NEW feature, DO NOT bloat existing files. Create a NEW, dedicated file and import it. Every file must maintain a single responsibility.
2. **Native Alerts:** NEVER use `window.alert`, `window.confirm`, or `window.prompt`. Always use `useToastStore`, `useConfirmationUI`, or `useEditorUI.getState().openFilenameInputModal`.
3. **Zustand Selectors:** Always use `useShallow` when selecting multiple properties from a store to prevent unnecessary re-renders.
   *Bad:* `const { a, b } = useStore();`
   *Good:* `const { a, b } = useStore(useShallow(state => ({ a: state.a, b: state.b })));`
4. **Translations:** Hardcoded English strings in UI components are strictly forbidden. Always use `const { t } = useTranslation();` and add new keys to `translations.ts`.
5. **Pure CSS Animations:** Use `animate-modal-open` for modals instead of `framer-motion` to ensure smooth, jank-free mobile performance.
