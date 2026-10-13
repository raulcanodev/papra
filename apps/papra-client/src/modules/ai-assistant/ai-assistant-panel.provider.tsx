import type { ParentComponent } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import { createContext, createSignal, useContext } from 'solid-js';

type AiAssistantPanelContextValue = {
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const AiAssistantPanelContext = createContext<AiAssistantPanelContextValue>();

export const AiAssistantPanelProvider: ParentComponent = (props) => {
  const [isOpen, setIsOpen] = makePersisted(createSignal(false), {
    name: 'papra:ai-assistant:panel-open',
    storage: localStorage,
  });

  return (
    <AiAssistantPanelContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen(value => !value),
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
