import type { ParentComponent } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import { createContext, createSignal, onCleanup, useContext } from 'solid-js';

/** The record a page is editing, as it is on screen now, and the paper it comes from */
export type AssistantScreen = { subject: string; documentId?: string; data: Record<string, unknown> };

type AiAssistantPanelContextValue = {
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Opens the assistant on a new chat that asks this question straight away */
  ask: (prompt: string) => void;
  pendingPrompt: () => string | undefined;
  takePendingPrompt: () => string | undefined;
  /** What the page on screen declares to the assistant, read when a message is sent */
  getScreen: () => AssistantScreen | undefined;
  setScreenSource: (source: (() => AssistantScreen | undefined) | undefined) => void;
};

const AiAssistantPanelContext = createContext<AiAssistantPanelContextValue>();

export const AiAssistantPanelProvider: ParentComponent = (props) => {
  const [isOpen, setIsOpen] = makePersisted(createSignal(false), {
    name: 'paqui:ai-assistant:panel-open',
    storage: localStorage,
  });
  const [pendingPrompt, setPendingPrompt] = createSignal<string>();
  let screenSource: (() => AssistantScreen | undefined) | undefined;

  return (
    <AiAssistantPanelContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen(value => !value),
        ask: (prompt) => {
          setPendingPrompt(prompt);
          setIsOpen(true);
        },
        pendingPrompt,
        takePendingPrompt: () => {
          const prompt = pendingPrompt();
          setPendingPrompt(undefined);
          return prompt;
        },
        getScreen: () => screenSource?.(),
        setScreenSource: (source) => {
          screenSource = source;
        },
      }}
    >
      {props.children}
    </AiAssistantPanelContext.Provider>
  );
};

export function useAiAssistantPanel() {
  const context = useContext(AiAssistantPanelContext);

  if (!context) {
    throw new Error('useAiAssistantPanel must be used within AiAssistantPanelProvider');
  }

  return context;
}

// A page shows the assistant the record it is editing for as long as it is open: whatever the user asks, from a button
// or by writing, the assistant sees the same values and the same paper they do
export function useAssistantScreen(source: () => AssistantScreen | undefined) {
  const panel = useAiAssistantPanel();

  panel.setScreenSource(source);
  onCleanup(() => panel.setScreenSource(undefined));
}
