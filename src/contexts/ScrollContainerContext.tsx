import { createContext, useContext, useState, type ReactNode, type RefObject } from "react";

type ScrollTarget = HTMLElement | null;

interface ScrollContainerContextValue {
  element: ScrollTarget;
  setElement: (el: ScrollTarget) => void;
}

const ScrollContainerContext = createContext<ScrollContainerContextValue>({
  element: null,
  setElement: () => {},
});

export const ScrollContainerProvider = ({ children }: { children: ReactNode }) => {
  const [element, setElement] = useState<ScrollTarget>(null);
  return (
    <ScrollContainerContext.Provider value={{ element, setElement }}>
      {children}
    </ScrollContainerContext.Provider>
  );
};

export const useScrollContainer = () => useContext(ScrollContainerContext);

export const useRegisterScrollContainer = (ref: RefObject<HTMLElement>) => {
  const { setElement } = useScrollContainer();
  // Caller should call this in a useEffect
  return () => {
    setElement(ref.current);
    return () => setElement(null);
  };
};
