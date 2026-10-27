import type { ParentComponent } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import { createContext, createSignal, useContext } from 'solid-js';

type AiAssistantPanelContextValue = {
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Opens the assistant on a new chat that asks this question straight away */
  ask: (prompt: string) => void;
  pendingPrompt: () => string | undefined;
  takePendingPrompt: () => string | undefined;
};

const AiAssistantPanelContext = createContext<AiAssistantPanelContextValue>();

export const AiAssistantPanelProvider: ParentComponent = (props) => {
  const [isOpen, setIsOpen] = makePersisted(createSignal(false), {
    name: 'paqui:ai-assistant:panel-open',
    storage: localStorage,
  });
  const [pendingPrompt, setPendingPrompt] = createSignal<string>();

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
